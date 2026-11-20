import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged, same } from './harness.mjs'

const F = ['echo a > f', 'git add f', 'git commit -m base', 'git switch -c topic',
  'echo b >> f', 'git commit -am add-b', 'echo x > g', 'git add g', 'git commit -m add-g']
const msgs = hv => { const out = []; for (let c = hv.getCommit('HEAD'); c && c.message !== 'base'; c = hv.getCommit(c.parent)) out.push(c.message); return out }

test('commit --fixup / --squash name their target', () => {
  assert.equal(run(F.concat('echo c >> f', 'git commit -a --fixup HEAD~')).box.hv.getCommit('HEAD').message, 'fixup! add-b')
  assert.equal(run(F.concat('echo c >> f', 'git commit -a --squash HEAD~')).box.hv.getCommit('HEAD').message, 'squash! add-b')
  assert.equal(run(F.concat('echo c >> f', 'git commit -a --squash HEAD~ -m more')).box.hv.getCommit('HEAD').message, 'squash! add-b / more')
  unchanged(F.concat('echo c >> f'), 'git commit -a --fixup nope')
})
test('rebase --autosquash folds fixup! into its target', () => {
  const r = run(F.concat('echo c >> f', 'git commit -a --fixup HEAD~', 'git rebase --autosquash master'))
  assert.deepEqual(msgs(r.box.hv), ['add-g', 'add-b'])
  assert.deepEqual(r.box.hv.getCommit('HEAD~').tree, { f: ['a', 'b', 'c'] })
  assert.deepEqual(r.box.hv.work, { f: ['a', 'b', 'c'], g: ['x'] })
  assert.ok(same(F.concat('echo c >> f', 'git commit -a --fixup HEAD~', 'git rebase --autosquash master'),
    F.concat('git reset --hard HEAD~', 'echo c >> f', 'git commit -a --amend -m add-b', 'echo x > g', 'git add g', 'git commit -m add-g')))
})
test('rebase --autosquash with squash! combines the messages', () => {
  const r = run(F.concat('echo c >> f', 'git commit -a --squash HEAD~ -m more', 'git rebase --autosquash master'))
  assert.deepEqual(msgs(r.box.hv), ['add-g', 'add-b / more'])
})
test('autosquash without files', () => {
  const r = run(['git switch -c t', 'git commit -m a', 'git commit -m b', 'git commit --fixup HEAD~', 'git rebase --autosquash master'])
  assert.deepEqual(r.log.filter(l => l.kind === 'error'), [])
  assert.deepEqual([r.box.hv.getCommit('HEAD').message, r.box.hv.getCommit('HEAD~').message, r.box.hv.getCommit('HEAD~2').message], ['b', 'a', 'first commit'])
})
const M = ['echo a > f', 'git add f', 'git commit -m base', 'git switch -c side', 'echo s > s', 'git add s', 'git commit -m side',
  'git switch master', 'echo m > m', 'git add m', 'git commit -m main', 'git merge side']
test('revert -m 1 undoes the side branch of a merge', () => {
  const r = run(M.concat('git revert -m 1 HEAD'))
  assert.deepEqual(r.box.hv.work, { f: ['a'], m: ['m'] })
  assert.match(r.box.hv.getCommit('HEAD').message, /^Revert "Merge branch 'side'"/)
  assert.deepEqual(run(M.concat('git revert -m 2 HEAD')).box.hv.work, { f: ['a'], s: ['s'] })
})
test('revert of a merge needs -m, -m needs a merge', () => {
  unchanged(M, 'git revert HEAD')
  unchanged(M, 'git revert -m 1 HEAD~')
  unchanged(M, 'git revert -m 3 HEAD')
})
