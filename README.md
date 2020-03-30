<!--
author:   Yannik Höll

email:    labruzzler@gmail.com

version:  0.0.1

language: en

narrator: US English Female

dark: true

@ExplainGit: @ExplainGit_(@uid,```@0```)

@ExplainGit_
<iframe width=100% height=600px id="explain_@0"></iframe>

<script>
  const url = 'https://kokokotlin.github.io/';

  const frame = document.getElementById("explain_@0");
  frame.contentWindow.location.reload(true);
  frame.contentWindow.location.replace(url);

  "LIA: stop"
</script>
@end

@ExplainGit.eval: @ExplainGit._eval_(@uid,```@0```)

@ExplainGit._eval_
<iframe width=100% height=600px id="eval_@0"></iframe>
<script>
  const input = `@1`.replace(/\n/g, "|");

  const url = 'https://kokokotlin.github.io/#' + input;

  const frame = document.getElementById("eval_@0");
  frame.contentWindow.location.reload(true);
  frame.contentWindow.location.replace(url);

  "LIA: stop"
</script>
@end

-->

## ExplainGit for LiaScript

Implementation of __ExplainGit with D3__ for LiaScript

[Original Source Code](https://github.com/onlywei/explain-git-with-d3)

[Original Website](https://onlywei.github.io/explain-git-with-d3/)

## `@ExplainGit`

@ExplainGit

## `@ExplainGit.eval`

``` text @ExplainGit.eval
git commit
git commit -m Hello World
git branch dev
git checkout dev
git commit -m dev commit
git checkout master
git commit -m master commit
```
