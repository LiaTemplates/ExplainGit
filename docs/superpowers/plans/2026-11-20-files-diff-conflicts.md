# Dateien, Diff und Konflikte für ExplainGit (Phase 1 von 5) – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ExplainGit bekommt echte, kleine Dateien: Commits speichern Inhalte, Index und Arbeitsverzeichnis sind Dateistände, `git diff`/`git show`/`git status` zeigen sie, und Merge, Rebase, Cherry-pick, Revert und Stash führen Inhalte zusammen – mit echten Konflikten.

**Architecture:** Reine Funktionen für Bäume, Zeilen-Diff und Drei-Wege-Merge in `src/files.js` (ohne DOM, in Node testbar). `HistoryView` speichert pro Commit einen Baum `tree` und pro Worktree `index` und `work`; alle Befehle in `ControlBox` arbeiten darauf. Ein Dateifeld unter dem Graphen zeigt HEAD / Index / Arbeitsverzeichnis wie in „Reset Demystified“. Quiz und Gemeinschaftsmodus bleiben deterministisch (Blob-IDs aus Inhalts-Hash).

**Tech Stack:** JavaScript (ES-Module), d3-selection@1 / d3-transition@1, Parcel 2, `node --test` + jsdom.

**Spec:** Abschnitt „Befehlsumfang (Spec)“ unten; abgeleitet aus Pro Git 3 (progit3.com, Kapitel Git Basics, Basic Branching and Merging, Undoing, Reset Demystified, Stashing and Cleaning, Advanced Merging, Rebasing) und der Analyse vom 2026-11-20. Spätere Phasen (nicht in diesem Plan): 2 Verlauf/Reflog/Tags, 3 mehrere Repos/Entwickler, 4 interaktiver Rebase/Bisect, 5 Objekt-Ansicht.

## Global Constraints

- Template-Version bleibt unter 1.0.0; dieser Plan endet mit `version: 0.3.0` und Tag `0.3.0` (Tag erst nach Merge auf `master`).
- Kurse ohne Dateibefehle verhalten sich exakt wie 0.2.0: gleiche Commits, gleiche Refs, gleiche Quiz-Bewertung, `git commit` ohne Änderungen erzeugt weiter einen Commit, solange das Repository keine Datei kennt.
- Jeder sichtbare Text über `tr(key, ...args)` mit `en`, `de`, `uk`; Dateinamen und Inhalte immer als `tr`-Argument bzw. als `notranslate`-Element, nie übersetzbar.
- Deterministisch: keine Zufallswerte, keine Zeit; Blob-IDs = 7 Hex aus Inhalts-Hash (dieselbe Mischfunktion wie `nextId`).
- Dateiinhalt = Array von Zeilen (Strings) ohne Zeilenende; Baum = Objekt `{ [pfad]: string[] }`, Pfade ohne `./`.
- Abgelehnte Befehle ändern nichts (Test-Helfer `unchanged`).
- Nach jeder Aufgabe: `npm test` grün, `npm run build`, `dist/index.js` mitcommitten.

## Befehlsumfang (Spec)

| Befehl | Wirkung | Ausgabe / Darstellung |
|---|---|---|
| `echo "text" > f`, `echo text >> f`, `echo text` | Datei im Arbeitsverzeichnis schreiben / anhängen / Text ausgeben | – |
| `cat f`, `ls`, `rm f`, `mv a b` | Shell auf dem Arbeitsverzeichnis | Inhalt / Dateiliste |
| `edit [f]` (alt) | hängt Zeile `change <n>` an `f` (Standard `file.txt`) | wie 0.2.0: danach „nicht vorgemerkt“ |
| `git add <pfad>… / . / -A` | Index ← Arbeitsverzeichnis (auch Löschungen); löst Konflikte | – |
| `git rm [--cached] f`, `git mv a b` | aus Index (und Arbeitsverzeichnis) entfernen / umbenennen | – |
| `git status`, `git status -s` | | Abschnitte wie Git: „Changes to be committed“, „Changes not staged for commit“, „Untracked files“, „Unmerged paths“; `-s`: `XY pfad` |
| `git commit` | Commit-Baum = Index; mit Dateien im Repo und nichts vorgemerkt: Fehler „nothing to commit“ (außer `--allow-empty`) | |
| `git diff`, `--staged`/`--cached`, `<a> <b>`, `<a>..<b>`, `<a>...<b>`, `--stat`, `-- <pfad>` | Arbeitsverzeichnis↔Index, Index↔HEAD, Commit↔Commit, Merge-Base | `diff --git a/f b/f`, `--- a/f`, `+++ b/f`, `@@ -1,n +1,m @@`, Zeilen ` `/`+`/`-`, farbig; `--stat`: ` f \| 3 ++-` + Summe |
| `git show [<ref>]` | Commit-Kopf + Diff zum ersten Parent | |
| `git reset --soft/--mixed/--hard <ref>`, `git reset [<ref>] -- <pfad>` | Branch bewegen; mixed: Index ← Ziel; hard: Index und Arbeitsverzeichnis ← Ziel; mit Pfad: nur Index-Eintrag | Dateifeld |
| `git restore [--staged] [--source=<ref>] <pfad>`, `git checkout [<ref>] -- <pfad>` | Datei aus Index / HEAD / Ref zurückholen | |
| `git switch`/`checkout` mit lokalen Änderungen | Änderungen wandern mit; würde eine geänderte Datei überschrieben: Fehler „Your local changes would be overwritten“ | |
| `git clean -n/-f [-d] [-x]` | unversionierte Dateien zeigen / löschen | Liste |
| `git merge` | Drei-Wege-Merge pro Datei auf Zeilenebene; Fast-Forward unverändert | |
| Konflikt bei `merge` | Zustand MERGING: Datei mit `<<<<<<< HEAD` / `=======` / `>>>>>>> <name>` (bei `merge.conflictstyle diff3` zusätzlich `\|\|\|\|\|\|\| base`), Index-Eintrag „unmerged“, Status `UU` / „both modified“ | Statuszeile „Merging – fix conflicts“ |
| `git add f` + `git commit` / `git merge --continue` | Merge-Commit mit zwei Parents | |
| `git merge --abort` | Index und Arbeitsverzeichnis ← HEAD | |
| `git checkout --ours/--theirs f`, `git restore --ours/--theirs f` | Konfliktdatei aus einer Seite | |
| `git config merge.conflictstyle diff3`, `git config rerere.enabled` (nur speichern), `git config --list` | Einstellungen pro Repository | |
| `cherry-pick`, `revert`, `rebase` (auch `--onto`, `--update-refs`, `pull --rebase`), `commit --amend`, `merge --squash` | übertragen Änderungen per Drei-Wege-Merge; bei Konflikt Halt mit Zustand CHERRY-PICKING / REVERTING / REBASING | Statuszeile |
| `--continue`, `--abort`, `--skip` (für cherry-pick, revert, rebase) | fortsetzen / zurück zum Ausgangszustand / Commit auslassen | |
| `git stash [push] [-u/--include-untracked] [--keep-index] [-m]`, `apply [--index]`, `pop`, `stash branch <b>` | Stash speichert Index und Arbeitsverzeichnis; Anwenden per Drei-Wege-Merge | |
| Dateifeld | Tabelle Datei × HEAD / Index / Arbeitsverzeichnis mit Blob-ID, Status-Buchstaben; nur sichtbar, wenn eine Datei existiert | unter dem Graphen |

## Review Focus

1. Ein Kurs aus 0.2.0 ohne Dateibefehle ergibt dieselben Graphen und Quiz-Ergebnisse (Commits ohne Änderungen bleiben erlaubt) – Test in Task 2 und 9.
2. Ein Konflikt mitten in einem Rebase über drei Commits: `--continue` nach `add`, `--skip`, `--abort` stellen den richtigen Zustand her, auch für `--update-refs`-Branches – Test in Task 7.
3. Dateinamen und Inhalte mit Leerzeichen, Anführungszeichen, `>` im Text (`echo "a > b" > f`) – Test in Task 2.
4. Wechsel des Worktrees während eines Merge-Konflikts: Konfliktzustand bleibt beim Worktree – Test in Task 6.
5. Gemeinschaftsmodus: dieselbe Befehlsfolge mit Konflikten ergibt in jedem Browser dieselben Bäume und Blob-IDs – `SCRIPTS` je Task.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/files.js` (neu) | `blobId(lines)`, `diffLines(a, b)`, `merge3(base, ours, theirs, labels, style)`, `mergeTrees(base, ours, theirs, labels, style)`, `formatDiff(path, a, b)`, `diffStat(changes)`, `treeEqual`, `changedPaths(a, b)` – rein, ohne DOM |
| `src/explaingit.js` | Befehle (`ControlBox`) und Modell (`HistoryView`): Bäume, Index, Arbeitsverzeichnis, Zustände MERGING/REBASING/…, Dateifeld |
| `src/repo.js` | `viewInfo` mit `files`, `needsFiles(cmds)`, `compare` mit Bäumen |
| `src/i18n.js`, `src/explaingit.css` | neue Texte, Diff-Farben, Dateifeld |
| `test/files.test.mjs`, `test/worktree-files.test.mjs`, `test/diff.test.mjs`, `test/conflict.test.mjs`, `test/replay.test.mjs`, `test/stash-files.test.mjs` | Tests je Task |

---

### Task 1: `src/files.js` – Diff und Drei-Wege-Merge

**Files:** Create `src/files.js`, `test/files.test.mjs`

**Interfaces:**
- Produces:
  - `blobId(lines: string[]) -> string` (7 Hex, FNV-1a + murmur3-Mix über `lines.join('\n')`)
  - `diffLines(a: string[], b: string[]) -> Array<{op: ' '|'+'|'-', line: string}>` (LCS, bei gleicher Länge des Ergebnisses: Löschungen vor Einfügungen)
  - `merge3(base, ours, theirs, labels: {ours: string, theirs: string}, style: 'merge'|'diff3') -> {lines: string[], conflict: boolean}`
  - `mergeTrees(base, ours, theirs, labels, style) -> {tree: Tree, conflicts: string[], unmerged: {[path]: {base, ours, theirs}}}` (Datei nur auf einer Seite geändert ⇒ diese Seite; gelöscht vs. geändert ⇒ Konflikt)
  - `formatDiff(path: string, a: string[]|undefined, b: string[]|undefined) -> string[]` (ein Hunk über die ganze Datei)
  - `changedPaths(a: Tree, b: Tree) -> string[]` (sortiert), `diffStat(a: Tree, b: Tree) -> {files: [{path, plus, minus}], plus, minus}`

- [ ] **Step 1: Tests**

```js
test('diff of one changed line', () => assert.deepEqual(diffLines(['a','b','c'], ['a','x','c']),
  [{op:' ',line:'a'},{op:'-',line:'b'},{op:'+',line:'x'},{op:' ',line:'c'}]))
test('merge3 takes both sides when they touch different lines', () =>
  assert.deepEqual(merge3(['a','b','c'], ['A','b','c'], ['a','b','C'], L, 'merge'), {lines:['A','b','C'], conflict:false}))
test('merge3 marks a conflict', () => assert.deepEqual(merge3(['a'], ['b'], ['c'], {ours:'HEAD', theirs:'dev'}, 'merge'),
  {lines:['<<<<<<< HEAD','b','=======','c','>>>>>>> dev'], conflict:true}))
test('diff3 style shows the base', () => assert.deepEqual(merge3(['a'], ['b'], ['c'], {ours:'HEAD', theirs:'dev'}, 'diff3').lines,
  ['<<<<<<< HEAD','b','||||||| base','a','=======','c','>>>>>>> dev']))
test('same change on both sides is no conflict', () => assert.equal(merge3(['a'], ['b'], ['b'], L, 'merge').conflict, false))
test('mergeTrees: added on one side, deleted vs modified', () => {
  const r = mergeTrees({ f: ['x'] }, { f: ['y'], g: ['n'] }, {}, L, 'merge')
  assert.deepEqual(r.conflicts, ['f']); assert.deepEqual(r.tree.g, ['n'])
})
test('formatDiff of a new file', () => assert.deepEqual(formatDiff('f', undefined, ['x']),
  ['diff --git a/f b/f', 'new file', '--- /dev/null', '+++ b/f', '@@ -0,0 +1,1 @@', '+x']))
test('blobId is stable and content based', () => { assert.equal(blobId(['a']), blobId(['a'])); assert.notEqual(blobId(['a']), blobId(['b'])) })
```
- [ ] **Step 2:** `node --test test/files.test.mjs` → FAIL (Modul fehlt). **Step 3:** umsetzen; `merge3` über die beiden LCS-Diffs gegen `base` (Hunks, die sich in Base-Zeilen überlappen ⇒ Konflikt). **Step 4:** PASS. **Step 5: Commit** `feat: files module with line diff and three-way merge`

### Task 2: Dateien im Modell, Shell-Befehle, `add`/`rm`/`mv`/`status`/`commit`

**Files:** Modify `src/explaingit.js`, `src/repo.js` (`viewInfo.files`, `viewInfo.status`), `src/i18n.js`, `src/explaingit.css`; Test `test/worktree-files.test.mjs`

**Interfaces:**
- Consumes: `files.js` (Task 1)
- Produces:
  - Commit-Feld `tree` (Erstcommit `{}`), `HistoryView.index`, `HistoryView.work` (aktiver Worktree; inaktive Worktrees speichern `index`/`work` im Eintrag, `activate` tauscht sie), `HistoryView.headTree() -> Tree`.
  - `HistoryView.fileStatus() -> Array<{path, x: ' '|'A'|'M'|'D'|'U'|'?', y: ' '|'M'|'D'|'U'|'?'}>` (sortiert); `HistoryView.status` wird daraus abgeleitet: `'clean'` | `'staged'` (nur Index≠HEAD) | `'unstaged'` (Arbeitsverzeichnis≠Index oder unversioniert) | `'conflict'`; `setStatus` entfällt als Setter für Befehle (nur noch Anzeige).
  - `HistoryView.hasFiles() -> boolean` (eine Datei in irgendeinem Commit, Index oder Arbeitsverzeichnis).
  - `viewInfo(hv).files = {head, index, work}`.
  - Shell-Befehle in `ControlBox._run` vor `git`: `echo`, `cat`, `ls`, `rm`, `mv`, `edit`. `echo`-Argument: in Anführungszeichen (auch mit Leerzeichen und `>`) oder alle Wörter bis `>`/`>>`.
- [ ] **Step 1: Tests**

```js
test('echo, add, commit stores the file', () => {
  const { box } = run(['echo "hello world" > a.txt', 'git add a.txt', 'git commit -m a'])
  assert.deepEqual(box.hv.getCommit('HEAD').tree, { 'a.txt': ['hello world'] })
  assert.equal(viewInfo(box.hv).status, 'clean')
})
test('quotes and > inside the text', () => assert.deepEqual(run(['echo "a > b" > f', 'cat f']).log.at(-1).text, 'a > b'))
test('>> appends', () => assert.deepEqual(run(['echo a > f', 'echo b >> f']).box.hv.work.f, ['a', 'b']))
test('status sections', () => assert.deepEqual(run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'echo n > new', 'git status']).log.filter(l => l.kind === 'info').map(l => l.text).slice(-4),
  ['Changes not staged for commit:', 'modified: f', 'Untracked files:', 'new']))
test('status -s', () => assert.deepEqual(run(['echo a > f', 'git add f', 'echo b >> f', 'git status -s']).log.at(-1).text, 'AM f'))
test('nothing to commit once files exist', () => unchanged(['echo a > f', 'git add f', 'git commit'], 'git commit'))
test('legacy: empty commits without files', () => assert.equal(run(['git commit', 'git commit']).box.hv.commitData.length, 3))
test('legacy: edit then add then commit', () => assert.equal(viewInfo(run(['edit', 'git add .', 'git commit']).box.hv).status, 'clean'))
const C = ['echo a > f', 'git add f', 'git commit']
test('git rm', () => { const { box } = run(C.concat('git rm f')); assert.equal(box.hv.index.f, undefined); assert.equal(box.hv.work.f, undefined) })
test('git rm --cached keeps the file untracked', () => {
  const { box } = run(C.concat('git rm --cached f'))
  assert.equal(box.hv.index.f, undefined); assert.deepEqual(box.hv.work.f, ['a'])
  assert.deepEqual(box.hv.fileStatus(), [{ path: 'f', x: 'D', y: '?' }])
})
test('git mv', () => { const { box } = run(C.concat('git mv f g')); assert.deepEqual(box.hv.index, { g: ['a'] }); assert.deepEqual(box.hv.work, { g: ['a'] }) })
test('cat of a missing file is an error', () => unchanged([], 'cat nope'))
```
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen; `git status`-Texte als `tr`-Schlüssel (`statusStaged`, `statusUnstaged`, `statusUntracked`, `statusUnmerged`, `statusNothing`, `fileNew`, `fileModified`, `fileDeleted`, `fileBoth`); Statuszeile im SVG zeigt weiter die Zusammenfassung. `SCRIPTS` += Datei-Skript. **Step 4:** PASS (alle alten Tests unverändert grün). **Step 5: Commit** `feat: files in commits, index and working tree; echo/cat/ls/rm/mv, add/rm/mv/status`

### Task 3: `reset`, `restore`, `checkout -- <pfad>`, Branchwechsel mit Änderungen, `clean`

**Files:** Modify `src/explaingit.js`, `src/i18n.js`; Test `test/worktree-files.test.mjs` (erweitern)

**Interfaces:** Produces `HistoryView.switchTrees(targetTree) -> void` (wirft `localChanges`-Fehler), `HistoryView.untracked() -> string[]`.

- [ ] **Step 1: Tests** – soft/mixed/hard setzen Index/Arbeitsverzeichnis wie in „Reset Demystified“ (drei Assertions auf `files`); `git reset -- f` holt nur den Index-Eintrag; `restore f`, `restore --staged f`, `restore --source=HEAD~1 f`, `checkout HEAD~1 -- f`; `switch dev` mit geänderter Datei, die auf `dev` gleich ist ⇒ Änderung wandert mit; mit Datei, die auf `dev` anders ist ⇒ `unchanged(..., 'git switch dev')`; `clean -n` listet, `clean -f` löscht nur unversionierte, `-d` ohne Wirkung (keine Ordner), `-x` ohne Wirkung (kein `.gitignore` in Phase 1).
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen; Schlüssel `localChanges: f => \`Your local changes to ${f} would be overwritten.\``, `wouldRemove: f => \`Would remove ${f}\``, `removing: f => \`Removing ${f}\``. **Step 4:** PASS. **Step 5: Commit** `feat: reset/restore/checkout on files, switching keeps or protects local changes, clean`

### Task 4: `git diff`, `git show`

**Files:** Modify `src/explaingit.js` (`ControlBox.diff`, `ControlBox.show`, `ControlBox.diffLine(text, kind)`), `src/explaingit.css` (`.diff-add`, `.diff-del`, `.diff-hunk`, `.diff-head`), `src/i18n.js`; Test `test/diff.test.mjs`

**Interfaces:** Produces `ControlBox.diffLine(text: string, kind: 'add'|'del'|'hunk'|'head'|'ctx')` – Konsolenzeile `notranslate`, Klasse `diff-<kind>`; harness-`log` meldet sie als `kind: 'diff'`.

- [ ] **Step 1: Tests** – `git diff` nach `echo b >> f` gibt genau `['diff --git a/f b/f','--- a/f','+++ b/f','@@ -1,1 +1,2 @@',' a','+b']`; `--staged` leer bis `git add`; `git diff HEAD~1 HEAD`, `master..dev`, `master...dev` (Merge-Base); `--stat` → `[' f | 1 +', '1 file changed, 1 insertion(+)']`; `-- f` filtert; `git show` druckt `commit <id>`, Nachricht, Diff zum ersten Parent; `git show` auf Merge-Commit: Diff zum ersten Parent; unbekannte Ref ⇒ `unchanged`.
- [ ] **Step 2:** FAIL. **Step 3–4:** umsetzen, PASS. **Step 5: Commit** `feat: git diff and git show`

### Task 5: Dateifeld

**Files:** Modify `src/explaingit.js` (`HistoryView.renderFiles()` – aufgerufen nach jedem Befehl), `src/index.js` (Bereich unter `.explaingit`), `src/explaingit.css`, `src/i18n.js`; Test `test/worktree-files.test.mjs`

**Interfaces:** Produces DOM `table.explaingit-files` mit `caption` (übersetzt), Kopf `File | HEAD | Index | Working tree`, je Datei eine Zeile: Zellen = Blob-ID oder `–`, Klasse `changed` wo der Wert von der linken Nachbarspalte abweicht, `conflict` bei unmerged; ausgeblendet (`hidden`), solange `hasFiles()` false ist.

- [ ] **Step 1: Tests** – ohne Dateien `hidden`; nach `echo a > f; git add f; echo b >> f`: Zeile `f` mit `['–', blobId(['a']), blobId(['a','b'])]` und `changed` in Index- und Worktree-Spalte; Konflikt ⇒ Klasse `conflict`; Tabelle hat `caption`.
- [ ] **Step 2:** FAIL. **Step 3–4:** umsetzen, PASS; im DevServer ansehen (hell/dunkel, schmal). **Step 5: Commit** `feat: files panel with HEAD, index and working tree`

### Task 6: Merge mit Inhalten und Konflikten

**Files:** Modify `src/explaingit.js` (`HistoryView.merge`, Zustand `this.operation = {type: 'merge'|'cherry-pick'|'revert'|'rebase', …}` pro Worktree), `src/i18n.js`; Test `test/conflict.test.mjs`

**Interfaces:**
- Consumes `mergeTrees` (Task 1), `index`/`work` (Task 2).
- Produces `HistoryView.operation`, Index-Eintrag für Konflikt `{unmerged: {base, ours, theirs}}`, `HistoryView.config: {[key]: string}` (`git config <key> <value>`, `git config <key>`, `git config --list`), `ControlBox.merge` mit `--continue`, `--abort`; `checkout/restore --ours/--theirs`.
- [ ] **Step 1: Tests** – sauberer Drei-Wege-Merge setzt Merge-Commit-Baum = Ergebnis; Konflikt: Datei-Inhalt mit Markern (`>>>>>>> dev`), `status -s` `UU f`, `viewInfo.status === 'conflict'`, kein Commit; `git commit` mit offenem Konflikt ⇒ `unchanged`; `add f` + `commit` ⇒ zwei Parents, Baum = gelöste Datei; `merge --abort` ⇒ Zustand wie vor dem Merge; `checkout --theirs f` + `add` + `commit`; `config merge.conflictstyle diff3` ⇒ `|||||||`-Zeile; Worktree-Wechsel während Konflikt behält Konflikt im Worktree; `SCRIPTS` += Konflikt-Skript.
- [ ] **Step 2:** FAIL. **Step 3–4:** umsetzen, PASS. **Step 5: Commit** `feat: three-way merge of files, conflicts, merge --abort/--continue, ours/theirs`

### Task 7: Cherry-pick, Revert, Rebase, Amend, Squash mit Inhalten

**Files:** Modify `src/explaingit.js`; Test `test/replay.test.mjs`

**Interfaces:**
- Consumes `operation` (Task 6), `mergeTrees`.
- Produces `HistoryView.applyCommit(commit, {reverse}) -> {conflicts: string[]}` (Drei-Wege: Base = Parent-Baum, Ours = Index, Theirs = Commit-Baum; `reverse` vertauscht), Rebase-Zustand `{type:'rebase', todo: [commitIds], onto, updateRefs, orig: {branch, head}}`; `--continue`, `--abort`, `--skip` für `cherry-pick`, `revert`, `rebase`.
- [ ] **Step 1: Tests** – cherry-pick überträgt nur die Änderung des Commits; revert entfernt sie; rebase über 3 Commits mit Konflikt beim zweiten: Halt (Status, `todo` Länge 1), `add`+`rebase --continue` beendet, `--skip` lässt aus, `--abort` stellt Branch und Bäume wieder her; `--update-refs` nach Konflikt korrekt; `commit --amend` nimmt Index; `merge --squash` füllt Index mit Merge-Ergebnis; `pull --rebase` mit Inhalten; Kurse ohne Dateien unverändert (Determinismus-Skripte der Phase 0.2.0 grün).
- [ ] **Step 2:** FAIL. **Step 3–4:** umsetzen, PASS. **Step 5: Commit** `feat: cherry-pick, revert, rebase, amend and squash carry file changes, with --continue/--abort/--skip`

### Task 8: Stash mit Inhalten

**Files:** Modify `src/explaingit.js`; Test `test/stash-files.test.mjs`

**Interfaces:** Stash-Commit erhält `tree` (= Arbeitsverzeichnis) und `indexTree`; `stash push -u` nimmt unversionierte Dateien mit, sonst bleiben sie liegen; `--keep-index` lässt den Index stehen; `apply` per Drei-Wege-Merge (Konflikt ⇒ Stash bleibt erhalten, auch bei `pop`); `apply --index` stellt den Index wieder her; `stash branch <b>` = Branch am Stash-Parent + `pop`.

- [ ] **Step 1: Tests** – je eine Assertion pro Option auf `files`; Konflikt bei `pop` behält `stash@{0}`; `SCRIPTS` += Stash-Datei-Skript.
- [ ] **Step 2:** FAIL. **Step 3–4:** PASS. **Step 5: Commit** `feat: stash keeps index and working tree, -u, --keep-index, apply --index, stash branch`

### Task 9: Remote, Worktrees, Quiz und Gemeinschaftsmodus mit Dateien

**Files:** Modify `src/explaingit.js` (`push`/`fetch` kopieren `tree`), `src/repo.js` (`needsFiles(cmds)`, `encode` nimmt bei Bedarf Blob-IDs der Commit-Bäume auf, `compare` vergleicht `files.index`/`files.work` des Haupt-Worktrees), `src/index.js` (`check` übergibt `{ files: needsFiles(...) }`); Test `test/worktree-files.test.mjs`, `test/review.test.mjs`

**Interfaces:** `needsFiles(cmds: string[]) -> boolean` (true bei `echo`, `cat`, `rm`, `mv`, `edit`, `git add|rm|mv|restore|diff|show|clean|stash|checkout … --`), `compare(actual, expected, {status, files})`.

- [ ] **Step 1: Tests** – Quiz „Datei ändern und committen“ lehnt fehlenden Inhalt ab, akzeptiert anderen Weg (`echo` + `git commit -a` vs. `add` + `commit`); alte 0.2.0-Quizze (ohne Dateien) unverändert; `push` + `fetch` übertragen Bäume; zwei Worktrees haben eigene Index/Arbeitsverzeichnisse.
- [ ] **Step 2:** FAIL. **Step 3–4:** PASS. **Step 5: Commit** `feat: files in remotes, worktrees and quiz comparison`

### Task 10: Dokumentation, Version 0.3.0

**Files:** Modify `README.md` (neue Folien „Files and diff“ mit `@ExplainGit.eval`-Beispiel und Quiz, „Conflicts“ mit Konflikt-Beispiel und Quiz; Befehlstabelle; `version: 0.3.0`; Import-Zeile `0.3.0`), `package.json` (`0.3.0`)

- [ ] **Step 1:** DevServer: neue Folien zeichnen fehlerfrei, Quizze akzeptieren richtige und lehnen falsche Lösungen ab, Sprache `de` einmal prüfen.
- [ ] **Step 2:** `npm test`, `npm run build` – PASS.
- [ ] **Step 3: Commit** `docs: files, diff and conflicts, version 0.3.0` (Tag `0.3.0` erst nach Merge auf `master`).
