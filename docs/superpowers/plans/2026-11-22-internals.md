# Git-Interna für ExplainGit (Phase 5 von 5) – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kapitel „Git Internals“ (Objekte, Bäume, Commit-Objekte, Referenzen, Packfiles) und „Ignoring Files“ aus Pro Git 3 lassen sich mit ExplainGit zeigen: Lernende sehen, dass ein Commit auf einen Baum zeigt, der Baum auf Blobs, und bauen einen Commit von Hand mit Plumbing-Befehlen.

**Architecture:** Jedes Objekt bekommt eine deterministische Id: Blobs wie bisher (`blobId`), Bäume aus ihren sortierten Einträgen (`treeId`), Commits behalten ihre Ids. Ein Objektspeicher pro Repository (`HistoryView.objects`: Id → `{type, …}`) hält Blobs und Bäume, die `hash-object -w`/`write-tree` erzeugen; Commits, Bäume und Blobs der Geschichte werden bei Bedarf aus `commitData` gefunden. `commit-tree` legt Commits an, die nur über ihre Id erreichbar sind, bis `update-ref` einen Branch darauf setzt. `.gitignore` ist eine normale Datei im Arbeitsverzeichnis, deren Muster `untracked()` filtert.

**Tech Stack:** wie Phase 1–4.

**Spec:** Abschnitt „Befehlsumfang (Spec)“; abgeleitet aus Pro Git 3 (Git Objects, Git References, Packfiles, Maintenance and Data Recovery, Ignoring Files). Baut auf Phase 4 (`history-tools`, v0.6.0) auf.

## Global Constraints

- Version am Ende `0.7.0`.
- Deterministisch; abgelehnte Befehle ändern nichts; Texte über `tr`; Ausgaben der Plumbing-Befehle englisch wie in Git.
- Ids sind 7 Hex-Zeichen wie alle Ids in ExplainGit (keine echten SHA-1).
- Kurse ohne die neuen Befehle und ohne `.gitignore` verhalten sich wie 0.6.0.

## Befehlsumfang (Spec)

| Befehl | Wirkung |
|---|---|
| `git cat-file -t <obj>` / `-p <obj>` / `-s <obj>` | Typ / Inhalt / Größe; `<obj>` ist Rev, `<rev>^{tree}`, `<rev>:<pfad>`, Blob- oder Baum-Id. `-p` Commit: `tree <id>`, `parent <id>`…, `author <name>`, Leerzeile, Nachricht; Baum: `100644 blob <id>\t<pfad>`; Blob: Zeilen |
| `git hash-object [-w] <datei>` | Blob-Id der Datei im Arbeitsverzeichnis; `-w` legt sie in den Objektspeicher |
| `git update-index --add <datei>` | wie `git add` (Plumbing-Name) |
| `git ls-files [-s]` | Dateien im Index (`-s`: `100644 <blob> 0\t<pfad>`) |
| `git ls-tree [-r] <tree-ish>` | Einträge eines Baums |
| `git write-tree` | Baum aus dem Index, Id ausgeben, in den Speicher |
| `git commit-tree <tree> [-p <parent>]… -m <msg>` | neuer Commit ohne Ref-Änderung, Id ausgeben; im Graphen als unerreichbarer Commit sichtbar |
| `git update-ref refs/heads/<b> <rev>`, `update-ref -d refs/heads/<b>` | Branch setzen/löschen ohne Checkout |
| `git symbolic-ref HEAD [refs/heads/<b>]` | HEAD lesen / auf Branch zeigen lassen (Index und Arbeitsverzeichnis bleiben) |
| `git show-ref` | alle Refs `<id> refs/heads/…`, `refs/remotes/…`, `refs/tags/…` |
| `git count-objects [-v]`, `git gc` | Anzahl lose/gepackte Objekte; nach `gc` sind erreichbare Objekte „in pack“ |
| `.gitignore` | Zeilen sind Muster (`*.log`, `build/`, `!keep.log`, `#` Kommentar); passende unversionierte Dateien fehlen in `status`, `add .`, `add -A`, `clean`; `add <datei>` einer ignorierten Datei ⇒ Fehler wie Git, `add -f` erzwingt; `git check-ignore -v <pfad>` |
| Darstellung | Tooltip eines Commits zeigt auch `tree <id>`; die Dateitabelle zeigt eine Zeile mit der Baum-Id von HEAD und Index |

## Review Focus

1. `cat-file -p` eines Baums aus `write-tree` stimmt mit `ls-tree` des Commits aus `commit-tree` überein; gleiche Inhalte ⇒ gleiche Ids (Blob und Baum) in jedem Browser – Test in Task 1/2.
2. `commit-tree` + `update-ref` ergibt einen normalen Branch, mit dem `log`, `merge`, `rebase` und das Quiz arbeiten – Test in Task 2.
3. `symbolic-ref HEAD refs/heads/<b>` ändert Index/Arbeitsverzeichnis nicht; `status` zeigt danach die Unterschiede – Test in Task 2.
4. `.gitignore` mit Negation und Verzeichnis-Muster; eine bereits versionierte Datei wird trotz Muster weiter verfolgt – Test in Task 3.
5. `gc` vor/nach `commit-tree` ohne Ref: unerreichbare Objekte bleiben lose (bis `prune`), erreichbare werden gepackt – Test in Task 2.

---

### Task 1: Objekt-Ids und lesende Plumbing-Befehle

**Files:** `src/files.js` (`treeId(tree)`), `src/explaingit.js` (`HistoryView.objects`, `findObject(name)` → `{type, id, data}`; `cat-file`, `hash-object`, `ls-files`, `ls-tree`, `update-index --add`; Tooltip, Dateitabelle), `src/i18n.js`; Test `test/objects.test.mjs`
**Interfaces:** Produces `HistoryView.findObject(name)`, `HistoryView.storeObject(type, data)` → id, `treeId(tree)`.
- [ ] **Step 1: Tests** – `cat-file -t HEAD` = `commit`, `-t HEAD^{tree}` = `tree`, `-t HEAD:f` = `blob`; `cat-file -p HEAD` Zeilen `tree <id>`, `parent <id>`, `author you`, ``, Nachricht; `-p HEAD^{tree}` = `ls-tree HEAD`; `-p <blob-id>` = Dateiinhalt; `-s`; `hash-object f` = Blob-Id aus `ls-files -s` nach `add`; `hash-object -w` ⇒ `cat-file -p <id>` geht, ohne `-w` nicht; gleiche Bäume ⇒ gleiche Id; unbekanntes Objekt ⇒ Fehler, unverändert.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: object ids, cat-file, hash-object, ls-tree, ls-files`

### Task 2: Schreibende Plumbing-Befehle, Refs, Packfiles

**Files:** `src/explaingit.js` (`write-tree`, `commit-tree`, `update-ref`, `symbolic-ref`, `show-ref`, `count-objects`, `gc` markiert gepackt), `src/i18n.js`; Test `test/plumbing.test.mjs`
- [ ] **Step 1: Tests** – Pro-Git-Ablauf: `echo "version 1" > test.txt`, `update-index --add test.txt`, `write-tree`, `commit-tree <tree> -m "first commit"`, `update-ref refs/heads/master <id>` ⇒ `log` zeigt ihn; zweiter Commit mit `-p`; `same()` gegen `add`+`commit` (Review Focus 2); `symbolic-ref HEAD` ⇒ `refs/heads/master`; `symbolic-ref HEAD refs/heads/dev` (Review Focus 3); `update-ref -d`; `show-ref`; `count-objects -v` vor/nach `gc` (Review Focus 5); Fehlerfälle `unchanged`; Determinismus-Skript.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: write-tree, commit-tree, update-ref, symbolic-ref, show-ref, count-objects`

### Task 3: `.gitignore`

**Files:** `src/explaingit.js` (`HistoryView.ignored(path)` mit `globMatch`; `untracked()`, `add`, `clean`, `status`; `check-ignore`), `src/i18n.js`; Test `test/ignore.test.mjs`
- [ ] **Step 1: Tests** – `echo "*.log" > .gitignore`, `echo x > a.log` ⇒ `status` ohne `a.log`, `.gitignore` selbst unversioniert sichtbar; `add .` nimmt `a.log` nicht; `add a.log` ⇒ Fehler (unverändert), `add -f a.log` geht; `!keep.log`; `build/` (Pfade `build/x`); versionierte Datei bleibt verfolgt (Review Focus 4); `clean -f` lässt Ignoriertes stehen, `clean -fx` entfernt es; `check-ignore -v a.log` ⇒ `.gitignore:1:*.log\ta.log`.
- [ ] **Step 2–4.** **Step 5: Commit** `feat: .gitignore`

### Task 4: Dokumentation, Version 0.7.0

**Files:** `README.md` (Folien „Git objects“ mit Quiz „Baue einen Commit nur mit Plumbing-Befehlen“, „Ignoring files“; Befehlstabelle; „Not included yet“; Version, Import-Zeile), `package.json`
- [ ] **Step 1:** README-Beispiele laufen fehlerfrei (Skript), DevServer: Folien, Quiz richtig/falsch, `de`. **Step 2:** `npm test`, `npm run build`. **Step 3: Commit** `docs: git internals and ignoring files, version 0.7.0`
