import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, viewInfo } from './harness.mjs'

const status = cmds => viewInfo(run(cmds).box.hv).status

test('a new repository is clean', () => assert.equal(status([]), 'clean'))
test('edit makes unstaged changes', () => assert.equal(status(['edit']), 'unstaged'))
test('add stages them', () => assert.equal(status(['edit', 'git add .']), 'staged'))
test('commit cleans', () => assert.equal(status(['edit', 'git add -A', 'git commit']), 'clean'))
test('soft reset keeps changes staged', () => assert.equal(status(['git commit', 'git reset --soft HEAD^']), 'staged'))
test('plain reset is mixed', () => assert.equal(status(['git commit', 'git reset HEAD^']), 'unstaged'))
test('hard reset cleans', () => assert.equal(status(['git commit', 'edit', 'git reset --hard HEAD^']), 'clean'))
test('reset still moves the branch', () => assert.equal(run(['git commit', 'git reset --soft HEAD^']).box.hv.getCommit('master').id, 'e137e9b'))
test('add then restore --staged', () => assert.equal(status(['edit', 'git add .', 'git restore --staged .']), 'unstaged'))
test('restore drops unstaged changes', () => assert.equal(status(['edit', 'git restore .']), 'clean'))
test('merge --squash stages', () => assert.equal(status(['git switch -c dev', 'git commit', 'git switch master', 'git merge --squash dev']), 'staged'))
test('status prints the state', () => assert.equal(run(['edit', 'git status']).log.at(-1).text, 'Working tree: changes not staged'))
test('quiz: soft and hard reset differ', () => assert.ok(!same(['git commit', 'git reset --soft HEAD^'], ['git commit', 'git reset --hard HEAD^'])))
test('old quizzes unaffected', () => assert.ok(same(['git commit'], ['git commit'])))
test('status line shows the state', () => assert.match(run(['edit']).box.hv.svg.select('text.status-display').text(), /not staged/))
test('rejects restore without path', () => assert.equal(run(['edit', 'git restore']).log.at(-1).kind, 'error'))
