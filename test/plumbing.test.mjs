import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged, same } from './harness.mjs'
import { treeId } from '../src/files.js'

const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)
const out1 = (cmds, opts) => { const r = run(cmds, opts); return lines(r)[0] }
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)

// Pro Git, Git Objects: a commit by hand
const T1 = ['echo "version 1" > test.txt', 'git update-index --add test.txt']
test('write-tree, commit-tree, update-ref make a branch', () => {
  const tree = out1(T1.concat('git write-tree'))
  assert.equal(tree, treeId({ 'test.txt': ['version 1'] }))
  const base = T1.concat('git write-tree')
  const c1 = out1(base.concat(`git commit-tree ${tree} -p HEAD -m "first commit"`))
  assert.match(c1, /^[0-9a-f]{7}$/)
  const r = run(base.concat(`git commit-tree ${tree} -p HEAD -m "first commit"`, `git update-ref refs/heads/master ${c1}`, 'git log --oneline -1'))
  assert.deepEqual(errors(r), [])
  assert.equal(r.box.hv.getCommit('master').id, c1)
  assert.deepEqual(r.box.hv.getCommit('master').tree, { 'test.txt': ['version 1'] })
  assert.match(lines(r)[0], /first commit$/)
  // the same as git add + git commit for the quiz
  assert.ok(same(base.concat(`git commit-tree ${tree} -p HEAD -m x`, `git update-ref refs/heads/master ${c1}`), T1.concat('git commit -m first')))
})
test('commit-tree without -p is a new root; the commit stays unreachable until a ref points at it', () => {
  const tree = out1(T1.concat('git write-tree'))
  const r = run(T1.concat('git write-tree', `git commit-tree ${tree} -m root`))
  const id = lines(r)[0]
  assert.ok(!r.box.hv.reachable()[id])
  assert.deepEqual(run(T1.concat('git write-tree', `git commit-tree ${tree} -m root`, `git cat-file -p ${id}`)).log.slice(-4).map(l => l.text), [`tree ${tree}`, 'author you', '', 'root'])
})
test('symbolic-ref reads and sets HEAD without touching the files', () => {
  const B = ['echo a > f', 'git add f', 'git commit -m a', 'git branch dev', 'echo b > f', 'git commit -am b']
  assert.equal(out1(B.concat('git symbolic-ref HEAD')), 'refs/heads/master')
  const r = run(B.concat('git symbolic-ref HEAD refs/heads/dev', 'git status -s'))
  assert.equal(r.box.hv.currentBranch, 'dev')
  assert.deepEqual(r.box.hv.work, { f: ['b'] })
  assert.deepEqual(lines(r), ['M  f'])
  unchanged(B, 'git symbolic-ref HEAD refs/heads/nope')
  unchanged(B.concat('git switch --detach HEAD'), 'git symbolic-ref HEAD')
})
test('update-ref -d, show-ref', () => {
  const B = ['git commit -m a', 'git branch dev', 'git tag v1']
  const r = run(B.concat('git update-ref -d refs/heads/dev'))
  assert.equal(r.box.hv.getCommit('dev'), null)
  unchanged(B, 'git update-ref -d refs/heads/master')
  unchanged(B, 'git update-ref refs/heads/x nope')
  unchanged(B, 'git update-ref nope HEAD')
  const s = run(B.concat('git show-ref'))
  const id = s.box.hv.getCommit('HEAD').id
  assert.deepEqual(lines(s), [`${id} refs/heads/dev`, `${id} refs/heads/master`, `${id} refs/tags/v1`])
  assert.equal(run(B.concat('git update-ref refs/tags/v2 HEAD~')).box.hv.getCommit('[v2]').message, 'first commit')
})
test('count-objects: loose before gc, packed after; unreachable stays loose', () => {
  const F = ['echo a > f', 'git add f', 'git commit -m a']
  const v = cmds => Object.fromEntries(lines(run(cmds)).map(l => l.split(': ')))
  const before = v(F.concat('git count-objects -v'))
  assert.ok(Number(before.count) >= 3)
  assert.equal(before['in-pack'], '0')
  const after = v(F.concat('git gc', 'git count-objects -v'))
  assert.equal(after.count, '0')
  assert.equal(after.packs, '1')
  const tree = out1(F.concat('git write-tree'))
  const dangling = v(F.concat('git gc', 'echo z > z', 'git add z', 'git write-tree', `git commit-tree ${treeId({ f: ['a'], z: ['z'] })} -m d`, 'git count-objects -v'))
  assert.ok(Number(dangling.count) >= 2)
  assert.match(out1(F.concat('git count-objects')), /^\d+ objects, \d+ kilobytes$/)
})
