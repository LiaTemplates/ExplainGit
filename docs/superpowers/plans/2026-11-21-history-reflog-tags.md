# Verlauf, Reflog und Tags für ExplainGit (Phase 2 von 5) – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kapitel „Viewing the Commit History“, „Revision Selection“, „Tagging“, „Branch Management“, „Git Aliases“ und „Maintenance and Data Recovery“ von Pro Git lassen sich mit ExplainGit zeigen: `git log` in allen gängigen Formen mit Hervorhebung im Graphen, Revisionsausdrücke, Reflog und Wiederherstellung, vollständige Tags, Aliase.

**Architecture:** Ausgabe-Befehle in `ControlBox` lesen das vorhandene Modell; eine neue Liste `HistoryView.reflog` wird nach jedem Befehl durch Vergleich der Ref-Stände vorher/nachher fortgeschrieben (deterministisch, ein Eintrag pro Befehl und bewegtem Ref). Bereiche (`a..b`, `a...b`) werden einmal in `HistoryView.revList(spec)` aufgelöst und von `log`, `branch --merged`, `describe` und der Hervorhebung benutzt.

**Tech Stack:** wie Phase 1 (JavaScript ES-Module, d3-selection@1, Parcel, `node --test` + jsdom).

**Spec:** Abschnitt „Befehlsumfang (Spec)“ unten; abgeleitet aus Pro Git 3 (Kapitel Viewing History, Revision Selection, Tagging, Branch Management, Remote Branches, Git Aliases, Maintenance and Data Recovery) und der Analyse vom 2026-11-20. Baut auf Phase 1 (`files-diff`, v0.3.0) auf.

## Global Constraints

- Version am Ende `0.4.0` (Tag erst nach Merge auf `master`).
- Kurse aus 0.3.0 und früher verhalten sich gleich: keine Änderung an Commits, Refs, Quiz-Bewertung; neue Ausgaben nur auf neue Befehle.
- Texte über `tr` (en/de/uk); Git-Ausgabe (IDs, Ref-Namen, Commit-Nachrichten) bleibt unübersetzt (`notranslate`).
- Deterministisch; abgelehnte Befehle ändern nichts (`unchanged`).
- Nach jeder Aufgabe `npm test`, `npm run build`, `dist/index.js` mitcommitten.

## Befehlsumfang (Spec)

| Befehl | Wirkung / Ausgabe |
|---|---|
| `git log` | je Commit `commit <id> (<decor>)`, `    <msg>`; Reihenfolge: neueste zuerst (Topologie: Kinder vor Eltern, sonst Erstellungsreihenfolge rückwärts) |
| `--oneline`, `--graph`, `--all`, `--decorate`, `-<n>`/`-n <n>`, `--no-merges`, `--merges`, `--first-parent`, `-p`, `--stat`, `-- <pfad>`, `-S <text>` | Kurzform `<id> (<decor>) <msg>`; `--graph` stellt `* ` voran (der echte Graph steht daneben); Pfadfilter und Pickaxe auf Dateiinhalten |
| `<a>..<b>`, `^<a> <b>`, `<b> --not <a>`, `<a>...<b>`, `--left-right` | Bereichsauflösung; `--left-right` markiert `<`/`>` |
| Hervorhebung | Die von `git log` gelisteten Commits erhalten im Graphen die Klasse `selected`, bis zum nächsten Befehl |
| Revisionsausdrücke | `HEAD^2` (zweiter Parent), `@` (= HEAD), `@{u}`/`@{upstream}`, `<b>@{u}`, `HEAD@{n}`, `<b>@{n}` |
| `git rev-parse <rev>` | ID |
| `git reflog [show <ref>]`, `git log -g` | `<id> HEAD@{n}: <nachricht>`; Nachrichten wie Git: `commit: …`, `commit (amend): …`, `checkout: moving from a to b`, `reset: moving to …`, `merge <b>: Fast-forward`/`Merge made by the 'ort' strategy.`, `rebase (finish): …`, `cherry-pick: …`, `pull: …`, `branch: Created from …` |
| `git branch <name> HEAD@{2}` | Wiederherstellung |
| `git fsck [--unreachable/--lost-found]` | `dangling commit <id>` / `unreachable commit <id>` |
| `git reflog expire --expire=now --all`, `git gc [--prune=now]`, `git prune` | Unerreichbare Commits (ohne Reflog-Bezug) verschwinden aus dem Graphen |
| `git tag <name> [<rev>]`, `git tag -a <name> -m <msg> [<rev>]`, `git tag -d <name>`, `git tag [-l "<muster>"]` | annotierte Tags mit Nachricht; Darstellung: Klasse `annotated` |
| `git show <tag>` | annotiert: `tag <name>`, Nachricht, dann Commit wie `show` |
| `git push origin <tag>`, `--tags`, `--follow-tags`, `git push origin --delete <tag>` / `:refs/tags/<tag>`, Tags bei `fetch` | Tags im Remote |
| `git describe [--tags] [<rev>]` | `<tag>` oder `<tag>-<n>-g<id>` |
| `git branch -v`, `-vv`, `--merged [<rev>]`, `--no-merged [<rev>]`, `-a`, `-r` | `* master 1a2b3c4 msg`, `[origin/master: ahead 1, behind 2]` |
| `git config alias.<name> '<befehl …>'`, `git <alias> …` | Alias-Auflösung (auch mehrere Wörter, z. B. `reset HEAD --`); `!…` ⇒ Fehler „nicht unterstützt“ |

## Review Focus

1. Reflog nach Rebase mit Konflikt (`--continue`): `HEAD@{1}` zeigt auf den Stand vor dem letzten Befehl, `git branch rescue ORIG` funktioniert – Test in Task 3.
2. `gc` nach `reflog expire` entfernt nur Unerreichbares; Stashes, Worktree-HEADs und Tags bleiben – Test in Task 4.
3. `git log a...b --left-right` über Merges – Test in Task 2.
4. Aliase, die sich selbst aufrufen (`alias.x x`), hängen nicht – Test in Task 6.
5. Gemeinschaftsmodus: Reflog und Hervorhebung entstehen bei jedem Teilnehmer gleich – `SCRIPTS` je Task.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/explaingit.js` | `revList`, Revisionsausdrücke in `getCommit`, `log`, `reflog`, `fsck`, `gc`/`prune`, Tags, `describe`, `branch -v/-vv/--merged`, Aliase |
| `src/repo.js` | `viewInfo.tags` (annotiert ja/nein) für den Quiz-Vergleich |
| `src/i18n.js`, `src/explaingit.css` | Texte, Klassen `selected`, `annotated` |
| `test/log.test.mjs`, `test/revs.test.mjs`, `test/reflog.test.mjs`, `test/tags.test.mjs`, `test/branch-info.test.mjs`, `test/alias.test.mjs` | Tests je Task |

### Task 1: Revisionsausdrücke und `rev-parse`

**Files:** Modify `src/explaingit.js` (`getCommit`), Test `test/revs.test.mjs`
**Interfaces:** Produces `getCommit` mit `^<n>`, `@`, `@{u}`, `@{upstream}`, `<ref>@{n}` (über `this.reflogFor(ref)` aus Task 3 – bis dahin liefert `@{n}` null), `ControlBox['rev-parse']`.
- [ ] **Step 1: Tests** – `HEAD^2` nach Merge = zweiter Parent; `HEAD^1` = `HEAD^`; `@` = HEAD; `@{u}` nach `push -u`; `master@{upstream}`; `rev-parse HEAD~1` gibt die ID; unbekannt ⇒ `unchanged`.
- [ ] **Step 2–4:** FAIL → umsetzen → PASS. **Step 5: Commit** `feat: revision syntax ^n, @, @{u}; git rev-parse`

### Task 2: `git log` und Hervorhebung

**Files:** Modify `src/explaingit.js` (`HistoryView.revList(includes: string[], excludes: string[]) -> commit[]`, `ControlBox.log`, `HistoryView.highlight(ids)`), `src/explaingit.css`, `src/i18n.js`; Test `test/log.test.mjs`
**Interfaces:** `revList` liefert erreichbare Commits (über `parent` und `parent2`, `--first-parent` nur `parent`) neueste zuerst; `highlight(ids)` setzt `selected`, jeder neue Befehl löscht es (in `ControlBox.command`).
- [ ] **Step 1: Tests** – Standardausgabe zweier Commits; `--oneline` mit Dekoration `(HEAD -> master, origin/master, tag: v1)`; `-2`; `--all` zeigt Commits anderer Branches; `master..dev`, `^master dev`, `dev --not master` gleich; `master...dev --left-right` mit `<`/`>`; `--no-merges`/`--merges`; `-p` enthält Diff-Zeilen; `--stat`; `-- f` nur Commits, die `f` ändern; `-S text`; `selected`-Klassen genau auf den gelisteten Commits und nach dem nächsten Befehl weg.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: git log with ranges, filters, formats and highlighting`

### Task 3: Reflog

**Files:** Modify `src/explaingit.js` (`ControlBox.command` schreibt nach `_run` das Reflog: Ref-Stände vor/nach vergleichen; `HistoryView.reflog: {[ref]: Array<{id, msg}>}` neueste zuerst, `HEAD`-Log pro Worktree), `src/i18n.js`; Test `test/reflog.test.mjs`
**Interfaces:** `HistoryView.reflogFor(ref) -> Array<{id, msg}>`; Nachricht aus dem Befehl (Tabelle oben); `git reflog`, `git reflog show <ref>`, `git log -g`.
- [ ] **Step 1: Tests** – Folge `commit`, `switch -c dev`, `commit`, `switch master`, `reset --hard HEAD~` ergibt genau die Git-Nachrichten in dieser Reihenfolge; `HEAD@{1}`; `git branch rescue HEAD@{1}` holt einen Commit nach `reset --hard` zurück; `master@{1}`; Reflog nach Rebase mit Konflikt; Worktrees haben eigene HEAD-Logs; alte Kurse unverändert (Reflog ändert keine Commits).
- [ ] **Step 2–4.** **Step 5: Commit** `feat: reflog with git-like messages, HEAD@{n} and recovery`

### Task 4: `fsck`, `reflog expire`, `gc`, `prune`

**Files:** Modify `src/explaingit.js`; Test `test/reflog.test.mjs`
**Interfaces:** `HistoryView.reachable({reflog: boolean}) -> Set<id>` (Refs, alle Worktree-HEADs, Stashes, Tags, laufende Operation, optional Reflog); `gc --prune=now` und `prune` entfernen Commits außerhalb `reachable({reflog: true})`; `reflog expire --expire=now --all` leert das Reflog.
- [ ] **Step 1: Tests** – `fsck` listet den Commit nach `reset --hard HEAD~` als `dangling commit`; `gc --prune=now` entfernt ihn nicht (Reflog), nach `reflog expire --expire=now --all` schon; Stash, Tag und zweiter Worktree-HEAD bleiben; Graph hat danach weniger Kreise.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: fsck, reflog expire, gc and prune`

### Task 5: Tags vollständig, `describe`

**Files:** Modify `src/explaingit.js` (`ControlBox.tag`, `HistoryView.tagInfo: {[name]: {message}}`, Push/Fetch von Tags, `show <tag>`, `describe`), `src/repo.js` (`viewInfo.tags`), `src/explaingit.css`, `src/i18n.js`; Test `test/tags.test.mjs`
**Interfaces:** Tags bleiben intern `[name]`; `viewInfo.tags: {[name]: 'annotated'|'lightweight'}`; Quiz vergleicht Tag-Art, wenn die Lösung `tag -a` nutzt.
- [ ] **Step 1: Tests** – `tag -a v1 -m msg` annotiert (Klasse `annotated`), `tag v2 HEAD~`, `tag -d`, `tag -l "v1*"`, Liste sortiert; `show v1` druckt `tag v1` und Nachricht; `push origin v1`, `push --tags`, `--follow-tags` (nur annotierte erreichbare), `push origin --delete v1`, `fetch` holt Tags; `describe` exakt / `v1-2-g<id>` / ohne annotierte Tags nur mit `--tags`; Tag-Doppel ⇒ `unchanged`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: annotated tags, tag listing/deletion, pushing tags, git describe`

### Task 6: Branch-Übersicht und Aliase

**Files:** Modify `src/explaingit.js` (`ControlBox.branch` mit `-v`, `-vv`, `--merged`, `--no-merged`, `-a`, `-r`; Alias-Auflösung in `_run`), `src/i18n.js`; Test `test/branch-info.test.mjs`, `test/alias.test.mjs`
**Interfaces:** Ahead/Behind = Anzahl Commits in `revList([b],[u])` / `revList([u],[b])`; Alias: `config['alias.<x>']` wird vor der Befehlswahl eingesetzt, höchstens 10 Ersetzungen.
- [ ] **Step 1: Tests** – `branch -v` Zeilen mit `*`; `-vv` mit `[origin/dev: ahead 1, behind 2]`; `--merged`/`--no-merged`; `-a` listet `remotes/origin/…`; `alias.co checkout` ⇒ `git co dev`; `alias.unstage 'reset HEAD --'` ⇒ `git unstage f`; `alias.last 'log -1 HEAD'`; `alias.x x` ⇒ Fehler; `alias.vis '!gitk'` ⇒ Fehler.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: branch -v/-vv/--merged/-a and git aliases`

### Task 7: Dokumentation, Version 0.4.0

**Files:** `README.md` (Folien „History“ mit `log`-Beispielen und Hervorhebung, „Reflog and recovery“ mit Quiz „rette den verlorenen Commit“, „Tags“; Befehlstabelle; `version: 0.4.0`; Import-Zeile), `package.json`
- [ ] **Step 1:** DevServer: Folien fehlerfrei, Quiz akzeptiert/lehnt ab, `de` einmal. **Step 2:** `npm test`, `npm run build`. **Step 3: Commit** `docs: history, reflog and tags, version 0.4.0`
