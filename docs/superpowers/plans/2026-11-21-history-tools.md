# Geschichte umschreiben und durchsuchen für ExplainGit (Phase 4 von 5) – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kapitel „Rewriting History“ (interaktives Rebase: umordnen, squash, fixup, reword, edit, drop, aufteilen), „Debugging with Git“ (bisect, blame), „Searching“ (grep, `log -S`, `log -L`) und „Advanced Merging“ (`revert -m`) aus Pro Git 3 lassen sich mit ExplainGit zeigen.

**Architecture:** Interaktives Rebase nutzt den vorhandenen Sequencer (`HistoryView.operation`, `_continueSequence`, `_commitStep`) mit neuen Schrittarten. Statt eines Editors gibt es eine To-do-Liste in der Konsole: Nach `git rebase -i` ist die Liste offen und Zeilen wie `squash <commit>` ändern sie; `:wq` startet, `:q!` bricht ab. So bleibt alles eine Folge von Befehlen (Quiz, Gemeinschaftsmodus, Replay). Bisect ist ein eigener Zustand pro Worktree mit Refs `bisect/bad`, `bisect/good-<id>`. Blame, grep und `log -L` sind reine Leseoperationen über die Bäume mit `diffLines` aus `src/files.js`.

**Tech Stack:** wie Phase 1–3.

**Spec:** Abschnitt „Befehlsumfang (Spec)“; abgeleitet aus Pro Git 3 (Rewriting History, Debugging with Git, Searching, Advanced Merging). Baut auf Phase 3 (`distributed`, v0.5.0) auf.

## Global Constraints

- Version am Ende `0.6.0`.
- Deterministisch (gleiche Befehle ⇒ gleicher Zustand in jedem Browser); abgelehnte Befehle ändern nichts; Texte über `tr` (en/de/uk); Git-Ausgaben (Todo-Zeilen, `Bisecting: …`, blame-Zeilen) bleiben englisch wie in Git.
- Kurse ohne `-i`/`bisect` verhalten sich wie 0.5.0 (bisheriges Rebase ohne Dateien unverändert).
- Nach jeder Aufgabe `npm test`, `npm run build`, `dist/index.js` mitcommitten.

## Befehlsumfang (Spec)

| Befehl | Wirkung |
|---|---|
| `git commit --fixup <c>` / `--squash <c>` | Commit mit Nachricht `fixup! <msg>` / `squash! <msg>` |
| `git rebase [-i] --autosquash <upstream>` | `fixup!`/`squash!`-Commits rücken hinter ihr Ziel, Aktion fixup/squash |
| `git rebase -i <upstream>` / `HEAD~n` / `--root` | zeigt die To-do-Liste (`pick <id> <msg>`, älteste zuerst), Zustand „To-do offen“; Graph markiert die Commits |
| To-do-Zeilen: `pick/p`, `reword/r <c> ["msg"]`, `edit/e`, `squash/s`, `fixup/f`, `drop/d` `<c>` | setzt die Aktion für `<c>` (Id-Präfix oder Nummer der Zeile) |
| `move <c> <n>` | verschiebt `<c>` an Position `<n>` (1 = älteste) |
| `:wq` | startet das Rebase mit der Liste; `:q!` oder leere Liste bricht ab (nichts ändert sich) |
| während To-do offen | andere Befehle außer To-do-Zeilen, `:wq`, `:q!`, `git rebase --abort`, `git status`, `git log` ⇒ Fehler „To-do-Liste ist offen“ |
| `edit` | hält nach dem Commit an; `git commit --amend`, `git reset HEAD^` + mehrere Commits (aufteilen), `git rebase --continue` |
| `squash` / `fixup` | vereinigt mit dem vorigen Commit; Nachricht bei squash: beide Nachrichten (`a` + Leerzeile + `b` als eine Zeile `a / b`), bei fixup: die vorige |
| `git revert -m <n> <merge>` | Revert eines Merges relativ zu Elternteil `<n>`; ohne `-m` bei Merge ⇒ Fehler |
| `git bisect start [<bad> [<good>…]]`, `bisect bad/good [<rev>]`, `bisect skip`, `bisect reset`, `bisect log` | HEAD in der Mitte (deterministisch: mittlerer Commit der Kandidaten in `revList`-Reihenfolge), Meldung `Bisecting: <n> revisions left to test after this (roughly <k> steps)`, am Ende `<id> is the first bad commit`; Refs `bisect/bad`, `bisect/good-<id>` im Graphen |
| `git blame <file>` [`-L a,b`] | pro Zeile `<id> (<author>) <n>) <line>`; Herkunft über `diffLines` entlang der Eltern (bei Merges: Zeile, die unverändert aus einem Elternteil kommt, gehört dessen Geschichte) |
| `git grep [-n] [-c] <muster> [<rev>]` | durchsucht Arbeitsverzeichnis (verfolgte Dateien) oder Baum von `<rev>`; Ausgabe `[<rev>:]<datei>:[<n>:]<zeile>` |
| `git log -L <a>,<b>:<datei>` | Commits, die diesen Zeilenbereich geändert haben, mit Diff des Bereichs |

## Review Focus

1. Interaktives Rebase mit Konflikt in einem `squash`-Schritt: `--continue` ergibt den vereinigten Commit, `--abort` stellt alles wieder her – Test in Task 2.
2. `:q!` und eine geleerte Liste ändern nichts (Graph, Index, Arbeitsverzeichnis, Reflog) – Test in Task 2.
3. Bisect in einer Geschichte mit Merges findet den ersten schlechten Commit in jedem Fall (alle Positionen des schlechten Commits durchprobieren) – Test in Task 3.
4. Blame nach Umbenennen einer Datei per `git mv` (Zeilen behalten den alten Commit nicht – Git ohne `-C` auch nicht; Erwartung: Commit des `mv`) und nach Merge – Test in Task 4.
5. Gemeinschaftsmodus/Replay: To-do-Zeilen und `:wq` sind normale Befehle, `SCRIPTS` enthalten `rebase -i` und `bisect` – Determinismustest.

---

### Task 1: `commit --fixup/--squash`, `--autosquash`, `revert -m`

**Files:** `src/explaingit.js` (`commit`, `rebase`, `revert`, `HistoryView.applyCommit` mit Elternteil-Wahl), `src/i18n.js`; Test `test/fixup.test.mjs`
**Interfaces:** Produces: `HistoryView._todo(base, commits, opt)` → `[{id, kind: 'pick'|'squash'|'fixup'|'reword'|'edit', message?}]` (autosquash-Sortierung), von Task 2 genutzt; `applyCommit(commit, reverse, mainline)`.
- [ ] **Step 1: Tests** – `commit --fixup HEAD~` ⇒ Nachricht `fixup! <msg>`; `rebase --autosquash master` (ohne `-i`, wie Git ≥ 2.44) vereinigt fixup in sein Ziel (eine Commit weniger, Baum des Ziels enthält die Änderung, Nachricht des Ziels); `--squash` ⇒ beide Nachrichten; `revert -m 1 <merge>` entfernt die Änderungen des Seitenzweigs; `revert <merge>` ohne `-m` ⇒ Fehler, unverändert.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: commit --fixup/--squash, rebase --autosquash, revert -m`

### Task 2: Interaktives Rebase mit To-do-Liste

**Files:** `src/explaingit.js` (`ControlBox._run`: To-do-Modus vor allen anderen Befehlen; `rebase -i`; `HistoryView.operation.type = 'rebase-todo'` mit `todo`, sonst Sequencer; `_commitStep` für `squash/fixup/reword/edit`), `src/explaingit.css` (markierte Commits), `src/i18n.js`; Test `test/interactive.test.mjs`
**Interfaces:** Consumes `_todo` aus Task 1. Rebase ohne Dateien läuft bei `-i` ebenfalls über den Sequencer.
- [ ] **Step 1: Tests** – `rebase -i HEAD~3` zeigt drei `pick`-Zeilen (älteste zuerst); `squash <id>` + `:wq` ⇒ zwei Commits, Nachricht kombiniert; `fixup 2` (Zeilennummer); `drop`; `move <c> 1` ordnet um (Bäume stimmen); `reword <c> "neu"`; `edit` hält an, `commit --amend -m x`, `--continue`; Aufteilen: `edit`, `reset HEAD^`, zwei `add`/`commit`, `--continue` ⇒ ein Commit mehr; `:q!` ⇒ `unchanged`; `git commit` während To-do offen ⇒ Fehler; Konflikt bei `squash` (Review Focus 1); `rebase -i --root`; Quiz-Vergleich: `rebase -i` + `squash` ergibt denselben Graphen wie `reset --soft HEAD~2` + `commit` (mit Dateien, `same()`); Determinismus-Skript.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: interactive rebase with a todo list in the console`

### Task 3: `git bisect`

**Files:** `src/explaingit.js` (`bisect`-Befehl, `HistoryView.bisect` Zustand pro Worktree, Refs im Graphen), `src/explaingit.css` (Refs `bisect/*`), `src/i18n.js`; Test `test/bisect.test.mjs`
- [ ] **Step 1: Tests** – lineare Geschichte mit 8 Commits, `bisect start HEAD <erster>`, `bad`/`good` nach Datei-Inhalt ⇒ `… is the first bad commit` mit richtiger Id für jede Position (Review Focus 3, auch mit einem Merge); `bisect reset` ⇒ zurück auf den Branch, Refs weg; `bisect skip`; `bisect log`; `bisect good` ohne `start` ⇒ Fehler; Determinismus-Skript.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: git bisect`

### Task 4: `blame`, `grep`, `log -L`

**Files:** `src/files.js` (`blameLines(history)`-Hilfe ohne DOM), `src/explaingit.js` (`blame`, `grep`, `gitLog` `-L`), `src/i18n.js`; Test `test/search.test.mjs`
- [ ] **Step 1: Tests** – `blame f` nach drei Commits, die je eine Zeile anhängen/ändern ⇒ richtige Id/Autor je Zeile; Merge (Review Focus 4); `blame -L 2,3`; `blame` unbekannte Datei ⇒ Fehler; `grep -n salt` im Arbeitsverzeichnis, `grep salt HEAD~1`, `grep -c`; `log -L 1,2:f` zeigt genau die Commits, die Zeilen 1–2 geändert haben.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: git blame, git grep and git log -L`

### Task 5: Dokumentation, Version 0.6.0

**Files:** `README.md` (Folien „Rewriting history“ mit Quiz „Fasse die letzten drei Commits zu einem zusammen“, „Finding bugs“ (bisect), „Who wrote this line“ (blame/grep); Befehlstabelle; „Not included yet“; Version, Import-Zeile), `package.json`
- [ ] **Step 1:** Alle README-Beispiele laufen fehlerfrei (Skript), DevServer: Folien, Quiz richtig/falsch, `de`. **Step 2:** `npm test`, `npm run build`. **Step 3: Commit** `docs: rewriting history, bisect and blame, version 0.6.0`
