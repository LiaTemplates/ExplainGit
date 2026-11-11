<!--
author:   Yannik Höll
email:    labruzzler@gmail.com
version:  0.1.0
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

`import: https://raw.githubusercontent.com/LiaTemplates/ExplainGit/0.1.0/README.md`

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
a remote repository named `origin`. The remote supports only one branch.

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
connected, every branch and tag, and where `HEAD` is. Commit messages and the
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
A group can solve a quiz together, and everyone checks the shared result.

@ExplainGit


## Languages

Buttons, console messages and quiz feedback follow the course language
(`language:` in the header): English by default, German (`de`) and Ukrainian
(`uk`) have their own texts. When a reader switches Google Translate on, the
widget follows that language: `de` and `uk` use their own texts, every other
language is translated by Google. Git commands, branch names and commit ids are
never translated.


## Commands

| Command                              | Notes                                         |
| ------------------------------------ | --------------------------------------------- |
| `git commit`, `git commit -m "msg"`  |                                               |
| `git branch name`, `git branch -d name` |                                            |
| `git checkout name`, `git checkout -b name` | also a commit id, e.g. `git checkout HEAD^` |
| `git tag name`                       |                                               |
| `git merge name`, `git merge --no-ff name` | fast-forward when possible              |
| `git rebase name`                    |                                               |
| `git reset name`, `git revert id`    | `reset` always works like `--hard`            |
| `git fetch`, `git pull`, `git push`  | needs `create origin`                         |


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
