import * as d3selection from 'd3-selection'
import 'd3-transition'
import { tr, fill } from './i18n.js'
import { sameLines, formatDiff, changedPaths, diffStat, blobId, mergeTrees } from './files.js'

// id of the pseudo commit before the first one; contains a space, so no command can name it
export const ROOT = 'initial commit'

// worktree paths: ../wt/ is ../wt, ./wt is wt
var normPath = function (path) {
    return String(path || '').replace(/\/+$/, '').replace(/^\.\/(?=.)/, '') || '.';
};

var clone = function (tree) {
    return JSON.parse(JSON.stringify(tree || {}));
};

// set or delete one path of a tree
var setPath = function (tree, path, lines) {
    if (lines) {
        tree[path] = JSON.parse(JSON.stringify(lines));
    } else {
        delete tree[path];
    }
};

var allPaths = function () {
    var paths = [];
    for (var i = 0; i < arguments.length; i++) {
        Object.keys(arguments[i] || {}).forEach(function (p) {
            if (paths.indexOf(p) === -1) {
                paths.push(p);
            }
        });
    }
    return paths.sort();
};

var sameTree = function (a, b) {
    var keys = Object.keys(a).concat(Object.keys(b));
    return keys.every(function (k) { return sameLines(a[k], b[k]); });
};

// width of a branch or tag label, as renderTags draws it
var labelWidth = function (name) {
    return (name.length * 6) + 10;
};

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
    // shell commands on the working tree
    var SHELL = ['echo', 'cat', 'ls', 'rm', 'mv'];

    // the message after -m: "in quotes", or every word up to the next known flag
    // (0.1.0 courses write git commit -m Hello World)
    var takeMessage = function (args, flags) {
        var words = [];
        if (args.length && /^["']/.test(args[0])) {
            var quote = args[0].charAt(0);
            do {
                words.push(args.shift());
            } while (args.length && !(words[words.length - 1].length > 1 && words[words.length - 1].slice(-1) === quote));
            return words.join(' ').slice(1, -1);
        }
        while (args.length && flags.indexOf(args[0]) === -1) {
            words.push(args.shift());
        }
        return words.join(' ');
    };

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
            if (this.historyView && this.historyView.svg) {
                this.historyView.showStatus();
            }
        },

        // echo text | echo "text" > file | echo text >> file
        _echo: function (args) {
            var text = takeMessage(args, ['>', '>>']),
                op = args.shift(),
                file = args.shift(),
                work = this.historyView.work;

            if (!op) {
                return this.info(text);
            }
            if (!file) {
                throw new Error(tr('needPath'));
            }
            work[file] = (op === '>>' && work[file] ? work[file] : []).concat([text]);
        },

        _cat: function (args) {
            var work = this.historyView.work, control = this;
            if (!args[0] || !work[args[0]]) {
                throw new Error(tr('noFile', args[0] || ''));
            }
            work[args[0]].forEach(function (line) { control.info(line); });
        },

        _ls: function () {
            var names = Object.keys(this.historyView.work).sort();
            if (names.length) {
                this.info(names.join('  '));
            }
        },

        _rm: function (args) {
            var work = this.historyView.work;
            if (!args[0] || !work[args[0]]) {
                throw new Error(tr('noFile', args[0] || ''));
            }
            delete work[args[0]];
        },

        _mv: function (args) {
            var work = this.historyView.work;
            if (!args[0] || !work[args[0]] || !args[1]) {
                throw new Error(tr('noFile', args[0] || ''));
            }
            work[args[1]] = work[args[0]];
            delete work[args[0]];
        },

        _run: function (split) {
            var hv = this.historyView;

            if (split[0] === 'edit') {
                // without files: the abstract change of 0.2.0; with files: one more line
                if (!split[1] && !hv.hasFiles()) {
                    if (hv.status === 'clean') {
                        hv.setStatus('unstaged');
                    }
                } else {
                    var name = split[1] || 'file.txt',
                        old = hv.work[name] || [];
                    hv.work[name] = old.concat(['change ' + (old.length + 1)]);
                }
                return this.info(tr('edited'));
            }

            if (SHELL.indexOf(split[0]) > -1) {
                return this['_' + split[0]](split.slice(1));
            }

            if (split[0] === 'cd') {
                return hv.activate(split[1] || '.');
            }

            if (split[0] !== 'git') {
                return this.error();
            }

            // git -C <path> <command>: run in another worktree, then come back
            if (split[1] === '-C') {
                if (!split[2]) {
                    throw new Error(tr('needPath'));
                }
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
            if (Object.prototype.hasOwnProperty.call(ControlBox.prototype, method) &&
                method.charAt(0) !== '_' && NOT_COMMANDS.indexOf(method) === -1) {
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
            var amend = false, all = false, allowEmpty = false, message,
                flags = ['--amend', '-a', '--all', '--allow-empty', '--no-edit'];

            while (args.length > 0) {
                var arg = args.shift();
                if (arg === '-m' || arg === '-am' || arg === '--message') {
                    all = all || arg === '-am';
                    message = takeMessage(args, flags);
                } else if (arg === '-a' || arg === '--all') {
                    all = true;
                } else if (arg === '--allow-empty') {
                    allowEmpty = true;
                } else if (arg === '--amend') {
                    amend = true;
                } else if (arg !== '-a' && arg !== '--all' && arg !== '--allow-empty' && arg !== '--no-edit') {
                    return this.error();
                }
            }

            var hv = this.historyView;
            if (all && hv.hasFiles()) {
                hv.stageTracked();
            }
            if (hv.hasUnmerged()) {
                throw new Error(tr('unmergedFiles'));
            }
            if (hv.operation && hv.operation.type === 'merge') {
                var op = hv.operation;
                hv.operation = null;
                return hv.commit({ parent2: op.theirs, isNoFFCommit: op.noFF || undefined, tree: clone(hv.index) },
                    message || "Merge branch '" + op.label + "'");
            }
            if (!amend && !allowEmpty && !hv.squashPending && hv.hasFiles() && sameTree(hv.index, hv.headTree())) {
                throw new Error(tr('statusNothing'));
            }

            if (amend) {
                hv.amend(message);
            } else {
                hv.commit({}, message);
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
                if (!rest[0]) {
                    throw new Error(tr('needRef'));
                }
                if (!hv.getCommit(rest[0]) || !hv.isRemoteRef(rest[0])) {
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
            if (hv.operation) {
                throw new Error(tr('operationInProgress', hv.operation.type));
            }

            if (name === '-') {
                if (!hv.previousBranch) {
                    throw new Error(tr('noPrevious'));
                }
                name = hv.previousBranch;
            }

            if (!opt.detach && hv.isLocalBranch(name) && name !== hv.currentBranch) {
                hv.checkFree(name);
            }

            var target, start, exists = hv.isLocalBranch(name);
            if (opt.create) {
                start = hv.getCommit(opt.start || 'HEAD');
                if (!start) {
                    throw new Error(tr('noRef', opt.start));
                }
                if (exists && !opt.force && !opt.lenient) {
                    hv._checkNewName(name); // throws "already exists"
                }
                target = exists && !opt.force ? hv.getCommit(name) : start;
            } else if (opt.detach) {
                target = hv.getCommit(name || 'HEAD');
                if (!target) {
                    throw new Error(tr('noRef', name));
                }
                name = target.id;
            } else {
                if (opt.branchOnly && !exists) {
                    throw new Error(hv.getCommit(name) ? tr('branchExpected', name) : tr('noRef', name));
                }
                target = hv.getCommit(name);
                if (!target) {
                    throw new Error(tr('noCommit', name));
                }
            }

            // local changes must not be lost: check first, then change
            hv.switchTrees(target.tree, true);
            if (opt.create && !exists) {
                hv.branch(name, start.id);
            } else if (opt.create && opt.force) {
                hv.moveTag(name, start.id);
            }
            hv.switchTrees(target.tree);
            hv.checkout(name);
        },

        checkout: function (args) {
            var opt = { lenient: true }, name,
                hv = this.historyView,
                dashes = args.indexOf('--');

            var side = args.indexOf('--ours') > -1 ? 'ours' : args.indexOf('--theirs') > -1 ? 'theirs' : null;
            if (side) {
                return this._takeSide(side, args.filter(function (a) { return a.charAt(0) !== '-'; }));
            }
            if (dashes > -1) {
                return this._checkoutPaths(args.slice(0, dashes).filter(function (a) { return a.charAt(0) !== '-'; })[0], args.slice(dashes + 1));
            }
            if (args.length === 1 && args[0] !== '-' && !hv.getCommit(args[0]) && args[0] in hv.index) {
                return this._checkoutPaths(null, args);
            }

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
                ref = 'HEAD',
                dashes = args.indexOf('--'),
                paths = dashes > -1 ? args.slice(dashes + 1) : [];

            (dashes > -1 ? args.slice(0, dashes) : args).forEach(function (arg) {
                if (arg === '--soft' || arg === '--mixed' || arg === '--hard') {
                    mode = arg.slice(2);
                } else if (arg.charAt(0) !== '-') {
                    ref = arg;
                }
            });

            // git reset <path>: a file name that is no ref
            if (!paths.length && ref !== 'HEAD' && !hv.getCommit(ref) && (ref in hv.index || ref in hv.headTree())) {
                paths = [ref];
                ref = 'HEAD';
            }

            if (paths.length) {
                var source = hv.getCommit(ref);
                if (!source) {
                    throw new Error(tr('noRef', ref));
                }
                paths.forEach(function (p) {
                    if (!source.tree[p] && !hv.index[p]) {
                        throw new Error(tr('noMatch', p));
                    }
                });
                return paths.forEach(function (p) { setPath(hv.index, p, source.tree[p]); });
            }

            var before = hv.getCommit('HEAD').id,
                untracked = hv.untracked();
            hv.reset(ref);
            var moved = hv.getCommit('HEAD').id !== before;

            if (hv.hasFiles() && mode !== 'soft') {
                var target = hv.headTree();
                hv.index = clone(target);
                if (mode === 'hard') {
                    hv.work = clone(target);
                    untracked.forEach(function (p) {
                        if (!target[p]) {
                            hv.work[p] = untracked.files[p];
                        }
                    });
                }
            }

            if (mode === 'hard') {
                hv.setStatus('clean');
                hv.squashPending = null;
            } else if (mode === 'soft') {
                moved && hv.setStatus('staged');
            } else if (moved || hv.status !== 'clean') {
                hv.setStatus('unstaged');
            }
        },

        add: function (args) {
            var hv = this.historyView;
            if (args.length === 0) {
                throw new Error(tr('needPath'));
            }
            if (!hv.hasFiles()) {
                if (hv.status === 'unstaged') {
                    hv.setStatus('staged');
                }
                return;
            }
            var paths = hv.pathsFor(args);
            paths.forEach(function (p) {
                if (hv.work[p]) {
                    hv.index[p] = clone(hv.work[p]);
                } else {
                    delete hv.index[p];
                }
            });
        },

        // git rm [--cached] <path>  (git rm without files: unknown, as in 0.2.0)
        rm: function (args) {
            var hv = this.historyView,
                cached = args.indexOf('--cached') > -1,
                paths = args.filter(function (a) { return a.charAt(0) !== '-'; });
            if (!paths.length) {
                throw new Error(tr('needPath'));
            }
            paths.forEach(function (p) {
                if (!hv.index[p]) {
                    throw new Error(tr('noMatch', p));
                }
            });
            paths.forEach(function (p) {
                delete hv.index[p];
                if (!cached) {
                    delete hv.work[p];
                }
            });
        },

        mv: function (args) {
            var hv = this.historyView, from = args[0], to = args[1];
            if (!from || !to) {
                throw new Error(tr('needPath'));
            }
            if (!hv.index[from]) {
                throw new Error(tr('noMatch', from));
            }
            hv.index[to] = hv.index[from];
            delete hv.index[from];
            if (hv.work[from]) {
                hv.work[to] = hv.work[from];
                delete hv.work[from];
            }
        },

        restore: function (args) {
            var hv = this.historyView,
                staged = args.indexOf('--staged') > -1 || args.indexOf('-S') > -1;

            if (!args.some(function (a) { return a.charAt(0) !== '-'; })) {
                throw new Error(tr('needPath'));
            }
            var side = args.indexOf('--ours') > -1 ? 'ours' : args.indexOf('--theirs') > -1 ? 'theirs' : null;
            if (side) {
                return this._takeSide(side, args.filter(function (a) { return a.charAt(0) !== '-'; }));
            }
            if (hv.hasFiles()) {
                return this._restoreFiles(args, staged);
            }
            if (staged && hv.status === 'staged') {
                hv.setStatus('unstaged');
            } else if (!staged && hv.status === 'unstaged') {
                hv.setStatus('clean');
            }
        },

        // restore [--staged] [--worktree] [--source=<ref>] <path>...
        _restoreFiles: function (args, staged) {
            var hv = this.historyView,
                worktree = !staged || args.indexOf('--worktree') > -1 || args.indexOf('-W') > -1,
                source = null,
                paths = [];

            for (var i = 0; i < args.length; i++) {
                if (args[i].indexOf('--source=') === 0) {
                    source = args[i].slice(9);
                } else if (args[i] === '--source' || args[i] === '-s') {
                    source = args[++i];
                } else if (args[i].charAt(0) !== '-') {
                    paths.push(args[i]);
                }
            }

            var src = null;
            if (source) {
                if (!hv.getCommit(source)) {
                    throw new Error(tr('noRef', source));
                }
                src = hv.getCommit(source).tree;
            }
            var head = hv.headTree(),
                known = allPaths(head, hv.index, hv.work, src);
            if (paths.indexOf('.') > -1) {
                paths = known;
            }
            paths.forEach(function (p) {
                if (known.indexOf(p) === -1) {
                    throw new Error(tr('noMatch', p));
                }
            });
            paths.forEach(function (p) {
                if (staged) {
                    setPath(hv.index, p, (src || head)[p]);
                }
                if (worktree) {
                    setPath(hv.work, p, (src || (staged ? head : hv.index))[p]);
                }
            });
        },

        // checkout/restore --ours|--theirs <path>: one side of a conflict into the working tree
        _takeSide: function (side, paths) {
            var hv = this.historyView;
            paths.forEach(function (p) {
                if (!hv.index[p] || Array.isArray(hv.index[p])) {
                    throw new Error(tr('notUnmerged', p));
                }
            });
            paths.forEach(function (p) { setPath(hv.work, p, hv.index[p].unmerged[side]); });
        },

        // checkout [<ref>] -- <path>...: files, not branches
        _checkoutPaths: function (ref, paths) {
            var hv = this.historyView,
                src = ref ? hv.getCommit(ref) : null;
            if (ref && !src) {
                throw new Error(tr('noRef', ref));
            }
            var from = src ? src.tree : hv.index;
            if (paths.indexOf('.') > -1) {
                paths = Object.keys(from).sort();
            }
            paths.forEach(function (p) {
                if (!from[p]) {
                    throw new Error(tr('noMatch', p));
                }
            });
            paths.forEach(function (p) {
                if (src) {
                    setPath(hv.index, p, from[p]);
                }
                setPath(hv.work, p, from[p]);
            });
        },

        // one line of diff output: colored, never translated
        diffLine: function (text, kind) {
            this.log.append('div')
                .classed('diff', true)
                .classed('diff-' + kind, true)
                .classed('notranslate', true)
                .attr('translate', 'no')
                .text(text);
            this._scrollToBottom();
        },

        _printDiff: function (a, b, paths, stat) {
            // unmerged index entries have no single content
            var plain = function (t) {
                var out = {};
                Object.keys(t).forEach(function (p) {
                    if (Array.isArray(t[p])) {
                        out[p] = t[p];
                    }
                });
                return out;
            };
            a = plain(a);
            b = plain(b);
            var control = this,
                only = function (p) { return !paths.length || paths.indexOf(p) > -1; };
            if (stat) {
                var st = diffStat(a, b);
                st.files = st.files.filter(function (f) { return only(f.path); });
                if (!st.files.length) {
                    return;
                }
                st.files.forEach(function (f) {
                    control.diffLine(' ' + f.path + ' | ' + (f.plus + f.minus) + ' ' +
                        new Array(f.plus + 1).join('+') + new Array(f.minus + 1).join('-'), 'stat');
                });
                return this.diffLine(tr('statSummary', st.files.length,
                    st.files.reduce(function (n, f) { return n + f.plus; }, 0),
                    st.files.reduce(function (n, f) { return n + f.minus; }, 0)), 'stat');
            }
            changedPaths(a, b).filter(only).forEach(function (p) {
                var hunk = false;
                formatDiff(p, a[p], b[p]).forEach(function (line) {
                    var kind = 'head';
                    if (line.indexOf('@@') === 0) {
                        hunk = true;
                        kind = 'hunk';
                    } else if (hunk) {
                        kind = { '+': 'add', '-': 'del' }[line.charAt(0)] || 'ctx';
                    }
                    control.diffLine(line, kind);
                });
            });
        },

        _tree: function (ref) {
            var commit = this.historyView.getCommit(ref);
            if (!commit) {
                throw new Error(tr('noRef', ref));
            }
            return commit.tree || {};
        },

        // diff [--staged] [--stat] [<a> [<b>] | <a>..<b> | <a>...<b>] [-- <path>...]
        diff: function (args) {
            var hv = this.historyView,
                dashes = args.indexOf('--'),
                paths = dashes > -1 ? args.slice(dashes + 1) : [],
                opts = dashes > -1 ? args.slice(0, dashes) : args,
                staged = opts.indexOf('--staged') > -1 || opts.indexOf('--cached') > -1,
                stat = opts.indexOf('--stat') > -1,
                refs = opts.filter(function (a) { return a.charAt(0) !== '-'; }),
                a, b;

            var range = refs.length === 1 && /^(.*?)(\.\.\.?)(.*)$/.exec(refs[0]);
            if (range) {
                var left = range[1] || 'HEAD', right = range[3] || 'HEAD';
                if (range[2] === '...') {
                    var base = hv.mergeBase(left, right);
                    this._tree(left);
                    a = base ? base.tree : {};
                } else {
                    a = this._tree(left);
                }
                b = this._tree(right);
            } else if (refs.length >= 2) {
                a = this._tree(refs[0]);
                b = this._tree(refs[1]);
            } else if (refs.length === 1) {
                a = this._tree(refs[0]);
                b = staged ? hv.index : hv.work;
            } else {
                a = staged ? hv.headTree() : hv.index;
                b = staged ? hv.index : hv.work;
            }
            this._printDiff(a, b, paths, stat);
        },

        show: function (args) {
            var hv = this.historyView,
                ref = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'HEAD',
                commit = hv.getCommit(ref);
            if (!commit) {
                throw new Error(tr('noRef', ref));
            }
            this.diffLine('commit ' + commit.id, 'head');
            if (commit.parent2) {
                this.diffLine('Merge: ' + hv.getCommit(commit.parent).id + ' ' + commit.parent2, 'head');
            }
            this.diffLine('    ' + (commit.message || ''), 'ctx');
            this._printDiff(hv.getCommit(commit.parent).tree || {}, commit.tree || {}, [], false);
        },

        status: function (args) {
            var hv = this.historyView, control = this;
            if (!hv.hasFiles()) {
                return this.info(tr('status_' + hv.status));
            }
            var files = hv.fileStatus();
            if (args && (args.indexOf('-s') > -1 || args.indexOf('--short') > -1)) {
                return files.forEach(function (f) { control.info(tr('shortLine', f.x + f.y, f.path)); });
            }
            var kinds = { A: 'fileNew', M: 'fileModified', D: 'fileDeleted' },
                section = function (title, list, line) {
                    if (list.length) {
                        control.info(tr(title));
                        list.forEach(function (f) { control.info(line(f)); });
                    }
                };
            section('statusUnmerged', files.filter(function (f) { return f.x === 'U'; }), function (f) { return tr('fileBoth', f.path); });
            section('statusStaged', files.filter(function (f) { return kinds[f.x]; }), function (f) { return tr(kinds[f.x], f.path); });
            section('statusUnstaged', files.filter(function (f) { return kinds[f.y]; }), function (f) { return tr(kinds[f.y], f.path); });
            section('statusUntracked', files.filter(function (f) { return f.y === '?'; }), function (f) { return tr('pathLine', f.path); });
            if (!files.length) {
                this.info(tr('statusNothing'));
            }
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
                    control.info(branch ? tr('worktreeLine', w.path, head, branch) : tr('worktreeLineDetached', w.path, head));
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
                branch = target || normPath(path).split('/').pop();
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
                ref = args.slice(1).filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'stash@{0}',
                index = Number((/^stash@\{(\d+)\}$/.exec(ref) || [])[1]);

            if (action === 'push' || action === 'save') {
                var opt = {
                    untracked: args.indexOf('-u') > -1 || args.indexOf('--include-untracked') > -1,
                    keepIndex: args.indexOf('--keep-index') > -1 || args.indexOf('-k') > -1
                };
                var changes = hv.hasFiles()
                    ? hv.fileStatus().some(function (f) { return f.x !== '?' || opt.untracked; })
                    : hv.status !== 'clean';
                if (!changes) {
                    return this.info(tr('noLocalChanges'));
                }
                var m = args.indexOf('-m') > -1 ? args.indexOf('-m') : args.indexOf('--message');
                hv.stashPush(m > -1 ? takeMessage(args.slice(m + 1), []) : null, opt);
                return this.info(tr('stashSaved', 0));
            }
            if (action === 'branch') {
                return hv.stashBranch(args[1], args[2] || 'stash@{0}', this);
            }
            if (action === 'list') {
                for (var i = 0; i < hv.stashes.length; i++) {
                    this.info(tr('stashLine', i, hv.getCommit(hv.stashes[i]).message));
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
                if (hv.hasFiles()) {
                    var result = hv.stashApply(index, args.indexOf('--index') > -1),
                        control = this;
                    if (result.conflicts.length) {
                        // like git: a stash that did not apply cleanly is kept
                        return result.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                    }
                } else {
                    hv.setStatus('unstaged');
                }
            }
            if (action === 'drop' || action === 'pop') {
                hv.stashDrop(index);
            } else if (action !== 'apply') {
                return this.error();
            }
        },

        // clean -n / -f (also combined like -fd, -nx); without files: the 0.2.0 message
        clean: function (args) {
            var hv = this.historyView, control = this;
            if (!hv.hasFiles()) {
                return this.info(tr('clean'));
            }
            var letters = args.filter(function (a) { return /^-[a-z]+$/.test(a); }).join(''),
                dry = letters.indexOf('n') > -1 || args.indexOf('--dry-run') > -1,
                force = letters.indexOf('f') > -1 || args.indexOf('--force') > -1;
            if (!dry && !force) {
                throw new Error(tr('requireForce'));
            }
            hv.untracked().forEach(function (p) {
                if (dry) {
                    control.info(tr('wouldRemove', p));
                } else {
                    delete hv.work[p];
                    control.info(tr('removing', p));
                }
            });
        },

        // --continue / --skip / --abort of cherry-pick, revert and rebase
        _sequenceFlag: function (type, args) {
            var hv = this.historyView;
            if (args.indexOf('--abort') > -1) {
                hv.abortOperation(type);
                return true;
            }
            if (args.indexOf('--continue') > -1) {
                this._printSequence(type, hv.continueOperation(type));
                return true;
            }
            if (args.indexOf('--skip') > -1) {
                this._printSequence(type, hv.skipOperation(type));
                return true;
            }
            if (hv.operation) {
                throw new Error(tr('operationInProgress', hv.operation.type));
            }
            return false;
        },

        _printSequence: function (type, result) {
            var control = this;
            (result.done || []).forEach(function (d) {
                if (type === 'cherry-pick') {
                    control.info(tr('cherryPicked', d.from, d.to));
                }
            });
            if (result.conflicts) {
                result.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                this.info(tr('stoppedAt', result.at.id, result.at.message || ''));
                this.info(tr('resolveHint', type));
            }
        },

        'cherry-pick': function (args) {
            var hv = this.historyView,
                refs = args.filter(function (a) { return a.charAt(0) !== '-'; });

            if (this._sequenceFlag('cherry-pick', args)) {
                return;
            }
            if (refs.length === 0) {
                throw new Error(tr('needRef'));
            }
            if (hv.hasFiles()) {
                var items = refs.map(function (ref) {
                    var source = hv.getCommit(ref);
                    if (!source || source.id === ROOT) {
                        throw new Error(tr('noRef', ref));
                    }
                    if (hv.isAncestor(source, 'HEAD')) {
                        throw new Error(tr('alreadyInHead', ref));
                    }
                    return { id: source.id, kind: 'pick' };
                });
                return this._printSequence('cherry-pick', hv.startSequence('cherry-pick', items));
            }
            for (var i = 0; i < refs.length; i++) {
                var source = hv.cherryPick(refs[i]);
                this.info(tr('cherryPicked', source.id, hv.getCommit('HEAD').id));
            }
        },

        revert: function (args) {
            var hv = this.historyView,
                ref = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
            if (this._sequenceFlag('revert', args)) {
                return;
            }
            if (hv.hasFiles()) {
                var commit = hv.getCommit(ref);
                if (!commit) {
                    throw new Error(tr('noRef', ref));
                }
                if (!hv.isAncestor(commit, 'HEAD')) {
                    throw new Error(tr('notAncestor', ref));
                }
                return this._printSequence('revert', hv.startSequence('revert', [{ id: commit.id, kind: 'revert' }]));
            }
            hv.revert(ref);
        },

        merge: function (args) {
            var hv = this.historyView,
                opt = {},
                branch;

            if (args.indexOf('--abort') > -1) {
                return hv.abortOperation('merge');
            }
            if (args.indexOf('--continue') > -1) {
                if (!hv.operation || hv.operation.type !== 'merge') {
                    throw new Error(tr('noOperation', 'merge'));
                }
                return this.commit([]);
            }
            if (hv.operation) {
                throw new Error(tr('operationInProgress', hv.operation.type));
            }

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
                if (hv.hasFiles()) {
                    var base = hv.mergeBase('HEAD', target.id),
                        merged = hv._threeWay(base ? base.tree : {}, target.tree, branch),
                        control = this;
                    merged.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                }
                hv.squashPending = target.id;
                hv.setStatus('staged');
                this.info(tr('squashed', branch));
                return;
            }

            if (opt.ffOnly && hv.getCommit(branch) && !hv.isAncestor('HEAD', branch) && !hv.isAncestor(branch, 'HEAD')) {
                throw new Error(tr('notFastForward'));
            }

            var result = hv.merge(branch, opt.noFF),
                control = this;

            if (result === 'Fast-Forward') {
                this.info(tr('fastForward'));
            } else if (result === 'Up-To-Date') {
                this.info(tr('upToDate'));
            } else if (result && result.conflicts) {
                result.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                this.info(tr('mergeFailed'));
            }
        },

        rebase: function (args) {
            var opt = {}, positional = [], ref, result;

            if (this._sequenceFlag('rebase', args)) {
                return;
            }

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
            var hv = this.historyView;
            if (!hv.getCommit(ref)) {
                throw new Error(tr('noRef', ref));
            }
            if (opt.onto && !hv.getCommit(opt.onto)) {
                throw new Error(tr('noRef', opt.onto));
            }
            // git rebase <upstream> <branch>: switch to <branch> first
            if (positional[1]) {
                this._changeBranch(positional[1], {});
            }

            result = this.historyView.rebase(ref, opt);
            if (result && result.done) {
                this._printSequence('rebase', result);
            } else if (result === 'Fast-Forward') {
                this.info(tr('fastForwardTo', opt.onto || ref));
            } else if (result === 'Up-To-Date') {
                this.info(tr('upToDate'));
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
            var result = args[0] === '--rebase' || control.rebaseConfig[currentBranch] === 'true' || local.config['pull.rebase'] === 'true'
                ? local.rebase(rtBranch)
                : local.merge(rtBranch);

            if (result === 'Fast-Forward') {
                control.info(tr('fastForwardTo', rtBranch));
            } else if (result === 'Up-To-Date') {
                control.info(tr('upToDate'));
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
                if (!positional[1]) {
                    throw new Error(tr('needBranchName'));
                }
                if (!remote.isLocalBranch(positional[1])) {
                    throw new Error(tr('noRef', positional[1]));
                }
                if (positional[1] === remote.currentBranch) {
                    throw new Error(tr('deleteCurrent'));
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
                        while (commit && commit.id !== ROOT && remote.getCommit(commit.id) === null &&
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

        // config [--global|--local] <key> [<value>] | --list  (one set of settings per repository)
        config: function (args) {
            var hv = this.historyView, control = this;
            args = args.filter(function (a) { return a !== '--global' && a !== '--local' && a !== '--system'; });
            if (args[0] === '--list' || args[0] === '-l') {
                return Object.keys(hv.config).sort().forEach(function (k) { control.info(k + '=' + hv.config[k]); });
            }
            var key = args[0];
            if (!key) {
                throw new Error(tr('configUsage'));
            }
            if (args.length === 1) {
                if (key in hv.config) {
                    this.info(hv.config[key]);
                }
                return;
            }
            hv.config[key] = takeMessage(args.slice(1), []);
            var branch = /^branch\.(.+)\.rebase$/.exec(key);
            if (branch) {
                this.rebaseConfig[branch[1]] = hv.config[key];
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

        return parentCX + (view.spacing || view.commitRadius * 4.5);
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
            !commit.parent && (commit.parent = ROOT);
            !commit.tags && (commit.tags = []);
            !commit.tree && (commit.tree = {});
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
        this._legacyStatus = 'clean'; // working tree without files (0.2.0): clean, staged or unstaged
        this.index = {};                // files of the active worktree: path -> lines
        this.work = {};
        this.stashes = [];      // commit ids, newest first
        this.config = {};       // git config of this repository
        this.operation = null;  // merge/cherry-pick/revert/rebase that stopped at a conflict
        this.upstream = {};     // branch -> remote tracking branch, set by push -u / branch -u
        // worktrees: the active one lives in currentBranch, HEAD and status
        this.worktrees = [{ path: '.', branch: this.currentBranch, head: null, status: 'clean' }];
        this.active = 0;
        this.remoteName = config.remoteName;

        this.initialCommit = {
            id: ROOT,
            tree: {},
            parent: null,
            cx: -(this.commitRadius * 2),
            cy: this.baseLine
        };
    }

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

            if (ref === ROOT) {
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
                // nothing comes before the first commit (git: unknown revision)
                return matchedCommit && matchedCommit.id !== ROOT ? matchedCommit : null;
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

        _neededSpacing: function () {
            var widest = 0, i;
            for (i = 0; i < this.commitData.length; i++) {
                this.commitData[i].tags.forEach(function (t) { widest = Math.max(widest, labelWidth(t)); });
            }
            for (i = 0; i < this.worktrees.length; i++) {
                if (i !== this.active) {
                    widest = Math.max(widest, labelWidth('HEAD ' + this.worktrees[i].path));
                }
            }
            return Math.max(this.commitRadius * 4.5, widest + 10);
        },

        renderCommits: function () {
            this.spacing = this._neededSpacing();
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
            // a longer label than the commits have room for: lay the commits out again
            if (this._neededSpacing() > (this.spacing || 0) && !this._spacingPass) {
                this._spacingPass = true;
                try {
                    this.renderCommits();
                } finally {
                    this._spacingPass = false;
                }
                return;
            }
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

        // with files the state comes from HEAD, index and working tree, else from the 0.2.0 switch
        get status() {
            if (!this.hasFiles()) {
                return this._legacyStatus;
            }
            var files = this.fileStatus();
            if (files.some(function (f) { return f.x === 'U'; })) {
                return 'conflict';
            }
            if (files.some(function (f) { return f.y !== ' '; })) {
                return 'unstaged';
            }
            return files.length ? 'staged' : 'clean';
        },

        setStatus: function (status) {
            this._legacyStatus = status;
            this.showStatus();
        },

        showStatus: function () {
            if (this.svg) {
                this.svg.select('text.status-display').text(tr('status_' + this.status));
            }
            this.renderFiles();
        },

        // table under the graph: each file in HEAD, index and working tree (blob ids, content as tooltip)
        renderFiles: function () {
            var table = this.filesPanel;
            if (!table) {
                return;
            }
            table.hidden = !this.hasFiles();
            if (table.hidden) {
                return;
            }
            var head = this.headTree(), index = this.index, work = this.work,
                cell = function (row, lines, before, compare) {
                    var td = row.insertCell();
                    td.className = 'notranslate';
                    td.setAttribute('translate', 'no');
                    if (lines && !Array.isArray(lines)) {
                        td.textContent = tr('conflictCell');
                        td.classList.add('conflict');
                        return;
                    }
                    td.textContent = lines ? blobId(lines) : '–';
                    if (lines) {
                        td.title = lines.join('\n');
                    }
                    if (compare && !sameLines(lines, before)) {
                        td.classList.add('changed');
                    }
                };

            table.innerHTML = '';
            table.createCaption().textContent = tr('filesCaption');
            var headRow = table.createTHead().insertRow();
            [tr('fileColumn'), 'HEAD', tr('indexColumn'), tr('workColumn')].forEach(function (label) {
                var th = document.createElement('th');
                th.scope = 'col';
                th.textContent = label;
                headRow.appendChild(th);
            });
            var body = table.createTBody();
            allPaths(head, index, work).forEach(function (p) {
                var row = body.insertRow(),
                    th = document.createElement('th');
                th.scope = 'row';
                th.className = 'notranslate';
                th.setAttribute('translate', 'no');
                th.textContent = p;
                row.appendChild(th);
                cell(row, head[p], null, false);
                cell(row, index[p], head[p], true);
                cell(row, work[p], Array.isArray(index[p]) ? index[p] : undefined, true);
            });
        },

        headTree: function () {
            var head = this.getCommit('HEAD');
            return (head && head.tree) || {};
        },

        hasFiles: function () {
            return Object.keys(this.index).length > 0 || Object.keys(this.work).length > 0 ||
                this.commitData.some(function (c) { return c.tree && Object.keys(c.tree).length > 0; });
        },

        // like git status --short: x = index against HEAD, y = working tree against index
        fileStatus: function () {
            var head = this.headTree(), index = this.index, work = this.work,
                paths = Object.keys(head).concat(Object.keys(index), Object.keys(work))
                    .filter(function (p, i, all) { return all.indexOf(p) === i; }).sort();

            return paths.map(function (p) {
                var h = head[p], i = index[p], w = work[p], x = ' ', y = ' ';
                if (i && !Array.isArray(i)) {
                    return { path: p, x: 'U', y: 'U' };
                }
                if (!h && !i) {
                    x = '?';
                } else if (!h) {
                    x = 'A';
                } else if (!i) {
                    x = 'D';
                } else if (!sameLines(h, i)) {
                    x = 'M';
                }
                if (!i) {
                    y = w ? '?' : ' ';
                } else if (!w) {
                    y = 'D';
                } else if (!sameLines(i, w)) {
                    y = 'M';
                }
                return { path: p, x: x, y: y };
            }).filter(function (f) { return f.x !== ' ' || f.y !== ' '; });
        },

        // git add . / -A / <paths>: every path named must exist somewhere
        pathsFor: function (args) {
            var index = this.index, work = this.work,
                all = Object.keys(index).concat(Object.keys(work))
                    .filter(function (p, i, list) { return list.indexOf(p) === i; }).sort();
            if (args.some(function (a) { return a === '.' || a === '-A' || a === '--all'; })) {
                return all;
            }
            return args.filter(function (a) { return a.charAt(0) !== '-'; }).map(function (p) {
                if (all.indexOf(p) === -1) {
                    throw new Error(tr('noMatch', p));
                }
                return p;
            });
        },

        // the nearest common ancestor of two refs (breadth-first from b, first parents first)
        mergeBase: function (a, b) {
            var view = this, seen = {}, todo = [this.getCommit(a)], c;
            while (todo.length) {
                c = todo.shift();
                if (c && c.id !== ROOT && !seen[c.id]) {
                    seen[c.id] = true;
                    todo.push(view.getCommit(c.parent), c.parent2 && view.getCommit(c.parent2));
                }
            }
            todo = [this.getCommit(b)];
            var visited = {};
            while (todo.length) {
                c = todo.shift();
                if (!c || c.id === ROOT || visited[c.id]) {
                    continue;
                }
                if (seen[c.id]) {
                    return c;
                }
                visited[c.id] = true;
                todo.push(view.getCommit(c.parent), c.parent2 && view.getCommit(c.parent2));
            }
            return null;
        },

        // paths in the working tree that the index does not know; .files keeps their content
        untracked: function () {
            var index = this.index, work = this.work,
                list = Object.keys(work).filter(function (p) { return !index[p]; }).sort();
            list.files = {};
            list.forEach(function (p) { list.files[p] = work[p]; });
            return list;
        },

        // switching to another commit: files that differ there must have no local changes,
        // all other local changes come along (check = only test, change nothing)
        switchTrees: function (target, check) {
            var head = this.headTree(), index = this.index, work = this.work;
            if (!this.hasFiles() && !Object.keys(target || {}).length) {
                return;
            }
            var changes = allPaths(head, target, index, work).filter(function (p) {
                return !sameLines(target[p], head[p]);
            });
            changes.forEach(function (p) {
                if (!sameLines(index[p], head[p]) || !sameLines(work[p], index[p])) {
                    throw new Error(tr('localChanges', p));
                }
            });
            if (!check) {
                changes.forEach(function (p) {
                    setPath(index, p, target[p]);
                    setPath(work, p, target[p]);
                });
            }
        },

        // commit -a: tracked files take their working tree content
        stageTracked: function () {
            var index = this.index, work = this.work;
            Object.keys(index).forEach(function (p) {
                if (work[p]) {
                    index[p] = clone(work[p]);
                } else {
                    delete index[p];
                }
            });
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
            path = normPath(path);
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
            current.index = this.index;
            current.work = this.work;
            current.operation = this.operation;
            current.previous = this.previousBranch;
            current.squash = this.squashPending;

            this.active = index;
            this.currentBranch = next.branch;
            this.previousBranch = next.previous || null;
            this.squashPending = next.squash || null;
            this.index = next.index || {};
            this.work = next.work || {};
            this.operation = next.operation || null;
            this.checkout(next.branch || next.head);
            this.setStatus(next.status);
        },

        addWorktree: function (path, branch, head) {
            var tree = this.getCommit(head).tree;
            this.worktrees.push({ path: normPath(path), branch: branch, head: head, status: 'clean', index: clone(tree), work: clone(tree) });
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
        // the stash commit keeps the working tree (tree) and the index (indexTree);
        // -u also takes untracked files, --keep-index leaves the index as it is
        stashPush: function (text, opt) {
            opt = opt || {};
            var where = this.currentBranch || this.getCommit('HEAD').id,
                head = this.headTree(),
                untracked = this.untracked(),
                tree = {}, view = this,
                commit = {
                id: this.nextId(),
                parent: this.getCommit('HEAD').id,
                // stored as plain text: the marks are only for display
                message: (text ? tr('stashOn', where, text) : tr('stashWip', where)).replace(/[\u2068\u2069]/g, ''),
                tags: [],
                stash: true
            };
            if (this.hasFiles()) {
                allPaths(head, this.index).forEach(function (p) { setPath(tree, p, view.work[p]); });
                if (opt.untracked) {
                    untracked.forEach(function (p) { tree[p] = untracked.files[p]; });
                }
                commit.tree = tree;
                commit.indexTree = clone(this.index);
                commit.untracked = opt.untracked ? untracked.slice() : [];
                var keep = opt.keepIndex ? this.index : head;
                this.index = clone(keep);
                this.work = clone(keep);
                if (!opt.untracked) {
                    untracked.forEach(function (p) {
                        if (!keep[p]) {
                            view.work[p] = untracked.files[p];
                        }
                    });
                }
            }
            this.commitData.push(commit);
            this.stashes.unshift(commit.id);
            this._numberStashes();
            this.setStatus('clean');
            this.squashPending = null;
            this.renderCommits();
        },

        // three-way: the change from the stash base to the stashed working tree onto HEAD
        stashApply: function (index, withIndex) {
            var stash = this.getCommit(this.stashes[index]),
                base = this.getCommit(stash.parent).tree || {},
                head = this.headTree(),
                result = this._threeWay(base, stash.tree, 'stash@{' + index + '}'),
                view = this;
            if (!result.conflicts.length) {
                // the changes come back unstaged; new files stay added, untracked ones untracked
                allPaths(base, stash.tree).forEach(function (p) {
                    if (withIndex && !sameLines(stash.indexTree[p], base[p])) {
                        setPath(view.index, p, stash.indexTree[p]);
                    } else if (head[p] || stash.untracked.indexOf(p) > -1) {
                        setPath(view.index, p, head[p]);
                    }
                });
            }
            return result;
        },

        // stash branch <name>: a new branch at the commit the stash was made on, then pop
        stashBranch: function (name, ref, control) {
            var index = Number((/^stash@\{(\d+)\}$/.exec(ref) || [])[1]);
            if (!name) {
                throw new Error(tr('needBranchName'));
            }
            if (isNaN(index) || index >= this.stashes.length) {
                throw new Error(this.stashes.length ? tr('noRef', ref) : tr('noStash'));
            }
            control._changeBranch(name, { create: true, start: this.getCommit(this.stashes[index]).parent });
            if (!this.stashApply(index, true).conflicts.length) {
                this.stashDrop(index);
            }
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

            if (!source || source.id === ROOT) {
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

            if (head.parent === ROOT) {
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
            if (!commit.tree) {
                commit.tree = clone(this.index);
            }
            if (this.squashPending && !commit.parent2) {
                commit.squashOf = this.squashPending;
            }
            this.squashPending = null;
            if (!commit.parent) {
                commit.parent = this.getCommit('HEAD').id;
            }

            this.commitData.push(commit);
            // on a branch the branch moves; on a detached HEAD only HEAD does
            if (this.currentBranch) {
                this.moveTag(this.currentBranch, commit.id);
            }

            this.renderCommits();

            this.checkout(this.currentBranch || commit.id);
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

            this._setCurrentBranch(this.isLocalBranch(ref) ? ref : ref === 'HEAD' ? this.currentBranch : null);
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

            if (this.isAncestor(mergeTarget, currentCommit)) {
                return 'Up-To-Date';
            }
            if (this.hasFiles() || Object.keys(mergeTarget.tree).length) {
                if (noFF !== true && this.isAncestor(currentCommit, mergeTarget)) {
                    this.switchTrees(mergeTarget.tree, true);
                    this.switchTrees(mergeTarget.tree);
                    this.fastForward(mergeTarget);
                    return 'Fast-Forward';
                }
                return this._mergeFiles(mergeTarget, ref, noFF, currentCommit);
            }
            if (noFF === true) {
                this._markNoFF(mergeTarget, currentCommit);
                this.commit({parent2: mergeTarget.id, isNoFFCommit: true});
            } else if (this.isAncestor(currentCommit, mergeTarget)) {
                this.fastForward(mergeTarget);
                return 'Fast-Forward';
            } else {
                this.commit({parent2: mergeTarget.id});
            }
        },

        // three-way merge of the files; stops with an operation when files conflict
        _mergeFiles: function (target, label, noFF, currentCommit) {
            var before = { index: clone(this.index), work: clone(this.work) },
                base = this.mergeBase('HEAD', target.id),
                result = this._threeWay(base ? base.tree : {}, target.tree, label);
            if (result.conflicts.length) {
                this.operation = { type: 'merge', theirs: target.id, label: label, noFF: noFF === true, before: before };
                return { conflicts: result.conflicts };
            }
            if (noFF === true) {
                this._markNoFF(target, currentCommit);
            }
            this.commit({ parent2: target.id, isNoFFCommit: noFF === true || undefined, tree: clone(result.tree) }, "Merge branch '" + label + "'");
        },

        // apply the change base -> theirs onto HEAD in index and working tree; conflicts are marked
        // (staged changes and local changes in touched files are refused first)
        _threeWay: function (base, theirs, label) {
            var head = this.headTree(), index = this.index, work = this.work;
            changedPaths(head, index).forEach(function (p) {
                throw new Error(tr('localChanges', p));
            });
            var style = this.config['merge.conflictstyle'] === 'diff3' ? 'diff3' : 'merge',
                result = mergeTrees(base, head, theirs, { ours: 'HEAD', theirs: label }, style),
                touched = allPaths(result.tree, head).filter(function (p) {
                    return !sameLines(head[p], result.tree[p]) || result.conflicts.indexOf(p) > -1;
                });
            touched.forEach(function (p) {
                if (!sameLines(work[p], index[p])) {
                    throw new Error(tr('localChanges', p));
                }
            });
            touched.forEach(function (p) {
                setPath(index, p, result.tree[p]);
                setPath(work, p, result.tree[p]);
            });
            result.conflicts.forEach(function (p) { index[p] = { unmerged: result.unmerged[p] }; });
            return result;
        },

        // the change one commit made (or its reverse) onto HEAD
        applyCommit: function (commit, reverse) {
            var parent = this.getCommit(commit.parent),
                parentTree = (parent && parent.tree) || {},
                label = commit.id + ' (' + (commit.message || '') + ')';
            return reverse
                ? this._threeWay(commit.tree, parentTree, label)
                : this._threeWay(parentTree, commit.tree, label);
        },

        _fastForwardFiles: function (target) {
            if (this.hasFiles()) {
                this.switchTrees(target.tree, true);
                this.switchTrees(target.tree);
            }
            this.fastForward(target);
        },

        // cherry-pick / revert / rebase: a list of commits applied one by one, stopping at conflicts
        startSequence: function (type, items) {
            if (this.operation) {
                throw new Error(tr('operationInProgress', this.operation.type));
            }
            this.operation = {
                type: type,
                todo: items,
                orig: { branch: this.currentBranch, head: this.getCommit('HEAD').id },
                before: { index: clone(this.index), work: clone(this.work) },
                map: {}
            };
            return this._continueSequence();
        },

        _rebaseFiles: function (base, toRebase, opt) {
            if (this.operation) {
                throw new Error(tr('operationInProgress', this.operation.type));
            }
            if (this.fileStatus().some(function (f) { return f.x !== '?'; })) {
                throw new Error(tr('dirtyRebase'));
            }
            var orig = { branch: this.currentBranch, head: this.getCommit('HEAD').id },
                before = { index: clone(this.index), work: clone(this.work) },
                untracked = this.untracked();

            if (this.currentBranch) {
                this.moveTag(this.currentBranch, base.id);
                this.checkout(this.currentBranch);
            } else {
                this.checkout(base.id);
            }
            this.index = clone(base.tree);
            this.work = clone(base.tree);
            untracked.forEach(function (p) {
                if (!base.tree[p]) {
                    this.work[p] = untracked.files[p];
                }
            }, this);

            this.operation = {
                type: 'rebase',
                todo: toRebase.map(function (c) { return { id: c.id, kind: 'rebase' }; }),
                orig: orig,
                before: before,
                updateRefs: !!opt.updateRefs,
                map: {}
            };
            return this._continueSequence();
        },

        _continueSequence: function () {
            var op = this.operation, done = [];
            while (op.todo.length) {
                var item = op.todo.shift(),
                    commit = this.getCommit(item.id),
                    result = this.applyCommit(commit, item.kind === 'revert');
                if (result.conflicts.length) {
                    op.current = item;
                    return { conflicts: result.conflicts, at: commit, done: done };
                }
                done.push(this._commitStep(item));
            }
            this._finishSequence();
            return { done: done };
        },

        _commitStep: function (item) {
            var commit = this.getCommit(item.id);
            if (item.kind === 'pick') {
                this.commit({ cherryPickedFrom: commit.id }, commit.message);
            } else if (item.kind === 'revert') {
                commit.reverted = true;
                this.commit({ reverts: commit.id }, 'Revert "' + (commit.message || commit.id) + '"');
            } else {
                this.commit({ rebased: true }, commit.message);
                this.operation.map[commit.id] = this.getCommit('HEAD').id;
            }
            return { from: commit.id, to: this.getCommit('HEAD').id };
        },

        _finishSequence: function () {
            var op = this.operation, view = this;
            if (op.type === 'rebase' && op.updateRefs) {
                Object.keys(op.map).forEach(function (old) {
                    view.getCommit(old).tags.filter(function (t) {
                        return view.isLocalBranch(t) && t !== view.currentBranch && view.worktreeOf(t) === null;
                    }).forEach(function (t) {
                        view._removeTag(t);
                        view.getCommit(op.map[old]).tags.push(t);
                    });
                });
                this.renderTags();
            }
            this.operation = null;
        },

        continueOperation: function (type) {
            var op = this.operation;
            if (!op || op.type !== type) {
                throw new Error(tr('noOperation', type));
            }
            if (this.hasUnmerged()) {
                throw new Error(tr('unmergedFiles'));
            }
            var done = [];
            if (op.current) {
                done.push(this._commitStep(op.current));
                op.current = null;
            }
            var result = this._continueSequence();
            result.done = done.concat(result.done);
            return result;
        },

        skipOperation: function (type) {
            var op = this.operation;
            if (!op || op.type !== type || !op.current) {
                throw new Error(tr('noOperation', type));
            }
            var head = this.headTree(), untracked = this.untracked();
            this.index = clone(head);
            this.work = clone(head);
            untracked.forEach(function (p) {
                if (!head[p] && !untracked.files[p].unmerged) {
                    this.work[p] = untracked.files[p];
                }
            }, this);
            op.current = null;
            return this._continueSequence();
        },

        // layout: the merged branch is drawn beside, not on the main line
        _markNoFF: function (target, currentCommit) {
            var start = target;
            while (!this.isAncestor(start.parent, currentCommit)) {
                start = this.getCommit(start.parent);
            }
            start.isNoFFBranch = true;
        },

        hasUnmerged: function () {
            var index = this.index;
            return Object.keys(index).some(function (p) { return !Array.isArray(index[p]); });
        },

        // merge/cherry-pick/revert/rebase --abort: back to the state before it began
        abortOperation: function (type) {
            var op = this.operation;
            if (!op || op.type !== type) {
                throw new Error(tr('noOperation', type));
            }
            this.operation = null;
            if (op.orig) {
                if (op.orig.branch) {
                    this.moveTag(op.orig.branch, op.orig.head);
                }
                this.checkout(op.orig.branch || op.orig.head);
            }
            this.index = op.before.index;
            this.work = op.before.work;
            this.renderCommits();
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
                if (this.isAncestor(upstream, currentCommit)) {
                    return 'Up-To-Date';
                }
                if (this.isAncestor(currentCommit, upstream)) {
                    this._fastForwardFiles(upstream);
                    return 'Fast-Forward';
                }
            }

            // the commits of HEAD that upstream does not have, oldest first
            while (currentCommit && currentCommit.id !== ROOT && !this.isAncestor(currentCommit, upstream)) {
                toRebase.unshift(currentCommit);
                currentCommit = this.getCommit(currentCommit.parent);
            }

            if (toRebase.length === 0) {
                this._fastForwardFiles(base);
                return 'Fast-Forward';
            }

            if (this.hasFiles()) {
                return this._rebaseFiles(base, toRebase, opt);
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
