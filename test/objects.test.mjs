import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'
import { blobId, treeId } from '../src/files.js'

const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)
const F = ['echo "version 1" > test.txt', 'echo hi > b.txt', 'git add .', 'git commit -m first', 'echo "version 2" > test.txt', 'git commit -am second']

test('tree ids depend only on the content', () => {
  assert.equal(treeId({ a: ['x'], b: ['y'] }), treeId({ b: ['y'], a: ['x'] }))
  assert.notEqual(treeId({ a: ['x'] }), treeId({ a: ['y'] }))
  assert.match(treeId({}), /^[0-9a-f]{7}$/)
})
test('cat-file -t names the type', () => {
  assert.deepEqual(lines(run(F.concat('git cat-file -t HEAD'))), ['commit'])
  assert.deepEqual(lines(run(F.concat('git cat-file -t HEAD^{tree}'))), ['tree'])
  assert.deepEqual(lines(run(F.concat('git cat-file -t HEAD:test.txt'))), ['blob'])
  assert.deepEqual(lines(run(F.concat(`git cat-file -t ${blobId(['version 1'])}`))), ['blob'])
})
test('cat-file -p of a commit, a tree and a blob', () => {
  const r = run(F.concat('git cat-file -p HEAD'))
  const hv = r.box.hv, head = hv.getCommit('HEAD')
  assert.deepEqual(lines(r), [`tree ${treeId(head.tree)}`, `parent ${head.parent}`, 'author you', '', 'second'])
  const t = run(F.concat('git cat-file -p HEAD^{tree}'))
  assert.deepEqual(lines(t), [`100644 blob ${blobId(['hi'])}\tb.txt`, `100644 blob ${blobId(['version 2'])}\ttest.txt`])
  assert.deepEqual(lines(run(F.concat(`git cat-file -p ${treeId(head.tree)}`))), lines(t))
  assert.deepEqual(lines(run(F.concat('git ls-tree HEAD'))), lines(t))
  assert.deepEqual(lines(run(F.concat(`git cat-file -p ${blobId(['version 1'])}`))), ['version 1'])
  assert.deepEqual(lines(run(F.concat('git cat-file -s HEAD:test.txt'))), ['10'])
})
test('hash-object, -w and ls-files -s', () => {
  const id = blobId(['new'])
  assert.deepEqual(lines(run(F.concat('echo new > n', 'git hash-object n'))), [id])
  unchanged(F.concat('echo new > n', 'git hash-object n'), `git cat-file -p ${id}`)
  assert.deepEqual(lines(run(F.concat('echo new > n', 'git hash-object -w n', `git cat-file -p ${id}`))), ['new'])
  assert.deepEqual(lines(run(F.concat('git ls-files -s'))), [`100644 ${blobId(['hi'])} 0\tb.txt`, `100644 ${blobId(['version 2'])} 0\ttest.txt`])
  assert.deepEqual(lines(run(F.concat('git ls-files'))), ['b.txt', 'test.txt'])
})
test('update-index --add works like add', () => {
  const r = run(F.concat('echo z > z', 'git update-index --add z'))
  assert.deepEqual(r.box.hv.index.z, ['z'])
  unchanged(F.concat('echo z > z'), 'git update-index z')
})
test('errors change nothing', () => {
  unchanged(F, 'git cat-file -p 1234567')
  unchanged(F, 'git cat-file -t')
  unchanged(F, 'git hash-object nope')
  unchanged(F, 'git ls-tree nope')
  unchanged(F, 'git cat-file -p HEAD:nope')
})
test('tooltip and files table show tree ids', () => {
  const r = run(F)
  const hv = r.box.hv, head = hv.getCommit('HEAD')
  assert.match(hv.svg.select('#' + hv.name + '-' + head.id + ' title').text(), new RegExp('tree ' + treeId(head.tree)))
  assert.match(r.box.filesPanel.tFoot.textContent, new RegExp(treeId(head.tree)))
})
