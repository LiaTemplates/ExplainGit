<!--
author:   Yannik Höll

email:    labruzzler@gmail.com

version:  0.0.1

language: en

narrator: US English Female

dark: true

@onload
customElements.define('explain-git', class extends HTMLElement {
  constructor () {
    super()
  }

  connectedCallback () {
    this.code = this.textContent;
    this.textContent = "";

    this.id_ = Math.random().toString(36);

    const iframe = document.createElement('iframe');
    iframe.style = "width: 100%; height: 600px"
    this.appendChild(iframe);

    iframe.id = this.id_;

    this.frame = iframe;
    this.init()
  }

  init() {
    const input = this.code.replace(/;\s?/g, "|");

    const url = 'https://kokokotlin.github.io/#' + input;

    this.frame.contentWindow.location.reload(true);
    this.frame.contentWindow.location.replace(url);
  }

  disconnectedCallback () {
    this.removeChild(this.frame);
  }
});

@end

@ExplainGit: @ExplainGit_(@uid,```@0```)

@ExplainGit_
  <explain-git></explain-git>
@end

@ExplainGit.eval: @ExplainGit._eval_(@uid,```@0```)

@ExplainGit._eval_
  <explain-git>@1</explain-git>
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
git commit;
git commit -m Hello World;
git branch dev;
git checkout dev;
git commit -m dev commit;
git checkout master;
git commit -m master commit;
```
