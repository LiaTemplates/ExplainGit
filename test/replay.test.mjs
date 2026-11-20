import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged, graph } from './harness.mjs'

const files = r => viewInfo(r.box.hv).files
const msg = (hv, ref) => hv.getCommit(ref).message
// f has three lines; dev changes line 3, master changes line 1
const BASE = ['echo 1 > f', 'echo 2 >> f', 'echo 3 >> f', 'git add f', 'git commit -m base']

test('cherry-pick carries only the change of that commit', () => {
  const r = run(BASE.concat('git switch -c dev', 'echo x > g', 'git add g', 'git commit -m g', 'echo 1 > f', 'echo 2 >> f', 'echo C >> f', 'git commit -am c3',
    'git switch master', 'git cherry-pick dev'))
  assert.deepEqual(files(r).work, { f: ['1', '2', 'C'] })
  assert.equal(r.box.hv.getCommit('HEAD').cherryPickedFrom, viewInfo(r.box.hv).refs.dev)
})
test('revert takes a change back', () => {
  const r = run(BASE.concat('echo 4 >> f', 'git commit -am four', 'echo x > g', 'git add g', 'git commit -m g', 'git revert HEAD~'))
  assert.deepEqual(files(r).work, { f: ['1', '2', '3'], g: ['x'] }); assert.equal(msg(r.box.hv, 'HEAD'), 'Revert "four"')
})
// topic: three commits, the second conflicts with master
const TOPIC = BASE.concat('git switch -c topic', 'echo a > a', 'git add a', 'git commit -m a',
  'echo T > f', 'echo 2 >> f', 'echo 3 >> f', 'git commit -am t1', 'echo b > b', 'git add b', 'git commit -m b',
  'git switch master', 'echo M > f', 'echo 2 >> f', 'echo 3 >> f', 'git commit -am m1', 'git switch topic')
test('rebase without conflict copies the changes onto the new base', () => {
  const r = run(BASE.concat('git switch -c topic', 'echo a > a', 'git add a', 'git commit -m a', 'git switch master', 'echo x > x', 'git add x', 'git commit -m x', 'git switch topic', 'git rebase master'))
  assert.deepEqual(Object.keys(files(r).work).sort(), ['a', 'f', 'x']); assert.equal(msg(r.box.hv, 'topic~'), 'x')
  assert.ok(r.box.hv.getCommit('HEAD').rebased)
})
test('rebase stops at the conflict', () => {
  const r = run(TOPIC.concat('git rebase master'))
  assert.equal(viewInfo(r.box.hv).status, 'conflict'); assert.equal(r.box.hv.operation.type, 'rebase')
  assert.equal(r.box.hv.operation.todo.length, 1); assert.equal(msg(r.box.hv, 'HEAD'), 'a')
})
test('rebase --continue after add finishes', () => {
  const r = run(TOPIC.concat('git rebase master', 'echo TM > f', 'echo 2 >> f', 'echo 3 >> f', 'git add f', 'git rebase --continue'))
  assert.equal(r.box.hv.operation, null); assert.equal(r.box.hv.currentBranch, 'topic')
  assert.deepEqual(['b', 't1', 'a', 'm1'].map((m, i) => msg(r.box.hv, 'HEAD' + '~'.repeat(i))), ['b', 't1', 'a', 'm1'])
  assert.deepEqual(files(r).work.f, ['TM', '2', '3'])
})
test('rebase --skip leaves the commit out', () => {
  const r = run(TOPIC.concat('git rebase master', 'git rebase --skip'))
  assert.deepEqual(['b', 'a', 'm1'].map((m, i) => msg(r.box.hv, 'HEAD' + '~'.repeat(i))), ['b', 'a', 'm1'])
  assert.deepEqual(files(r).work.f, ['M', '2', '3'])
})
test('rebase --abort restores branch and files', () => {
  const before = run(TOPIC)
  const after = run(TOPIC.concat('git rebase master', 'git rebase --abort'))
  assert.deepEqual(files(after), files(before)); assert.equal(viewInfo(after.box.hv).refs.topic, viewInfo(before.box.hv).refs.topic)
  assert.equal(after.box.hv.operation, null)
})
test('rebase refuses a dirty working tree', () => unchanged(TOPIC.concat('echo dirty >> a'), 'git rebase master'))
test('--update-refs moves the stacked branch after a conflict', () => {
  const r = run(TOPIC.concat('git branch stacked HEAD~', 'git rebase --update-refs master', 'echo TM > f', 'echo 2 >> f', 'echo 3 >> f', 'git add f', 'git rebase --continue'))
  assert.equal(msg(r.box.hv, 'stacked'), 't1'); assert.equal(msg(r.box.hv, 'stacked~2'), 'm1')
})
test('cherry-pick conflict, --continue and --abort', () => {
  const C = TOPIC.concat('git switch master', 'git cherry-pick topic~')
  assert.equal(viewInfo(run(C).box.hv).status, 'conflict')
  const done = run(C.concat('echo X > f', 'echo 2 >> f', 'echo 3 >> f', 'git add f', 'git cherry-pick --continue'))
  assert.equal(msg(done.box.hv, 'HEAD'), 't1'); assert.ok(done.box.hv.getCommit('HEAD').cherryPickedFrom)
  const back = run(C.concat('git cherry-pick --abort'))
  assert.equal(msg(back.box.hv, 'HEAD'), 'm1'); assert.equal(viewInfo(back.box.hv).status, 'clean')
})
test('commit --amend takes the index', () =>
  assert.deepEqual(run(BASE.concat('echo 4 >> f', 'git add f', 'git commit --amend -m base')).box.hv.getCommit('HEAD').tree.f, ['1', '2', '3', '4']))
test('merge --squash puts the merged files into the index', () => {
  const r = run(BASE.concat('git switch -c dev', 'echo d > d', 'git add d', 'git commit -m d', 'git switch master', 'git merge --squash dev'))
  assert.deepEqual(files(r).index.d, ['d']); assert.equal(r.box.hv.getCommit('HEAD').message, 'base')
  r.box.run('git commit -m squashed'); assert.deepEqual(r.box.hv.getCommit('HEAD').tree.d, ['d'])
})
test('pull --rebase with files', () => {
  const r = run(['echo a > f', 'git add f', 'git commit -m a', 'git push', 'echo b > g', 'git add g', 'git commit -m b', 'git push',
    'git reset --hard HEAD~', 'echo c > h', 'git add h', 'git commit -m c', 'git pull --rebase'], { origin: true })
  assert.deepEqual(Object.keys(files(r).work).sort(), ['f', 'g', 'h']); assert.equal(msg(r.box.hv, 'HEAD~'), 'b')
})
test('legacy rebase without files is unchanged', () => {
  const cmds = ['git switch -c t1', 'git commit -m B', 'git switch master', 'git commit -m M', 'git switch t1', 'git rebase master']
  assert.equal(msg(run(cmds).box.hv, 'HEAD~'), 'M'); assert.deepEqual(graph(run(cmds).box).length, 4) // first commit, moved B, M, husk of the old B
})
