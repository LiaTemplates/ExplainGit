import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const files = r => viewInfo(r.box.hv).files
const refs = r => viewInfo(r.box.hv).refs
const A = ['echo a > f', 'echo x > g', 'git add .', 'git commit -m a']

test('stash saves the changes and cleans the working tree', () => {
  const r = run(A.concat('echo b >> f', 'git stash'))
  assert.deepEqual(files(r).work, { f: ['a'], g: ['x'] }); assert.ok('stash@{0}' in refs(r))
  assert.deepEqual(r.box.hv.getCommit('stash@{0}').tree.f, ['a', 'b'])
})
test('pop brings the changes back as unstaged', () => {
  const r = run(A.concat('echo b >> f', 'git add f', 'git stash', 'git stash pop'))
  assert.deepEqual(files(r).work.f, ['a', 'b']); assert.deepEqual(files(r).index.f, ['a']); assert.ok(!('stash@{0}' in refs(r)))
})
test('apply --index restores the index too', () => {
  const r = run(A.concat('echo b >> f', 'git add f', 'git stash', 'git stash apply --index'))
  assert.deepEqual(files(r).index.f, ['a', 'b'])
})
test('untracked files stay unless -u', () => {
  assert.equal(run(A.concat('echo u > u', 'git stash')).log.at(-1).text, 'No local changes to save.')
  const r = run(A.concat('echo u > u', 'git stash -u'))
  assert.equal(files(r).work.u, undefined); r.box.run('git stash pop'); assert.deepEqual(r.box.hv.work.u, ['u']); assert.equal(r.box.hv.index.u, undefined)
})
test('--keep-index leaves the staged change', () => {
  const r = run(A.concat('echo b >> f', 'git add f', 'echo y >> g', 'git stash --keep-index'))
  assert.deepEqual([files(r).index.f, files(r).work.f, files(r).work.g], [['a', 'b'], ['a', 'b'], ['x']])
})
test('pop with a conflict keeps the stash', () => {
  const r = run(A.concat('echo b >> f', 'git stash', 'echo c >> f', 'git commit -am c', 'git stash pop'))
  assert.equal(viewInfo(r.box.hv).status, 'conflict'); assert.ok('stash@{0}' in refs(r))
})
test('stash branch creates a branch at the stash base and pops', () => {
  const r = run(A.concat('echo b >> f', 'git stash', 'echo c > g', 'git commit -am c', 'git stash branch fix'))
  assert.equal(r.box.hv.currentBranch, 'fix'); assert.deepEqual(files(r).work, { f: ['a', 'b'], g: ['x'] }); assert.ok(!('stash@{0}' in refs(r)))
})
test('apply refuses local changes in the same file', () => unchanged(A.concat('echo b >> f', 'git stash', 'echo local >> f'), 'git stash apply'))
test('legacy stash without files is unchanged', () => assert.ok('stash@{0}' in viewInfo(run(['edit', 'git stash']).box.hv).refs))
