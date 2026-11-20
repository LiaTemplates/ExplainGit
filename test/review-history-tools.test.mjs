import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const msgs = hv => { const out = []; for (let c = hv.getCommit('HEAD'); c && c.message !== 'base'; c = hv.getCommit(c.parent)) out.unshift(c.message); return out }
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)
const B = ['echo a > f', 'git add f', 'git commit -m base', 'echo 1 > one', 'git add one', 'git commit -m one',
  'echo 2 > two', 'git add two', 'git commit -m two', 'echo 3 > three', 'git add three', 'git commit -m three']

test('a refused rebase --continue loses no commit', () => {
  const S = ['echo a > f', 'git add f', 'git commit -m base', 'echo b >> f', 'git commit -am b', 'echo c >> f', 'git commit -am c',
    'git rebase -i HEAD~2', 'edit 1', ':wq', 'git reset HEAD^']
  unchanged(S, 'git rebase --continue')
  const r = run(S.concat('git rebase --continue', 'git commit -am b2', 'git rebase --continue'))
  assert.deepEqual(msgs(r.box.hv), ['b2', 'c'])
  assert.deepEqual(r.box.hv.work, { f: ['a', 'b', 'c'] })
})
test('--update-refs with edit moves the branch to the amended commit', () => {
  const r = run(B.concat('git branch mid HEAD~1', 'git rebase -i --update-refs HEAD~3', 'edit 2', ':wq', 'git commit --amend -m TWO', 'git rebase --continue'))
  assert.deepEqual(errors(r), [])
  assert.equal(r.box.hv.getCommit('mid').id, r.box.hv.getCommit('master~1').id)
  assert.equal(r.box.hv.getCommit('mid').message, 'TWO')
})
test('bisect belongs to the worktree where it started', () => {
  const C = ['git commit -m c1', 'git commit -m c2', 'git commit -m c3', 'git commit -m c4', 'git branch other HEAD~1',
    'git worktree add ../wt other', 'git bisect start HEAD HEAD~3', 'cd ../wt']
  unchanged(C, 'git bisect bad')
  const r = run(C.concat('cd .', 'git bisect reset'))
  assert.deepEqual(errors(r), [])
  assert.equal(r.box.hv.currentBranch, 'master')
})
test('unchanged picks keep their ids', () => {
  const before = run(B).box.hv
  const ids = h => ['HEAD', 'HEAD~', 'HEAD~2'].map(x => h.getCommit(x).id)
  assert.deepEqual(ids(run(B.concat('git rebase -i HEAD~3', ':wq')).box.hv), ids(before))
  const rw = run(B.concat('git rebase -i HEAD~3', 'reword 3 "x"', ':wq')).box.hv
  assert.deepEqual(ids(rw).slice(1), ids(before).slice(1))
  assert.notEqual(ids(rw)[0], ids(before)[0])
  const a = ['git commit -m a', 'git switch -c t', 'git commit -m b', 'git commit -m c']
  assert.deepEqual(ids(run(a.concat('git rebase --autosquash master')).box.hv), ids(run(a).box.hv))
})
test('todo lines can name commits whose id is all digits', () => {
  const cmds = []
  for (let i = 0; i < 40; i++) cmds.push('git commit -m c' + i)
  const r0 = run(cmds)
  const c = []
  for (let x = r0.box.hv.getCommit('HEAD'), n = 0; n < 30; x = r0.box.hv.getCommit(x.parent), n++) if (/^\d+$/.test(x.id)) c.push(x)
  assert.ok(c.length, 'needs an all-digit id in the last 30 commits')
  const r = run(cmds.concat('git rebase -i HEAD~30', 'drop ' + c[0].id, ':wq'))
  assert.deepEqual(errors(r), [])
  assert.ok(!r.box.hv.commitData.some(x => x.message === c[0].message && r.box.hv.isAncestor(x, 'HEAD')))
})
