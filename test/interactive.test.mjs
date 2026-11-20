import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged, same } from './harness.mjs'

// base, then three commits that each add a file
const B = ['echo a > f', 'git add f', 'git commit -m base',
  'echo 1 > one', 'git add one', 'git commit -m one',
  'echo 2 > two', 'git add two', 'git commit -m two',
  'echo 3 > three', 'git add three', 'git commit -m three']
const msgs = hv => { const out = []; for (let c = hv.getCommit('HEAD'); c && c.message !== 'base'; c = hv.getCommit(c.parent)) out.unshift(c.message); return out }
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)
const id = (r, ref) => r.box.hv.getCommit(ref).id
const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)

test('rebase -i shows the todo, oldest first, and marks the commits', () => {
  const r = run(B.concat('git rebase -i HEAD~3'))
  const l = lines(r)
  assert.deepEqual(l.slice(0, 3), [`pick ${id(r, 'HEAD~2')} one`, `pick ${id(r, 'HEAD~')} two`, `pick ${id(r, 'HEAD')} three`])
  assert.equal(r.box.hv.operation.type, 'rebase-todo')
  assert.equal(r.box.hv.svg.selectAll('circle.commit.selected').size(), 3)
})
test('squash, fixup, drop, reword', () => {
  const sq = run(B.concat('git rebase -i HEAD~3', 'squash 2', ':wq'))
  assert.deepEqual(errors(sq), [])
  assert.deepEqual(msgs(sq.box.hv), ['one / two', 'three'])
  assert.deepEqual(sq.box.hv.getCommit('HEAD~').tree, { f: ['a'], one: ['1'], two: ['2'] })
  assert.deepEqual(msgs(run(B.concat('git rebase -i HEAD~3', 'f 3', ':wq')).box.hv), ['one', 'two'])
  const dr = run(B.concat('git rebase -i HEAD~3', 'drop 2', ':wq'))
  assert.deepEqual(msgs(dr.box.hv), ['one', 'three'])
  assert.deepEqual(dr.box.hv.work, { f: ['a'], one: ['1'], three: ['3'] })
  assert.deepEqual(msgs(run(B.concat('git rebase -i HEAD~3', 'reword 1 "first one"', ':wq')).box.hv), ['first one', 'two', 'three'])
})
test('lines can name commits by id', () => {
  const r0 = run(B)
  const r = run(B.concat('git rebase -i HEAD~3', `squash ${id(r0, 'HEAD')}`, ':wq'))
  assert.deepEqual(msgs(r.box.hv), ['one', 'two / three'])
})
test('move reorders the commits', () => {
  const r = run(B.concat('git rebase -i HEAD~3', 'move 3 1', ':wq'))
  assert.deepEqual(msgs(r.box.hv), ['three', 'one', 'two'])
  assert.deepEqual(r.box.hv.getCommit('HEAD~2').tree, { f: ['a'], three: ['3'] })
})
test('edit stops, amend, continue', () => {
  const r = run(B.concat('git rebase -i HEAD~3', 'edit 2', ':wq'))
  assert.equal(r.box.hv.getCommit('HEAD').message, 'two')
  assert.equal(r.box.hv.operation.type, 'rebase')
  const a = run(B.concat('git rebase -i HEAD~3', 'edit 2', ':wq', 'git commit --amend -m TWO', 'git rebase --continue'))
  assert.deepEqual(errors(a), [])
  assert.deepEqual(msgs(a.box.hv), ['one', 'TWO', 'three'])
  assert.equal(a.box.hv.operation, null)
})
test('split a commit with edit and reset', () => {
  const r = run(['echo a > f', 'git add f', 'git commit -m base', 'echo x > x', 'echo y > y', 'git add .', 'git commit -m xy',
    'git rebase -i HEAD~', 'edit 1', ':wq', 'git reset HEAD^', 'git add x', 'git commit -m x', 'git add y', 'git commit -m y', 'git rebase --continue'])
  assert.deepEqual(errors(r), [])
  assert.deepEqual(msgs(r.box.hv), ['x', 'y'])
  assert.equal(r.box.hv.currentBranch, 'master')
})
test(':q! and an empty list change nothing', () => {
  unchanged(B.concat('git rebase -i HEAD~3', ':q!'), 'git commit')
  const before = run(B), after = run(B.concat('git rebase -i HEAD~3', ':q!'))
  assert.deepEqual(after.box.hv.commitData.map(c => c.id), before.box.hv.commitData.map(c => c.id))
  assert.deepEqual(after.box.hv.reflog, before.box.hv.reflog)
  const empty = run(B.concat('git rebase -i HEAD~3', 'drop 1', 'drop 2', 'drop 3', ':wq'))
  assert.equal(empty.box.hv.operation, null)
  assert.equal(id(empty, 'HEAD'), id(before, 'HEAD'))
  assert.deepEqual(run(B.concat('git rebase -i HEAD~3', 'git rebase --abort')).box.hv.operation, null)
})
test('while the todo is open other commands are refused', () => {
  const T = B.concat('git rebase -i HEAD~3')
  unchanged(T, 'git commit -m x')
  unchanged(T, 'echo z > z')
  unchanged(T, 'squash 1')       // nothing before it: refused at once
  unchanged(T, 'pick 9')
  unchanged(T, 'reword 1')       // needs a message
  assert.deepEqual(errors(run(T.concat('git status', 'git log --oneline'))), [])
})
test('squash with a conflict: continue and abort', () => {
  const C = ['echo a > f', 'git add f', 'git commit -m base', 'echo b > f', 'git commit -am b', 'echo c > f', 'git commit -am c', 'echo d > f', 'git commit -am d']
  const stop = run(C.concat('git rebase -i HEAD~3', 'drop 2', 'squash 3', ':wq'))
  assert.equal(stop.box.hv.operation.type, 'rebase')
  assert.ok(stop.box.hv.hasUnmerged())
  const done = run(C.concat('git rebase -i HEAD~3', 'drop 2', 'squash 3', ':wq', 'echo d > f', 'git add f', 'git rebase --continue'))
  assert.deepEqual(errors(done), [])
  assert.deepEqual(msgs(done.box.hv), ['b / d'])
  assert.deepEqual(done.box.hv.work, { f: ['d'] })
  const ab = run(C.concat('git rebase -i HEAD~3', 'drop 2', 'squash 3', ':wq', 'git rebase --abort'))
  assert.equal(id(ab, 'HEAD'), id(run(C), 'HEAD'))
  assert.deepEqual(ab.box.hv.work, { f: ['d'] })
})
test('rebase -i onto a moved upstream, and without files', () => {
  const r = run(['git switch -c t', 'git commit -m a', 'git commit -m b', 'git switch master', 'git commit -m m', 'git switch t', 'git rebase -i master', 'squash 2', ':wq'])
  assert.deepEqual(errors(r), [])
  assert.equal(r.box.hv.getCommit('HEAD').message, 'a / b')
  assert.equal(r.box.hv.getCommit('HEAD~').message, 'm')
})
test('quiz: squash via rebase -i equals reset --soft + commit', () =>
  assert.ok(same(B.concat('git rebase -i HEAD~3', 'squash 2', 'squash 3', ':wq'), B.concat('git reset --soft HEAD~3', 'git commit -m all'))))
