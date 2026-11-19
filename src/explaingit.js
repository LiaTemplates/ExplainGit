import * as d3selection from 'd3-selection'
import 'd3-transition'
import { tr, fill } from './i18n.js'

// d3 v5 API subset used below; event is a live binding
const d3 = {
  select: d3selection.select,
  selectAll: d3selection.selectAll,
  get event() { return d3selection.event }
}

function controlBoxFactory() {
    "use strict";

    /**
     * @class ControlBox
     * @constructor
     */
    function ControlBox(config) {
        this.historyView = config.historyView;
        this.originView = config.originView;
        this.initialMessage = config.initialMessage || 'Enter git commands below.';
        this._commandHistory = [];
        this._currentCommand = -1;
        this._tempCommand = '';
        this.rebaseConfig = {}; // to configure branches for rebase
    }

    var NOT_COMMANDS = ['init', 'render', 'destroy', 'command', 'info', 'error'];

    ControlBox.prototype = {
        init: function(cmds) {
            cmds.map(cmd => this.command(cmd));
        },
        render: function (container) {
            var cBox = this,
                cBoxContainer, log, input;

            cBoxContainer = container.append('div')
                .classed('control-box', true);


            log = cBoxContainer.append('div')
                .classed('log', true);

            input = cBoxContainer.append('input')
                .attr('type', 'text')
                .attr('placeholder', tr('placeholder'))
                .attr('aria-label', tr('command'))
                .classed('notranslate', true)
                .attr('translate', 'no')
                .attr('autocomplete', 'off')
                .attr('spellcheck', 'false');

            input.on('keyup', function () {
                var e = d3.event;

                switch (e.keyCode) {
                case 13:
                    if (this.value.trim() === '') {
                        break;
                    }

                    cBox._commandHistory.unshift(this.value);
                    cBox._tempCommand = '';
                    cBox._currentCommand = -1;
                    if (cBox.onInput) {
                        cBox.onInput(this.value);
                    } else {
                        cBox.command(this.value);
                    }
                    this.value = '';
                    e.stopImmediatePropagation();
                    break;
                case 38:
                    var previousCommand = cBox._commandHistory[cBox._currentCommand + 1];
                    if (cBox._currentCommand === -1) {
                        cBox._tempCommand = this.value;
                    }

                    if (typeof previousCommand === 'string') {
                        cBox._currentCommand += 1;
                        this.value = previousCommand;
                        this.value = this.value; // set cursor to end
                    }
                    e.stopImmediatePropagation();
                    break;
                case 40:
                    var nextCommand = cBox._commandHistory[cBox._currentCommand - 1];
                    if (typeof nextCommand === 'string') {
                        cBox._currentCommand -= 1;
                        this.value = nextCommand;
                        this.value = this.value; // set cursor to end
                    } else {
                        cBox._currentCommand = -1;
                        this.value = cBox._tempCommand;
                        this.value = this.value; // set cursor to end
                    }
                    e.stopImmediatePropagation();
                    break;
                }
            });

            this.container = cBoxContainer;
            this.log = log;
            this.input = input;

            this.info(this.initialMessage);
        },

        destroy: function () {
            this.log.remove();
            this.input.remove();
            this.container.remove();

            for (var prop in this) {
                if (this.hasOwnProperty(prop)) {
                    this[prop] = null;
                }
            }
        },

        _scrollToBottom: function () {
            var log = this.log.node();
            log.scrollTop = log.scrollHeight;
        },

        command: function (entry, who) {
            entry = String(entry).trim();
            if (entry === '') {
                return;
            }

            var split = entry.split(/\s+/);

            var line = this.log.append('div')
                .classed('command-entry', true)
                .classed('notranslate', true)
                .attr('translate', 'no');

            if (who) {
                line.append('span')
                    .classed('who', true)
                    .style('color', who.color || null)
                    .attr('title', who.name || '')
                    .text((who.symbol || '•') + ' ');
            }
            line.append('span').text(entry);

            this._scrollToBottom();

            try {
                this._run(split);
            } catch (ex) {
                var msg = (ex && ex.message) ? ex.message: null;
                this.error(msg);
            }
        },

        _run: function (split) {
            var hv = this.historyView;

            if (split[0] === 'edit') {
                if (hv.status === 'clean') {
                    hv.setStatus('unstaged');
                }
                return this.info(tr('edited'));
            }

            if (split[0] === 'cd') {
                return hv.activate(split[1] || '.');
            }

            if (split[0] !== 'git') {
                return this.error();
            }

            // git -C <path> <command>: run in another worktree, then come back
            if (split[1] === '-C') {
                var back = hv.worktrees[hv.active].path;
                hv.activate(split[2]);
                try {
                    return this._run(['git'].concat(split.slice(3)));
                } finally {
                    hv.activate(back);
                }
            }

            var method = split[1],
                args = split.slice(2);

            // only git commands, not the widget's own methods
            if (typeof this[method] === 'function' && method.charAt(0) !== '_' && NOT_COMMANDS.indexOf(method) === -1) {
                this[method](args);
            } else {
                this.error();
            }
        },

        info: function (msg) {
            this.log.append('div').classed('info', true).each(function () { fill(this, msg); });
            this._scrollToBottom();
        },

        error: function (msg) {
            msg = msg || tr('unknown');
            this.log.append('div').classed('error', true).each(function () { fill(this, msg); });
            this._scrollToBottom();
        },

        commit: function (args) {
            var amend = false, message;

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '-m' || arg === '-am' || arg === '--message') {
                    message = args.join(' ').replace(/^(["'])(.*)\1$/, '$2');
                    args.length = 0;
                } else if (arg === '--amend') {
                    amend = true;
                } else if (arg !== '-a' && arg !== '--all' && arg !== '--allow-empty' && arg !== '--no-edit') {
                    return this.error();
                }
            }

            if (amend) {
                this.historyView.amend(message);
            } else {
                this.historyView.commit({}, message);
            }
        },

        branch: function (args) {
            var hv = this.historyView,
                flag = args[0],
                rest = args.slice(1);

            // -m/-c with one name work on the current branch
            var pair = function () {
                return rest.length > 1 ? [rest[0], rest[1]] : [hv.currentBranch, rest[0]];
            };

            switch (flag) {
            case undefined:
                this.info(tr('branchList'));
                break;
            case '--remote':
            case '-r':
                this.info(tr('branchRemote'));
                break;
            case '--all':
            case '-a':
                this.info(tr('branchAll'));
                break;
            case '--delete':
            case '-d':
            case '-D':
                hv.deleteBranch(rest[0]);
                break;
            case '--move':
            case '-m':
            case '-M':
                var names = pair();
                hv.renameBranch(names[0], names[1], flag === '-M');
                this.info(tr('branchRenamed', names[0], names[1]));
                break;
            case '--copy':
            case '-c':
            case '-C':
                hv.copyBranch(pair()[0], pair()[1], flag === '-C');
                break;
            case '--force':
            case '-f':
                hv.forceBranch(rest[0], rest[1] || 'HEAD');
                break;
            case '-u':
            case '--set-upstream-to':
                var target = rest[1] || hv.currentBranch;
                if (!rest[0] || !hv.getCommit(rest[0]) || !hv.isRemoteRef(rest[0])) {
                    throw new Error(tr('noRef', rest[0]));
                }
                hv.upstream[target] = rest[0];
                this.info(tr('upstreamSet', target, rest[0]));
                break;
            default:
                if (flag.charAt(0) === '-') {
                    this.error();
                } else {
                    hv.branch(flag, rest[0]);
                }
            }
        },

        // switch and checkout: opt = {create, force, start, detach, lenient}
        _changeBranch: function (name, opt) {
            var hv = this.historyView;

            if (name === '-') {
                if (!hv.previousBranch) {
                    throw new Error(tr('noPrevious'));
                }
                name = hv.previousBranch;
            }

            if (!opt.detach && hv.isLocalBranch(name) && name !== hv.currentBranch) {
                hv.checkFree(name);
            }

            if (opt.create) {
                var start = hv.getCommit(opt.start || 'HEAD');
                if (!start) {
                    throw new Error(tr('noRef', opt.start));
                }
                if (!hv.isLocalBranch(name)) {
                    hv.branch(name, start.id);
                } else if (opt.force) {
                    hv.moveTag(name, start.id);
                } else if (!opt.lenient) {
                    hv.branch(name); // throws "already exists"
                }
            } else if (opt.detach) {
                name = hv.getCommit(name || 'HEAD') ? hv.getCommit(name || 'HEAD').id : name;
            } else if (opt.branchOnly && !hv.isLocalBranch(name)) {
                throw new Error(hv.getCommit(name) ? tr('branchExpected', name) : tr('noRef', name));
            }

            hv.checkout(name);
        },

        checkout: function (args) {
            var opt = { lenient: true }, name;

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '-b' || arg === '-B') {
                    opt.create = true;
                    opt.force = arg === '-B';
                    name = args.shift();
                    opt.start = args.shift();
                } else if (arg === '--detach') {
                    opt.detach = true;
                } else {
                    name = [arg].concat(args).join(' ');
                    args.length = 0;
                }
            }

            if (!name && !opt.detach) {
                throw new Error(tr('needBranchName'));
            }
            this._changeBranch(name, opt);
        },

        switch: function (args) {
            var opt = { branchOnly: true }, name;

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '-c' || arg === '--create' || arg === '-C' || arg === '--force-create') {
                    opt.create = true;
                    opt.force = arg === '-C' || arg === '--force-create';
                    name = args.shift();
                    opt.start = args.shift();
                } else if (arg === '-d' || arg === '--detach') {
                    opt.detach = true;
                } else if (!name) {
                    name = arg;
                }
            }

            if (!name && !opt.detach) {
                throw new Error(tr('switchUsage'));
            }
            this._changeBranch(name, opt);
        },

        tag: function (args) {
            if (args.length < 1) {
                this.info(tr('tagList'));

                return;
            }
            
            while (args.length > 0) {
                var arg = args.shift();

                try {
                    this.historyView.tag(arg);
                } catch (err) {
                    if (err.code !== 'exists') {
                        throw new Error(err.message);
                    }
                }
            }
        },

        // --soft keeps the undone changes staged, --mixed (default) unstaged, --hard drops them
        reset: function (args) {
            var hv = this.historyView,
                mode = 'mixed',
                ref = 'HEAD';

            args.forEach(function (arg) {
                if (arg === '--soft' || arg === '--mixed' || arg === '--hard') {
                    mode = arg.slice(2);
                } else if (arg.charAt(0) !== '-') {
                    ref = arg;
                }
            });

            var before = hv.getCommit('HEAD').id;
            hv.reset(ref);
            var moved = hv.getCommit('HEAD').id !== before;

            if (mode === 'hard') {
                hv.setStatus('clean');
            } else if (mode === 'soft') {
                moved && hv.setStatus('staged');
            } else if (moved || hv.status !== 'clean') {
                hv.setStatus('unstaged');
            }
        },

        add: function (args) {
            if (args.length === 0) {
                throw new Error(tr('needPath'));
            }
            if (this.historyView.status === 'unstaged') {
                this.historyView.setStatus('staged');
            }
        },

        restore: function (args) {
            var hv = this.historyView,
                staged = args.indexOf('--staged') > -1 || args.indexOf('-S') > -1;

            if (!args.some(function (a) { return a.charAt(0) !== '-'; })) {
                throw new Error(tr('needPath'));
            }
            if (staged && hv.status === 'staged') {
                hv.setStatus('unstaged');
            } else if (!staged && hv.status === 'unstaged') {
                hv.setStatus('clean');
            }
        },

        status: function () {
            this.info(tr('status_' + this.historyView.status));
        },

        // worktree add [-b <new>] [--detach] <path> [<commit-ish>] | list | remove [--force] <path>
        worktree: function (args) {
            var hv = this.historyView,
                sub = args.shift(),
                opt = {},
                pos = [];

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '-b' || arg === '-B') {
                    opt.create = args.shift();
                    opt.force = arg === '-B';
                } else if (arg === '--detach' || arg === '-d') {
                    opt.detach = true;
                } else if (arg === '--force' || arg === '-f') {
                    opt.forceRemove = true;
                } else if (arg.charAt(0) !== '-') {
                    pos.push(arg);
                }
            }

            if (sub === 'list') {
                var control = this;
                return hv.worktrees.forEach(function (w, i) {
                    var head = hv.worktreeHead(i),
                        branch = i === hv.active ? hv.currentBranch : w.branch;
                    control.info(w.path + '  ' + head + (branch ? ' [' + branch + ']' : ' (detached HEAD)'));
                });
            }
            if (sub === 'remove') {
                if (!pos[0]) {
                    throw new Error(tr('worktreeUsage'));
                }
                return hv.removeWorktree(pos[0], opt.forceRemove);
            }
            if (sub !== 'add' || !pos[0]) {
                throw new Error(tr('worktreeUsage'));
            }

            var path = pos[0], target = pos[1], branch = null, commit;
            if (hv.findWorktree(path) > -1) {
                throw new Error(tr('worktreeExists', path));
            }

            if (opt.create) {
                branch = opt.create;
                commit = hv.getCommit(target || 'HEAD');
                if (!commit) {
                    throw new Error(tr('noRef', target));
                }
                if (hv.isLocalBranch(branch) && opt.force) {
                    hv.checkFree(branch);
                    hv.moveTag(branch, commit.id);
                } else {
                    hv.branch(branch, commit.id);
                }
            } else if (opt.detach || (target && !hv.isLocalBranch(target))) {
                commit = hv.getCommit(target || 'HEAD');
                if (!commit) {
                    throw new Error(tr('noRef', target));
                }
            } else {
                // like git: without a branch, use (or create) one named after the folder
                branch = target || path.split('/').pop();
                if (!hv.isLocalBranch(branch)) {
                    hv.branch(branch);
                }
            }

            if (branch) {
                hv.checkFree(branch);
                commit = hv.getCommit(branch);
            }
            hv.addWorktree(path, branch, commit.id);
            this.info(tr('worktreeAdded', path, branch || commit.id));
        },

        // stash [push [-m msg]] | pop | apply | drop | list  [stash@{n}]
        stash: function (args) {
            var hv = this.historyView,
                action = args[0] && args[0].charAt(0) !== '-' ? args[0] : 'push',
                ref = args[1] || 'stash@{0}',
                index = Number((/^stash@\{(\d+)\}$/.exec(ref) || [])[1]);

            if (action === 'push' || action === 'save') {
                if (hv.status === 'clean') {
                    return this.info(tr('noLocalChanges'));
                }
                hv.stashPush();
                return this.info(tr('stashSaved', 0));
            }
            if (action === 'list') {
                for (var i = 0; i < hv.stashes.length; i++) {
                    this.info('stash@{' + i + '}: ' + hv.getCommit(hv.stashes[i]).message);
                }
                return;
            }
            if (hv.stashes.length === 0) {
                throw new Error(tr('noStash'));
            }
            if (isNaN(index) || index >= hv.stashes.length) {
                throw new Error(tr('noRef', ref));
            }
            if (action === 'apply' || action === 'pop') {
                hv.setStatus('unstaged');
            }
            if (action === 'drop' || action === 'pop') {
                hv.stashDrop(index);
            } else if (action !== 'apply') {
                return this.error();
            }
        },

        clean: function (args) {
            this.info(tr('clean'));
        },

        'cherry-pick': function (args) {
            var hv = this.historyView,
                refs = args.filter(function (a) { return a.charAt(0) !== '-'; });

            if (refs.length === 0) {
                throw new Error(tr('needRef'));
            }
            for (var i = 0; i < refs.length; i++) {
                var source = hv.cherryPick(refs[i]);
                this.info(tr('cherryPicked', source.id, hv.getCommit('HEAD').id));
            }
        },

        revert: function (args) {
            this.historyView.revert(args.shift());
        },

        merge: function (args) {
            var hv = this.historyView,
                opt = {},
                branch;

            args.forEach(function (arg) {
                if (arg === '--no-ff') {
                    opt.noFF = true;
                } else if (arg === '--ff-only') {
                    opt.ffOnly = true;
                } else if (arg === '--squash') {
                    opt.squash = true;
                } else if (arg.charAt(0) !== '-') {
                    branch = arg;
                }
            });

            if (!branch) {
                throw new Error(tr('needRef'));
            }

            if (opt.squash) {
                var target = hv.getCommit(branch);
                if (!target) {
                    throw new Error(tr('noRef', branch));
                }
                if (hv.isAncestor(target, 'HEAD')) {
                    throw new Error(tr('upToDate'));
                }
                // no commit yet: the next commit takes the changes, with one parent
                hv.squashPending = target.id;
                hv.setStatus('staged');
                this.info(tr('squashed', branch));
                return;
            }

            if (opt.ffOnly && hv.getCommit(branch) && !hv.isAncestor('HEAD', branch)) {
                throw new Error(tr('notFastForward'));
            }

            var result = hv.merge(branch, opt.noFF);

            if (result === 'Fast-Forward') {
                this.info(tr('fastForward'));
            }
        },

        rebase: function (args) {
            var opt = {}, positional = [], ref, result;

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '--onto') {
                    opt.onto = args.shift();
                    if (!opt.onto) {
                        throw new Error(tr('needRef'));
                    }
                } else if (arg === '--update-refs') {
                    opt.updateRefs = true;
                } else if (arg.charAt(0) !== '-') {
                    positional.push(arg);
                }
            }

            ref = positional[0];
            if (!ref) {
                throw new Error(tr('needRef'));
            }
            // git rebase <upstream> <branch>: switch to <branch> first
            if (positional[1]) {
                this._changeBranch(positional[1], {});
            }

            result = this.historyView.rebase(ref, opt);
            if (result === 'Fast-Forward') {
                this.info(tr('fastForwardTo', opt.onto || ref));
            }
        },

        fetch: function (args) {
            if (!this.originView) {
                throw new Error(tr('noRemote'));
            }

            var origin = this.originView,
                local = this.historyView,
                remotePattern = /^origin\/(.+)$/,
                rtb, isRTB, fb,
                fetchBranches = {},
                fetchIds = [], // just to make sure we don't fetch the same commit twice
                fetchCommits = [], fetchCommit,
                resultMessage = '';

            // determine which branches to fetch
            for (rtb = 0; rtb < local.branches.length; rtb++) {
                isRTB = remotePattern.exec(local.branches[rtb]);
                if (isRTB) {
                    fetchBranches[isRTB[1]] = 0;
                }
            }

            // determine which commits the local repo is missing from the origin
            for (fb in fetchBranches) {
                if (origin.branches.indexOf(fb) > -1) {
                    fetchCommit = origin.getCommit(fb);

                    var notInLocal = local.getCommit(fetchCommit.id) === null;
                    while (notInLocal) {
                        if (fetchIds.indexOf(fetchCommit.id) === -1) {
                            fetchCommits.unshift(fetchCommit);
                            fetchIds.unshift(fetchCommit.id);
                        }
                        fetchBranches[fb] += 1;
                        fetchCommit = origin.getCommit(fetchCommit.parent);
                        notInLocal = local.getCommit(fetchCommit.id) === null;
                    }
                }
            }

            // add the fetched commits to the local commit data
            for (var fc = 0; fc < fetchCommits.length; fc++) {
                fetchCommit = fetchCommits[fc];
                local.commitData.push({
                    id: fetchCommit.id,
                    parent: fetchCommit.parent,
                    parent2: fetchCommit.parent2,
                    message: fetchCommit.message,
                    tags: []
                });
            }

            // update the remote tracking branch tag locations
            for (fb in fetchBranches) {
                if (origin.branches.indexOf(fb) > -1) {
                    var remoteLoc = origin.getCommit(fb).id;
                    local.moveTag('origin/' + fb, remoteLoc);
                }

                resultMessage += tr('fetched', fetchBranches[fb], fb) + ' ';
            }

            // --prune: drop origin/<b> when the remote has no <b> any more
            if (args && (args.indexOf('--prune') > -1 || args.indexOf('-p') > -1)) {
                local.branches.slice().forEach(function (b) {
                    var m = remotePattern.exec(b);
                    if (m && !origin.isLocalBranch(m[1])) {
                        local._removeTag(b);
                    }
                });
                local.renderTags();
            }

            this.info(resultMessage);

            local.renderCommits();
        },

        pull: function (args) {
            var control = this,
                local = this.historyView,
                currentBranch = local.currentBranch,
                rtBranch = local.upstream[currentBranch] || 'origin/' + currentBranch,
                isFastForward = false;

            this.fetch();

            if (!currentBranch) {
                throw new Error(tr('notOnBranch'));
            }

            if (local.branches.indexOf(rtBranch) === -1) {
                throw new Error(tr('noUpstream'));
            }

            if (args.indexOf('--ff-only') > -1 && !local.isAncestor('HEAD', rtBranch) && !local.isAncestor(rtBranch, 'HEAD')) {
                throw new Error(tr('notFastForward'));
            }

            // at once, not after a delay: replaying commands must give the same state
            if (args[0] === '--rebase' || control.rebaseConfig[currentBranch] === 'true') {
                isFastForward = local.rebase(rtBranch) === 'Fast-Forward';
            } else {
                isFastForward = local.merge(rtBranch) === 'Fast-Forward';
            }

            if (isFastForward) {
                control.info(tr('fastForwardTo', rtBranch));
            }
        },

        // push [-u] [-f | --force-with-lease] [--delete] [<remote> [<local>[:<remote>]]]
        push: function (args) {
            var local = this.historyView,
                opt = {},
                positional = [];

            args.forEach(function (arg) {
                if (arg === '-u' || arg === '--set-upstream') {
                    opt.upstream = true;
                } else if (arg === '-f' || arg === '--force') {
                    opt.force = true;
                } else if (arg === '--force-with-lease') {
                    opt.lease = true;
                } else if (arg === '-d' || arg === '--delete') {
                    opt.remove = true;
                } else if (arg.charAt(0) !== '-') {
                    positional.push(arg);
                }
            });

            var remoteName = positional[0] || 'origin',
                remote = this[remoteName + 'View'],
                refspec = /^([^:]*)(:?)(.*)$/.exec(positional[1] || ''),
                localRef = refspec[1] || local.currentBranch,
                remoteRef = refspec[2] === ':' ? refspec[3] : localRef,
                tracking = remoteName + '/' + remoteRef;

            if (remoteName === 'history') {
                throw new Error(tr('remoteHistory'));
            }
            if (!remote) {
                throw new Error(tr('noRemoteNamed', remoteName));
            }

            if (opt.remove) {
                if (!remote.isLocalBranch(positional[1])) {
                    throw new Error(tr('noRef', positional[1]));
                }
                remote._removeTag(positional[1]);
                remote.renderCommits();
                local._removeTag(remoteName + '/' + positional[1]);
                local.renderTags();
                return this.info(tr('remoteDeleted', positional[1]));
            }

            if (!local.isLocalBranch(localRef)) {
                throw new Error(tr('noLocalRef', localRef));
            }
            if (!remoteRef) {
                throw new Error(tr('noRemoteBranch'));
            }

            var localCommit = local.getCommit(localRef),
                remoteCommit = remote.isLocalBranch(remoteRef) ? remote.getCommit(remoteRef) : null;

            if (remoteCommit && remoteCommit.id === localCommit.id) {
                this.info(tr('upToDateAll'));
            } else {
                if (remoteCommit && !local.isAncestor(remoteCommit.id, localCommit.id)) {
                    if (opt.lease) {
                        // only if the remote is still where we last saw it
                        var seen = local.getCommit(tracking);
                        if (!seen || seen.id !== remoteCommit.id) {
                            throw new Error(tr('staleLease'));
                        }
                    } else if (!opt.force) {
                        throw new Error(tr('pushRejected'));
                    }
                }

                // copy the commits the remote does not have yet, parents first
                var toPush = [],
                    copy = function (commit) {
                        while (commit && commit.id !== 'initial' && remote.getCommit(commit.id) === null &&
                               toPush.every(function (c) { return c.id !== commit.id; })) {
                            toPush.unshift({
                                id: commit.id,
                                parent: commit.parent,
                                parent2: commit.parent2,
                                message: commit.message,
                                tags: []
                            });
                            if (typeof commit.parent2 === 'string') {
                                copy(local.getCommit(commit.parent2));
                            }
                            commit = local.getCommit(commit.parent);
                        }
                    };
                copy(localCommit);

                remote.commitData = remote.commitData.concat(toPush);
                remote.moveTag(remoteRef, localCommit.id);
                remote.renderCommits();
            }

            local.moveTag(tracking, localCommit.id);
            if (opt.upstream) {
                local.upstream[localRef] = tracking;
                this.info(tr('upstreamSet', localRef, tracking));
            }
            local.renderTags();
        },

        config: function (args) {
            var path = args.shift().split('.');

            if (path[0] === 'branch') {
                if (path[2] === 'rebase') {
                    this.rebase[path[1]] = args.pop();
                }
            }
        }
    };

    return ControlBox;
}

function historyViewFactory(d3) {
    "use strict";

    var REG_MARKER_END = 'url(#explaingit-triangle)',
        MERGE_MARKER_END = 'url(#explaingit-brown-triangle)',
        FADED_MARKER_END = 'url(#explaingit-faded-triangle)',

        preventOverlap,
        applyBranchlessClass,
        cx, cy, fixCirclePosition,
        px1, py1, fixPointerStartPosition,
        px2, py2, fixPointerEndPosition,
        fixIdPosition, tagY;

    preventOverlap = function preventOverlap(commit, view) {
        var commitData = view.commitData,
            baseLine = view.baseLine,
            shift = view.commitRadius * 4.5,
            overlapped = null;

        for (var i = 0; i < commitData.length; i++) {
            var c = commitData[i];
            if (c.cx === commit.cx && c.cy === commit.cy && c !== commit) {
                overlapped = c;
                break;
            }
        }

        if (overlapped) {
            var oParent = view.getCommit(overlapped.parent),
                parent = view.getCommit(commit.parent);

            if (overlapped.cy < baseLine) {
                overlapped = oParent.cy < parent.cy ? overlapped : commit;
                overlapped.cy -= shift;
            } else {
                overlapped = oParent.cy > parent.cy ? overlapped : commit;
                overlapped.cy += shift;
            }

            preventOverlap(overlapped, view);
        }
    };

    applyBranchlessClass = function (selection) {
        if (selection.empty()) {
            return;
        }

        selection.classed('branchless', function (d) {
            return d.branchless;
        });

        if (selection.classed('commit-pointer')) {
            selection.attr('marker-end', function (d) {
                return d.branchless ? FADED_MARKER_END : REG_MARKER_END;
            });
        } else if (selection.classed('merge-pointer')) {
            selection.attr('marker-end', function (d) {
                return d.branchless ? FADED_MARKER_END : MERGE_MARKER_END;
            });
        }
    };

    cx = function (commit, view) {
        var parent = view.getCommit(commit.parent),
            parentCX = parent.cx;

        if (typeof commit.parent2 === 'string') {
            var parent2 = view.getCommit(commit.parent2);

            parentCX = parent.cx > parent2.cx ? parent.cx : parent2.cx;
        }

        return parentCX + (view.commitRadius * 4.5);
    };

    cy = function (commit, view) {
        var parent = view.getCommit(commit.parent),
            parentCY = parent.cy || cy(parent, view),
            baseLine = view.baseLine,
            shift = view.commitRadius * 4.5,
            branches = [], // count the existing branches
            branchIndex = 0;

        for (var i = 0; i < view.commitData.length; i++) {
            var d = view.commitData[i];

            if (d.parent === commit.parent) {
                branches.push(d.id);
            }
        }

        branchIndex = branches.indexOf(commit.id);

        if (commit.isNoFFBranch === true) {
            branchIndex++;
        }
        if (commit.isNoFFCommit === true) {
            branchIndex--;
        }

        if (parentCY === baseLine) {
            var direction = 1;
            for (var bi = 0; bi < branchIndex; bi++) {
                direction *= -1;
            }

            shift *= Math.ceil(branchIndex / 2);

            return parentCY + (shift * direction);
        }

        if (parentCY < baseLine) {
            return parentCY - (shift * branchIndex);
        } else if (parentCY > baseLine) {
            return parentCY + (shift * branchIndex);
        }
    };

    fixCirclePosition = function (selection) {
        selection
            .attr('cx', function (d) {
                return d.cx;
            })
            .attr('cy', function (d) {
                return d.cy;
            });
    };

    // calculates the x1 point for commit pointer lines
    px1 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            startCX = commit.cx,
            diffX = startCX - parent.cx,
            diffY = parent.cy - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return startCX - (view.pointerMargin * (diffX / length));
    };

    // calculates the y1 point for commit pointer lines
    py1 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            startCY = commit.cy,
            diffX = commit.cx - parent.cx,
            diffY = parent.cy - startCY,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return startCY + (view.pointerMargin * (diffY / length));
    };

    fixPointerStartPosition = function (selection, view) {
        selection.attr('x1', function (d) {
            return px1(d, view);
        }).attr('y1', function (d) {
            return py1(d, view);
        });
    };

    px2 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            endCX = parent.cx,
            diffX = commit.cx - endCX,
            diffY = parent.cy - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return endCX + (view.pointerMargin * 1.2 * (diffX / length));
    };

    py2 = function (commit, view, pp) {
        pp = pp || 'parent';

        var parent = view.getCommit(commit[pp]),
            endCY = parent.cy,
            diffX = commit.cx - parent.cx,
            diffY = endCY - commit.cy,
            length = Math.sqrt((diffX * diffX) + (diffY * diffY));

        return endCY - (view.pointerMargin * 1.2 * (diffY / length));
    };

    fixPointerEndPosition = function (selection, view) {
        selection.attr('x2', function (d) {
            return px2(d, view);
        }).attr('y2', function (d) {
            return py2(d, view);
        });
    };

    fixIdPosition = function (selection, view, delta) {
        selection.attr('x', function (d) {
            return d.cx;
        }).attr('y', function (d) {
            return d.cy + view.commitRadius + delta;
        });
    };

    tagY = function tagY(t, view) {
        var commit = view.getCommit(t.commit),
            commitCY = commit.cy,
            tags = commit.tags,
            tagIndex = typeof t.index === 'number' ? t.index : tags.indexOf(t.name);

        if (tagIndex === -1) {
            tagIndex = tags.length;
        }

        if (commitCY < (view.baseLine)) {
            return commitCY - 45 - (tagIndex * 25);
        } else {
            return commitCY + 50 + (tagIndex * 25);
        }
    };

    /**
     * @class HistoryView
     * @constructor
     */
    function HistoryView(config) {
        var commitData = config.commitData || [],
            commit;

        for (var i = 0; i < commitData.length; i++) {
            commit = commitData[i];
            !commit.parent && (commit.parent = 'initial');
            !commit.tags && (commit.tags = []);
        }

        this.name = config.name || 'UnnamedHistoryView';
        this.seed = config.seed || this.name;
        this.idCounter = 0;
        this.commitData = commitData;

        this.branches = [];
        this.currentBranch = config.currentBranch || 'master';

        this.width = config.width;
        this.height = config.height || 400;
        this.orginalBaseLine = config.baseLine;
        this.baseLine = this.height * (config.baseLine || 0.6);

        this.commitRadius = config.commitRadius || 20;
        this.pointerMargin = this.commitRadius * 1.3;

        this.isRemote = typeof config.remoteName === 'string';
        this.remotes = config.remotes || ['origin'];
        this.status = 'clean'; // working tree: clean, staged or unstaged
        this.stashes = [];      // commit ids, newest first
        this.upstream = {};     // branch -> remote tracking branch, set by push -u / branch -u
        // worktrees: the active one lives in currentBranch, HEAD and status
        this.worktrees = [{ path: '.', branch: this.currentBranch, head: null, status: 'clean' }];
        this.active = 0;
        this.remoteName = config.remoteName;

        this.initialCommit = {
            id: 'initial',
            parent: null,
            cx: -(this.commitRadius * 2),
            cy: this.baseLine
        };
    }

    HistoryView.generateId = function () {
        return Math.floor((1 + Math.random()) * 0x10000000).toString(16).substring(1);
    };


    HistoryView.prototype = {
        // FNV-1a hash of seed and counter, 7 hex digits like a short git hash:
        // the same commands give the same commit ids in every browser
        nextId: function () {
            var str = this.seed + '#' + (this.idCounter++),
                h = 0x811c9dc5;
            for (var i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 0x01000193) >>> 0;
            }
            // final mix (murmur3), so neighbouring counters give unlike ids
            h ^= h >>> 16;
            h = Math.imul(h, 0x85ebca6b) >>> 0;
            h ^= h >>> 13;
            h = Math.imul(h, 0xc2b2ae35) >>> 0;
            h ^= h >>> 16;
            return ('0000000' + h.toString(16)).slice(-7);
        },

        /**
         * @method getCommit
         * @param ref {String} the id or a tag name that refers to the commit
         * @return {Object} the commit datum object
         */
        getCommit: function getCommit(ref) {
            var commitData = this.commitData,
                // <ref>^, <ref>^^, <ref>~2, combined: walk first parents
                suffix = typeof ref === 'string' && /^(.+?)((?:\^|~\d*)+)$/.exec(ref),
                matchedCommit = null;

            if (ref === 'initial') {
                return this.initialCommit;
            }

            if (suffix) {
                var steps = 0;
                suffix[2].replace(/\^|~(\d*)/g, function (op, n) {
                    steps += op === '^' ? 1 : Number(n || 1);
                });
                matchedCommit = getCommit.call(this, suffix[1]);
                while (matchedCommit && steps-- > 0) {
                    matchedCommit = getCommit.call(this, matchedCommit.parent);
                }
                return matchedCommit;
            }

            for (var i = 0; i < commitData.length; i++) {
                var commit = commitData[i];
                if (commit === ref) {
                    matchedCommit = commit;
                    break;
                }

                if (commit.id === ref) {
                    matchedCommit = commit;
                    break;
                }

                var matchedTag = function() { 
                    for (var j = 0; j < commit.tags.length; j++) {
                        var tag = commit.tags[j];
                        if (tag === ref) {
                            matchedCommit = commit;
                            return true;
                        }
                        
                        if (tag.indexOf('[') === 0 && tag.indexOf(']') === tag.length - 1) {
                            tag = tag.substring(1, tag.length - 1);
                        }
                        if (tag === ref) {
                            matchedCommit = commit;
                            return true;
                        }
                    }
                }();
                if (matchedTag === true) {
                    break;
                }
            }

            return matchedCommit;
        },

        /**
         * @method getCircle
         * @param ref {String} the id or a tag name that refers to the commit
         * @return {d3 Selection} the d3 selected SVG circle
         */
        getCircle: function (ref) {
            var circle = this.svg.select('#' + this.name + '-' + ref),
                commit;

            if (circle && !circle.empty()) {
                return circle;
            }

            commit = this.getCommit(ref);

            if (!commit) {
                return null;
            }

            return this.svg.select('#' + this.name + '-' + commit.id);
        },

        getCircles: function () {
            return this.svg.selectAll('circle.commit');
        },

        /**
         * @method render
         * @param container {String} selector for the container to render the SVG into
         */
        render: function (container) {
            var svgContainer, svg;

            svgContainer = container.append('div')
                .classed('svg-container', true)
                .classed('remote-container', this.isRemote);
                
            svg = svgContainer.append('svg:svg');

            svg.attr('id', this.name)
                .attr('width', this.width)
                .attr('height', this.height);

            if (this.isRemote) {
                svg.append('svg:text')
                    .classed('remote-name-display', true)
                    .text(this.remoteName)
                    .attr('x', 10)
                    .attr('y', 25);
            } else {
                svg.append('svg:text')
                    .classed('remote-name-display', true)
                    .text(tr('localRepo'))
                    .attr('x', 10)
                    .attr('y', 25);

                svg.append('svg:text')
                    .classed('current-branch-display', true)
                    .attr('x', 10)
                    .attr('y', 45);

                svg.append('svg:text')
                    .classed('status-display', true)
                    .attr('x', 10)
                    .attr('y', 65);
            }

            this.svgContainer = svgContainer;
            this.svg = svg;
            this.arrowBox = svg.append('svg:g').classed('pointers', true);
            this.commitBox = svg.append('svg:g').classed('commits', true);
            this.tagBox = svg.append('svg:g').classed('tags', true);

            this.renderCommits();

            this._setCurrentBranch(this.currentBranch);
            this.setStatus(this.status);
        },

        destroy: function () {
            this.svg.remove();
            this.svgContainer.remove();
            clearInterval(this.refreshSizeTimer);

            for (var prop in this) {
                if (this.hasOwnProperty(prop)) {
                    this[prop] = null;
                }
            }
        },

        _calculatePositionData: function () {
            for (var i = 0; i < this.commitData.length; i++) {
                var commit = this.commitData[i];
                commit.cx = cx(commit, this);
                commit.cy = cy(commit, this);
                preventOverlap(commit, this);
            }
        },
        
        _resizeSvg: function() {
            var ele = document.getElementById(this.svg.node().id);
            var container = ele.parentNode;
            var currentWidth = ele.offsetWidth;
            var newWidth;

            if (ele.getBBox().width > container.offsetWidth)
                newWidth = Math.round(ele.getBBox().width);
            else
                newWidth = container.offsetWidth - 5;

            if (currentWidth != newWidth) {
                this.svg.attr('width', newWidth);
                container.scrollLeft = container.scrollWidth;
            }
        },

        renderCommits: function () {
            if (typeof this.height === 'string' && this.height.indexOf('%') >= 0) {
                var perc = this.height.substring(0, this.height.length - 1) / 100.0;
                var baseLineCalcHeight = Math.round(this.svg.node().parentNode.offsetHeight * perc) - 65;
                var newBaseLine = Math.round(baseLineCalcHeight * (this.originalBaseLine || 0.6));
                if (newBaseLine !== this.baseLine) {
                    this.baseLine = newBaseLine;
                    this.initialCommit.cy = newBaseLine;
                    this.svg.attr('height', baseLineCalcHeight);
                }
            }
            this._calculatePositionData();
            this._calculatePositionData(); // do this twice to make sure
            this._renderCircles();
            this._renderPointers();
            this._renderMergePointers();
            this._renderIdLabels();
            this._resizeSvg();
            this.checkout(this.currentBranch || this.getCommit('HEAD').id);
        },

        _renderCircles: function () {
            var view = this,
                existingCircles,
                newCircles;

            existingCircles = this.commitBox.selectAll('circle.commit')
                .data(this.commitData, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id;
                })
                .classed('reverted', function (d) {
                    return d.reverted;
                })
                .classed('rebased', function (d) {
                    return d.rebased;
                });

            existingCircles.transition()
                .duration(500)
                .call(fixCirclePosition);

            newCircles = existingCircles.enter()
                .append('svg:circle')
                .attr('id', function (d) {
                    return view.name + '-' + d.id;
                })
                .classed('commit', true)
                .classed('merge-commit', function (d) {
                    return typeof d.parent2 === 'string';
                })
                .classed('cherry-picked', function (d) {
                    return !!d.cherryPickedFrom;
                })
                .classed('squashed', function (d) {
                    return !!d.squashOf;
                })
                .classed('stash', function (d) {
                    return !!d.stash;
                })
                .call(fixCirclePosition)
                .attr('r', 1)
                .transition("inflate")
                .duration(500)
                .attr('r', this.commitRadius);

        },

        _renderPointers: function () {
            var view = this,
                existingPointers,
                newPointers;

            existingPointers = this.arrowBox.selectAll('line.commit-pointer')
                .data(this.commitData, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent;
                });

            existingPointers.transition()
                .duration(500)
                .call(fixPointerStartPosition, view)
                .call(fixPointerEndPosition, view);

            newPointers = existingPointers.enter()
                .append('svg:line')
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent;
                })
                .classed('commit-pointer', true)
                .call(fixPointerStartPosition, view)
                .attr('x2', function () { return d3.select(this).attr('x1'); })
                .attr('y2', function () {  return d3.select(this).attr('y1'); })
                .attr('marker-end', REG_MARKER_END)
                .transition()
                .duration(500)
                .call(fixPointerEndPosition, view);
        },

        _renderMergePointers: function () {
            var view = this,
                mergeCommits = [],
                existingPointers, newPointers;

            for (var i = 0; i < this.commitData.length; i++) {
                var commit = this.commitData[i];
                if (typeof commit.parent2 === 'string') {
                    mergeCommits.push(commit);
                }
            }

            existingPointers = this.arrowBox.selectAll('polyline.merge-pointer')
                .data(mergeCommits, function (d) { return d.id; })
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent2;
                });

            existingPointers.transition().duration(500)
                .attr('points', function (d) {
                    var p1 = px1(d, view, 'parent2') + ',' + py1(d, view, 'parent2'),
                        p2 = px2(d, view, 'parent2') + ',' + py2(d, view, 'parent2');

                    return [p1, p2].join(' ');
                });

            newPointers = existingPointers.enter()
                .append('svg:polyline')
                .attr('id', function (d) {
                    return view.name + '-' + d.id + '-to-' + d.parent2;
                })
                .classed('merge-pointer', true)
                .attr('points', function (d) {
                    var x1 = px1(d, view, 'parent2'),
                        y1 = py1(d, view, 'parent2'),
                        p1 = x1 + ',' + y1;

                    return [p1, p1].join(' ');
                })
                .attr('marker-end', MERGE_MARKER_END)
                .transition()
                .duration(500)
                .attr('points', function (d) {
                    var points = d3.select(this).attr('points').split(' '),
                        x2 = px2(d, view, 'parent2'),
                        y2 = py2(d, view, 'parent2');

                    points[1] = x2 + ',' + y2;
                    return points.join(' ');
                });
        },

        _renderIdLabels: function () {
            this._renderText('id-label', function (d) { return d.id + '..'; }, 14);
            this._renderText('message-label', function (d) { return d.message; }, 24);
        },

        _renderText: function(className, getText, delta) {
            var view = this,
                existingTexts,
                newtexts;

            existingTexts = this.commitBox.selectAll('text.' + className)
                .data(this.commitData, function (d) { return d.id; })
                .text(getText);

            existingTexts.transition().call(fixIdPosition, view, delta);

            newtexts = existingTexts.enter()
                .insert('svg:text', ':first-child')
                .classed(className, true)
                .text(getText)
                .call(fixIdPosition, view, delta);
        },

        _parseTagData: function () {
            var tagData = [], i,
                headCommit = null;

            for (i = 0; i < this.commitData.length; i++) {
                var c = this.commitData[i];

                for (var t = 0; t < c.tags.length; t++) {
                    var tagName = c.tags[t];
                    if (tagName.toUpperCase() === 'HEAD') {
                        headCommit = c;
                    } else if (this.branches.indexOf(tagName) === -1) {
                        this.branches.push(tagName);
                    }

                    tagData.push({name: tagName, commit: c.id});
                }
            }

            if (!headCommit) {
                headCommit = this.getCommit(this.currentBranch);
                headCommit.tags.push('HEAD');
                tagData.push({name: 'HEAD', commit: headCommit.id});
            }

            // the HEADs of the other worktrees
            for (i = 0; i < this.worktrees.length; i++) {
                if (i !== this.active) {
                    tagData.push({name: 'HEAD ' + this.worktrees[i].path, commit: this.worktreeHead(i)});
                }
            }

            // stacking order per commit, so no two tags share a place
            var count = {};
            tagData.forEach(function (t) {
                t.index = count[t.commit] = (count[t.commit] || 0) + 1;
                t.index--;
            });

            // find out which commits are not branchless


            return tagData;
        },

        _markBranchlessCommits: function () {
            var branch, commit, parent, parent2, c, b;

            // first mark every commit as branchless
            for (c = 0; c < this.commitData.length; c++) {
                this.commitData[c].branchless = true;
            }

            // reachable from a local branch, a stash or any worktree's HEAD
            var starts = this.branches.filter(function (r) { return !this.isRemoteRef(r); }, this);
            for (b = 0; b < this.worktrees.length; b++) {
                starts.push(this.worktreeHead(b));
            }

            for (b = 0; b < starts.length; b++) {
                branch = starts[b];
                commit = this.getCommit(branch);
                if (commit) {
                    parent = this.getCommit(commit.parent);
                    parent2 = this.getCommit(commit.parent2);

                    commit.branchless = false;

                    while (parent) {
                        parent.branchless = false;
                        parent = this.getCommit(parent.parent);
                    }

                    // just in case this is a merge commit
                    while (parent2) {
                        parent2.branchless = false;
                        parent2 = this.getCommit(parent2.parent);
                    }
                }
            }

            this.svg.selectAll('circle.commit').call(applyBranchlessClass);
            this.svg.selectAll('line.commit-pointer').call(applyBranchlessClass);
            this.svg.selectAll('polyline.merge-pointer').call(applyBranchlessClass);
        },

        renderTags: function () {
            var view = this,
                tagData = this._parseTagData(),
                existingTags, newTags;

            existingTags = this.tagBox.selectAll('g.branch-tag')
                .data(tagData, function (d) { return d.name; });

            existingTags.exit().remove();

            existingTags.select('rect')
                .transition()
                .duration(500)
                .attr('y', function (d) { return tagY(d, view); })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit),
                        width = Number(d3.select(this).attr('width'));

                    return commit.cx - (width / 2);
                });

            existingTags.select('text')
                .transition()
                .duration(500)
                .attr('y', function (d) { return tagY(d, view) + 14; })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit);
                    return commit.cx;
                });

            newTags = existingTags.enter()
                .append('g')
                .attr('class', function (d) {
                    var classes = 'branch-tag';
                    if (d.name.indexOf('HEAD ') === 0) {
                        classes += ' head-tag worktree-head';
                    } else if (d.name.indexOf('[') === 0 && d.name.indexOf(']') === d.name.length - 1) {
                        classes += ' git-tag';
                    } else if (d.name.indexOf('stash@{') === 0) {
                        classes += ' stash-tag';
                    } else if (view.isRemoteRef(d.name)) {
                        classes += ' remote-branch';
                    } else if (d.name.toUpperCase() === 'HEAD') {
                        classes += ' head-tag';
                    }
                    return classes;
                });

            newTags.append('svg:rect')
                .attr('width', function (d) {
                    return (d.name.length * 6) + 10;
                })
                .attr('height', 20)
                .attr('y', function (d) { return tagY(d, view); })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit),
                        width = Number(d3.select(this).attr('width'));

                    return commit.cx - (width / 2);
                });

            newTags.append('svg:text')
                .text(function (d) {
                    if (d.name.indexOf('[') === 0 && d.name.indexOf(']') === d.name.length - 1)
                        return d.name.substring(1, d.name.length - 1); 
                    return d.name; 
                })
                .attr('y', function (d) {
                    return tagY(d, view) + 14;
                })
                .attr('x', function (d) {
                    var commit = view.getCommit(d.commit);
                    return commit.cx;
                });

            this._markBranchlessCommits();
        },

        setStatus: function (status) {
            this.status = status;
            if (this.svg) {
                this.svg.select('text.status-display').text(tr('status_' + status));
            }
        },

        _setCurrentBranch: function (branch) {
            var display = this.svg.select('text.current-branch-display'),
                text;

            if (this.currentBranch && this.currentBranch !== branch) {
                this.previousBranch = this.currentBranch;
            }

            if (branch && !this.isRemoteRef(branch)) {
                text = tr('currentBranch', branch);
                this.currentBranch = branch;
            } else {
                text = tr('detachedHead');
                this.currentBranch = null;
            }

            if (this.worktrees && this.worktrees.length > 1) {
                text = tr('inWorktree', text, this.worktrees[this.active].path);
            }

            display.text(text);
        },

        moveTag: function (tag, ref) {
            var currentLoc = this.getCommit(tag),
                newLoc = this.getCommit(ref);

            if (currentLoc) {
                currentLoc.tags.splice(currentLoc.tags.indexOf(tag), 1);
            }

            newLoc.tags.push(tag);
            return this;
        },

        /**
         * @method isAncestor
         * @param ref1
         * @param ref2
         * @return {Boolean} whether or not ref1 is an ancestor of ref2
         */
        isAncestor: function isAncestor(ref1, ref2) {
            var currentCommit = this.getCommit(ref1),
                targetTree = this.getCommit(ref2),
                inTree = false,
                additionalTrees = [];

            if (!currentCommit) {
                return false;
            }

            while (targetTree) {
                if (targetTree.id === currentCommit.id) {
                    inTree = true;
                    targetTree = null;
                } else {
                    if (targetTree.parent2) {
                        additionalTrees.push(targetTree.parent2);
                    }
                    targetTree = this.getCommit(targetTree.parent);
                }
            }

            if (inTree) {
                return true;
            }

            for (var i = 0; i < additionalTrees.length; i++) {
                inTree = isAncestor.call(this, currentCommit, additionalTrees[i]);
                if (inTree) break;
            }

            return inTree;
        },

        findWorktree: function (path) {
            for (var i = 0; i < this.worktrees.length; i++) {
                if (this.worktrees[i].path === path) {
                    return i;
                }
            }
            return -1;
        },

        worktreeHead: function (i) {
            var w = this.worktrees[i];
            if (i === this.active) {
                return this.getCommit('HEAD').id;
            }
            return w.branch ? this.getCommit(w.branch).id : w.head;
        },

        // the path of the worktree that has <branch> checked out, or null
        worktreeOf: function (branch) {
            for (var i = 0; i < this.worktrees.length; i++) {
                var b = i === this.active ? this.currentBranch : this.worktrees[i].branch;
                if (b === branch) {
                    return this.worktrees[i].path;
                }
            }
            return null;
        },

        // a branch may be checked out in one worktree only
        checkFree: function (branch) {
            var path = this.worktreeOf(branch);
            if (path !== null) {
                throw new Error(tr('branchInWorktree', branch, path));
            }
        },

        activate: function (path) {
            var index = this.findWorktree(path);
            if (index === -1) {
                throw new Error(tr('noWorktree', path));
            }
            if (index === this.active) {
                return;
            }
            var current = this.worktrees[this.active],
                next = this.worktrees[index];

            current.branch = this.currentBranch;
            current.head = this.getCommit('HEAD').id;
            current.status = this.status;
            current.previous = this.previousBranch;

            this.active = index;
            this.currentBranch = next.branch;
            this.previousBranch = next.previous || null;
            this.checkout(next.branch || next.head);
            this.setStatus(next.status);
        },

        addWorktree: function (path, branch, head) {
            this.worktrees.push({ path: path, branch: branch, head: head, status: 'clean' });
            this._setCurrentBranch(this.currentBranch);
            this.renderTags();
        },

        removeWorktree: function (path, force) {
            var index = this.findWorktree(path);
            if (index === -1) {
                throw new Error(tr('noWorktree', path));
            }
            if (index === 0 || index === this.active) {
                throw new Error(tr('worktreeInUse', path));
            }
            if (this.worktrees[index].status !== 'clean' && !force) {
                throw new Error(tr('worktreeDirty', path));
            }
            this.worktrees.splice(index, 1);
            if (this.active > index) {
                this.active--;
            }
            this._setCurrentBranch(this.currentBranch);
            this.renderTags();
        },

        // a stash is a commit on top of HEAD that no branch points to, named stash@{n}
        stashPush: function () {
            var commit = {
                id: this.nextId(),
                parent: this.getCommit('HEAD').id,
                message: 'WIP on ' + (this.currentBranch || this.getCommit('HEAD').id),
                tags: [],
                stash: true
            };
            this.commitData.push(commit);
            this.stashes.unshift(commit.id);
            this._numberStashes();
            this.setStatus('clean');
            this.renderCommits();
        },

        stashDrop: function (index) {
            this.stashes.splice(index, 1);
            this._numberStashes();
            this.renderCommits();
        },

        _numberStashes: function () {
            var view = this;
            this.commitData.forEach(function (c) {
                c.tags = c.tags.filter(function (t) { return t.indexOf('stash@{') !== 0; });
            });
            this.branches = this.branches.filter(function (t) { return t.indexOf('stash@{') !== 0; });
            this.stashes.forEach(function (id, i) {
                view.getCommit(id).tags.push('stash@{' + i + '}');
            });
        },

        // copies one commit onto HEAD, returns the copied (source) commit
        cherryPick: function (ref) {
            var source = this.getCommit(ref);

            if (!source || source.id === 'initial') {
                throw new Error(tr('noRef', ref));
            }
            if (this.isAncestor(source, 'HEAD')) {
                throw new Error(tr('alreadyInHead', ref));
            }
            this.commit({ cherryPickedFrom: source.id }, source.message);
            return source;
        },

        // a new commit with the parents of HEAD; the old one is no longer reachable
        amend: function (message) {
            var head = this.getCommit('HEAD'),
                commit = { parent: head.parent };

            if (!this.currentBranch) {
                throw new Error(tr('detachedCommit'));
            }
            if (head.parent === 'initial') {
                throw new Error(tr('amendRoot'));
            }
            if (head.parent2) {
                commit.parent2 = head.parent2;
            }
            return this.commit(commit, message === undefined ? head.message : message);
        },

        commit: function (commit, message) {
            commit = commit || {};

            !commit.id && (commit.id = this.nextId());
            !commit.tags && (commit.tags = []);

            commit.message = message;
            if (this.squashPending && !commit.parent2) {
                commit.squashOf = this.squashPending;
            }
            this.squashPending = null;
            if (!commit.parent) {
                if (!this.currentBranch) {
                    throw new Error(tr('detachedCommit'));
                }

                commit.parent = this.getCommit(this.currentBranch).id;
            }

            this.commitData.push(commit);
            this.moveTag(this.currentBranch, commit.id);

            this.renderCommits();

            this.checkout(this.currentBranch);
            this.setStatus('clean');
            return this;
        },

        // remote tracking branches look like <remote>/<branch>; feature/login is local
        isRemoteRef: function (name) {
            return !this.isRemote && this.remotes.some(function (r) { return name.indexOf(r + '/') === 0; });
        },

        // from the commits, not from this.branches: that list is filled only when tags are drawn
        isLocalBranch: function (name) {
            if (!name || name === 'HEAD' || this.isRemoteRef(name) || name.charAt(0) === '[' || name.indexOf('stash@{') === 0) {
                return false;
            }
            return this.commitData.some(function (c) { return c.tags.indexOf(name) > -1; });
        },

        _checkNewName: function (name, force) {
            if (!name || name.trim() === '') {
                throw new Error(tr('needBranchName'));
            }

            if (name === 'HEAD') {
                throw new Error(tr('branchHead'));
            }

            if (name.indexOf(' ') > -1) {
                throw new Error(tr('branchSpaces'));
            }

            if (this.branches.indexOf(name) > -1 && !force) {
                var exists = new Error(tr('branchExists', name));
                exists.code = 'exists';
                throw exists;
            }
        },

        _removeTag: function (name) {
            var commit = this.getCommit(name);
            if (commit && commit.tags.indexOf(name) > -1) {
                commit.tags.splice(commit.tags.indexOf(name), 1);
            }
            if (this.branches.indexOf(name) > -1) {
                this.branches.splice(this.branches.indexOf(name), 1);
            }
        },

        renameBranch: function (old, name, force) {
            if (!this.isLocalBranch(old)) {
                throw new Error(tr('noBranch'));
            }
            this._checkNewName(name, force);
            if (name !== old) {
                this._removeTag(name);
            }
            var commit = this.getCommit(old);
            commit.tags[commit.tags.indexOf(old)] = name;
            this.branches.splice(this.branches.indexOf(old), 1);
            this.worktrees.forEach(function (w) {
                if (w.branch === old) {
                    w.branch = name;
                }
            });
            if (this.currentBranch === old) {
                this.currentBranch = name;
                this._setCurrentBranch(name);
            }
            this.renderTags();
        },

        copyBranch: function (old, name, force) {
            if (!this.isLocalBranch(old)) {
                throw new Error(tr('noBranch'));
            }
            this._checkNewName(name, force);
            this._removeTag(name);
            this.getCommit(old).tags.push(name);
            this.renderTags();
        },

        forceBranch: function (name, ref) {
            var target = this.getCommit(ref);
            if (name === this.currentBranch) {
                throw new Error(tr('cannotForceCurrent', name));
            }
            this.checkFree(name);
            if (!target) {
                throw new Error(tr('noRef', ref));
            }
            this._checkNewName(name, true);
            this._removeTag(name);
            target.tags.push(name);
            this.renderTags();
        },

        branch: function (name, start) {
            this._checkNewName(name);
            if (start && !this.getCommit(start)) {
                throw new Error(tr('noRef', start));
            }

            this.getCommit(start || 'HEAD').tags.push(name);
            this.renderTags();
            return this;
        },

        tag: function (name) {
            this.branch('[' + name + ']');
        },

        deleteBranch: function (name) {
            var branchIndex,
                commit;

            if (!name || name.trim() === '') {
                throw new Error(tr('needBranchName'));
            }

            if (name === this.currentBranch) {
                throw new Error(tr('deleteCurrent'));
            }
            this.checkFree(name);

            branchIndex = this.branches.indexOf(name);

            if (branchIndex === -1) {
                throw new Error(tr('noBranch'));
            }

            this.branches.splice(branchIndex, 1);
            commit = this.getCommit(name);
            branchIndex = commit.tags.indexOf(name);

            if (branchIndex > -1) {
                commit.tags.splice(branchIndex, 1);
            }

            this.renderTags();
        },

        checkout: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error(tr('noCommit', ref));
            }

            var previousHead = this.getCircle('HEAD'),
                newHead = this.getCircle(commit.id);

            if (previousHead && !previousHead.empty()) {
                previousHead.classed('checked-out', false);
            }

            this._setCurrentBranch(this.isLocalBranch(ref) ? ref : null);
            this.moveTag('HEAD', commit.id);
            this.renderTags();

            newHead.classed('checked-out', true);

            return this;
        },

        reset: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error(tr('noRef', ref));
            }

            if (this.currentBranch) {
                this.moveTag(this.currentBranch, commit.id);
                this.checkout(this.currentBranch);
            } else {
                this.checkout(commit.id);
            }

            return this;
        },

        revert: function (ref) {
            var commit = this.getCommit(ref);

            if (!commit) {
                throw new Error(tr('noRef', ref));
            }

            if (this.isAncestor(commit, 'HEAD')) {
                commit.reverted = true;
                this.commit({reverts: commit.id});
            } else {
                throw new Error(tr('notAncestor', ref));
            }
        },

        fastForward: function (ref) {
            var targetCommit = this.getCommit(ref);

            if (this.currentBranch) {
                this.moveTag(this.currentBranch, targetCommit.id);
                this.checkout(this.currentBranch);
            } else {
                this.checkout(targetCommit.id);
            }
        },

        merge: function (ref, noFF) {
            var mergeTarget = this.getCommit(ref),
                currentCommit = this.getCommit('HEAD');

            if (!mergeTarget) {
                throw new Error(tr('noRef', ref));
            }

            if (currentCommit.id === mergeTarget.id) {
                throw new Error(tr('upToDate'));
            } else if (currentCommit.parent2 === mergeTarget.id) {
                throw new Error(tr('upToDate'));
            } else if (noFF === true) {
                // the first commit of the merged branch: its parent is already in HEAD
                var branchStartCommit = mergeTarget;
                while (!this.isAncestor(branchStartCommit.parent, currentCommit)) {
                    branchStartCommit = this.getCommit(branchStartCommit.parent);
                }
                
                branchStartCommit.isNoFFBranch = true;
                
                this.commit({parent2: mergeTarget.id, isNoFFCommit: true});
            } else if (this.isAncestor(currentCommit, mergeTarget)) {
                this.fastForward(mergeTarget);
                return 'Fast-Forward';
            } else {
                this.commit({parent2: mergeTarget.id});
            }
        },

        // opt.onto: new base instead of ref; opt.updateRefs: move branches on rebased commits too
        rebase: function (ref, opt) {
            opt = opt || {};
            var upstream = this.getCommit(ref),
                base = opt.onto ? this.getCommit(opt.onto) : upstream,
                currentCommit = this.getCommit('HEAD'),
                rebaseTreeLoc,
                rebaseMessage,
                toRebase = [], rebasedCommit,
                remainingHusk;

            if (!upstream) {
                throw new Error(tr('noRef', ref));
            }
            if (!base) {
                throw new Error(tr('noRef', opt.onto));
            }

            if (!opt.onto) {
                if (currentCommit.id === upstream.id || currentCommit.parent2 === upstream.id) {
                    throw new Error(tr('upToDate'));
                }
                if (this.isAncestor(currentCommit, upstream)) {
                    this.fastForward(upstream);
                    return 'Fast-Forward';
                }
            }

            // the commits of HEAD that upstream does not have, oldest first
            while (currentCommit && currentCommit.id !== 'initial' && !this.isAncestor(currentCommit, upstream)) {
                toRebase.unshift(currentCommit);
                currentCommit = this.getCommit(currentCommit.parent);
            }

            if (toRebase.length === 0) {
                this.fastForward(base);
                return 'Fast-Forward';
            }

            rebaseTreeLoc = base.id;

            for (var i = 0; i < toRebase.length; i++) {
                rebasedCommit = toRebase[i];
                rebaseMessage = rebasedCommit.message;

                remainingHusk = {
                    id: rebasedCommit.id,
                    parent: rebasedCommit.parent,
                    message: rebasedCommit.message,
                    tags: []
                };

                var moved = [];
                for (var t = 0; t < rebasedCommit.tags.length; t++) {
                    var tagName = rebasedCommit.tags[t];
                    if (tagName === this.currentBranch || tagName === 'HEAD') {
                        continue;
                    }
                    if (opt.updateRefs && this.isLocalBranch(tagName) && this.worktreeOf(tagName) === null) {
                        moved.push(tagName);
                    } else {
                        remainingHusk.tags.unshift(tagName);
                    }
                }

                this.commitData.push(remainingHusk);

                rebasedCommit.parent = rebaseTreeLoc;
                rebaseTreeLoc = this.nextId();
                rebasedCommit.id = rebaseTreeLoc;
                rebasedCommit.message = rebaseMessage;
                rebasedCommit.tags.length = 0;
                Array.prototype.push.apply(rebasedCommit.tags, moved);
                rebasedCommit.rebased = true;
            }

            if (this.currentBranch) {
                rebasedCommit.tags.push(this.currentBranch);
            }

            this.renderCommits();

            if (this.currentBranch) {
                this.checkout(this.currentBranch);
            } else {
                this.checkout(rebasedCommit.id);
            }
        }
    };

    return HistoryView;
}

export const ControlBox = controlBoxFactory(d3)
export const HistoryView = historyViewFactory(d3)
