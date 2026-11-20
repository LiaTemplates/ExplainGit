# Mehrere Repositories und Entwickler für ExplainGit (Phase 3 von 5) – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kapitel „Working with Remotes“, „Remote Branches“, „Distributed Git“ (Centralized, Integration-Manager, Forks), „The Refspec“ und die Teamszenen aus „Contributing to a Project“ (John und Jessica pushen auf denselben Server) lassen sich mit ExplainGit zeigen.

**Architecture:** Statt eines festen `origin` gibt es eine „Welt“ aus benannten Repositories (`HistoryView` mit `isRemote`), die die Sandbox hält. Das lokale Repository kennt davon die konfigurierten Remotes (`git remote add`). Befehle mit Präfix `@<repo>` laufen in einem Welt-Repository (andere Entwickler, Server). `fetch` holt nach der Standard-Refspec `+refs/heads/*:refs/remotes/<name>/*` alle Branches. Remote-Fenster stehen untereinander rechts.

**Tech Stack:** wie Phase 1/2.

**Spec:** Abschnitt „Befehlsumfang (Spec)“; abgeleitet aus Pro Git 3 (Working with Remotes, Remote Branches, Distributed Workflows, Contributing to a Project, Maintaining a Project, The Refspec). Baut auf Phase 2 (`history-reflog`, v0.4.0) auf.

## Global Constraints

- Version am Ende `0.5.0`.
- Kurse mit `create origin` verhalten sich wie bisher (gleiche Graphen, Quiz-Bewertung, `origin`-Fenster oben rechts), Ausnahme: `fetch` holt jetzt auch neue Remote-Branches (wie Git).
- Deterministisch; abgelehnte Befehle ändern nichts; Texte über `tr`.
- Commit-Autor: Standard `you` bzw. `git config user.name`; im Gemeinschaftsmodus der Name der Person, die den Befehl tippt; `@<repo>`-Befehle: Name des Repositorys oder `user.name` dieses Repositorys.
- Nach jeder Aufgabe `npm test`, `npm run build`, `dist/index.js` mitcommitten.

## Befehlsumfang (Spec)

| Befehl / Zeile | Wirkung |
|---|---|
| Codeblock-Zeile `create <name>` | Welt-Repository `<name>` (Startcommit wie lokal); `create origin` richtet es zusätzlich als Remote `origin` ein (wie bisher) |
| `@<repo> <befehl>` | Befehl (`git …`, `echo`, …) im Welt-Repository ausführen, z. B. `@origin git commit -m "Jessica: reset task"`; Log zeigt `[<repo>]` |
| `git remote`, `-v`, `remote add <name> <url>`, `remote rename`, `remote remove`/`rm`, `remote show <name>`, `git ls-remote <name>` | `<url>` wählt das Welt-Repository nach dem letzten Pfadteil ohne `.git` (`https://…/paulboone/ticgit` → `ticgit`), sonst ein neues |
| `git fetch [<remote>] [--all] [--prune]`, `git fetch <remote> <src>:<dst>` | alle Branches und Tags; Refspec-Form schreibt nach `<dst>` |
| `git pull [<remote> [<branch>]]` | wie bisher, mit beliebigem Remote |
| `git push [<remote>] [<src>:<dst>]`, `+<src>:<dst>` | jedes Remote; `+` erzwingt |
| `git switch <b>` / `checkout <b>`, wenn nur `<remote>/<b>` existiert; `checkout --track <remote>/<b>`; `checkout -b <b> <remote>/<b>` | lokaler Branch mit Upstream |
| `git config user.name <n>`, `git commit --author="<n>"` | Autor am Commit; `git log` zeigt `Author: <n>`; Commit-Beschriftung im Graphen ergänzt den Autor als Tooltip |
| Darstellung | Ein Fenster pro eingerichtetem Remote, rechts untereinander, mit Titel = Remote-Name; Welt-Repositories ohne Remote-Eintrag nur sichtbar, wenn `@<repo>` sie benutzt |
| Quiz | vergleicht alle eingerichteten Remotes (nach Name) |

## Review Focus

1. Push wird abgelehnt, nachdem `@origin` einen Commit gepusht hat (Centralized Workflow aus Pro Git); `fetch` + `merge` + `push` gelingt danach – Test in Task 3.
2. `remote rename` benennt Remote-Tracking-Branches und Upstreams um – Test in Task 2.
3. Integration-Manager: `upstream` (Original) + `origin` (Fork), `fetch upstream`, `rebase upstream/main`, `push -f origin topic` – Test in Task 5.
4. Gemeinschaftsmodus: `@<repo>`-Befehle und Autoren sind in jedem Browser gleich – `SCRIPTS`.
5. Kurse mit `create origin` aus 0.2.0–0.4.0 ergeben dieselben Graphen – Determinismus-/Kompatibilitätstest in Task 1.

---

### Task 1: Welt-Repositories statt festem `origin`

**Files:** Modify `src/repo.js` (`Sandbox`: `this.world = {name: HistoryView}`, `this.remotes` Reihenfolge; `parseCommands`: `create <name>`; `snapshot` über alle Remotes), `src/explaingit.js` (`ControlBox.remotes: {name: view}` statt `originView`; `push`/`fetch`/`pull` über `remotes[name]`; Remote-Fenster-Layout), `src/explaingit.css`; Test `test/remotes.test.mjs`
**Interfaces:** `Sandbox(area, name, {origin, init, intro, world: string[]})`; `ControlBox.remotes`; `ControlBox.world`; `HistoryView.remotes` (Namen, für `isRemoteRef`).
- [ ] **Step 1: Tests** – `create origin` ergibt dieselben Graphen wie 0.4.0 für alle bisherigen Remote-Skripte (Vergleich mit gespeicherten `graph()`-Ergebnissen); `create upstream` ohne Remote-Eintrag zeigt kein Fenster; `parseCommands` erkennt `create <name>`.
- [ ] **Step 2–4.** **Step 5: Commit** `refactor: named world repositories instead of a fixed origin`

### Task 2: `git remote …`, `ls-remote`

**Files:** `src/explaingit.js`, `src/i18n.js`; Test `test/remotes.test.mjs`
- [ ] **Step 1: Tests** – `remote -v` Zeilen `origin\t<url> (fetch)`/`(push)`; `remote add pb https://github.com/paulboone/ticgit` verbindet mit Welt-Repo `ticgit` falls vorhanden, sonst neu `pb`; `remote rename pb paul` benennt `pb/*` → `paul/*` und Upstreams; `remote remove paul` entfernt Tracking-Branches und Fenster; `remote show origin` (Branches, `HEAD branch`); `ls-remote origin` (`<id>\trefs/heads/…`, Tags); Fehler bei doppeltem Namen.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: git remote add/rename/remove/show/-v and ls-remote`

### Task 3: `@<repo>`-Befehle und Autoren

**Files:** `src/explaingit.js` (`ControlBox._run` erkennt `@<repo>`; führt `_run` mit `historyView` = Welt-Repo aus, Log-Präfix `[<repo>]`; Autor-Feld), `src/repo.js` (Welt-Repos mit eigenem Index/Arbeitsverzeichnis), `src/index.js` (Autor im Gemeinschaftsmodus = `who.name`), `src/i18n.js`; Test `test/team.test.mjs`
- [ ] **Step 1: Tests** – Pro-Git-Szene: `create origin`, Jessica `@origin git commit -m "Add reset task"`, John `git commit -m "Remove invalid default"`, `git push` ⇒ abgelehnt (non-fast-forward), `git fetch`, `git merge origin/master`, `git push` gelingt; `@origin echo x > f` + `@origin git commit -am …` mit Dateien; `git log` zeigt `Author: Jessica` bei `@origin` mit `user.name Jessica`; `commit --author="Ann"`; unbekanntes `@nope` ⇒ Fehler; `@origin` darf kein `@other` schachteln.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: commands in other repositories (@repo) and commit authors`

### Task 4: Fetch aller Branches, Refspecs, Tracking-DWIM

**Files:** `src/explaingit.js`; Test `test/remotes.test.mjs`
- [ ] **Step 1: Tests** – `@origin git switch -c serverfix` + Commit, dann `git fetch` ⇒ `origin/serverfix`; `git switch serverfix` legt Tracking-Branch an (Upstream `origin/serverfix`); `checkout --track origin/serverfix`; `checkout -b sf origin/serverfix` setzt Upstream; `fetch origin master:refs/remotes/origin/mymaster`; `push origin serverfix:awesomebranch`; `push origin +dev:dev` erzwingt; `fetch --all` über zwei Remotes.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: fetch all branches, refspecs, tracking branches from remote branches`

### Task 5: Workflows aus „Distributed Git“

**Files:** `test/workflows.test.mjs` (Szenarien als Tests; Code nur, wo sie scheitern), `README.md`-Beispiele vorbereiten
- [ ] **Step 1: Tests** – Integration-Manager (Fork `origin`, Original `upstream`, `fetch upstream`, `rebase upstream/master`, `push -f origin topic`, Maintainer `@upstream git fetch …` ist nicht nötig: Maintainer-Sicht über `@upstream git pull <url> topic` oder `@upstream git merge`); Dictator/Lieutenants vereinfacht mit drei Welt-Repos; `merge --squash` in neuen Branch + `push myfork featureBv2`.
- [ ] **Step 2–4:** Lücken schließen. **Step 5: Commit** `feat: distributed workflows from Pro Git work end to end`

### Task 6: Dokumentation, Version 0.5.0

**Files:** `README.md` (Folien „Remotes“, „Working in a team“ mit Quiz „Push abgelehnt – bring deine Arbeit trotzdem hoch“, „Forks“; Befehlstabelle; Version, Import-Zeile), `package.json`
- [ ] **Step 1:** DevServer: Folien fehlerfrei, Remote-Fenster lesbar (auch zwei Remotes, schmal), Quiz richtig/falsch, `de`. **Step 2:** `npm test`, `npm run build`. **Step 3: Commit** `docs: remotes, teams and forks, version 0.5.0`
