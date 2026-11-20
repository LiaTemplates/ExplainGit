// deferred minors of the branch review
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, viewInfo, unchanged } from './harness.mjs'

const O = { origin: true }

test('long labels fit between neighbouring commits', () => {
  const { box } = run(['git switch -c feature/login-form', 'git commit', 'git push -u origin feature/login-form', 'git commit'], O)
  const width = name => name.length * 6 + 10
  const widest = Math.max(...box.hv.commitData.flatMap(c => c.tags.map(width)))
  for (const c of box.hv.commitData) {
    const parent = box.hv.getCommit(c.parent)
    if (parent && parent.cx !== undefined && c.cx !== undefined) assert.ok(c.cx - parent.cx >= widest, `${c.cx - parent.cx} < ${widest}`)
  }
})
test('reset --hard and stash drop a pending squash', () => {
  const squash = ['git switch -c dev', 'git commit', 'git switch master', 'git merge --squash dev']
  assert.equal(run(squash.concat('git reset --hard', 'edit', 'git commit')).box.hv.getCommit('HEAD').squashOf, undefined)
  assert.equal(run(squash.concat('git stash', 'edit', 'git commit')).box.hv.getCommit('HEAD').squashOf, undefined)
})
test('a pending squash belongs to its worktree', () => {
  const { box } = run(['git switch -c dev', 'git commit', 'git switch master', 'git worktree add -b other ../wt', 'git merge --squash dev', 'git -C ../wt commit'])
  assert.equal(box.hv.getCommit('other').squashOf, undefined)
})
test('list output is translated and names are protected', () => {
  document.documentElement.lang = 'de'
  try {
    const log = run(['edit', 'git stash', 'git worktree add --detach ../wt', 'git stash list', 'git worktree list']).log
    assert.deepEqual(log.filter(l => l.kind === 'info').slice(-3).map(l => l.text), ['stash@{0}: WIP on master', '.  e137e9b [master]', '../wt  e137e9b (losgelöster HEAD)'])
  } finally { document.documentElement.lang = 'en' }
})
test('stash push -m keeps the message', () => {
  const { box, log } = run(['edit', 'git stash push -m "half done"', 'git stash list'])
  assert.equal(box.hv.getCommit('stash@{0}').message, 'On master: half done')
  assert.equal(log.at(-1).text, 'stash@{0}: On master: half done')
})
test('rebase with an unknown upstream does not switch first', () => unchanged(['git switch -c topic1', 'git commit', 'git switch master'], 'git rebase nope topic1'))
test('checkout HEAD stays on the branch', () => assert.equal(run(['git commit', 'git checkout HEAD']).box.hv.currentBranch, 'master'))
test('missing arguments are named, not "undefined"', () => {
  unchanged(['git switch -c dev', 'git push -u origin dev'], 'git push origin --delete', O)
  unchanged(['git switch -c dev', 'git push -u origin dev'], 'git branch -u', O)
  unchanged([], 'git -C')
})
test('worktree paths are compared without trailing slash or ./', () => {
  assert.equal(run(['git worktree add -b dev ../wt', 'cd ../wt/']).box.hv.currentBranch, 'dev')
  assert.equal(run(['git worktree add -b dev ./wt', 'cd wt']).box.hv.currentBranch, 'dev')
  unchanged(['git worktree add -b dev ../wt'], 'git worktree add -b x ../wt/')
})
test('commit -m msg --amend', () => {
  const { box } = run(['git commit -m one', 'git commit -m two --amend'])
  assert.equal(box.hv.getCommit('HEAD').message, 'two'); assert.equal(box.hv.getCommit('HEAD').parent, 'e137e9b')
})
test('commit -m with quotes and flags after it', () => assert.equal(run(['git commit -m "a b" -a']).box.hv.getCommit('HEAD').message, 'a b'))
test('commit -m without quotes still takes all words (0.1.0)', () => assert.equal(run(['git commit -m Hello World']).box.hv.getCommit('HEAD').message, 'Hello World'))
test('quiz compares every worktree, not only the one you are in', () => {
  assert.ok(same(['git worktree add -b dev ../wt'], ['git worktree add -b dev ../wt', 'cd ../wt']))
  assert.ok(!same(['git worktree add --detach ../wt', 'git switch --detach'], ['git worktree add --detach ../wt', 'cd ../wt']))
})
test('no random ids left', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/explaingit.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /Math\.random/)
})
