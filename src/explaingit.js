import * as d3selection from 'd3-selection'
import 'd3-transition'
import { tr, fill } from './i18n.js'
import { sameLines, formatDiff, changedPaths, diffStat, blobId, mergeTrees, blame, lineMap, diffLines, treeId, treeEntries } from './files.js'

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

// copy the commits `to` does not have yet, parents first; returns how many
var copyCommits = function (from, to, commit) {
    var list = [],
        copy = function (c) {
            while (c && c.id !== ROOT && to.getCommit(c.id) === null &&
                   list.every(function (p) { return p.id !== c.id; })) {
                list.unshift({ id: c.id, parent: c.parent, parent2: c.parent2, message: c.message, author: c.author, tree: clone(c.tree), tags: [] });
                if (typeof c.parent2 === 'string') {
                    copy(from.getCommit(c.parent2));
                }
                c = from.getCommit(c.parent);
            }
        };
    copy(commit);
    to.commitData = to.commitData.concat(list);
    return list.length;
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
        this.remotes = config.remotes || Object.create(null); // name -> view of the remotes we know
        this.world = config.world || Object.create(null);     // every repository of the course
        this.showRepo = config.showRepo || function () {};
        this.hideRepo = config.hideRepo || function () {};
        this.createRepo = config.createRepo || function () { return null; };
        this.urls = Object.create(null);                      // remote name -> url as typed
        Object.keys(this.remotes).forEach(function (n) { this.urls[n] = '../' + n + '.git'; }, this);
        this.originView = this.remotes.origin || null;
        this.initialMessage = config.initialMessage || 'Enter git commands below.';
        this._commandHistory = [];
        this._currentCommand = -1;
        this._tempCommand = '';
    }

    var NOT_COMMANDS = ['init', 'render', 'destroy', 'command', 'info', 'error'];
    // shell commands on the working tree
    var SHELL = ['echo', 'cat', 'ls', 'rm', 'mv'];

    // * and ? wildcards in linear time (a RegExp of many .* can take hours)
    var globMatch = function (pattern, text) {
        var p = 0, i = 0, star = -1, mark = 0;
        while (i < text.length) {
            if (p < pattern.length && (pattern.charAt(p) === '?' || pattern.charAt(p) === text.charAt(i))) {
                p++;
                i++;
            } else if (p < pattern.length && pattern.charAt(p) === '*') {
                star = p++;
                mark = i;
            } else if (star > -1) {
                p = star + 1;
                i = ++mark;
            } else {
                return false;
            }
        }
        while (pattern.charAt(p) === '*') {
            p++;
        }
        return p === pattern.length;
    };

    // shell words: "quoted text" stays one word (quotes removed), > and >> are words of their own
    var tokenize = function (line) {
        var words = [], word = null, quote = null, i, ch;
        for (i = 0; i < line.length; i++) {
            ch = line.charAt(i);
            if (quote) {
                if (ch === quote) {
                    quote = null;
                } else {
                    word += ch;
                }
            } else if (ch === '"' || ch === "'") {
                quote = ch;
                word = word || '';
            } else if (ch === '>') {
                if (word !== null) {
                    words.push(word);
                    word = null;
                }
                if (line.charAt(i + 1) === '>') {
                    words.push('>>');
                    i++;
                } else {
                    words.push('>');
                }
            } else if (/\s/.test(ch)) {
                if (word !== null) {
                    words.push(word);
                    word = null;
                }
            } else {
                word = (word || '') + ch;
            }
        }
        if (quote) {
            throw new Error(tr('shellUsage'));
        }
        if (word !== null) {
            words.push(word);
        }
        return words;
    };

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
        // an unquoted message ends at the next flag (also --author=…)
        while (args.length && flags.indexOf(args[0]) === -1 && !/^--[a-z-]+=/.test(args[0])) {
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
            this._entry = entry;
            this._resolved = null;
            this._reflogDone = false;
            if (this.historyView && this.historyView.svg) {
                this.historyView.highlight([]);
            }

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

            // @<repo> <command>: run it in another repository of the world (a colleague, the server)
            var home = { historyView: this.historyView, remotes: this.remotes, urls: this.urls, originView: this.originView },
                at = /^@(\S*)\s*(.*)$/.exec(entry);
            try {
                if (at) {
                    var view = this.world[at[1]];
                    if (!view) {
                        return this.error(tr('noRepo', at[1]));
                    }
                    if (!at[2] || at[2].charAt(0) === '@') {
                        return this.error(tr('repoUsage'));
                    }
                    this._entry = at[2];
                    split = at[2].split(/\s+/);
                    this.showRepo(view);
                    view.remoteViews = view.remoteViews || { remotes: Object.create(null), urls: Object.create(null) };
                    this.historyView = view;
                    this.remotes = view.remoteViews.remotes;
                    this.urls = view.remoteViews.urls;
                    this.originView = this.remotes.origin || null;
                } else if (this.historyView) {
                    // in the classroom the person typing is the author
                    this.historyView.authorName = (who && who.name) || null;
                }
                this._command(split);
            } finally {
                Object.assign(this, home);
            }
        },

        _command: function (split) {
            var before = this.historyView && this.historyView.refSnapshot();
            try {
                this._run(split);
            } catch (ex) {
                var msg = (ex && ex.message) ? ex.message: null;
                this.error(msg);
            }
            if (before && !this._reflogDone) {
                try {
                    this._recordReflog(before, this._resolved || split);
                } catch (ex) {
                    this.error(ex && ex.message);
                }
            }
            if (this.historyView && this.historyView.svg) {
                this.historyView.showStatus();
            }
        },

        // echo text | echo "text" > file | echo text >> file
        _echo: function (args) {
            var redirect = Math.max(args.indexOf('>'), args.indexOf('>>')),
                text = (redirect > -1 ? args.slice(0, redirect) : args).join(' '),
                op = redirect > -1 ? args[redirect] : null,
                file = redirect > -1 ? args[redirect + 1] : null,
                work = this.historyView.work;

            if (!op) {
                return this.plain(text);
            }
            if (!file) {
                throw new Error(tr('needPath'));
            }
            if (args.length > redirect + 2) {
                throw new Error(tr('shellUsage'));
            }
            work[file] = (op === '>>' && work[file] ? work[file] : []).concat([text]);
        },

        _cat: function (args) {
            var work = this.historyView.work, control = this;
            if (!args[0] || !work[args[0]]) {
                throw new Error(tr('noFile', args[0] || ''));
            }
            work[args[0]].forEach(function (line) { control.plain(line); });
        },

        _ls: function () {
            var names = Object.keys(this.historyView.work).sort();
            if (names.length) {
                this.plain(names.join('  '));
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
            if (!args[0] || !args[1]) {
                throw new Error(tr('needPath'));
            }
            if (!work[args[0]]) {
                throw new Error(tr('noFile', args[0]));
            }
            work[args[1]] = work[args[0]];
            delete work[args[0]];
        },

        _run: function (split) {
            var hv = this.historyView;

            // rebase -i: the todo list is open, lines edit it (like an editor)
            if (hv.operation && hv.operation.type === 'rebase-todo' &&
                !(split[0] === 'git' && ['status', 'log', 'show', 'diff'].indexOf(split[1]) > -1)) {
                return this._todoLine(tokenize(this._entry || split.join(' ')));
            }

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
                return this['_' + split[0]](tokenize(this._entry || split.join(' ')).slice(1));
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
                var inner = hv.refSnapshot();
                try {
                    return this._run(['git'].concat(split.slice(3)));
                } finally {
                    // the reflog of the other worktree, written while it is active
                    this._recordReflog(inner, this._resolved || split.slice(2));
                    this._reflogDone = true;
                    hv.activate(back);
                }
            }

            // git aliases (config alias.<name>); git's own commands cannot be replaced
            var command = function (name) { return name === 'log' ? 'gitLog' : name; },
                rounds = 0;
            while (split[1] && !Object.prototype.hasOwnProperty.call(ControlBox.prototype, command(split[1])) &&
                   hv.config['alias.' + split[1]] !== undefined) {
                var value = hv.config['alias.' + split[1]];
                if (value.charAt(0) === '!') {
                    throw new Error(tr('aliasShell'));
                }
                if (++rounds > 10) {
                    throw new Error(tr('aliasLoop', split[1]));
                }
                split = ['git'].concat(tokenize(value), split.slice(2));
            }

            // `log` is the console element of this object, so git log runs as gitLog
            var method = command(split[1]),
                args = split.slice(2);
            this._resolved = split;

            // only git commands, not the widget's own methods
            if (Object.prototype.hasOwnProperty.call(ControlBox.prototype, method) &&
                method.charAt(0) !== '_' && NOT_COMMANDS.indexOf(method) === -1) {
                this[method](args);
            } else {
                this.error();
            }
        },

        // file contents and other git data: shown as they are, never translated
        plain: function (text) {
            this.log.append('div')
                .classed('info', true)
                .classed('notranslate', true)
                .attr('translate', 'no')
                .text(text);
            this._scrollToBottom();
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
            var amend = false, all = false, allowEmpty = false, message, author, fold,
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
                } else if (arg === '--fixup' || arg === '--squash' || /^--(fixup|squash)=/.test(arg)) {
                    // a commit that rebase --autosquash folds into <c>
                    var kind = arg.slice(2).split('=')[0],
                        target = this.historyView.getCommit(arg.indexOf('=') > -1 ? arg.slice(arg.indexOf('=') + 1) : args.shift());
                    if (!target || target.id === ROOT) {
                        throw new Error(tr('noRef', arg));
                    }
                    fold = { kind: kind, subject: target.message || target.id };
                } else if (arg.indexOf('--author=') === 0) {
                    // --author="Ann Smith" may come in several words
                    author = arg.slice(9);
                    while (/^["']/.test(author) && !/.["']$/.test(author) && args.length) {
                        author += ' ' + args.shift();
                    }
                    author = author.replace(/^["']|["']$/g, '');
                    if (!author) {
                        return this.error();
                    }
                } else if (arg !== '-a' && arg !== '--all' && arg !== '--allow-empty' && arg !== '--no-edit') {
                    return this.error();
                }
            }

            var hv = this.historyView,
                staged = all && hv.hasFiles() ? hv.stagedTracked() : hv.index;
            if (Object.keys(staged).some(function (p) { return !Array.isArray(staged[p]); })) {
                throw new Error(tr('unmergedFiles'));
            }
            if (!amend && !allowEmpty && !hv.squashPending && !(hv.operation && hv.operation.type === 'merge') &&
                hv.hasFiles() && sameTree(staged, hv.headTree())) {
                throw new Error(tr(hv.fileStatus().some(function (f) { return f.y !== ' ' && f.y !== '?'; }) ? 'noChangesAdded' : 'statusNothing'));
            }
            if (fold) {
                message = fold.kind + '! ' + fold.subject + (fold.kind === 'squash' && message ? ' / ' + message : '');
            }
            hv.index = staged;
            // git commit inside a stopped cherry-pick/revert/rebase finishes that step
            if (hv.operation && hv.operation.current) {
                return hv.commitCurrent(message);
            }
            if (hv.operation && hv.operation.type === 'merge') {
                var op = hv.operation;
                hv.operation = null;
                return hv.commit({ parent2: op.theirs, isNoFFCommit: op.noFF || undefined, tree: clone(hv.index), author: author },
                    message || "Merge branch '" + op.label + "'");
            }

            if (amend) {
                hv.amend(message);
            } else {
                hv.commit({ author: author }, message);
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
            case '--list':
            case '-v':
            case '-vv':
            case '--verbose':
            case '--merged':
            case '--no-merged':
            case '--remote':
            case '-r':
            case '--all':
            case '-a':
                this._listBranches(args);
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

        // branch [-v | -vv] [-a | -r] [--merged | --no-merged [<rev>]]
        _listBranches: function (args) {
            var hv = this.historyView, control = this,
                has = function (f) { return args.indexOf(f) > -1; },
                verbose = has('-vv') ? 2 : has('-v') || has('--verbose') ? 1 : 0,
                filter = has('--merged') ? 'merged' : has('--no-merged') ? 'noMerged' : null,
                rev = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'HEAD',
                names = Object.keys(hv.refSnapshot().branches).sort(),
                remotes = [];
            hv.commitData.forEach(function (c) {
                c.tags.forEach(function (t) {
                    if (hv.isRemoteRef(t) && remotes.indexOf(t) === -1) {
                        remotes.push(t);
                    }
                });
            });
            remotes.sort();
            if (filter) {
                if (!hv.getCommit(rev)) {
                    throw new Error(tr('noRef', rev));
                }
                names = names.filter(function (b) { return hv.isAncestor(b, rev) === (filter === 'merged'); });
            }
            var width = names.reduce(function (w, b) { return Math.max(w, b.length); }, 0),
                line = function (b) {
                    var mark = b === hv.currentBranch ? '* ' : '  ';
                    if (!verbose) {
                        return mark + b;
                    }
                    var c = hv.getCommit(b), extra = '';
                    if (verbose === 2) {
                        var u = hv.upstream[b] || ('origin/' + b);
                        if (hv.getCommit(u)) {
                            var ahead = hv.revList([b], [u]).length, behind = hv.revList([u], [b]).length,
                                parts = (ahead ? ['ahead ' + ahead] : []).concat(behind ? ['behind ' + behind] : []);
                            extra = '[' + u + (parts.length ? ': ' + parts.join(', ') : '') + '] ';
                        }
                    }
                    return mark + (b + new Array(width + 1).join(' ')).slice(0, width) + ' ' + c.id + ' ' + extra + (c.message || '');
                };
            if (!has('-r') && !has('--remote')) {
                names.forEach(function (b) { control.plain(line(b)); });
            }
            if (has('-a') || has('--all')) {
                remotes.forEach(function (r) { control.plain('  remotes/' + r); });
            }
            if (has('-r') || has('--remote')) {
                remotes.forEach(function (r) { control.plain('  ' + r); });
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

            // switch serverfix: a local branch from the one remote branch with that name
            if (!opt.create && !opt.detach && !hv.isLocalBranch(name) && !(opt.lenient && hv.getCommit(name))) {
                var guess = hv.remotes.filter(function (r) { return hv.getCommit(r + '/' + name); });
                if (guess.length === 1) {
                    opt.create = true;
                    opt.start = guess[0] + '/' + name;
                }
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
            // a branch started from a remote branch follows it
            if (opt.create && opt.start && hv.isRemoteRef(opt.start) && hv.isLocalBranch(name)) {
                hv.upstream[name] = opt.start;
                this.info(tr('upstreamSet', name, opt.start));
            }
        },

        // --track <remote>/<b>: create <b> (or the -b/-c name) from it
        _track: function (name, opt) {
            if (opt.track === undefined) {
                return name;
            }
            if (!opt.track || !this.historyView.isRemoteRef(opt.track)) {
                throw new Error(tr('noRef', opt.track || ''));
            }
            opt.create = true;
            opt.start = opt.track;
            return name || opt.track.slice(opt.track.indexOf('/') + 1);
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
                } else if (arg === '-t' || arg === '--track') {
                    opt.track = args.shift();
                } else {
                    name = [arg].concat(args).join(' ');
                    args.length = 0;
                }
            }

            name = this._track(name, opt);
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
                } else if (arg === '-t' || arg === '--track') {
                    opt.track = args.shift();
                } else if (!name) {
                    name = arg;
                }
            }

            name = this._track(name, opt);
            if (!name && !opt.detach) {
                throw new Error(tr('switchUsage'));
            }
            this._changeBranch(name, opt);
        },

        // tag [-l [<pattern>]] | tag -d <name> | tag [-a] [-m <msg>] <name> [<rev>]
        tag: function (args) {
            var hv = this.historyView, control = this, msg = null, annotated = false, del = false, list = false, pos = [];
            args = args.slice();
            while (args.length) {
                var a = args.shift();
                if (a === '-a' || a === '--annotate') {
                    annotated = true;
                } else if (a === '-m' || a === '--message') {
                    annotated = true;
                    msg = takeMessage(args, ['-a', '-d']);
                } else if (a === '-d' || a === '--delete') {
                    del = true;
                } else if (a === '-l' || a === '--list') {
                    list = true;
                } else if (a.charAt(0) !== '-') {
                    pos.push(a.replace(/^(["'])(.*)\1$/, '$2'));
                }
            }
            if (del) {
                if (!pos[0] || !hv.getCommit('[' + pos[0] + ']')) {
                    throw new Error(tr('noRef', pos[0] || ''));
                }
                hv._removeTag('[' + pos[0] + ']');
                delete hv.tagInfo[pos[0]];
                return hv.renderTags();
            }
            if (list || !pos.length) {
                var pattern = list && pos[0] ? pos[0] : '*';
                return hv.tagNames().filter(function (t) { return globMatch(pattern, t); }).forEach(function (t) { control.plain(t); });
            }
            var target = hv.getCommit(pos[1] || 'HEAD');
            if (!target || target.id === ROOT) {
                throw new Error(tr('noRef', pos[1]));
            }
            if (hv.tagNames().indexOf(pos[0]) > -1) {
                throw new Error(tr('tagExists', pos[0]));
            }
            if (annotated) {
                hv.tagInfo[pos[0]] = { message: msg || '' };
            }
            hv.branch('[' + pos[0] + ']', target.id);
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

            if (mode === 'soft' && hv.hasUnmerged()) {
                throw new Error(tr('softResetConflict'));
            }
            var before = hv.getCommit('HEAD').id,
                untracked = hv.untracked();
            hv.reset(ref);
            // like git: a reset ends a merge, cherry-pick or revert (not a rebase)
            if (hv.operation && hv.operation.type !== 'rebase') {
                hv.operation = null;
            }
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
            if (args.indexOf('-u') > -1 || args.indexOf('--update') > -1) {
                hv.index = hv.stagedTracked();
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
                if (worktree && !staged && !src && hv.index[p] && !Array.isArray(hv.index[p])) {
                    throw new Error(tr('unmergedPath', p));
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
                if (!Array.isArray(from[p])) {
                    throw new Error(tr('unmergedPath', p));
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
            if (hv.tagInfo[ref]) {
                this.diffLine('tag ' + ref, 'head');
                this.plain(hv.tagInfo[ref].message);
                this.plain('');
            }
            this.diffLine('commit ' + commit.id, 'head');
            if (commit.parent2) {
                this.diffLine('Merge: ' + hv.getCommit(commit.parent).id + ' ' + commit.parent2, 'head');
            }
            this._author(commit, 'head');
            this.diffLine('    ' + (commit.message || ''), 'ctx');
            this._printDiff(hv.getCommit(commit.parent).tree || {}, commit.tree || {}, [], false);
        },

        _author: function (commit, kind) {
            if (commit && commit.author) {
                this.diffLine('Author: ' + commit.author, kind);
            }
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
                if (hv.hasUnmerged()) {
                    throw new Error(tr('unmergedFiles'));
                }
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
            if (result.edit) {
                this.info(tr('stoppedEdit', result.edit.id, result.edit.message || ''));
            }
            if (result.conflicts) {
                result.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                this.info(tr('stoppedAt', result.at.id, result.at.message || ''));
                this.info(tr('resolveHint', type));
            }
        },

        // log [--oneline] [--graph] [--all] [-n] [--merges/--no-merges] [--first-parent] [-p] [--stat]
        //     [--left-right] [-S <text>] [<rev>... | <a>..<b> | <a>...<b> | ^<a> | --not <a>] [-- <path>]
        gitLog: function (args) {
            var range = args.map(function (a, i) { return a === '-L' ? args[i + 1] : /^-L./.test(a) ? a.slice(2) : null; })
                .filter(function (a) { return a !== null; })[0];
            if (range !== undefined) {
                return this._logRange(range);
            }
            var hv = this.historyView, control = this,
                dashes = args.indexOf('--'),
                paths = dashes > -1 ? args.slice(dashes + 1) : [],
                opts = dashes > -1 ? args.slice(0, dashes) : args.slice(),
                o = { max: Infinity }, includes = [], excludes = [], not = false, left = null, right = null;

            while (opts.length) {
                var a = opts.shift(), n = /^-(\d+)$/.exec(a);
                if (n) {
                    o.max = Number(n[1]);
                } else if (a === '-n' || a === '--max-count') {
                    o.max = Number(opts.shift());
                    if (isNaN(o.max)) {
                        throw new Error(tr('needNumber'));
                    }
                } else if (a === '-S') {
                    o.pickaxe = opts.shift();
                } else if (a === '--not') {
                    not = !not;
                } else if (a.charAt(0) === '-' && a.length > 1) {
                    o[{ '-g': 'reflog', '--walk-reflogs': 'reflog', '--oneline': 'oneline', '--graph': 'graph', '--all': 'all', '--merges': 'merges', '--no-merges': 'noMerges',
                        '--first-parent': 'firstParent', '-p': 'patch', '--patch': 'patch', '--stat': 'stat', '--left-right': 'leftRight' }[a] || 'ignored'] = true;
                } else {
                    var range = /^(.*?)(\.\.\.?)(.*)$/.exec(a);
                    if (range && range[2] === '...') {
                        left = range[1] || 'HEAD';
                        right = range[3] || 'HEAD';
                        includes.push(left, right);
                    } else if (range) {
                        excludes.push(range[1] || 'HEAD');
                        includes.push(range[3] || 'HEAD');
                    } else if (a.charAt(0) === '^') {
                        excludes.push(a.slice(1));
                    } else {
                        (not ? excludes : includes).push(a);
                    }
                }
            }
            if (o.reflog) {
                var ref = includes[0] || 'HEAD';
                return hv.reflogFor(ref).slice(0, o.max).forEach(function (e, i) {
                    var c = hv.getCommit(e.id);
                    control.diffLine('commit ' + e.id + (hv.decorations(e.id) ? ' (' + hv.decorations(e.id) + ')' : ''), 'commit');
                    control.diffLine('Reflog: ' + ref + '@{' + i + '}', 'ctx');
                    control.diffLine('Reflog message: ' + e.msg, 'ctx');
                    control._author(c, 'ctx');
                    control.diffLine('    ' + ((c && c.message) || ''), 'ctx');
                });
            }
            if (o.all) {
                includes = includes.concat(hv.allRefs());
            }
            if (!includes.length) {
                includes.push('HEAD');
            }
            includes.concat(excludes).forEach(function (r) {
                if (!hv.getCommit(r)) {
                    throw new Error(tr('noRef', r));
                }
            });

            var side = {};
            if (left) {
                // symmetric difference: what only one side has, marked < or >
                var l = hv.revList([left], [], o), r = hv.revList([right], [], o),
                    inL = {}, inR = {};
                l.forEach(function (c) { inL[c.id] = true; });
                r.forEach(function (c) { inR[c.id] = true; });
                Object.keys(inL).forEach(function (id) { if (inR[id]) { excludes.push(id); } });
                l.forEach(function (c) { side[c.id] = '<'; });
                r.forEach(function (c) { side[c.id] = side[c.id] ? null : '>'; });
            }

            var commits = hv.revList(includes, excludes, o).filter(function (c) {
                var parent = hv.getCommit(c.parent), before = (parent && parent.tree) || {};
                if (o.merges && !c.parent2) { return false; }
                if (o.noMerges && c.parent2) { return false; }
                if (paths.length && !paths.some(function (p) { return !sameLines(before[p], (c.tree || {})[p]); })) { return false; }
                if (o.pickaxe) {
                    var count = function (t) {
                        return Object.keys(t).reduce(function (sum, p) {
                            return sum + t[p].join('\n').split(o.pickaxe).length - 1;
                        }, 0);
                    };
                    return count(before) !== count(c.tree || {});
                }
                return true;
            }).slice(0, o.max);

            commits.forEach(function (c) {
                var decor = hv.decorations(c.id),
                    mark = o.leftRight && side[c.id] ? side[c.id] + ' ' : o.graph ? '* ' : '';
                if (o.oneline) {
                    control.diffLine(mark + c.id + (decor ? ' (' + decor + ')' : '') + ' ' + (c.message || ''), 'commit');
                } else {
                    control.diffLine(mark + 'commit ' + c.id + (decor ? ' (' + decor + ')' : ''), 'commit');
                    if (c.parent2) {
                        control.diffLine('Merge: ' + hv.getCommit(c.parent).id + ' ' + c.parent2, 'ctx');
                    }
                    control._author(c, 'ctx');
                    control.diffLine('    ' + (c.message || ''), 'ctx');
                }
                if (o.patch || o.stat) {
                    var parent = hv.getCommit(c.parent);
                    control._printDiff((parent && parent.tree) || {}, c.tree || {}, paths, o.stat && !o.patch);
                }
            });
            hv.highlight(commits.map(function (c) { return c.id; }));
        },

        // after every command: one reflog entry for HEAD and for each branch that moved
        _recordReflog: function (before, split) {
            var hv = this.historyView,
                after = hv.refSnapshot(),
                msg = this._reflogMessage(split, before, after),
                rebasing = hv.operation && hv.operation.type === 'rebase' ? hv.operation.orig.branch : null,
                created = Object.keys(after.branches).filter(function (b) { return before.branches[b] === undefined; }),
                removed = Object.keys(before.branches).filter(function (b) { return after.branches[b] === undefined; }),
                renaming = split[1] === 'branch' && /^-(m|M|-move)$/.test(split[2] || '');
            if (before.active === after.active && (before.head !== after.head || before.branch !== after.branch)) {
                hv.addReflog('HEAD', after.head, msg);
            }
            if (renaming && created.length === 1 && removed.length === 1) {
                // branch -m: the log moves with the branch
                hv.reflog[created[0]] = (hv.reflog[removed[0]] || []).slice();
                hv.addReflog(created[0], after.branches[created[0]], 'Branch: renamed refs/heads/' + removed[0] + ' to refs/heads/' + created[0]);
                delete hv.reflog[removed[0]];
                return;
            }
            created.forEach(function (b) {
                var at = split.indexOf(b), start = at > -1 && split[at + 1] && split[at + 1].charAt(0) !== '-' ? split[at + 1] : 'HEAD';
                hv.addReflog(b, after.branches[b], 'branch: Created from ' + start);
            });
            Object.keys(after.branches).forEach(function (b) {
                if (before.branches[b] !== undefined && before.branches[b] !== after.branches[b] && b !== rebasing) {
                    // like git: a rebased branch moves once, when the rebase finishes
                    hv.addReflog(b, after.branches[b], split[1] === 'branch' ? 'branch: Reset to ' + (split[4] || 'HEAD') : msg);
                }
            });
            removed.forEach(function (b) { delete hv.reflog[b]; });
        },

        _reflogMessage: function (split, before, after) {
            var hv = this.historyView,
                head = hv.getCommit('HEAD'),
                sub = split[0] === 'git' ? split[1] : split[0],
                args = split.slice(2).filter(function (a) { return a.charAt(0) !== '-'; }),
                merged = head.parent2 && head.id !== before.head ? "Merge made by the 'ort' strategy." : 'Fast-forward',
                returning = 'returning to refs/heads/' + (after.branch || after.head);
            switch (sub) {
            case 'commit':
                return (split.indexOf('--amend') > -1 ? 'commit (amend): ' : head.parent2 ? 'commit (merge): ' : 'commit: ') + (head.message || '');
            case 'switch':
            case 'checkout':
                return 'checkout: moving from ' + (before.branch || before.head) + ' to ' + (after.branch || after.head);
            case 'reset':
                return 'reset: moving to ' + (args[0] || 'HEAD');
            case 'merge':
                // the merged branch: the last argument that names a commit (not the -m text)
                return 'merge ' + args.filter(function (a) { return hv.getCommit(a); }).pop() + ': ' + merged;
            case 'pull':
                return split.indexOf('--rebase') > -1 ? 'pull --rebase (finish): ' + returning : 'pull: ' + merged;
            case 'rebase':
                if (split.indexOf('--abort') > -1) {
                    return 'rebase (abort): ' + returning;
                }
                if (hv.operation) {
                    return split.indexOf('--continue') > -1 || split.indexOf('--skip') > -1
                        ? 'rebase (continue): ' + (head.message || '')
                        : 'rebase (start): checkout ' + (args[args.length - 1] || 'HEAD');
                }
                return 'rebase (finish): ' + returning;
            case 'cherry-pick':
            case 'revert':
                return sub + ': ' + (head.message || '');
            default:
                return sub + (split.length > 2 ? ': ' + split.slice(2).join(' ') : '');
            }
        },

        // fsck [--no-reflogs] [--unreachable] [--lost-found] [--full]: commits no ref reaches
        fsck: function (args) {
            var hv = this.historyView, control = this,
                keep = hv.reachable({ reflog: args.indexOf('--no-reflogs') === -1 }),
                lost = hv.commitData.filter(function (c) { return !keep[c.id]; }),
                isParent = {};
            lost.forEach(function (c) {
                isParent[c.parent] = true;
                isParent[c.parent2] = true;
            });
            lost.forEach(function (c) {
                if (args.indexOf('--unreachable') > -1) {
                    control.plain('unreachable commit ' + c.id);
                } else if (!isParent[c.id]) {
                    control.plain('dangling commit ' + c.id);
                }
            });
        },

        // gc: objects are young, so only --prune=now removes something
        gc: function (args) {
            if (args.indexOf('--prune=now') > -1) {
                this.historyView.pruneUnreachable();
            }
        },

        prune: function () {
            this.historyView.pruneUnreachable();
        },

        // reflog [show] [<ref>] | reflog expire --expire=now (--all | <ref>)
        reflog: function (args) {
            var hv = this.historyView, control = this;
            if (args[0] === 'expire') {
                if (args.indexOf('--expire=now') > -1 || args.indexOf('--expire-unreachable=now') > -1) {
                    hv.expireReflog(args.indexOf('--all') > -1 ? null : args.slice(1).filter(function (a) { return a.charAt(0) !== '-'; }));
                }
                return;
            }
            var
                rest = args[0] === 'show' ? args.slice(1) : args,
                ref = rest.filter(function (a) { return a.charAt(0) !== '-' && !/^\d+$/.test(a); })[0] || 'HEAD';
            if (ref !== 'HEAD' && !hv.reflog[ref]) {
                throw new Error(tr('noRef', ref));
            }
            var max = Infinity;
            rest.forEach(function (a, i) {
                if (/^-\d+$/.test(a)) {
                    max = Number(a.slice(1));
                } else if (a === '-n') {
                    max = Number(rest[i + 1]);
                }
            });
            hv.reflogFor(ref).slice(0, max).forEach(function (e, i) {
                control.plain(e.id + ' ' + ref + '@{' + i + '}: ' + e.msg);
            });
        },

        // describe [--tags] [<rev>]: the nearest tag, plus distance and id
        describe: function (args) {
            var hv = this.historyView,
                all = args.indexOf('--tags') > -1,
                ref = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'HEAD',
                commit = hv.getCommit(ref);
            if (!commit || commit.id === ROOT) {
                throw new Error(tr('noRef', ref));
            }
            var best = null;
            hv.tagNames().forEach(function (t) {
                var tagged = hv.getCommit('[' + t + ']');
                if ((all || hv.tagInfo[t]) && hv.isAncestor(tagged, commit)) {
                    var n = hv.revList([commit.id], [tagged.id]).length;
                    if (!best || n < best.n) {
                        best = { name: t, n: n };
                    }
                }
            });
            if (!best) {
                throw new Error(tr(all || !hv.tagNames().length ? 'noNames' : 'noAnnotated'));
            }
            this.plain(best.n ? best.name + '-' + best.n + '-g' + commit.id : best.name);
        },

        // rev-parse <rev>... / --abbrev-ref HEAD
        'rev-parse': function (args) {
            var hv = this.historyView, control = this,
                abbrev = args.indexOf('--abbrev-ref') > -1,
                refs = args.filter(function (a) { return a.charAt(0) !== '-'; });
            if (!refs.length) {
                throw new Error(tr('needRef'));
            }
            var commits = refs.map(function (r) {
                var c = hv.getCommit(r);
                if (!c || c.id === ROOT) {
                    throw new Error(tr('noRef', r));
                }
                return c;
            });
            commits.forEach(function (c, i) {
                control.plain(abbrev && refs[i] === 'HEAD' ? hv.currentBranch || 'HEAD' : c.id);
            });
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
            var hv = this.historyView, mainline = null, m = args.indexOf('-m');
            if (this._sequenceFlag('revert', args)) {
                return;
            }
            if (m > -1) {
                mainline = Number(args[m + 1]);
                args = args.slice(0, m).concat(args.slice(m + 2));
            }
            var ref = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
            if (!ref) {
                throw new Error(tr('needRef'));
            }
            var target = hv.getCommit(ref);
            // a merge has two sides: -m <n> says which parent stays
            if (target && target.parent2 && mainline === null) {
                throw new Error(tr('mergeNeedsMainline', target.id));
            }
            if (target && mainline !== null && (!target.parent2 || (mainline !== 1 && mainline !== 2))) {
                throw new Error(target.parent2 ? tr('badMainline', args[m + 1] || '') : tr('notAMerge', target.id));
            }
            if (hv.hasFiles()) {
                var commit = hv.getCommit(ref);
                if (!commit) {
                    throw new Error(tr('noRef', ref));
                }
                if (!hv.isAncestor(commit, 'HEAD')) {
                    throw new Error(tr('notAncestor', ref));
                }
                return this._printSequence('revert', hv.startSequence('revert', [{ id: commit.id, kind: 'revert', mainline: mainline || undefined }]));
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

            var m = args.indexOf('-m');
            if (m > -1) {
                var rest = args.slice(m + 1);
                opt.message = takeMessage(rest, ['--no-ff', '--ff-only', '--squash']);
                args = args.slice(0, m).concat(rest);
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

            var result = hv.merge(branch, opt.noFF, opt.message),
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
                } else if (arg === '--autosquash') {
                    opt.autosquash = true;
                } else if (arg === '-i' || arg === '--interactive') {
                    opt.interactive = true;
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
            // git rebase <upstream> <branch>: switch to <branch> first (not with changes)
            if (positional[1] && hv.hasFiles() && hv.fileStatus().some(function (f) { return f.x !== '?'; })) {
                throw new Error(tr('dirtyRebase'));
            }
            if (positional[1]) {
                this._changeBranch(positional[1], {});
            }

            result = this.historyView.rebase(ref, opt);
            if (result && result.todo) {
                this._printTodo();
                this.info(tr('todoHint'));
            } else if (result && result.done) {
                this._printSequence('rebase', result);
            } else if (result === 'Fast-Forward') {
                this.info(tr('fastForwardTo', opt.onto || ref));
            } else if (result === 'Up-To-Date') {
                this.info(tr('upToDate'));
            }
        },

        _todoLine: function (words) {
            var hv = this.historyView, op = hv.operation, control = this, todo = op.todo,
                ACTIONS = { pick: 'rebase', p: 'rebase', reword: 'reword', r: 'reword', edit: 'edit', e: 'edit',
                    squash: 'squash', s: 'squash', fixup: 'fixup', f: 'fixup', drop: 'drop', d: 'drop' },
                find = function (c) {
                    var i = /^\d+$/.test(c || '') ? Number(c) - 1 : -1, commit;
                    // a line number first; an id may be all digits too
                    if (i < 0 || i >= todo.length) {
                        commit = c && hv.getCommit(c);
                        i = todo.map(function (t) { return t.id; }).indexOf(commit ? commit.id : null);
                    }
                    if (i < 0) {
                        throw new Error(tr('noRef', c || ''));
                    }
                    return i;
                },
                before = function (i) {
                    return todo.slice(0, i).some(function (t) { return t.kind !== 'drop'; });
                };

            if (words[0] === ':q!' || (words[0] === 'git' && words[1] === 'rebase' && words[2] === '--abort')) {
                hv.operation = null;
                return this.info(tr('todoCancelled'));
            }
            if (words[0] === ':wq') {
                this._resolved = ['git', 'rebase', '--continue'];
                var result = hv.runTodo();
                return result.empty ? this.info(tr('todoCancelled')) : this._printSequence('rebase', result);
            }
            if (words[0] === 'move') {
                var from = find(words[1]), to = Number(words[2]) - 1;
                if (!(to >= 0 && to < todo.length)) {
                    throw new Error(tr('todoUsage'));
                }
                var item = todo.splice(from, 1)[0];
                todo.splice(to, 0, item);
            } else if (ACTIONS[words[0]]) {
                var i = find(words[1]), kind = ACTIONS[words[0]];
                if ((kind === 'squash' || kind === 'fixup') && !before(i)) {
                    throw new Error(tr('todoNothingBefore', words[0]));
                }
                if (kind === 'reword' && !words.slice(2).join(' ')) {
                    throw new Error(tr('rewordNeedsMessage'));
                }
                todo[i].kind = kind;
                todo[i].message = kind === 'reword' ? words.slice(2).join(' ') : undefined;
            } else {
                throw new Error(tr('todoOpen'));
            }
            this._printTodo();
        },

        _printTodo: function () {
            var hv = this.historyView, control = this, names = { rebase: 'pick' };
            hv.operation.todo.forEach(function (t) {
                var c = hv.getCommit(t.id);
                control.plain((names[t.kind] || t.kind) + ' ' + t.id + ' ' + (t.message || c.message || ''));
            });
            hv.highlight(hv.operation.todo.map(function (t) { return t.id; }));
        },

        // the range <a>,<b>:<file> (1-based) of HEAD and where it is in the working tree
        _range: function (spec, lines) {
            var m = /^(\d+),(\d+)$/.exec(spec || '');
            if (!m || Number(m[1]) < 1 || Number(m[2]) < Number(m[1]) || Number(m[2]) > lines.length) {
                throw new Error(tr('badRange', spec || ''));
            }
            return [Number(m[1]) - 1, Number(m[2]) - 1];
        },

        // blame [-L a,b] [<rev>] <file>
        blame: function (args) {
            var hv = this.historyView, control = this, l = args.indexOf('-L'), spec = null;
            if (l > -1) {
                spec = args[l + 1];
                args = args.slice(0, l).concat(args.slice(l + 2));
            }
            args = args.filter(function (a) { return a !== '--'; });
            var path = args[args.length - 1], rev = args.length > 1 ? args[0] : null,
                commit = hv.getCommit(rev || 'HEAD');
            if (!commit || commit.id === ROOT) {
                throw new Error(tr('noRef', rev || 'HEAD'));
            }
            var committed = commit.tree && commit.tree[path],
                file = rev ? committed : hv.work[path];
            if (!path || !Array.isArray(file)) {
                throw new Error(tr('noFile', path || ''));
            }
            var from = Array.isArray(committed) ? blame(commit, path, function (id) { return hv.getCommit(id); }) : [],
                // the working tree: lines HEAD does not have are not committed yet
                map = rev || !Array.isArray(committed) ? null : lineMap(file, committed),
                who = file.map(function (line, i) {
                    var c = map ? (map.has(i) ? from[map.get(i)] : null) : from[i];
                    return c ? c.id + ' (' + (c.author || 'you') : '0000000 (Not Committed Yet';
                }),
                r = spec ? this._range(spec, file) : [0, file.length - 1];
            for (var i = r[0]; i <= r[1]; i++) {
                control.plain(who[i] + ' ' + (i + 1) + ') ' + file[i]);
            }
        },

        // grep [-n] [-c] <text> [<rev>]: the text as it is (no regular expression)
        grep: function (args) {
            var hv = this.historyView, control = this,
                num = args.indexOf('-n') > -1, count = args.indexOf('-c') > -1 || args.indexOf('--count') > -1,
                words = tokenize(this._entry || '').slice(2).filter(function (a) { return a.charAt(0) !== '-'; }),
                text = words[0], rev = words[1];
            if (!text) {
                throw new Error(tr('grepUsage'));
            }
            var files = {};
            if (rev) {
                var commit = hv.getCommit(rev);
                if (!commit || commit.id === ROOT) {
                    throw new Error(tr('noRef', rev));
                }
                files = commit.tree || {};
            } else {
                // tracked files as they are in the working tree
                Object.keys(hv.index).forEach(function (p) {
                    if (Array.isArray(hv.work[p])) {
                        files[p] = hv.work[p];
                    }
                });
            }
            Object.keys(files).sort().forEach(function (p) {
                var prefix = (rev ? rev + ':' : '') + p + ':', hits = 0;
                files[p].forEach(function (line, i) {
                    if (line.indexOf(text) > -1) {
                        hits++;
                        if (!count) {
                            control.plain(prefix + (num ? (i + 1) + ':' : '') + line);
                        }
                    }
                });
                if (count && hits) {
                    control.plain(prefix + hits);
                }
            });
        },

        // log -L <a>,<b>:<file>: the commits that changed these lines, newest first
        _logRange: function (spec) {
            var hv = this.historyView, control = this,
                m = /^([^:]+):(.+)$/.exec(spec || ''),
                commit = hv.getCommit('HEAD'),
                path = m && m[2],
                file = commit && commit.tree && commit.tree[path];
            if (!m || !Array.isArray(file)) {
                throw new Error(tr('noFile', path || spec || ''));
            }
            var r = this._range(m[1], file), shown = [];
            while (commit && commit.id !== ROOT && r) {
                var parent = hv.getCommit(commit.parent),
                    old = parent && parent.tree && parent.tree[path],
                    now = commit.tree[path].slice(r[0], r[1] + 1),
                    next = null, before = [];
                if (Array.isArray(old)) {
                    // the range in the parent: between the nearest unchanged lines around it
                    var cur = commit.tree[path], map = lineMap(cur, old), lo = 0, hi = old.length - 1, i;
                    for (i = r[0] - 1; i >= 0; i--) {
                        if (map.has(i)) { lo = map.get(i) + 1; break; }
                    }
                    for (i = r[1] + 1; i < cur.length; i++) {
                        if (map.has(i)) { hi = map.get(i) - 1; break; }
                    }
                    if (lo <= hi) {
                        next = [lo, hi];
                        before = old.slice(lo, hi + 1);
                    }
                }
                if (!sameLines(before, now)) {
                    shown.push(commit.id);
                    control.diffLine('commit ' + commit.id, 'commit');
                    control._author(commit, 'ctx');
                    control.diffLine('    ' + (commit.message || ''), 'ctx');
                    control.diffLine('diff --git a/' + path + ' b/' + path, 'head');
                    diffLines(before, now).forEach(function (d) {
                        control.diffLine(d.op + d.line, d.op === '+' ? 'add' : d.op === '-' ? 'del' : 'ctx');
                    });
                }
                commit = parent;
                r = next;
            }
            hv.highlight(shown);
        },

        // cat-file -t | -p | -s | -e <object>
        'cat-file': function (args) {
            var hv = this.historyView, control = this,
                flag = args.filter(function (a) { return a.charAt(0) === '-'; })[0],
                name = args.filter(function (a) { return a.charAt(0) !== '-'; })[0],
                obj = hv.findObject(name);
            if (!name || ['-t', '-p', '-s', '-e'].indexOf(flag) === -1) {
                throw new Error(tr('catFileUsage'));
            }
            if (!obj) {
                throw new Error(tr('noObject', name));
            }
            if (flag === '-e') {
                return;
            }
            var text = this._objectText(obj);
            if (flag === '-t') {
                return this.plain(obj.type);
            }
            if (flag === '-s') {
                return this.plain(String(text.join('\n').length + (text.length ? 1 : 0)));
            }
            text.forEach(function (l) { control.plain(l); });
        },

        _objectText: function (obj) {
            var hv = this.historyView, c = obj.data;
            if (obj.type === 'blob') {
                return c;
            }
            if (obj.type === 'tree') {
                return treeEntries(c);
            }
            var out = ['tree ' + treeId(c.tree || {})];
            [c.parent, c.parent2].forEach(function (p) {
                if (p && p !== ROOT && hv.getCommit(p)) {
                    out.push('parent ' + p);
                }
            });
            return out.concat(['author ' + (c.author || 'you'), '', c.message || '']);
        },

        // hash-object [-w] <file>
        'hash-object': function (args) {
            var hv = this.historyView,
                path = args.filter(function (a) { return a.charAt(0) !== '-'; })[0],
                lines = hv.work[path];
            if (!path || !Array.isArray(lines)) {
                throw new Error(tr('noFile', path || ''));
            }
            this.plain(args.indexOf('-w') > -1 ? hv.storeObject('blob', lines) : blobId(lines));
        },

        // ls-files [-s]: the index; conflicts show their stages
        'ls-files': function (args) {
            var hv = this.historyView, control = this, stage = args.indexOf('-s') > -1 || args.indexOf('--stage') > -1;
            Object.keys(hv.index).sort().forEach(function (p) {
                var e = hv.index[p];
                if (!stage) {
                    return control.plain(p);
                }
                if (Array.isArray(e)) {
                    return control.plain('100644 ' + blobId(e) + ' 0\t' + p);
                }
                [e.unmerged.base, e.unmerged.ours, e.unmerged.theirs].forEach(function (l, i) {
                    if (l) {
                        control.plain('100644 ' + blobId(l) + ' ' + (i + 1) + '\t' + p);
                    }
                });
            });
        },

        // ls-tree [-r] <tree-ish> (files only, so -r lists the same)
        'ls-tree': function (args) {
            var hv = this.historyView, control = this,
                name = args.filter(function (a) { return a.charAt(0) !== '-'; })[0],
                obj = hv.findObject(name);
            if (obj && obj.type === 'commit') {
                obj = { type: 'tree', data: obj.data.tree || {} };
            }
            if (!obj || obj.type !== 'tree') {
                throw new Error(tr('notTree', name || ''));
            }
            treeEntries(obj.data).forEach(function (l) { control.plain(l); });
        },

        // update-index [--add] <file>: git add for plumbing
        'update-index': function (args) {
            var hv = this.historyView,
                paths = args.filter(function (a) { return a.charAt(0) !== '-'; });
            paths.forEach(function (p) {
                if (!(p in hv.index) && args.indexOf('--add') === -1) {
                    throw new Error(tr('needAddOption', p));
                }
            });
            this.add(paths);
        },

        // bisect start [<bad> [<good>...]] | bad/new | good/old | skip [<rev>...] | reset | log
        bisect: function (args) {
            var hv = this.historyView, control = this, sub = args[0], st = hv.bisectState,
                rest = args.slice(1).filter(function (a) { return a !== '--'; }),
                resolve = function (r) {
                    var c = hv.getCommit(r);
                    if (!c || c.id === ROOT) {
                        throw new Error(tr('noRef', r));
                    }
                    return c.id;
                },
                mark = function (kind, id) {
                    if (kind === 'bad') {
                        st.bad = id;
                    } else {
                        st[kind].push(id);
                    }
                    st.log.push('git bisect ' + kind + ' ' + id);
                };
            if (sub === 'start') {
                if (st) {
                    throw new Error(tr('bisectRunning'));
                }
                var revs = rest.map(resolve);
                st = hv.bisectState = { orig: { branch: hv.currentBranch, head: hv.getCommit('HEAD').id }, bad: null, good: [], skip: [], log: ['git bisect start'] };
                if (revs[0]) {
                    mark('bad', revs[0]);
                }
                revs.slice(1).forEach(function (id) { mark('good', id); });
                return this._bisectNext();
            }
            if (!st) {
                throw new Error(tr('bisectNotStarted'));
            }
            if (sub === 'reset') {
                this._changeBranch(st.orig.branch || st.orig.head, st.orig.branch ? {} : { detach: true });
                hv.bisectState = null;
                return hv.renderBisect();
            }
            if (sub === 'log') {
                return st.log.forEach(function (l) { control.plain(l); });
            }
            var kind = { bad: 'bad', 'new': 'bad', good: 'good', old: 'good', skip: 'skip' }[sub];
            if (!kind) {
                throw new Error(tr('bisectUsage'));
            }
            (rest.length ? rest : ['HEAD']).map(resolve).forEach(function (id) { mark(kind, id); });
            this._bisectNext();
        },

        // like git: test the commit that splits the candidates best (first one in revList order on a tie)
        _bisectNext: function () {
            var hv = this.historyView, st = hv.bisectState, control = this;
            hv.renderBisect();
            if (!st.bad || !st.good.length) {
                return this.info(tr('bisectWaiting'));
            }
            var cands = hv.revList([st.bad], st.good), all = cands.length;
            if (all <= 1) {
                var c = hv.getCommit(st.bad);
                this.plain(c.id + ' is the first bad commit');
                this.diffLine('commit ' + c.id, 'commit');
                this._author(c, 'ctx');
                return this.diffLine('    ' + (c.message || ''), 'ctx');
            }
            var best = null;
            cands.forEach(function (c) {
                if (c.id === st.bad || st.skip.indexOf(c.id) > -1) {
                    return;
                }
                var w = cands.filter(function (x) { return hv.isAncestor(x, c); }).length,
                    score = Math.min(w, all - w);
                if (!best || score > best.score) {
                    best = { commit: c, w: w, score: score };
                }
            });
            if (!best) {
                this.info(tr('bisectOnlySkipped'));
                return cands.forEach(function (c) { control.plain(c.id); });
            }
            this._changeBranch(best.commit.id, { detach: true });
            hv.renderBisect();
            var left = all - best.w - 1,
                n = Math.floor(Math.log2(all)), e = Math.pow(2, n),
                steps = all < 3 ? 0 : (e < 3 * (all - e) ? n : n - 1);
            this.plain('Bisecting: ' + left + ' revision' + (left === 1 ? '' : 's') + ' left to test after this (roughly ' +
                steps + ' step' + (steps === 1 ? '' : 's') + ')');
        },

        // remote [-v] | add <name> <url> | rename <old> <new> | remove <name> | show <name>
        remote: function (args) {
            var control = this, hv = this.historyView, sub = args[0],
                names = Object.keys(this.remotes).sort(),
                need = function (n) {
                    if (!n || !control.remotes[n]) {
                        throw new Error(tr('noRemoteNamed', n || ''));
                    }
                };
            if (!sub || sub === '-v' || sub === '--verbose') {
                return names.forEach(function (n) {
                    if (sub) {
                        control.plain(n + '\t' + control.urls[n] + ' (fetch)');
                        control.plain(n + '\t' + control.urls[n] + ' (push)');
                    } else {
                        control.plain(n);
                    }
                });
            }
            if (sub === 'add') {
                var name = args[1], url = args[2];
                if (!name || !url) {
                    throw new Error(tr('remoteUsage'));
                }
                if (this.remotes[name]) {
                    throw new Error(tr('remoteExists', name));
                }
                // the url names a repository of the world by its last part (without .git)
                var repo = url.replace(/\.git$/, '').split('/').pop();
                var view = this.world[repo] || this.world[name] || this.createRepo(name);
                this.remotes[name] = view;
                this.urls[name] = url;
                if (hv.remotes.indexOf(name) === -1) {
                    hv.remotes.push(name);
                }
                this.showRepo(view);
                return view.svg && view.svg.select('text.remote-name-display').text(name);
            }
            if (sub === 'rename') {
                var old = args[1], neu = args[2];
                need(old);
                if (!neu || this.remotes[neu]) {
                    throw new Error(tr('remoteExists', neu || ''));
                }
                this.remotes[neu] = this.remotes[old];
                this.urls[neu] = this.urls[old];
                delete this.remotes[old];
                delete this.urls[old];
                hv.remotes = hv.remotes.filter(function (n) { return n !== old && n !== neu; }).concat(neu);
                // branches that follow origin/<b> without an explicit upstream keep following it
                if (old === 'origin') {
                    Object.keys(hv.refSnapshot().branches).forEach(function (b) {
                        if (!hv.upstream[b] && hv.getCommit('origin/' + b)) {
                            hv.upstream[b] = 'origin/' + b;
                        }
                    });
                }
                hv.commitData.forEach(function (c) {
                    c.tags = c.tags.map(function (t) { return t.indexOf(old + '/') === 0 ? neu + t.slice(old.length) : t; });
                });
                hv.branches = hv.branches.map(function (t) { return t.indexOf(old + '/') === 0 ? neu + t.slice(old.length) : t; });
                Object.keys(hv.upstream).forEach(function (b) {
                    if (hv.upstream[b].indexOf(old + '/') === 0) {
                        hv.upstream[b] = neu + hv.upstream[b].slice(old.length);
                    }
                });
                if (this.remotes[neu].svg) {
                    this.remotes[neu].svg.select('text.remote-name-display').text(neu);
                }
                this.originView = this.remotes.origin || null;
                return hv.renderTags();
            }
            if (sub === 'remove' || sub === 'rm') {
                var gone = args[1];
                need(gone);
                if (!Object.keys(this.remotes).some(function (n) { return n !== gone && control.remotes[n] === control.remotes[gone]; })) {
                    this.hideRepo(this.remotes[gone]);
                }
                delete this.remotes[gone];
                delete this.urls[gone];
                hv.remotes = hv.remotes.filter(function (n) { return n !== gone; });
                hv.commitData.forEach(function (c) {
                    c.tags = c.tags.filter(function (t) { return t.indexOf(gone + '/') !== 0; });
                });
                hv.branches = hv.branches.filter(function (t) { return t.indexOf(gone + '/') !== 0; });
                Object.keys(hv.upstream).forEach(function (b) {
                    if (hv.upstream[b].indexOf(gone + '/') === 0) {
                        delete hv.upstream[b];
                    }
                });
                this.originView = this.remotes.origin || null;
                return hv.renderTags();
            }
            if (sub === 'show') {
                var n = args[1];
                need(n);
                var remote = this.remotes[n],
                    branches = Object.keys(remote.refSnapshot().branches).sort(),
                    mine = Object.keys(hv.refSnapshot().branches).sort();
                this.plain('* remote ' + n);
                this.plain('  Fetch URL: ' + this.urls[n]);
                this.plain('  Push  URL: ' + this.urls[n]);
                this.plain('  HEAD branch: ' + (remote.currentBranch || '(unknown)'));
                this.plain(branches.length === 1 ? '  Remote branch:' : '  Remote branches:');
                branches.forEach(function (b) {
                    control.plain('    ' + b + (hv.getCommit(n + '/' + b) ? ' tracked' : ' new (next fetch will store in remotes/' + n + ')'));
                });
                var pulls = mine.filter(function (b) { return (hv.upstream[b] || 'origin/' + b) === n + '/' + b && remote.isLocalBranch(b); });
                if (pulls.length) {
                    this.plain("  Local branch configured for 'git pull':");
                    pulls.forEach(function (b) { control.plain('    ' + b + ' merges with remote ' + b); });
                }
                return;
            }
            throw new Error(tr('remoteUsage'));
        },

        // ls-remote <remote>: the refs of the remote with their ids
        'ls-remote': function (args) {
            var control = this,
                name = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'origin',
                remote = this.remotes[name];
            if (!remote) {
                throw new Error(tr('noRemoteNamed', name));
            }
            var head = remote.getCommit('HEAD');
            if (head) {
                this.plain(head.id + '\tHEAD');
            }
            Object.keys(remote.refSnapshot().branches).sort().forEach(function (b) {
                control.plain(remote.getCommit(b).id + '\trefs/heads/' + b);
            });
            remote.tagNames().forEach(function (t) {
                control.plain(remote.getCommit('[' + t + ']').id + '\trefs/tags/' + t);
            });
        },

        // fetch [<remote> | --all] [--prune]: every branch of the remote to <remote>/<branch>, and tags
        fetch: function (args) {
            args = args || [];
            var control = this,
                names = args.indexOf('--all') > -1 ? Object.keys(this.remotes).sort()
                    : [args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'origin'];
            if (!Object.keys(this.remotes).length) {
                throw new Error(tr('noRemote'));
            }
            names.forEach(function (name) {
                if (!control.remotes[name]) {
                    throw new Error(tr('noRemoteNamed', name));
                }
            });
            names.forEach(function (name) { control._fetchFrom(name, args); });
            this.historyView.renderCommits();
        },

        _fetchFrom: function (name, args) {
            var remote = this.remotes[name],
                local = this.historyView,
                messages = [],
                branches = Object.keys(remote.refSnapshot().branches).sort(),
                // fetch <remote> [+]<src>[:<dst>]: only <src>, stored as <dst>
                spec = args.indexOf('--all') === -1 && /^(\+?)([^:]+)(?::(.+))?$/.exec(args.filter(function (a) { return a.charAt(0) !== '-'; })[1] || ''),
                dest = function (b) { return name + '/' + b; };

            if (spec) {
                var src = spec[2].replace(/^refs\/heads\//, ''),
                    dst = spec[3] && spec[3].replace(/^refs\/(remotes|heads)\//, '');
                if (!remote.isLocalBranch(src)) {
                    throw new Error(tr('noRef', src));
                }
                if (dst) {
                    if (dst === local.currentBranch) {
                        throw new Error(tr('fetchIntoCurrent', dst));
                    }
                    var old = local.getCommit(dst);
                    if (old && !spec[1] && !local.isAncestor(old.id, remote.getCommit(src).id) && !remote.isAncestor(old.id, src)) {
                        throw new Error(tr('notFastForward'));
                    }
                }
                branches = [src];
                dest = function () { return dst || name + '/' + src; };
            }

            branches.forEach(function (b) {
                var tip = remote.getCommit(b),
                    count = copyCommits(remote, local, tip),
                    tracking = dest(b),
                    known = local.getCommit(tracking);
                if (known || count) {
                    messages.push(tr('fetched', count, b));
                }
                local.moveTag(tracking, tip.id);
            });

            // tags on commits we have come along
            remote.tagNames().forEach(function (t) {
                var c = local.getCommit(remote.getCommit('[' + t + ']').id);
                if (c && local.tagNames().indexOf(t) === -1) {
                    c.tags.push('[' + t + ']');
                    if (remote.tagInfo[t]) {
                        local.tagInfo[t] = remote.tagInfo[t];
                    }
                }
            });

            // --prune: drop <remote>/<b> when the remote has no <b> any more
            if (args.indexOf('--prune') > -1 || args.indexOf('-p') > -1) {
                local.branches.slice().forEach(function (b) {
                    if (b.indexOf(name + '/') === 0 && !remote.isLocalBranch(b.slice(name.length + 1))) {
                        local._removeTag(b);
                    }
                });
                local.renderTags();
            }
            this.info(messages.join(' ') + (messages.length ? ' ' : ''));
        },

        pull: function (args) {
            var control = this,
                local = this.historyView,
                currentBranch = local.currentBranch,
                positional = args.filter(function (a) { return a.charAt(0) !== '-'; }),
                upstream = local.upstream[currentBranch],
                remoteName = positional[0] || this._remoteOf(upstream) || 'origin',
                rtBranch = positional[1] ? remoteName + '/' + positional[1]
                    : upstream && upstream.indexOf(remoteName + '/') === 0 ? upstream : remoteName + '/' + currentBranch;

            this.fetch([remoteName].concat(positional.slice(1, 2)));

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
            var result = args.indexOf('--rebase') > -1 || local.config['branch.' + currentBranch + '.rebase'] === 'true' || local.config['pull.rebase'] === 'true'
                ? local.rebase(rtBranch)
                : local.merge(rtBranch);

            if (result === 'Fast-Forward') {
                control.info(tr('fastForwardTo', rtBranch));
            } else if (result === 'Up-To-Date') {
                control.info(tr('upToDate'));
            } else if (result && result.at) {
                control._printSequence('rebase', result);
            } else if (result && result.conflicts) {
                result.conflicts.forEach(function (p) { control.info(tr('conflictIn', p)); });
                control.info(tr('mergeFailed'));
            }
        },

        // the remote of a remote-tracking branch (remote names may contain no /, branch names may)
        _remoteOf: function (ref) {
            return ref && this.historyView.remotes.filter(function (r) { return ref.indexOf(r + '/') === 0; })[0];
        },

        _copyCommits: function (remote, commit) {
            copyCommits(this.historyView, remote, commit);
        },

        _pushTag: function (remote, name) {
            var local = this.historyView, commit = local.getCommit('[' + name + ']'),
                there = remote.getCommit('[' + name + ']');
            if (there && there.id !== commit.id) {
                throw new Error(tr('tagExists', name));
            }
            this._copyCommits(remote, commit);
            if (!there) {
                remote.getCommit(commit.id).tags.push('[' + name + ']');
            }
            if (local.tagInfo[name]) {
                remote.tagInfo[name] = local.tagInfo[name];
            }
            remote.renderCommits();
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
                } else if (arg === '--tags') {
                    opt.tags = true;
                } else if (arg === '--follow-tags') {
                    opt.followTags = true;
                } else if (arg.charAt(0) !== '-') {
                    positional.push(arg);
                }
            });

            var remoteName = positional[0] || this._remoteOf(local.upstream[local.currentBranch]) || 'origin',
                remote = this.remotes[remoteName],
                refspec = /^([^:]*)(:?)(.*)$/.exec((positional[1] || '').replace(/^\+/, function () { opt.force = true; return ''; })),
                localRef = refspec[1] || local.currentBranch,
                remoteRef = refspec[2] === ':' ? refspec[3] : localRef,
                tracking = remoteName + '/' + remoteRef;

            positional[1] = positional[1] && positional[1].replace(/^\+/, '');
            if (remoteName === 'history') {
                throw new Error(tr('remoteHistory'));
            }
            if (!remote) {
                throw new Error(tr('noRemoteNamed', remoteName));
            }

            var control = this;
            if (opt.tags) {
                return local.tagNames().forEach(function (t) { control._pushTag(remote, t); });
            }
            // push origin :refs/tags/<tag> deletes like --delete
            if (refspec[2] === ':' && !refspec[1]) {
                opt.remove = true;
                positional[1] = refspec[3].replace(/^refs\/(tags|heads)\//, '');
            }
            if (opt.remove && positional[1] && remote.getCommit('[' + positional[1] + ']') && !remote.isLocalBranch(positional[1])) {
                remote._removeTag('[' + positional[1] + ']');
                delete remote.tagInfo[positional[1]];
                return remote.renderTags();
            }
            if (positional[1] && !opt.remove && local.tagNames().indexOf(positional[1]) > -1 && !local.isLocalBranch(positional[1])) {
                return this._pushTag(remote, positional[1]);
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

                this._copyCommits(remote, localCommit);
                remote.moveTag(remoteRef, localCommit.id);
                remote.renderCommits();
            }

            local.moveTag(tracking, localCommit.id);
            if (opt.followTags) {
                // annotated tags on commits the remote now has
                local.tagNames().forEach(function (t) {
                    if (local.tagInfo[t] && remote.getCommit(local.getCommit('[' + t + ']').id)) {
                        control._pushTag(remote, t);
                    }
                });
            }
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
                return Object.keys(hv.config).sort().forEach(function (k) { control.plain(k + '=' + hv.config[k]); });
            }
            var key = args[0];
            if (!key) {
                throw new Error(tr('configUsage'));
            }
            if (args.length === 1) {
                if (key in hv.config) {
                    this.plain(hv.config[key]);
                }
                return;
            }
            hv.config[key] = takeMessage(args.slice(1), []);
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
        this.remoteName = config.remoteName;
        // remotes this repository knows; a repository of the world knows none at first
        this.remotes = config.remotes || (this.isRemote ? [] : ['origin']);
        this._legacyStatus = 'clean'; // working tree without files (0.2.0): clean, staged or unstaged
        this.index = {};                // files of the active worktree: path -> lines
        this.work = {};
        this.stashes = [];      // commit ids, newest first
        // maps keyed by names people type: no prototype, so `constructor` is just a name
        this.config = Object.create(null);  // git config of this repository
        this.tagInfo = Object.create(null); // annotated tags: name -> {message}
        this.reflog = Object.create(null);  // ref -> [{id, msg}], newest first; HEAD per worktree
        this.operation = null;  // merge/cherry-pick/revert/rebase that stopped at a conflict
        this.bisectState = null; // git bisect: {orig, bad, good, skip, log}
        this.objects = Object.create(null); // blobs and trees written by hash-object -w / write-tree
        this.upstream = Object.create(null); // branch -> remote tracking branch, set by push -u / branch -u
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
                // <ref>^, <ref>^2, <ref>~2, combined; ^n picks the n-th parent
                suffix = typeof ref === 'string' && /^(.+?)((?:\^\d*|~\d*)+)$/.exec(ref),
                at = typeof ref === 'string' && /^(.*?)@\{([^}]+)\}$/.exec(ref),
                matchedCommit = null;

            if (ref === ROOT) {
                return this.initialCommit;
            }
            if (ref === '@') {
                return getCommit.call(this, 'HEAD');
            }

            // <branch>@{u} / @{upstream}, <ref>@{n} (reflog); stash@{n} are plain names
            if (at && at[1] !== 'stash') {
                return this._resolveAt(at[1], at[2]);
            }

            if (suffix) {
                var view = this;
                matchedCommit = getCommit.call(this, suffix[1]);
                suffix[2].replace(/\^(\d*)|~(\d*)/g, function (op, caret, tilde) {
                    var n = op.charAt(0) === '^' ? (caret === '' ? 1 : Number(caret)) : Number(tilde || 1);
                    if (op.charAt(0) === '^') {
                        matchedCommit = !matchedCommit ? null : n === 0 ? matchedCommit
                            : getCommit.call(view, n === 1 ? matchedCommit.parent : n === 2 ? matchedCommit.parent2 : null);
                    } else {
                        while (matchedCommit && n-- > 0) {
                            matchedCommit = getCommit.call(view, matchedCommit.parent);
                        }
                    }
                });
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

            existingCircles.exit().remove();

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

            // the author as tooltip
            var titles = this.commitBox.selectAll('circle.commit').selectAll('title')
                .data(function (d) { return d.stash || d.id === ROOT ? [] : [(d.author ? d.author + '\n' : '') + 'tree ' + treeId(d.tree || {})]; });
            titles.exit().remove();
            titles.enter().append('svg:title').merge(titles).text(String);
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

            existingPointers.exit().remove();
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

            existingPointers.exit().remove();
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

            existingTexts.exit().remove();
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
                        classes += ' git-tag' + (view.tagInfo[d.name.slice(1, -1)] ? ' annotated' : '');
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
            // the trees HEAD and the index stand for (git write-tree)
            var foot = table.createTFoot().insertRow(), label = document.createElement('th');
            label.scope = 'row';
            label.textContent = 'tree';
            foot.appendChild(label);
            [head, this.hasUnmerged() ? null : index].forEach(function (t) {
                var td = foot.insertCell();
                td.className = 'notranslate';
                td.setAttribute('translate', 'no');
                td.textContent = t ? treeId(t) : '–';
            });
            foot.insertCell();
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

        _resolveAt: function (name, spec) {
            var branch = name || this.currentBranch;
            if (spec === 'u' || spec === 'upstream') {
                return branch ? this.getCommit(this.upstream[branch] || 'origin/' + branch) : null;
            }
            if (/^\d+$/.test(spec)) {
                var entry = this.reflogFor(name || this.currentBranch || 'HEAD')[Number(spec)];
                return entry ? this.getCommit(entry.id) : null;
            }
            return null;
        },

        // HEAD, the active branch and every local branch start with their first commit
        initReflog: function () {
            var view = this, head = this.getCommit('HEAD');
            if (!head) {
                return;
            }
            this.reflog.HEAD = [{ id: head.id, msg: 'commit (initial): ' + (head.message || '') }];
            Object.keys(this.refSnapshot().branches).forEach(function (b) {
                view.reflog[b] = [{ id: view.getCommit(b).id, msg: 'commit (initial): ' + (view.getCommit(b).message || '') }];
            });
        },

        refSnapshot: function () {
            var view = this, branches = Object.create(null), head = this.getCommit('HEAD');
            this.commitData.forEach(function (c) {
                c.tags.forEach(function (t) {
                    if (view.isLocalBranch(t)) {
                        branches[t] = c.id;
                    }
                });
            });
            return { active: this.active, branch: this.currentBranch, head: head && head.id, branches: branches };
        },

        tagNames: function () {
            var names = [];
            this.commitData.forEach(function (c) {
                c.tags.forEach(function (t) {
                    if (t.charAt(0) === '[' && names.indexOf(t.slice(1, -1)) === -1) {
                        names.push(t.slice(1, -1));
                    }
                });
            });
            return names.sort();
        },

        // ids reachable from refs, every worktree HEAD, stashes, a running operation and
        // (opt.reflog) every reflog entry
        reachable: function (opt) {
            var view = this, seen = {}, todo = [];
            this.commitData.forEach(function (c) {
                if (c.tags.length) {
                    todo.push(c);
                }
            });
            this.worktrees.forEach(function (w, i) { todo.push(view.getCommit(view.worktreeHead(i))); });
            // a stopped merge/cherry-pick/rebase (also in another worktree) and a pending squash
            var keepOperation = function (op, squash) {
                if (op) {
                    todo.push(view.getCommit(op.theirs), op.orig && view.getCommit(op.orig.head), op.current && view.getCommit(op.current.id));
                    (op.todo || []).forEach(function (item) { todo.push(view.getCommit(item.id)); });
                }
                if (squash) {
                    todo.push(view.getCommit(squash));
                }
            };
            keepOperation(this.operation, this.squashPending);
            this.worktrees.forEach(function (w, i) {
                if (i !== view.active) {
                    keepOperation(w.operation, w.squash);
                }
            });
            if (opt && opt.reflog) {
                var logs = Object.keys(this.reflog).map(function (r) { return view.reflog[r]; })
                    .concat(this.worktrees.map(function (w) { return w.reflogHead || []; }));
                logs.forEach(function (log) {
                    log.forEach(function (e) { todo.push(view.getCommit(e.id)); });
                });
            }
            while (todo.length) {
                var c = todo.pop();
                if (c && c.id !== ROOT && !seen[c.id]) {
                    seen[c.id] = true;
                    todo.push(this.getCommit(c.parent), c.parent2 && this.getCommit(c.parent2));
                }
            }
            return seen;
        },

        pruneUnreachable: function () {
            var keep = this.reachable({ reflog: true });
            this.commitData = this.commitData.filter(function (c) { return keep[c.id]; });
            this.renderCommits();
        },

        // refs: null for all reflogs (also those of other worktrees)
        expireReflog: function (refs) {
            var view = this;
            (refs || Object.keys(this.reflog)).forEach(function (r) { view.reflog[r] = []; });
            if (!refs) {
                this.worktrees.forEach(function (w) { w.reflogHead = []; });
            }
        },

        addReflog: function (ref, id, msg) {
            (this.reflog[ref] = this.reflog[ref] || []).unshift({ id: id, msg: msg });
        },

        // reflog entries of a ref, newest first (HEAD@{0} is where it is now)
        reflogFor: function (ref) {
            return (this.reflog && this.reflog[ref]) || [];
        },

        // commits reachable from includes but not from excludes, children before parents,
        // otherwise newest (last created) first; opt.firstParent follows only first parents
        revList: function (includes, excludes, opt) {
            var view = this, firstParent = opt && opt.firstParent,
                parents = function (c) {
                    return [c.parent].concat(firstParent || !c.parent2 ? [] : [c.parent2]);
                },
                walk = function (refs) {
                    var seen = {}, todo = refs.map(function (r) { return view.getCommit(r); }), c;
                    while (todo.length) {
                        c = todo.pop();
                        if (c && c.id !== ROOT && !seen[c.id]) {
                            seen[c.id] = c;
                            parents(c).forEach(function (p) { todo.push(view.getCommit(p)); });
                        }
                    }
                    return seen;
                },
                out = walk(excludes),
                set = walk(includes),
                ids = Object.keys(set).filter(function (id) { return !out[id]; }),
                order = {}, children = {}, list = [];
            this.commitData.forEach(function (c, i) {
                if (order[c.id] === undefined) {
                    order[c.id] = i;
                }
            });
            ids.forEach(function (id) { children[id] = 0; });
            ids.forEach(function (id) {
                parents(set[id]).forEach(function (p) {
                    if (children[p] !== undefined) {
                        children[p]++;
                    }
                });
            });
            while (list.length < ids.length) {
                var next = ids.filter(function (id) { return children[id] === 0; })
                    .sort(function (a, b) { return order[b] - order[a]; })[0];
                children[next] = -1;
                list.push(set[next]);
                parents(set[next]).forEach(function (p) {
                    if (children[p] > 0) {
                        children[p]--;
                    }
                });
            }
            return list;
        },

        // every ref for --all: branches, remote branches, tags, stash, HEAD
        allRefs: function () {
            var refs = ['HEAD'];
            this.commitData.forEach(function (c) {
                c.tags.forEach(function (t) {
                    if (t !== 'HEAD' && refs.indexOf(t) === -1) {
                        refs.push(t);
                    }
                });
            });
            return refs.filter(function (r) { return r.indexOf('stash@{') !== 0 || r === 'stash@{0}'; });
        },

        // like git log --decorate: HEAD -> branch, branches, tags, remote branches
        decorations: function (id) {
            var view = this, commit = this.getCommit(id), head = this.getCommit('HEAD'),
                tags = commit.tags.filter(function (t) { return t !== 'HEAD' && t.indexOf('stash@{') !== 0; }),
                local = tags.filter(function (t) { return view.isLocalBranch(t) && t !== view.currentBranch; }).sort(),
                labels = tags.filter(function (t) { return t.charAt(0) === '['; }).sort().map(function (t) { return 'tag: ' + t.slice(1, -1); }),
                remote = tags.filter(function (t) { return view.isRemoteRef(t); }).sort(),
                out = [];
            if (head && head.id === id) {
                out.push(this.currentBranch ? 'HEAD -> ' + this.currentBranch : 'HEAD');
            } else if (this.currentBranch && tags.indexOf(this.currentBranch) > -1) {
                out.push(this.currentBranch);
            }
            return out.concat(local, labels, remote).join(', ');
        },

        // log marks its commits in the graph until the next command
        highlight: function (ids) {
            if (this.svg) {
                this.svg.selectAll('circle.commit').classed('selected', function (d) { return ids.indexOf(d.id) > -1; });
            }
        },

        // the best common ancestor: common to both, and no other common ancestor is newer
        // (several: the first one reached breadth-first from b)
        mergeBase: function (a, b) {
            var view = this,
                walk = function (start) {
                    var order = [], seen = {}, todo = [view.getCommit(start)], c;
                    while (todo.length) {
                        c = todo.shift();
                        if (c && c.id !== ROOT && !seen[c.id]) {
                            seen[c.id] = true;
                            order.push(c);
                            todo.push(view.getCommit(c.parent), c.parent2 && view.getCommit(c.parent2));
                        }
                    }
                    return order;
                },
                inA = {};
            walk(a).forEach(function (c) { inA[c.id] = true; });
            var common = walk(b).filter(function (c) { return inA[c.id]; });
            return common.filter(function (c) {
                return !common.some(function (d) { return d !== c && view.isAncestor(c, d); });
            })[0] || null;
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

        // commit -a / add -u: a copy of the index where tracked files take their working tree content
        stagedTracked: function () {
            var index = clone(this.index), work = this.work;
            Object.keys(index).forEach(function (p) {
                if (work[p]) {
                    index[p] = clone(work[p]);
                } else {
                    delete index[p];
                }
            });
            return index;
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

        // an object by name: <rev>, <rev>^{tree}, <rev>:<path>, or the id of a blob/tree git has
        findObject: function (name) {
            var view = this, m, commit, found = null;
            if (!name) {
                return null;
            }
            if ((m = /^(.+)\^\{tree\}$/.exec(name))) {
                commit = this.getCommit(m[1]);
                return commit && commit.id !== ROOT ? { type: 'tree', id: treeId(commit.tree || {}), data: commit.tree || {} } : null;
            }
            if ((m = /^([^:]*):(.+)$/.exec(name))) {
                commit = this.getCommit(m[1] || 'HEAD');
                var lines = commit && commit.tree && commit.tree[m[2]];
                return Array.isArray(lines) ? { type: 'blob', id: blobId(lines), data: lines } : null;
            }
            if (this.objects[name]) {
                return this.objects[name];
            }
            commit = this.getCommit(name);
            if (commit && commit.id !== ROOT && !/^\[/.test(name)) {
                return { type: 'commit', id: commit.id, data: commit };
            }
            if (!/^[0-9a-f]{4,7}$/.test(name)) {
                return null;
            }
            // blobs and trees of every commit and of the index
            var trees = this.commitData.map(function (c) { return c.tree || {}; }).concat([this.index]);
            trees.forEach(function (tree) {
                if (found) {
                    return;
                }
                if (treeId(tree).indexOf(name) === 0) {
                    found = { type: 'tree', id: treeId(tree), data: tree };
                }
                Object.keys(tree).forEach(function (p) {
                    if (!found && Array.isArray(tree[p]) && blobId(tree[p]).indexOf(name) === 0) {
                        found = { type: 'blob', id: blobId(tree[p]), data: tree[p] };
                    }
                });
            });
            return found;
        },

        storeObject: function (type, data) {
            var id = type === 'tree' ? treeId(data) : blobId(data);
            this.objects[id] = { type: type, id: id, data: clone(data) };
            return id;
        },

        // commits marked good/bad/skip during git bisect
        renderBisect: function () {
            var st = this.bisectState;
            if (!this.svg) {
                return;
            }
            this.svg.selectAll('circle.commit')
                .classed('bisect-bad', function (d) { return !!st && st.bad === d.id; })
                .classed('bisect-good', function (d) { return !!st && st.good.indexOf(d.id) > -1; })
                .classed('bisect-skip', function (d) { return !!st && st.skip.indexOf(d.id) > -1; });
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
            current.bisect = this.bisectState;
            current.reflogHead = this.reflog.HEAD;
            current.previous = this.previousBranch;
            current.squash = this.squashPending;

            this.active = index;
            this.currentBranch = next.branch;
            this.previousBranch = next.previous || null;
            this.squashPending = next.squash || null;
            this.index = next.index || {};
            this.work = next.work || {};
            this.operation = next.operation || null;
            this.bisectState = next.bisect || null;
            this.reflog.HEAD = next.reflogHead || [{ id: next.branch ? this.getCommit(next.branch).id : next.head, msg: 'worktree add' }];
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
                // like git: the same message in every language (it ends up in commits and conflict labels)
                message: text ? 'On ' + where + ': ' + text : 'WIP on ' + where,
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
            this.commit({ cherryPickedFrom: source.id, author: source.author }, source.message);
            return source;
        },

        // a new commit with the parents of HEAD; the old one is no longer reachable
        amend: function (message) {
            var head = this.getCommit('HEAD'),
                commit = { parent: head.parent, author: head.author };

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
            if (!commit.author) {
                commit.author = this.authorName || this.config['user.name'] ||
                    (this.isRemote ? this.remoteName : 'you');
            }
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
            return this.remotes.some(function (r) { return name.indexOf(r + '/') === 0; });
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

        merge: function (ref, noFF, message) {
            var mergeTarget = this.getCommit(ref),
                text = message || "Merge branch '" + ref + "'",
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
                return this._mergeFiles(mergeTarget, ref, noFF, currentCommit, text);
            }
            if (noFF === true) {
                this._markNoFF(mergeTarget, currentCommit);
                this.commit({parent2: mergeTarget.id, isNoFFCommit: true}, text);
            } else if (this.isAncestor(currentCommit, mergeTarget)) {
                this.fastForward(mergeTarget);
                return 'Fast-Forward';
            } else {
                this.commit({parent2: mergeTarget.id}, text);
            }
        },

        // three-way merge of the files; stops with an operation when files conflict
        _mergeFiles: function (target, label, noFF, currentCommit, text) {
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
            this.commit({ parent2: target.id, isNoFFCommit: noFF === true || undefined, tree: clone(result.tree) }, text || "Merge branch '" + label + "'");
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
        applyCommit: function (commit, reverse, mainline) {
            var parent = this.getCommit(mainline === 2 ? commit.parent2 : commit.parent),
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
            try {
                return this._continueSequence();
            } catch (e) {
                // refused before anything changed: no cherry-pick/revert is left open
                this.operation = null;
                throw e;
            }
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
            this.index = clone(base.tree || {});
            this.work = clone(base.tree || {});
            untracked.forEach(function (p) {
                if (!(base.tree || {})[p]) {
                    this.work[p] = untracked.files[p];
                }
            }, this);

            this.operation = {
                type: 'rebase',
                todo: opt.todo || this._todo(toRebase, opt.autosquash),
                orig: orig,
                before: before,
                updateRefs: !!opt.updateRefs,
                map: {}
            };
            return this._continueSequence();
        },

        // rebase -i: the todo stays open until :wq / :q!; nothing changes before
        _openTodo: function (base, toRebase, opt) {
            if (this.operation) {
                throw new Error(tr('operationInProgress', this.operation.type));
            }
            if (this.fileStatus().some(function (f) { return f.x !== '?'; })) {
                throw new Error(tr('dirtyRebase'));
            }
            this.operation = { type: 'rebase-todo', todo: this._todo(toRebase, opt.autosquash), base: base.id, updateRefs: !!opt.updateRefs };
            return { todo: this.operation.todo };
        },

        runTodo: function () {
            var op = this.operation,
                items = op.todo.filter(function (t) { return t.kind !== 'drop'; });
            if (items[0] && (items[0].kind === 'squash' || items[0].kind === 'fixup')) {
                throw new Error(tr('todoNothingBefore', items[0].kind));
            }
            this.operation = null;
            if (!items.length) {
                return { empty: true };
            }
            try {
                return this._rebaseFiles(this.getCommit(op.base), null, { updateRefs: op.updateRefs, todo: items });
            } catch (e) {
                this.operation = op;
                throw e;
            }
        },

        // the rebase todo, oldest first; with autosquash "fixup! <subject>" / "squash! <subject>"
        // commits move right behind their target (and its earlier fixups)
        _todo: function (commits, autosquash) {
            var todo = [];
            commits.forEach(function (c) {
                var m = autosquash && /^(fixup|squash)! (.*)$/.exec(c.message || ''),
                    item = { id: c.id, kind: 'rebase' },
                    at = -1;
                if (m) {
                    todo.forEach(function (t, i) {
                        var msg = this.getCommit(t.id).message || '';
                        if (at === -1 && t.kind === 'rebase' && (m[2] === msg || m[2].indexOf(msg + ' / ') === 0 || t.id.indexOf(m[2]) === 0)) {
                            at = i;
                        }
                    }, this);
                }
                if (at === -1) {
                    return todo.push(item);
                }
                item.kind = m[1];
                while (at + 1 < todo.length && (todo[at + 1].kind === 'fixup' || todo[at + 1].kind === 'squash')) {
                    at++;
                }
                todo.splice(at + 1, 0, item);
            }, this);
            return todo;
        },

        _continueSequence: function () {
            var op = this.operation, done = [];
            while (op.todo.length) {
                var item = op.todo[0],
                    commit = this.getCommit(item.id);
                // a pick that would give the same commit again stays as it is (like git)
                if (op.type === 'rebase' && item.kind === 'rebase' && !commit.parent2 &&
                    commit.parent === this.getCommit('HEAD').id && !this.hasUnmerged()) {
                    this._fastForwardFiles(commit);
                    op.todo.shift();
                    op.map[commit.id] = commit.id;
                    done.push({ from: commit.id, to: commit.id });
                    continue;
                }
                // a refused step (local changes) leaves the todo as it was
                var result = this.applyCommit(commit, item.kind === 'revert', item.mainline);
                op.todo.shift();
                if (result.conflicts.length) {
                    op.current = item;
                    return { conflicts: result.conflicts, at: commit, done: done };
                }
                done.push(this._commitStep(item));
                if (item.kind === 'edit') {
                    // stop to amend or split this commit; rebase --continue goes on
                    op.edited = this.getCommit('HEAD').id;
                    return { edit: this.getCommit('HEAD'), done: done };
                }
            }
            this._finishSequence();
            return { done: done };
        },

        _commitStep: function (item, message) {
            var commit = this.getCommit(item.id);
            if (item.kind === 'pick') {
                this.commit({ cherryPickedFrom: commit.id, author: commit.author }, message || commit.message);
            } else if (item.kind === 'fixup' || item.kind === 'squash') {
                // into the commit before: fixup keeps its message, squash adds this one
                var head = this.getCommit('HEAD'), text = commit.message || '';
                if (item.kind === 'squash') {
                    var sq = /^squash! (.*)$/.exec(text);
                    if (sq) {
                        text = sq[1] === head.message ? '' : sq[1].indexOf(head.message + ' / ') === 0 ? sq[1].slice(head.message.length + 3) : sq[1];
                    }
                }
                this.amend(message || (item.kind === 'squash' && text ? head.message + ' / ' + text : head.message));
                var now = this.getCommit('HEAD').id, map = this.operation.map;
                Object.keys(map).forEach(function (k) { if (map[k] === head.id) { map[k] = now; } });
                map[commit.id] = now;
            } else if (item.kind === 'revert') {
                commit.reverted = true;
                this.commit({ reverts: commit.id }, message || 'Revert "' + (commit.message || commit.id) + '"');
            } else {
                this.commit({ rebased: true, author: commit.author }, message || item.message || commit.message);
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

        // git commit while a cherry-pick/revert/rebase stopped: finish that step;
        // a cherry-pick or revert with nothing left ends here
        commitCurrent: function (message) {
            var op = this.operation;
            this._commitStep(op.current, message);
            op.current = null;
            if (!op.todo.length && op.type !== 'rebase') {
                this._finishSequence();
            }
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
            } else if (changedPaths(this.headTree(), this.index).length) {
                // stopped by edit: staged changes belong in a commit first
                throw new Error(tr('stagedOnContinue'));
            } else if (op.type === 'rebase' && this.fileStatus().some(function (f) { return f.y !== ' ' && f.y !== '?'; })) {
                // like git: unstaged changes are refused before anything happens
                throw new Error(tr('dirtyRebase'));
            }
            if (op.edited) {
                // --update-refs: branches on the edited commit go to what became of it
                var now = this.getCommit('HEAD').id, map = op.map, edited = op.edited;
                Object.keys(map).forEach(function (k) { if (map[k] === edited) { map[k] = now; } });
                op.edited = null;
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
            if (op.type === 'rebase') {
                // --update-refs: a branch on the skipped commit goes where HEAD is now
                op.map[op.current.id] = this.getCommit('HEAD').id;
            }
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

            if (!opt.onto && !opt.autosquash && !opt.interactive) {
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
                if (opt.interactive && base.id === this.getCommit('HEAD').id) {
                    return 'Up-To-Date';
                }
                this._fastForwardFiles(base);
                return 'Fast-Forward';
            }
            if (opt.interactive) {
                return this._openTodo(base, toRebase, opt);
            }

            if (this.hasFiles() || opt.autosquash) {
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
