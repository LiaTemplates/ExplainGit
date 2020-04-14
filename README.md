<!--
author:   Yannik Höll
email:    labruzzler@gmail.com
version:  0.0.2
language: en
narrator: US English Female

comment:  This template offers two macros for integrating ExplainGit, which uses
  D3 to visualize simple git branching operations. This simple project is
  designed to help people understand some basic git concepts visually.

logo:  https://upload.wikimedia.org/wikipedia/commons/e/e0/Git-logo.svg

attribute: ExplainGit is based on the project of onlywei, see the original
  project at https://github.com/onlywei/explain-git-with-d3

@ExplainGit: @ExplainGit._eval_(@uid, )

@ExplainGit.eval: @ExplainGit._eval_(@uid,```@0```)

@ExplainGit._eval_
<script>
function git(input) {
  if (window.git) {
    let srcdoc = window.git.replace("var cmds = \"\";", "var cmds = \"" + input + "\";")

    let frame = document.getElementById("eval_@0");
    frame.srcdoc = srcdoc
  } else {
    setTimeout(function(){git(input)}, 100)
    }
}

git(`@1`.replace(/\n/g, "|").trim())
</script>


<iframe width=100% height=500px id="eval_@0"></iframe>
@end


@onload

window.git = `<!DOCTYPE html>
  <html>
  <head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8" />
  <title>Implementation of explaingit with d3 for LiaScript</title>
  <script src="https://d3js.org/d3.v5.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/LiaTemplates/ExplainGit/bundle.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/2.1.0/normalize.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/1140/2.0/1140.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/LiaTemplates/ExplainGit/explaingit.min.css">
  </head>
  <body>

  <div id="ExplainGitZen-Container" style="display:none">
      <div class="playground-container"></div>
  </div>

  <svg version="1.1" baseProfile="full"
       xmlns="http://www.w3.org/2000/svg"
       xmlns:xlink="http://www.w3.org/1999/xlink"
       xmlns:ev="http://www.w3.org/2001/xml-events"
       width="0" height="0">

      <marker id="triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#666"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
      <marker id="faded-triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#DDD"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
      <marker id="brown-triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#663300"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
  </svg>

  <script type="text/javascript">
    var cmds = "";

    if(cmds) {
      explainGit.reset();

      const gitHubJson = {
        name: 'Zen',
        height: '100%',
        commitData: [
          {id: 'e137e9b', tags: ['master'], message: 'first commit'}
        ],
        initialMessage: "",
        cmds: cmds.split("|").filter(cmd => cmd !== "" && cmd !== "create origin")
      };

      if(cmds.includes("create origin")) {
        gitHubJson["originData"] = [{id: 'e137e9b', tags: ['master'], message: 'first commit'}]
        gitHubJson.commitData[0].tags = ["origin/master", "master"]
      }

      explainGit.open(gitHubJson);
    } else {
      explainGit.reset();

      explainGit.open({
          name: 'Zen',
          height: '100%',
          commitData: [{id: 'e137e9b', tags: ['master'], message: 'first commit'}],
          initialMessage:
              'Type in your git commands below.'
      });
    }

  </script>
  </body>
  </html>`

@end
-->

## ExplainGit for LiaScript

Implementation of __ExplainGit with D3__ for LiaScript

[Original Source Code](https://github.com/onlywei/explain-git-with-d3)

[Original Website](https://onlywei.github.io/explain-git-with-d3/)

[LiaScript Page](https://liascript.github.io/course/?https://github.com/liaTemplates/ExplainGit)

There are three ways to use this template. The easiest way is to use the
`import` statement and the URL of the raw text-file of the master branch or any
other branch or version. But you can also copy the required functionality
directly into the header of your Markdown document, see therefor the
[Implementation](#Implementation). And of course, you could also clone this
project and change it, as you wish.

1. Load the macros via

   `import: https://github.com/liaTemplates/ExplainGit/master/README.md`

2. Copy the definitions into your Project

3. Clone this repository on GitHub

## `@ExplainGit`

You can use the `@ExplainGit` macro to create a blank repository with only one
initial commit.

@ExplainGit

## `@ExplainGit.eval`

Or you can use the `@ExplainGit.eval` macro for preconfiguring your repository
with git commands.

You can use `create origin` to enable the remote origin. <big style='color:
red'>A big issue is that the used framework doesn't support branches in the
remote origin!</big>

<p style="color:green">__Example:__</p>

```` markdown
``` text  @ExplainGit.eval
git commit
git commit -m Hello World
git branch dev
git checkout dev
git commit -m dev commit
git checkout master
git commit -m master commit
```
````

This code generates the repository below.

``` text  @ExplainGit.eval
git commit
git commit -m Hello World
git branch dev
git checkout dev
git commit -m dev commit
git checkout master
git commit -m master commit
```


## Implementation

````` html
@ExplainGit: @ExplainGit._eval_(@uid, )

@ExplainGit.eval: @ExplainGit._eval_(@uid,```@0```)

@ExplainGit._eval_
<script>
function git(input) {
  if (window.git) {
    let srcdoc = window.git.replace("var cmds = \"\";", "var cmds = \"" + input + "\";")

    let frame = document.getElementById("eval_@0");
    frame.srcdoc = srcdoc
  } else {
    setTimeout(function(){git(input)}, 100)
    }
}

git(`@1`.replace(/\n/g, "|").trim())
</script>


<iframe width=100% height=500px id="eval_@0"></iframe>
@end


@onload

window.git = `<!DOCTYPE html>
  <html>
  <head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8" />
  <title>Implementation of explaingit with d3 for LiaScript</title>
  <script src="https://d3js.org/d3.v5.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/LiaTemplates/ExplainGit/bundle.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/2.1.0/normalize.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/1140/2.0/1140.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/LiaTemplates/ExplainGit/explaingit.min.css">
  </head>
  <body>

  <div id="ExplainGitZen-Container" style="display:none">
      <div class="playground-container"></div>
  </div>

  <svg version="1.1" baseProfile="full"
       xmlns="http://www.w3.org/2000/svg"
       xmlns:xlink="http://www.w3.org/1999/xlink"
       xmlns:ev="http://www.w3.org/2001/xml-events"
       width="0" height="0">

      <marker id="triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#666"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
      <marker id="faded-triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#DDD"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
      <marker id="brown-triangle" refX="5" refY="5" markerUnits="strokeWidth" fill="#663300"
              markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
          <path d="M 0 0 L 10 5 L 0 10 z"/>
      </marker>
  </svg>

  <script type="text/javascript">
    var cmds = "";

    if(cmds) {
      explainGit.reset();

      const gitHubJson = {
        name: 'Zen',
        height: '100%',
        commitData: [
          {id: 'e137e9b', tags: ['master'], message: 'first commit'}
        ],
        initialMessage: "",
        cmds: cmds.split("|").filter(cmd => cmd !== "" && cmd !== "create origin")
      };

      if(cmds.includes("create origin")) {
        gitHubJson["originData"] = [{id: 'e137e9b', tags: ['master'], message: 'first commit'}]
      }

      explainGit.open(gitHubJson);
    } else {
      explainGit.reset();

      explainGit.open({
          name: 'Zen',
          height: '100%',
          commitData: [{id: 'e137e9b', tags: ['master'], message: 'first commit'}],
          initialMessage:
              'Type in your git commands below.'
      });
    }

  </script>
  </body>
  </html>`

@end
`````
