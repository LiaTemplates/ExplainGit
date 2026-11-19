# Moderne Git-Befehle für ExplainGit – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ExplainGit unterstützt die Befehle, die man mit Git 2.56 heute lernt (`switch`, `restore`, `stash`, `worktree`, `cherry-pick`, …), und zeichnet ihre Wirkung im Commit-Graphen richtig.

**Architecture:** Befehle werden in `ControlBox` (`src/explaingit.js`) geparst und rufen Modell-Methoden von `HistoryView` auf. Der Zustand (Commits, Refs, HEADs der Worktrees, Status des Arbeitsverzeichnisses) wird über `snapshot()`/`compare()` in `src/repo.js` für Quiz und Tests vergleichbar gemacht. Jede Aufgabe hält drei Eigenschaften: deterministisch abspielbar (Gemeinschaftsmodus), übersetzt (en/de/uk), im Quiz vergleichbar.

**Tech Stack:** JavaScript (ES-Module), d3-selection@1 / d3-transition@1 (D3-v5-API, `d3.event`), Parcel 2, Tests mit `node --test` + jsdom.

**Spec:** Abschnitt „Befehlsumfang“ unten (abgeleitet aus `git <cmd> -h` von Git 2.56 und den Anforderungen im Gespräch vom 2026-11-19).

## Global Constraints

- Template-Version bleibt unter 1.0.0; dieser Plan endet mit `version: 0.2.0` und Tag `0.2.0`.
- Jeder sichtbare Text läuft über `tr(key, ...args)` aus `src/i18n.js`, mit Einträgen in `en`, `de` und `uk`; eingesetzte Namen (Branches, Pfade, IDs) immer als Argument von `tr`, nie per String-Verkettung, damit `fill()` sie vor Google Translate schützt.
- Kein `Math.random`, `Date` oder Timer in Modell-Logik; neue Commit-IDs nur über `historyView.nextId()`. Gleiche Befehlsliste ⇒ gleicher Zustand, in jedem Browser.
- Fehler bei Befehlen: `throw new Error(tr(...))` in `HistoryView`/`ControlBox` – `ControlBox.command` zeigt sie als `.error`. Ein abgelehnter Befehl ändert den Zustand nicht.
- Nur D3-v5-API (`d3.select`, `selection.transition()`, `d3.event`); keine neuen Laufzeit-Abhängigkeiten.
- Bestehende Kurse bleiben gültig: Startbranch `master`, Zeile `create origin`, alle bisherigen Befehle und Quiz-Lösungen verhalten sich wie in 0.1.0.
- Nach jeder Aufgabe: `npm test` grün, `npm run build`, `dist/index.js` mit committen.

## Befehlsumfang (Spec)

| Befehl | Wirkung im Modell | Darstellung |
|---|---|---|
| `git switch <b>`, `-c/-C <b> [<start>]`, `--detach <ref>`, `switch -` | wie `checkout`; `switch <commit>` ohne `--detach` ist ein Fehler (`fatal: a branch is expected`) | wie checkout |
| `git checkout -b <b> <start>`, `git checkout -` | Startpunkt wird beachtet; `-` = vorheriger Branch | – |
| `git branch <b> <start>`, `-m/-M [<alt>] <neu>`, `-c <alt> <neu>`, `-D <b>`, `-f <b> <ref>` | anlegen mit Startpunkt, umbenennen, kopieren, löschen, versetzen | Branch-Marke |
| Branch-Namen mit `/` (`feature/login`) | normale lokale Branches; Remote-Branch nur bei Präfix `<remote>/` | normale Marke |
| Codeblock-Zeile `git init -b <name>` (erste Zeile) | Startbranch heißt `<name>` (auch auf `origin`) | – |
| `git commit --amend [-m msg]`, `--allow-empty`, `-a`, `-am msg` | `--amend`: neuer Commit mit Parent des alten HEAD, alter wird unerreichbar | alter Commit verblasst |
| `git cherry-pick <ref>...` | Kopie je Ref als neuer Commit auf HEAD, Nachricht übernommen | Klasse `cherry-picked` (gestrichelter Rand) |
| `git merge --squash <b>` + `git commit` | kein Commit; Status `staged`; nächster Commit hat einen Parent | Klasse `squashed` |
| `git merge --ff-only <b>` | Fehler, wenn kein Fast-Forward möglich | – |
| `git rebase --onto <neu> <upstream> [<b>]`, `rebase <upstream> <b>`, `--update-refs` | wie rebase; `--update-refs` versetzt Branches auf umgeschriebenen Commits | wie rebase |
| `git add .`/`-A`/`<pfad>`, `git restore [--staged] <pfad>`, `git reset --soft/--mixed`, `git status` | Status je Worktree: `clean`, `staged`, `unstaged` | Statuszeile unter „Aktueller Branch“ |
| `git stash [push]`, `pop`, `apply`, `drop`, `list` | Stash-Commit (Parent = HEAD), Refs `stash@{n}` | Klasse `stash`, Marken `stash@{n}` |
| `git push -u origin <b>`, `push --force-with-lease`/`-f`, `push origin --delete <b>`, `git fetch --prune`, `git branch -u origin/<b>`, `git pull --ff-only` | neue Remote-Branches, erzwungenes Überschreiben, Löschen, Tracking | Marken in origin und `origin/<b>` lokal |
| `git worktree add <pfad> [<ref>]`, `-b <neu>`, `--detach`, `list`, `remove`, `cd <pfad>`, `git -C <pfad> <befehl>` | mehrere HEADs; ein Branch höchstens in einem Worktree | zusätzliche Marken `HEAD <pfad>`, Klasse `worktree-head` |

**Nicht im Plan** (bewusst): `rebase -i` (interaktiv), `switch --orphan`, `bisect`, `replay` (experimentell), `log`/`reflog`-Ausgabe, Dateiinhalte.

## Review Focus

1. Branch-Namen mit `/` (`feature/login`): werden heute als Remote-Branch gezeichnet, `checkout` darauf landet in „detached HEAD“ – Test in Task 3.
2. Abspielen derselben Befehlsliste in zwei Sandboxes ergibt identische Commits und Refs, auch mit jedem neuen Befehl – jeder Task erweitert `SCRIPTS` in `test/determinism.test.mjs`.
3. Fehlende oder falsche Argumente (`git switch`, `git worktree add`, `git cherry-pick nope`) zeigen eine Fehlermeldung und lassen den Zustand unverändert – je Task ein `rejects …`-Test.
4. Viele Marken auf einem Commit (Branches, `HEAD`, `HEAD <pfad>`, `stash@{0}`) überlappen nicht – Test in Task 12.
5. Quiz-Lösungen aus 0.1.0 werden weiter akzeptiert, neue Zustandsteile (Status, Worktrees) sind bei alten Aufgaben gleich – Test in Task 1 und 9.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/repo.js` (neu) | `Sandbox`, `initialCommits(branch)`, `parseCommands`, `parseQuiz`, `viewInfo`, `encode`, `snapshot`, `compare` – aus `src/index.js` herausgelöst, ohne CSS-Import, damit Node es laden kann |
| `src/index.js` | Widget, Gemeinschaftsmodus, `mount`/`check`, CSS-Injektion; importiert aus `repo.js` |
| `src/explaingit.js` | Befehls-Parser (`ControlBox`) und Repository-Modell/Zeichnung (`HistoryView`) |
| `src/i18n.js` | neue Schlüssel je Task |
| `src/explaingit.css` | neue Klassen je Task |
| `test/harness.mjs` (neu) | jsdom-Umgebung und `run()` |
| `test/*.test.mjs` (neu) | ein Testfile je Task |

---

### Task 1: Testumgebung, `repo.js` und drei Altfehler

**Files:**
- Create: `src/repo.js`, `test/harness.mjs`, `test/core.test.mjs`, `test/determinism.test.mjs`
- Modify: `src/index.js` (Sandbox/Vergleich entfernen, aus `repo.js` importieren), `src/explaingit.js` (`merge`, `pull`, `push`), `package.json`

**Interfaces:**
- Produces:
  - `src/repo.js`: `export class Sandbox(area: Element, name: string, opts: {origin: boolean, init: string, intro: string})` mit `.hv`, `.ov`, `.cb`, `.run(cmd: string, who?)`, `.destroy()`; `export function parseCommands(text) -> {cmds: string[], origin: boolean, init: string}` (`init` default `'master'`); `parseQuiz(text) -> {setup, solution, origin, init}`; `snapshot(box) -> Array<[scope, info]>`; `compare(actual, expected) -> string[]`; `initialCommits(branch: string)`.
  - `test/harness.mjs`: `export function run(cmds: string[], opts?: {origin?: boolean, init?: string}) -> {box: Sandbox, log: Array<{kind: 'cmd'|'info'|'error', text: string}>, state: ReturnType<snapshot>}`; `export function same(a: string[], b: string[], opts?) -> boolean` (via `compare`); `export function graph(box) -> Array<[id, parent, parent2|null, tags]>`; re-exportiert `viewInfo` und `parseCommands` aus `repo.js`.
  - `test/determinism.test.mjs`: `export const SCRIPTS = [ {name, cmds, opts} ]` – spätere Tasks hängen Einträge an.

- [ ] **Step 1: Harness schreiben.** jsdom ^26 als devDependency; `globalThis.window/document/Node/Element/SVGElement/requestAnimationFrame/getComputedStyle` aus `new JSDOM('<!doctype html><html lang="en"><body>', {pretendToBeVisual: true})` setzen (nicht `navigator`, das ist in Node nur lesbar), `SVGElement.prototype.getBBox = () => ({x:0,y:0,width:0,height:0})`, dann `repo.js` dynamisch importieren. Log aus `.log > div` lesen (`command-entry` → `cmd`).
- [ ] **Step 2: Tests, die das heutige Verhalten festhalten** (`test/core.test.mjs`):

```js
test('quiz from 0.1.0 still accepted', () => {
  assert.ok(same(['git commit','git checkout -b feature','git commit','git commit','git checkout master','git merge --no-ff feature'],
                 ['git commit','git branch feature','git checkout feature','git commit','git commit','git checkout master','git merge --no-ff feature']))
})
test('rebase is not a merge', () => assert.ok(!same(SETUP.concat('git rebase master'), SETUP.concat('git merge master'))))
test('merge --no-ff with one commit on the branch', () => {
  const { log, box } = run(['git checkout -b dev','git commit','git checkout master','git merge --no-ff dev'])
  assert.deepEqual(log.filter(l => l.kind === 'error'), [])
  assert.equal(graph(box).at(-1)[2] !== null, true)   // merge commit has parent2
})
test('pull applies at once', () => {
  const { box } = run(['git commit','git push','git reset HEAD^','git pull'], { origin: true })
  assert.equal(viewInfo(box.hv).refs.master, viewInfo(box.ov).refs.master)
})
test('pushed commits keep their message', () => {
  const { box } = run(['git commit -m hello','git push'], { origin: true })
  assert.ok(box.ov.commitData.some(c => c.message === 'hello'))
})
```
  `SETUP = ['git checkout -b dev','git commit','git checkout master','git commit','git checkout dev']`. In `determinism.test.mjs`: für jedes `SCRIPTS`-Element `graph(run(cmds).box)` zweimal gleich; erster Eintrag: das obige Merge-Beispiel.
- [ ] **Step 3:** `npm test` (`"test": "node --test test/"`) – erwartet: FAIL bei `merge --no-ff …` (TypeError `reading 'parent'`), `pull applies at once`, `pushed commits keep their message`; Import-Fehler bis `repo.js` existiert.
- [ ] **Step 4: Umsetzen.** `repo.js` aus `index.js` herauslösen (Verhalten unverändert, `init` ergänzt: `initialCommits(init)`, Tracking-Marke `'origin/' + init`, `HistoryView({currentBranch: init})`). `HistoryView.merge` mit `noFF`: Suche nach dem Branch-Start beginnt bei `mergeTarget` selbst und hört beim ersten Commit auf, dessen Parent ein Vorfahre von HEAD ist. `ControlBox.pull`: `setTimeout` entfernen, synchron mergen/rebasen. `push`: `message` beim Kopieren übernehmen.
- [ ] **Step 5:** `npm test` – PASS. Im Browser (DevServer) die Quiz-Folie einmal prüfen.
- [ ] **Step 6: Commit** `test: add jsdom harness; fix merge --no-ff, synchronous pull, push keeps messages`

### Task 2: `git switch` und `checkout` mit Startpunkt

**Files:** Modify `src/explaingit.js` (`ControlBox.switch`, `ControlBox.checkout`), `src/i18n.js`; Test `test/switch.test.mjs`

**Interfaces:**
- Consumes: `run`, `same`, `SCRIPTS` (Task 1)
- Produces: `ControlBox.switch(args)`; `HistoryView.previousBranch: string|null` (gesetzt bei jedem Branch-Wechsel, genutzt von `switch -` und `checkout -`).

- [ ] **Step 1: Tests**

```js
test('switch -c equals checkout -b', () => assert.ok(same(['git switch -c dev','git commit'], ['git checkout -b dev','git commit'])))
test('switch -c with start point', () => { const {box}=run(['git commit','git switch -c old HEAD^']); assert.equal(viewInfo(box.hv).refs.old, 'e137e9b') })
test('checkout -b with start point uses the name', () => { const {box}=run(['git commit','git checkout -b old HEAD^']); assert.ok('old' in viewInfo(box.hv).refs) })
test('switch to a commit needs --detach', () => { const {log,box}=run(['git commit','git switch HEAD^']); assert.equal(log.at(-1).kind,'error'); assert.equal(box.hv.currentBranch,'master') })
test('switch --detach', () => assert.equal(run(['git commit','git switch --detach HEAD^']).box.hv.currentBranch, null))
test('switch - goes back', () => assert.equal(run(['git switch -c dev','git switch master','git switch -']).box.hv.currentBranch, 'dev'))
test('rejects switch without argument', () => assert.equal(run(['git switch']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** `npm test` – FAIL („I don't understand that.“ für `switch`).
- [ ] **Step 3: Umsetzen.** `switch` und `checkout` teilen sich einen Helfer `_changeBranch(name, {create, force, start, detach})`. Neue Schlüssel: `branchExpected: r => \`a branch is expected, got commit '${r}'\``, `noPrevious: 'There is no previous branch.'`, `switchUsage: 'Usage: git switch [-c <new-branch>] [--detach] <branch>'`. `SCRIPTS` += `{name:'switch', cmds:['git switch -c dev','git commit','git switch -','git switch --detach HEAD']}`.
- [ ] **Step 4:** `npm test` – PASS. **Step 5: Commit** `feat: git switch, checkout start point and checkout -`

### Task 3: Branches verwalten, Namen mit `/`

**Files:** Modify `src/explaingit.js` (`ControlBox.branch`, `HistoryView.branch/deleteBranch`, `renderTags`, `_setCurrentBranch`, `_markBranchlessCommits`), `src/i18n.js`; Test `test/branch.test.mjs`

**Interfaces:**
- Produces: `HistoryView.branch(name, start?: string)`, `HistoryView.renameBranch(old, neu, force: boolean)`, `HistoryView.copyBranch(old, neu)`, `HistoryView.forceBranch(name, ref)`; `HistoryView.isRemoteRef(name) -> boolean` (true nur für `<remoteName>/…`, `remoteName` aus `this.remotes`, Default `['origin']`).

- [ ] **Step 1: Tests**

```js
test('slash names are local branches', () => {
  const {box} = run(['git switch -c feature/login','git commit'])
  assert.equal(box.hv.currentBranch, 'feature/login')
  assert.ok(!box.hv.svg.select('g.branch-tag.remote-branch').size())
})
test('branch with start point', () => assert.equal(viewInfo(run(['git commit','git branch old HEAD^']).box.hv).refs.old, 'e137e9b'))
test('branch -m renames the current branch', () => { const {box}=run(['git branch -m main']); assert.equal(box.hv.currentBranch,'main'); assert.ok(!('master' in viewInfo(box.hv).refs)) })
test('branch -c copies', () => { const r=viewInfo(run(['git branch -c master copy']).box.hv).refs; assert.equal(r.copy, r.master) })
test('branch -f moves another branch', () => { const r=viewInfo(run(['git branch dev','git commit','git branch -f dev HEAD']).box.hv).refs; assert.equal(r.dev, r.master) })
test('branch -D deletes', () => assert.ok(!('dev' in viewInfo(run(['git branch dev','git branch -D dev']).box.hv).refs)))
test('rejects -m onto existing name without -M', () => assert.equal(run(['git branch dev','git branch -m dev']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3: Umsetzen.** Überall, wo heute `indexOf('/')` Remote bedeutet, `isRemoteRef` verwenden. Neue Schlüssel: `branchRenamed: (a,b) => \`Renamed ${a} to ${b}.\``, `cannotForceCurrent: n => \`Cannot force update the current branch ${n}.\``. `SCRIPTS` += Umbenennen + Slash-Branch.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: branch -m/-c/-f/-D, start points, slash branch names`

### Task 4: Startbranch per `git init -b`

**Files:** Modify `src/repo.js` (`parseCommands`, `parseQuiz`), `src/index.js` (an `Sandbox` weiterreichen); Test `test/init.test.mjs`

**Interfaces:** Consumes `parseCommands(text).init`, `Sandbox(opts.init)` aus Task 1.

- [ ] **Step 1: Tests**

```js
test('init -b main', () => { const p=parseCommands('git init -b main\ngit commit'); assert.equal(p.init,'main'); assert.deepEqual(p.cmds,['git commit']) })
test('main with origin', () => { const {box}=run(['git push'],{origin:true,init:'main'}); assert.ok('origin/main' in viewInfo(box.hv).refs) })
test('default stays master', () => assert.equal(parseCommands('git commit').init, 'master'))
```
- [ ] **Step 2:** FAIL. **Step 3:** `git init -b <n>` / `--initial-branch=<n>` nur als erste Befehlszeile auswerten und entfernen. **Step 4:** PASS. **Step 5: Commit** `feat: initial branch via git init -b`

### Task 5: `commit --amend`, `--allow-empty`, `-a`, `-am`

**Files:** Modify `src/explaingit.js` (`ControlBox.commit`, `HistoryView.commit`), `src/i18n.js`; Test `test/commit.test.mjs`

**Interfaces:** Produces `HistoryView.amend(message?: string)`.

- [ ] **Step 1: Tests**

```js
test('amend replaces HEAD', () => {
  const {box} = run(['git commit -m one','git commit --amend -m two'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'two'); assert.equal(head.parent, 'e137e9b')
  assert.ok(box.hv.commitData.find(c => c.message === 'one').branchless)
})
test('amend without -m keeps the message', () => assert.equal(run(['git commit -m one','git commit --amend']).box.hv.getCommit('HEAD').message, 'one'))
test('-am and --allow-empty are commits', () => assert.ok(same(['git commit -am x','git commit --allow-empty'], ['git commit','git commit'])))
test('rejects amend on the first commit', () => assert.equal(run(['git commit --amend']).log.at(-1).kind, 'error'))
```
  (Erster Commit `e137e9b` ist der feste Startcommit; `--amend` darauf ist abgelehnt, weil `initial` kein echter Parent ist.)
- [ ] **Step 2:** FAIL. **Step 3:** Flags vor `-m` einsammeln (`-a`, `--all`, `--allow-empty`, `--amend`, `-am <msg>`). Schlüssel: `amendRoot: 'Cannot amend the initial commit in this demo.'`. `SCRIPTS` += amend.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: commit --amend and common commit flags`

### Task 6: `cherry-pick`

**Files:** Modify `src/explaingit.js`, `src/i18n.js`, `src/explaingit.css`; Test `test/cherry-pick.test.mjs`

**Interfaces:** Produces `HistoryView.cherryPick(ref) -> commit`; Commit-Feld `cherryPickedFrom: string`; CSS `circle.commit.cherry-picked { stroke-dasharray: 4 3; stroke: #7A3EB1 }`.

- [ ] **Step 1: Tests**

```js
test('cherry-pick copies onto HEAD', () => {
  const {box} = run(['git switch -c dev','git commit -m fix','git switch master','git cherry-pick dev'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'fix'); assert.equal(head.parent, 'e137e9b'); assert.equal(head.cherryPickedFrom, viewInfo(box.hv).refs.dev)
  assert.equal(box.hv.svg.selectAll('circle.cherry-picked').size(), 1)
})
test('several refs in order', () => {
  const {box} = run(['git switch -c dev','git commit -m a','git commit -m b','git switch master','git cherry-pick dev^ dev'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'b'); assert.equal(box.hv.getCommit(head.parent).message, 'a')
})
test('rejects unknown ref', () => assert.equal(run(['git cherry-pick nope']).log.at(-1).kind, 'error'))
test('rejects a commit already in HEAD', () => assert.equal(run(['git commit','git cherry-pick HEAD']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3:** Neuer Commit via `this.commit({cherryPickedFrom: src.id}, src.message)`; Klasse in `_renderCircles` wie `rebased`. Schlüssel: `cherryPicked: (a,b) => \`Copied ${a} as ${b}.\``, `alreadyInHead: r => \`${r} is already part of HEAD.\``. `SCRIPTS` += cherry-pick.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: git cherry-pick`

### Task 7: `merge --squash`, `merge --ff-only`

**Files:** Modify `src/explaingit.js` (`ControlBox.merge`, `HistoryView.merge`, `HistoryView.commit`), `src/i18n.js`, `src/explaingit.css`; Test `test/merge.test.mjs`

**Interfaces:** Consumes Statusfeld aus Task 9 noch nicht – setzt `hv.squashPending = <ref id>`; Task 9 verbindet es mit `status`. Produces Commit-Feld `squashOf: string`, CSS `circle.commit.squashed { stroke: #B15A00 }`.

- [ ] **Step 1: Tests**

```js
test('squash makes one commit with one parent', () => {
  const {box} = run(['git switch -c dev','git commit','git commit','git switch master','git merge --squash dev','git commit -m all'])
  const head = box.hv.getCommit('HEAD'); assert.equal(head.parent2, undefined); assert.ok(head.squashOf)
})
test('squash alone makes no commit', () => assert.equal(run(['git switch -c dev','git commit','git switch master','git merge --squash dev']).box.hv.getCommit('HEAD').id, 'e137e9b'))
test('ff-only refuses a real merge', () => assert.equal(run(['git switch -c dev','git commit','git switch master','git commit','git merge --ff-only dev']).log.at(-1).kind, 'error'))
test('ff-only fast-forwards', () => assert.ok(same(
  ['git switch -c dev','git commit','git switch master','git merge --ff-only dev'],
  ['git switch -c dev','git commit','git switch master','git merge dev'])))
```
- [ ] **Step 2:** FAIL. **Step 3:** Schlüssel: `squashed: r => \`Squashed ${r} – commit to finish.\``, `notFastForward: 'Not possible to fast-forward, aborting.'`. **Step 4:** PASS. **Step 5: Commit** `feat: merge --squash and --ff-only`

### Task 8: `rebase --onto`, `rebase <upstream> <branch>`, `--update-refs`

**Files:** Modify `src/explaingit.js` (`ControlBox.rebase`, `HistoryView.rebase`); Test `test/rebase.test.mjs`

**Interfaces:** Produces `HistoryView.rebase(upstream, {onto?: string, updateRefs?: boolean})` (alte Signatur `rebase(ref)` bleibt gültig).

- [ ] **Step 1: Tests**

```js
// master: A; topic1 from A: B; topic2 from B: C
const STACK = ['git switch -c topic1','git commit -m B','git switch -c topic2','git commit -m C','git switch master','git commit -m M']
test('onto moves only commits after upstream', () => {
  const {box} = run(STACK.concat('git rebase --onto master topic1 topic2'))
  assert.equal(box.hv.currentBranch, 'topic2')
  assert.equal(box.hv.getCommit(box.hv.getCommit('topic2').parent).message, 'M')
})
test('rebase <upstream> <branch> switches first', () => assert.equal(run(STACK.concat('git rebase master topic1')).box.hv.currentBranch, 'topic1'))
test('update-refs moves the stacked branch', () => {
  const {box} = run(STACK.concat('git switch topic2','git rebase --update-refs master'))
  const t1 = box.hv.getCommit('topic1'); assert.equal(box.hv.getCommit(t1.parent).message, 'M')
})
test('rejects onto without argument', () => assert.equal(run(['git rebase --onto']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3:** Liste `toRebase` = Commits von HEAD bis ausschließlich `upstream`-Vorfahren; neue Basis `onto ?? upstream`; `updateRefs`: lokale Branches (nicht HEAD-Branch, nicht Remote) auf einem umgeschriebenen Commit auf dessen Kopie versetzen. **Step 4:** PASS. **Step 5: Commit** `feat: rebase --onto, rebase upstream branch, --update-refs`

### Task 9: Arbeitsverzeichnis-Status (`add`, `restore`, `reset --soft/--mixed`, `status`)

**Files:** Modify `src/explaingit.js`, `src/repo.js` (`viewInfo`, `encode` via `compare`), `src/i18n.js`, `src/explaingit.css`; Test `test/status.test.mjs`

**Interfaces:**
- Produces: `HistoryView.status: 'clean'|'staged'|'unstaged'` (Task 12 verschiebt es in den Worktree); `viewInfo(hv).status`; `compare` vergleicht `status` des lokalen Repos; SVG-Text `text.status-display` unter `current-branch-display`.
- Regeln: `reset --soft <ref>` → `staged`; `reset --mixed`/`reset <ref>` ohne Flag → `unstaged` (git-Default ist `--mixed`; das alte „Assuming --hard“ entfällt); `reset --hard` → `clean`; `add .|-A|<pfad>` → `staged` (aus `unstaged`); `restore --staged …` → `unstaged`; `restore <pfad>` → `clean` (nur aus `unstaged`); `commit` → `clean`, bei `clean` ohne `--allow-empty` weiterhin erlaubt (Demo hat keine Dateien); `merge --squash` → `staged`; `status` gibt den Status als `info` aus. Neuer Codeblock-Befehl `edit` setzt `unstaged` (Datei ändern).

- [ ] **Step 1: Tests**

```js
test('soft reset keeps changes staged', () => assert.equal(viewInfo(run(['git commit','git reset --soft HEAD^']).box.hv).status, 'staged'))
test('plain reset is mixed', () => assert.equal(viewInfo(run(['git commit','git reset HEAD^']).box.hv).status, 'unstaged'))
test('add then restore --staged', () => assert.equal(viewInfo(run(['edit','git add .','git restore --staged .']).box.hv).status, 'unstaged'))
test('quiz: soft and hard reset differ', () => assert.ok(!same(['git commit','git reset --soft HEAD^'], ['git commit','git reset --hard HEAD^'])))
test('old quizzes unaffected', () => assert.ok(same(['git commit'], ['git commit'])))
test('status line shows the state', () => assert.match(run(['edit']).box.hv.svg.select('text.status-display').text(), /not staged/))
```
- [ ] **Step 2:** FAIL. **Step 3:** `edit` wird in `ControlBox.command` vor der `git`-Prüfung behandelt. Schlüssel: `statusClean: 'Working tree: clean'`, `statusStaged: 'Working tree: changes staged'`, `statusUnstaged: 'Working tree: changes not staged'`, `edited: 'You changed a file.'`. `resetSoft`/`resetMixed`/`resetHard` (alt) entfernen. `SCRIPTS` += Status-Skript.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: working tree status with add, restore and reset modes`

### Task 10: `stash`

**Files:** Modify `src/explaingit.js`, `src/i18n.js`, `src/explaingit.css`; Test `test/stash.test.mjs`

**Interfaces:**
- Consumes: `status` (Task 9).
- Produces: `HistoryView.stashes: string[]` (Commit-IDs, `[0]` = neuester); Marken `stash@{n}` (Klasse `stash-tag`), Commit-Klasse `stash`. `viewInfo.refs` enthält `stash@{n}`, damit der Quiz-Vergleich Stashes sieht.

- [ ] **Step 1: Tests**

```js
test('stash saves changes and cleans', () => {
  const {box} = run(['edit','git stash'])
  assert.equal(viewInfo(box.hv).status, 'clean'); assert.ok('stash@{0}' in viewInfo(box.hv).refs)
  assert.equal(box.hv.getCommit('stash@{0}').parent, 'e137e9b')
})
test('pop restores and removes', () => { const v=viewInfo(run(['edit','git stash','git stash pop']).box.hv); assert.equal(v.status,'unstaged'); assert.ok(!('stash@{0}' in v.refs)) })
test('stack renumbers', () => assert.ok('stash@{1}' in viewInfo(run(['edit','git stash','edit','git stash']).box.hv).refs))
test('stash on a clean tree only informs', () => {   // git: "No local changes to save"
  const {log, box} = run(['git stash'])
  assert.equal(log.at(-1).kind, 'info'); assert.ok(!('stash@{0}' in viewInfo(box.hv).refs))
})
test('rejects pop without stash', () => assert.equal(run(['git stash pop']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3:** Stash-Commit über `nextId()`, nicht auf einem Branch; `_markBranchlessCommits` zählt `stash@{n}` als erreichbar. Schlüssel: `stashSaved: n => \`Saved working directory as stash@{${n}}.\``, `noLocalChanges: 'No local changes to save.'`, `noStash: 'No stash entries found.'`, `stashList: s => s`. `SCRIPTS` += stash.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: git stash push/pop/apply/drop/list`

### Task 11: Remote-Befehle

**Files:** Modify `src/explaingit.js` (`push`, `fetch`, `pull`, `branch`), `src/i18n.js`; Test `test/remote.test.mjs`

**Interfaces:** Produces `HistoryView.upstream: {[branch]: string}` (`'origin/<b>'`), gesetzt durch `push -u` und `branch -u`; `pull` nutzt es statt `'origin/' + currentBranch`.

- [ ] **Step 1: Tests**

```js
const O = { origin: true }
test('push -u creates a remote branch', () => {
  const {box} = run(['git switch -c dev','git commit','git push -u origin dev'], O)
  assert.ok('dev' in viewInfo(box.ov).refs); assert.ok('origin/dev' in viewInfo(box.hv).refs)
})
test('force-with-lease overwrites after amend', () => {
  const {box,log} = run(['git commit -m a','git push','git commit --amend -m b','git push --force-with-lease'], O)
  assert.equal(log.at(-1).kind !== 'error', true); assert.equal(viewInfo(box.ov).refs.master, viewInfo(box.hv).refs.master)
})
test('plain push after amend is rejected', () => assert.equal(run(['git commit -m a','git push','git commit --amend -m b','git push'], O).log.at(-1).kind, 'error'))
test('push --delete and fetch --prune', () => { const {box}=run(['git switch -c dev','git push -u origin dev','git push origin --delete dev','git fetch --prune'], O); assert.ok(!('origin/dev' in viewInfo(box.hv).refs)) })
test('pull --ff-only refuses divergence', () => assert.equal(
  run(['git commit -m a','git push','git reset --hard HEAD^','git commit -m b','git pull --ff-only'], O).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3:** „noNewRemoteBranch“-Pfad durch Anlegen ersetzen; `--force`/`-f`/`--force-with-lease` setzen den Remote-Branch auf den lokalen Commit (Lease: nur wenn Remote-Stand == lokales `origin/<b>`); lokales `origin/<b>` nach jedem Push nachziehen. Schlüssel: `staleLease: 'Rejected: the remote changed since your last fetch.'`, `remoteDeleted: b => \`Deleted remote branch ${b}.\``, `upstreamSet: (b,u) => \`Branch ${b} tracks ${u}.\``. `SCRIPTS` += Remote-Skript (mit `origin`).
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: push -u/--force-with-lease/--delete, fetch --prune, branch -u, pull --ff-only`

### Task 12: Worktrees

**Files:** Modify `src/explaingit.js` (`HistoryView`: Worktree-Modell, `_parseTagData`, `tagY`, `_setCurrentBranch`, `checkout`; `ControlBox`: `worktree`, `cd`, `-C`), `src/repo.js` (`viewInfo.worktrees`, `compare`), `src/i18n.js`, `src/explaingit.css`; Test `test/worktree.test.mjs`

**Interfaces:**
- Consumes: `status` (Task 9), `_changeBranch` (Task 2).
- Produces:
  - `HistoryView.worktrees: Array<{path: string, branch: string|null, head: string, status: string}>`, Index 0 ist das Haupt-Arbeitsverzeichnis `'.'`; `HistoryView.active: number`. Der aktive Worktree bleibt über `currentBranch`/Marke `HEAD` abgebildet; `activate(path)` speichert den aktiven (`branch`, `head`, `status`) und lädt den neuen.
  - Inaktive Worktrees erzeugen in `_parseTagData` Marken `{name: 'HEAD ' + path, commit: branch ? getCommit(branch).id : head}` mit Klasse `head-tag worktree-head`.
  - `viewInfo(hv).worktrees: Array<[path, branch|null, headId]>` sortiert nach Pfad; `compare` meldet `worktreeMissing`, `worktreeWrong`.
  - `ControlBox.command('cd <path>')` aktiviert den Worktree; `git -C <path> <rest>` führt `<rest>` im Worktree aus und kehrt zurück.
  - Im Gemeinschaftsmodus wirkt `cd` für alle (gemeinsame Konsole) – im README-Abschnitt „Working together“ nennen.

- [ ] **Step 1: Tests**

```js
test('worktree add with -b', () => {
  const {box} = run(['git worktree add -b dev ../wt'])
  assert.deepEqual(viewInfo(box.hv).worktrees, [['.', 'master', 'e137e9b'], ['../wt', 'dev', 'e137e9b']])
})
test('commit in the other worktree moves only its branch', () => {
  const v = viewInfo(run(['git worktree add -b dev ../wt','git -C ../wt commit']).box.hv)
  assert.notEqual(v.refs.dev, v.refs.master); assert.equal(v.branch, 'master')
})
test('a branch can be checked out in one worktree only', () => assert.equal(run(['git worktree add -b dev ../wt','git switch dev']).log.at(-1).kind, 'error'))
test('cd switches HEAD', () => assert.equal(run(['git worktree add -b dev ../wt','cd ../wt']).box.hv.currentBranch, 'dev'))
test('remove frees the branch', () => assert.equal(run(['git worktree add -b dev ../wt','git worktree remove ../wt','git switch dev']).box.hv.currentBranch, 'dev'))
test('two HEAD tags do not overlap', () => {
  const ys = run(['git worktree add --detach ../wt']).box.hv.svg.selectAll('g.head-tag rect').nodes().map(n => n.getAttribute('y'))
  assert.equal(new Set(ys).size, ys.length)
})
test('quiz sees worktrees', () => assert.ok(!same(['git worktree add -b dev ../wt'], ['git branch dev'])))
test('rejects worktree add without path', () => assert.equal(run(['git worktree add']).log.at(-1).kind, 'error'))
```
- [ ] **Step 2:** FAIL. **Step 3:** Fehlermeldungen wie Git: Schlüssel `branchInWorktree: (b,p) => \`'${b}' is already used by worktree at '${p}'.\``, `noWorktree: p => \`'${p}' is not a working tree.\``, `worktreeAdded: (p,b) => \`Preparing worktree ${p} (${b}).\``, `currentBranchIn: (b,p) => \`Current Branch: ${b} · ${p}\``, `worktreeMissing`, `worktreeWrong` (Quiz). `tagY` zählt alle Marken eines Commits, inaktive HEADs zuletzt. CSS: `g.head-tag.worktree-head > rect { stroke-dasharray: 4 2; fill: #EEFFEE }`. `SCRIPTS` += Worktree-Skript.
- [ ] **Step 4:** PASS; im DevServer eine Folie mit zwei Worktrees ansehen (Marken lesbar, Statuszeile zeigt Pfad). **Step 5: Commit** `feat: git worktree add/list/remove, cd and git -C`

### Task 13: Dokumentation, Version 0.2.0

**Files:** Modify `README.md` (Befehlstabelle, neue Folien „Modern git“ mit `switch`/`restore`/`stash` und „Worktrees“, je ein `@ExplainGit.quiz`-Beispiel; Abschnitt „Languages“ unverändert), `package.json` (`version: 0.2.0`), README-Header `version: 0.2.0`

- [ ] **Step 1:** README-Beispiele im DevServer durchklicken: jede neue Folie zeichnet ohne Fehler, Quiz akzeptiert die Lösung und lehnt einen falschen Weg ab, Sprache `de`/`uk` über Google Translate einmal wechseln.
- [ ] **Step 2:** `npm test` und `npm run build` – PASS.
- [ ] **Step 3: Commit und Tag** `docs: modern git commands, version 0.2.0`; `git tag 0.2.0`; Push von `master` und Tag nur nach Rückfrage.
