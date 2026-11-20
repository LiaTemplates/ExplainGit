<!--
author:   Yannik Höll
email:    labruzzler@gmail.com
version:  0.6.0
edit:     true
language: en
narrator: US English Female

comment:  Visualize git commands with D3: an interactive repository per slide,
          quizzes that check the resulting repository, and a collaborative
          mode where the whole classroom works on one repository.

logo:     https://upload.wikimedia.org/wikipedia/commons/e/e0/Git-logo.svg

script:   dist/index.js

attribute: ExplainGit is based on [explain-git-with-d3](https://github.com/onlywei/explain-git-with-d3)
           by Wei Wang.

@ExplainGit: @ExplainGit._mount_(@uid, )

@ExplainGit.eval: @ExplainGit._mount_(@uid,```@0```)

@ExplainGit.quiz: @ExplainGit._quiz_(@uid,```@0```)

@ExplainGit._mount_
<div class="explaingit-widget" id="explaingit_@0"></div>
<script>
;(function start () {
  // the course can show a slide before dist/index.js is loaded
  if (window.ExplainGit) ExplainGit.mount("@0", `@'1`, {})
  else setTimeout(start, 50)
})()
"LIA: stop"
</script>
@end

@ExplainGit._quiz_
<div class="explaingit-widget" id="explaingit_@0"></div>
<script>
;(function start () {
  // the course can show a slide before dist/index.js is loaded
  if (window.ExplainGit) ExplainGit.mount("@0", `@'1`, { quiz: true })
  else setTimeout(start, 50)
})()
"LIA: stop"
</script>

[[!]]
<script>
ExplainGit.check("@0", "@input")
</script>
@end
-->

# ExplainGit for LiaScript

ExplainGit draws a git repository and lets learners change it with real git
commands. You can preset a repository, check in a quiz whether learners reached
the right state, and let a whole classroom work on one repository together.

Import the template into your course (pinned version or latest):

`import: https://raw.githubusercontent.com/LiaTemplates/ExplainGit/0.6.0/README.md`

`import: https://raw.githubusercontent.com/LiaTemplates/ExplainGit/master/README.md`

Based on [explain-git-with-d3](https://github.com/onlywei/explain-git-with-d3)
([website](https://onlywei.github.io/explain-git-with-d3/)) by Wei Wang.

[Open this page as a LiaScript course](https://liascript.github.io/course/?https://raw.githubusercontent.com/LiaTemplates/ExplainGit/master/README.md)


## `@ExplainGit`

`@ExplainGit` creates a repository with one initial commit. Type commands like
`git commit`, `git branch dev` or `git checkout dev` into the black console.

@ExplainGit


## `@ExplainGit.eval`

`@ExplainGit.eval` below a code block runs its commands first, one per line.
Empty lines and lines starting with `#` are skipped. A line `create origin` adds
a remote repository named `origin`; `create <name>` adds another repository (a
colleague, a fork, a second server), see the slides "Remotes" to "Forks". A first line `git init -b main` names the
first branch `main` instead of `master`. Files are written like in a shell:
`echo "text" > file.txt` and `echo "more" >> file.txt`; see the slide "Files and
diff". Without files, `edit` stands for an abstract change.

```` markdown
``` text  @ExplainGit.eval
git commit
git commit -m "Hello World"
git branch dev
git checkout dev
git commit -m "dev commit"
git checkout master
git commit -m "master commit"
```
````

This code block creates the following repository:

``` text  @ExplainGit.eval
git commit
git commit -m "Hello World"
git branch dev
git checkout dev
git commit -m "dev commit"
git checkout master
git commit -m "master commit"
```


## `@ExplainGit.quiz`

`@ExplainGit.quiz` turns the repository into a quiz. The code block holds the
setup commands, a line `---`, and a solution. The check compares the learner's
repository with the one the solution creates: the commits and how they are
connected, every branch, tag and stash, where `HEAD` is, the state of the working
tree and the other worktrees. When the quiz uses files, their contents in every
commit, in the index and in the working tree count too. Commit messages and the
commands used do not matter, so every correct way is accepted. Without a `---`
line all commands are the solution.

"Show solution" replaces the learner's repository with the solution.

```` markdown
Create a branch `feature`, make two commits on it and merge it into `master`
with a merge commit.

``` text  @ExplainGit.quiz
git commit
---
git checkout -b feature
git commit
git commit
git checkout master
git merge --no-ff feature
```
````

__Try it:__ Create a branch `feature`, make two commits on it and merge it into `master`
with a merge commit.

``` text  @ExplainGit.quiz
git commit
---
git checkout -b feature
git commit
git commit
git checkout master
git merge --no-ff feature
```


## Files and diff

Repositories can hold small text files. Write them like in a shell, then use git
as usual: `git add`, `git commit`, `git status`, `git diff`, `git show`,
`git restore`, `git reset`, `git rm`, `git mv`, `git clean`. The table under the
graph shows every file in `HEAD`, in the index and in the working tree, as a short
id of its content; hover a cell to see the content. Yellow cells differ from the
column to their left.

``` text  @ExplainGit.eval
echo "# Recipes" > README.md
echo "flour" > bread.txt
git add .
git commit -m "first recipes"
echo "water" >> bread.txt
git add bread.txt
echo "salt" >> bread.txt
echo "draft" > todo.txt
```

Try `git status`, `git diff`, `git diff --staged` and `git restore --staged bread.txt`.

__Try it:__ Add the line `yeast` to `bread.txt` and commit only this file.

``` text  @ExplainGit.quiz
echo flour > bread.txt
git add bread.txt
git commit -m bread
echo draft > todo.txt
---
echo yeast >> bread.txt
git add bread.txt
git commit -m yeast
```


## Conflicts

When two branches change the same lines, `git merge`, `git rebase`,
`git cherry-pick` and `git stash pop` stop with a conflict. The file then holds
both versions between `<<<<<<<`, `=======` and `>>>>>>>`. Write the right
version, mark it with `git add` and continue with `git commit` (merge) or
`--continue` (rebase, cherry-pick, revert). `--abort` goes back,
`git checkout --ours/--theirs <file>` takes one side, and
`git config merge.conflictstyle diff3` also shows the common base.

``` text  @ExplainGit.eval
echo "Hello" > greeting.txt
git add .
git commit -m start
git switch -c dev
echo "Servus" > greeting.txt
git commit -am servus
git switch master
echo "Moin" > greeting.txt
git commit -am moin
git merge dev
```

Try `cat greeting.txt`, then `echo "Moin, Servus" > greeting.txt`,
`git add greeting.txt` and `git commit`.

__Try it:__ Merge `dev` into `master` and keep the line `Moin, Servus`.

``` text  @ExplainGit.quiz
echo "Hello" > greeting.txt
git add .
git commit -m start
git switch -c dev
echo "Servus" > greeting.txt
git commit -am servus
git switch master
echo "Moin" > greeting.txt
git commit -am moin
---
git merge dev
echo "Moin, Servus" > greeting.txt
git add greeting.txt
git commit -m merged
```


## History

`git log` lists commits and marks them in the graph until the next command.
It knows `--oneline`, `--graph`, `--all`, `-<n>`, `--merges`, `--no-merges`,
`--first-parent`, `-p`, `--stat`, `-S <text>`, `-- <file>` and ranges:
`main..dev` (what `dev` has and `main` has not), `^main dev`, `dev --not main`
and `main...dev --left-right` (what only one side has). Revisions like
`HEAD~2`, `HEAD^2` (second parent of a merge), `@{u}` (upstream) and
`HEAD@{3}` (reflog) work everywhere. `git branch -v`, `-vv` (ahead/behind),
`--merged` and `--no-merged` give an overview.

``` text  @ExplainGit.eval
git init -b main
git commit -m one
git switch -c dev
git commit -m d1
git commit -m d2
git switch main
git commit -m m1
git log --oneline --left-right main...dev
```

Try `git log --oneline main..dev`, `git log --all --oneline` and `git branch -v`.


## Reflog and recovery

Every move of `HEAD` and of a branch is written to the reflog: `git reflog`,
`git reflog show <branch>`, `git log -g`. A commit that no branch reaches any
more can be saved with `git branch rescue HEAD@{1}`. `git fsck` lists such
commits once the reflog is gone (`git reflog expire --expire=now --all`), and
`git gc --prune=now` or `git prune` remove them for good.

``` text  @ExplainGit.eval
git commit -m a
git commit -m important
git reset --hard HEAD~
git reflog
```

__Try it:__ The commit `important` was lost by `git reset --hard`. Bring it back
as branch `rescue` and stay on `master`.

``` text  @ExplainGit.quiz
git commit -m a
git commit -m important
git reset --hard HEAD~
---
git branch rescue HEAD@{1}
```


## Tags

`git tag v1` makes a lightweight tag, `git tag -a v1 -m "message"` an annotated
one (drawn with a thick border, shown by `git show v1`). `git tag -l "v1*"`,
`git tag -d v1`, `git push origin v1`, `git push --tags`, `git push --follow-tags`
and `git describe` work as in git. Aliases come from `git config alias.<name>`,
for example `git config --global alias.last 'log -1 HEAD'`.

``` text  @ExplainGit.eval
git commit -m a
git tag -a v1.0 -m "first release"
git commit -m b
git commit -m c
git tag v1.1-rc HEAD~
git describe
```


## Rewriting history

`git rebase -i <base>` opens the todo list in the console, oldest commit first.
There is no editor: change the list line by line, then start the rebase with
`:wq` (or cancel it with `:q!`).

* `squash 2`, `fixup 3`, `drop 1`, `pick 1`: the action for a line (number or commit id)
* `reword 2 "better message"`: a new message
* `edit 2`: stop there, for `git commit --amend` or to split the commit
  (`git reset HEAD^`, then several commits), then `git rebase --continue`
* `move 3 1`: put line 3 first

`git commit --fixup <commit>` makes a commit that `git rebase --autosquash <base>`
folds into its target.

``` text  @ExplainGit.eval
echo flour > bread
git add bread
git commit -m flour
echo water >> bread
git commit -am water
echo salt >> bread
git commit -am "salt"
echo yeast >> bread
git commit -am "forgot yeast"
git rebase -i HEAD~3
squash 3
reword 2 "water and salt"
:wq
```

__Try it:__ Make one commit out of the last three. The files must stay as they are.

``` text  @ExplainGit.quiz
echo a > f
git add f
git commit -m base
echo 1 > one
git add one
git commit -m one
echo 2 > two
git add two
git commit -m two
echo 3 > three
git add three
git commit -m three
---
git reset --soft HEAD~3
git commit -m "one, two and three"
```


## Finding bugs

`git bisect` finds the commit that brought in a bug by halving the history. Start
it with a bad and a good commit; git checks out the commit in the middle, you say
`git bisect good` or `git bisect bad`, until git names the first bad commit. Good
commits are marked blue, bad ones red. `git bisect reset` brings you back.

``` text  @ExplainGit.eval
echo flour > bread
git add bread
git commit -m flour
echo water >> bread
git commit -am water
echo yeast >> bread
git commit -am yeast
echo sand >> bread
git commit -am "fine sugar"
echo salt >> bread
git commit -am salt
echo seeds >> bread
git commit -am seeds
git bisect start HEAD HEAD~5
git bisect bad
git bisect good
```

__Try it:__ One commit put sand into the bread. Find it with `git bisect` (`cat bread`
shows the file), tag it `sand`, and end with `git bisect reset`.

``` text  @ExplainGit.quiz
echo flour > bread
git add bread
git commit -m flour
echo water >> bread
git commit -am water
echo yeast >> bread
git commit -am yeast
echo sand >> bread
git commit -am "fine sugar"
echo salt >> bread
git commit -am salt
echo seeds >> bread
git commit -am seeds
---
git tag sand HEAD~2
```


## Who wrote this line

`git blame <file>` shows for every line the commit and author that brought it in,
`git grep <text> [<rev>]` searches the files, and `git log -L <a>,<b>:<file>` shows
every commit that changed these lines.

``` text  @ExplainGit.eval
git config user.name Ann
echo flour > bread
echo water >> bread
git add bread
git commit -m start
git config user.name Bob
echo flour > bread
echo milk >> bread
echo salt >> bread
git commit -am milk
git blame bread
git grep -n salt
git log -L 2,2:bread
```


## Modern git

`git switch`, `git restore`, `git stash`, `git cherry-pick`, `git commit --amend`
and `git rebase --onto` work as in git 2.5x. The line under "Current Branch"
shows the working tree: clean, changes staged, or changes not staged.

``` text  @ExplainGit.eval
git init -b main
git switch -c feature/login
git commit -m login
git commit -m "fix typo"
git switch main
git cherry-pick feature/login
edit
git stash
```

__Try it:__ Undo the last commit, but keep its changes, and put them away in a
stash.

``` text  @ExplainGit.quiz
git commit -m wip
---
git reset --soft HEAD^
git stash
```


## Worktrees

A worktree is a second working folder of the same repository, with its own
`HEAD`. `git worktree add ../hotfix` creates one, `cd ../hotfix` switches into
it, and `git -C ../hotfix commit` runs one command there. Every other worktree
shows its `HEAD` as a dashed tag. A branch can be checked out in one worktree
only.

``` text  @ExplainGit.eval
git commit -m a
git worktree add -b hotfix ../hotfix
git -C ../hotfix commit -m fix
git worktree add --detach ../review HEAD
```

__Try it:__ Without leaving `master`, fix a bug on a new branch `hotfix` in a
second worktree `../hotfix` and commit it there.

``` text  @ExplainGit.quiz
git commit
---
git worktree add -b hotfix ../hotfix
git -C ../hotfix commit
```


## Remotes

Every remote gets its own window on the right. `git remote add` connects a
repository of the course: the last part of the url names it (`…/ticgit` is the
repository `ticgit`, created with `create ticgit`), otherwise a new one is made.
`git fetch` brings every branch as `<remote>/<branch>`; `git switch <b>` creates a
local branch that follows `<remote>/<b>`.

``` text  @ExplainGit.eval
create origin
create ticgit
git remote add pb https://github.com/paulboone/ticgit
@ticgit git switch -c serverfix
@ticgit git commit -m fix
git fetch pb
git switch serverfix
git remote -v
```

A command that starts with `@<repository>` runs in that repository, as if a
colleague typed it there. Refspecs work too: `git fetch origin
master:refs/remotes/origin/mymaster`, `git push origin serverfix:awesomebranch`,
`git push origin +dev:dev`.


## Working in a team

John and Jessica push to the same server. Jessica (`@origin`) was faster, so
John's push is rejected. Every commit remembers its author (`git config user.name`,
`git commit --author="Ann"`, in the classroom the person who typed it); `git log`
shows it, and so does the tooltip of a commit.

``` text  @ExplainGit.eval
create origin
git commit -m start
git push
@origin git config user.name Jessica
@origin git commit -m "Add reset task"
git config user.name John
git commit -m "Remove invalid default value"
git push
```

__Try it:__ Your push was rejected. Bring your commit to `origin` with a merge
(do not rewrite it).

``` text  @ExplainGit.quiz
create origin
git commit -m start
git push
@origin git commit -m "Add reset task"
git commit -m "Remove invalid default value"
---
git fetch
git merge origin/master
git push
```


## Forks

In the integration-manager workflow you push to your own fork (`origin`) and the
maintainer pulls from it into the official repository (`upstream`). Before that
you rebase onto the newest `upstream`, so your work applies cleanly.

``` text  @ExplainGit.eval
create origin
create upstream
git remote add upstream https://github.com/project/upstream
git switch -c topic
git commit -m feature
git push -u origin topic
@upstream git commit -m "maintainer moves on"
git fetch upstream
git rebase upstream/master
git push -f origin topic
@upstream git remote add fork ../origin.git
@upstream git fetch fork
@upstream git merge fork/topic
```


## Working together

In a LiaScript classroom every repository gets the button __Collaborate__. It works like the
collaborative mode of code blocks:

* Without it, everyone works on their own repository.
* With it, you join the shared repository of this slide. Every command anyone in
  the shared repository types is applied for all of them, in the same order,
  and the console shows who typed it. __Work alone__ brings back your own
  repository.
* __Reset__ clears your own repository. In the shared repository only the owner
  of the classroom can reset it.

The button works for `@ExplainGit`, `@ExplainGit.eval` and `@ExplainGit.quiz`.
A group can solve a quiz together, and everyone checks the shared result. The
console is shared too: `cd` into another worktree moves everyone there.

@ExplainGit


## Languages

Buttons, console messages and quiz feedback follow the course language
(`language:` in the header): English by default, German (`de`) and Ukrainian
(`uk`) have their own texts. When a reader switches Google Translate on, the
widget follows that language: `de` and `uk` use their own texts, every other
language is translated by Google. Git commands, branch names and commit ids are
never translated.


## Commands

| Command | Notes |
| --- | --- |
| `git commit [-m "msg"] [--amend] [-a] [--allow-empty]` | `--amend` replaces the last commit |
| `git switch <b>`, `-c <b> [<start>]`, `-C`, `--detach <ref>`, `git switch -` | |
| `git checkout <ref>`, `-b <b> [<start>]`, `git checkout -` | a commit id detaches `HEAD` |
| `git branch <b> [<start>]`, `-d`/`-D`, `-m`/`-M`, `-c`, `-f <b> <ref>`, `-u origin/<b>` | names like `feature/login` work |
| `git merge <b>`, `--no-ff`, `--ff-only`, `--squash` | |
| `git rebase <upstream> [<b>]`, `--onto <base>`, `--update-refs` | |
| `git cherry-pick <ref>...` | |
| `git reset [--soft / --mixed / --hard] <ref>`, `git reset [<ref>] -- <path>`, `git revert <ref>` | `--mixed` is the default, as in git |
| `echo "text" > f`, `echo text >> f`, `cat f`, `ls`, `rm f`, `mv a b` | files in the working tree |
| `git add <path> / . / -A`, `git rm [--cached]`, `git mv`, `git status [-s]` | |
| `git diff [--staged] [<a> <b> / <a>..<b> / <a>...<b>] [--stat] [-- <path>]`, `git show [<ref>]` | |
| `git restore [--staged] [--source=<ref>] <path>`, `git checkout [<ref>] -- <path>`, `git clean -n / -f` | |
| `git merge --abort / --continue`, `git checkout --ours / --theirs <path>` | conflicts |
| `git rebase / cherry-pick / revert --continue / --skip / --abort` | |
| `git config <key> [<value>]`, `git config --list`, `git config alias.<name> '<command>'` | e.g. `merge.conflictstyle diff3`, `pull.rebase true` |
| `git log [--oneline] [--graph] [--all] [-<n>] [--merges / --no-merges] [--first-parent] [-p] [--stat] [-S <text>] [--left-right] [<range>] [-- <path>]` | marks the listed commits in the graph |
| `git reflog [show <ref>]`, `git log -g`, `git reflog expire --expire=now --all` | |
| `git fsck [--no-reflogs] [--unreachable]`, `git gc [--prune=now]`, `git prune` | |
| `git rev-parse [--abbrev-ref] <rev>`, `git describe [--tags]` | |
| `git branch [-v / -vv] [-a / -r] [--merged / --no-merged [<rev>]]` | |
| `git tag [-a] [-m <msg>] <name> [<rev>]`, `git tag -d <name>`, `git tag [-l "<pattern>"]` | |
| `edit [<file>]` | without files: an abstract change; with a file: one more line |
| `git stash [push] [-u] [--keep-index] [-m msg]`, `pop`, `apply [--index]`, `drop`, `list`, `branch <b>` | |
| `git worktree add [-b <b>] [--detach] <path> [<ref>]`, `list`, `remove [--force]` | |
| `cd <path>`, `git -C <path> <command>` | `.` is the main worktree |
| `git remote [-v]`, `git remote add <name> <url>`, `rename`, `remove`, `show <name>`, `git ls-remote <name>` | |
| `git fetch [<remote> [[+]<src>[:<dst>]]] [--all] [--prune]`, `git pull [<remote> [<b>]] [--rebase / --ff-only]` | needs a remote |
| `git push [-u] [--force-with-lease / -f] [--tags / --follow-tags] [<remote> [+]<b or tag>[:<dst>]]`, `git push <remote> --delete <b or tag>` | needs a remote |
| `git switch <b>` / `git checkout <b>` when only `<remote>/<b>` exists, `git checkout --track <remote>/<b>` | a local branch that follows it |
| `@<repository> <command>` | runs in another repository of the course |
| `git rebase -i [--autosquash] <base>`, then `pick/reword/edit/squash/fixup/drop <line>`, `move <line> <n>`, `:wq`, `:q!` | interactive rebase without an editor |
| `git commit --fixup <c>` / `--squash <c>`, `git rebase --autosquash <base>`, `git revert -m <n> <merge>` | |
| `git bisect start [<bad> [<good>]]`, `good`, `bad`, `skip`, `log`, `reset` | |
| `git blame [-L a,b] [<rev>] <file>`, `git grep [-n] [-c] <text> [<rev>]`, `git log -L <a>,<b>:<file>` | `grep` searches plain text |
| `git config user.name <n>`, `git commit --author="<n>"` | the author of a commit |
| `git init -b <name>` | only as the first line of a code block |

Revisions like `HEAD^`, `main~2`, `HEAD^2`, `@{u}` and `HEAD@{2}` work
everywhere. Files are small text files without folders. Not included yet:
`rebase -i --root`, `.gitignore`, plumbing commands.


## Implementation

The widget is bundled with [Parcel](https://parceljs.org) from `src/` into
`dist/index.js` (D3 selection and transition from npm, the ExplainGit sources,
the CSS). Rebuild after a change:

``` bash
npm install
npm run build
```

`dist/index.js` is committed, because LiaScript loads it directly from the
repository. The macros:

``` html
script:   dist/index.js

@ExplainGit: @ExplainGit._mount_(@uid, )

@ExplainGit.eval: @ExplainGit._mount_(@uid,```@0```)

@ExplainGit.quiz: @ExplainGit._quiz_(@uid,```@0```)

@ExplainGit._mount_
<div class="explaingit-widget" id="explaingit_@0"></div>
<script>
;(function start () {
  // the course can show a slide before dist/index.js is loaded
  if (window.ExplainGit) ExplainGit.mount("@0", `@'1`, {})
  else setTimeout(start, 50)
})()
"LIA: stop"
</script>
@end

@ExplainGit._quiz_
<div class="explaingit-widget" id="explaingit_@0"></div>
<script>
;(function start () {
  // the course can show a slide before dist/index.js is loaded
  if (window.ExplainGit) ExplainGit.mount("@0", `@'1`, { quiz: true })
  else setTimeout(start, 50)
})()
"LIA: stop"
</script>

[[!]]
<script>
ExplainGit.check("@0", "@input")
</script>
@end
```
