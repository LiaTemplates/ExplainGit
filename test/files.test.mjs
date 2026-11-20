import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blobId, diffLines, merge3, mergeTrees, formatDiff, changedPaths, diffStat } from '../src/files.js'

const L = { ours: 'HEAD', theirs: 'dev' }

test('diff of one changed line', () => assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']),
  [{ op: ' ', line: 'a' }, { op: '-', line: 'b' }, { op: '+', line: 'x' }, { op: ' ', line: 'c' }]))
test('diff of added and removed lines', () => {
  assert.deepEqual(diffLines([], ['x']), [{ op: '+', line: 'x' }])
  assert.deepEqual(diffLines(['x'], []), [{ op: '-', line: 'x' }])
})
test('merge3 takes both sides when they touch different lines', () =>
  assert.deepEqual(merge3(['a', 'b', 'c'], ['A', 'b', 'c'], ['a', 'b', 'C'], L, 'merge'), { lines: ['A', 'b', 'C'], conflict: false }))
test('merge3 marks a conflict', () => assert.deepEqual(merge3(['a'], ['b'], ['c'], L, 'merge'),
  { lines: ['<<<<<<< HEAD', 'b', '=======', 'c', '>>>>>>> dev'], conflict: true }))
test('diff3 style shows the base', () => assert.deepEqual(merge3(['a'], ['b'], ['c'], L, 'diff3').lines,
  ['<<<<<<< HEAD', 'b', '||||||| base', 'a', '=======', 'c', '>>>>>>> dev']))
test('same change on both sides is no conflict', () => assert.deepEqual(merge3(['a'], ['b'], ['b'], L, 'merge'), { lines: ['b'], conflict: false }))
test('lines added at the end by one side', () => assert.deepEqual(merge3(['a'], ['a', 'x'], ['a'], L, 'merge'), { lines: ['a', 'x'], conflict: false }))
test('mergeTrees: added on one side, deleted vs modified', () => {
  const r = mergeTrees({ f: ['x'] }, { f: ['y'], g: ['n'] }, {}, L, 'merge')
  assert.deepEqual(r.conflicts, ['f']); assert.deepEqual(r.tree.g, ['n']); assert.deepEqual(r.tree.f, ['y'])
  assert.deepEqual(r.unmerged.f, { base: ['x'], ours: ['y'], theirs: undefined })
})
test('mergeTrees: deletion on one side wins over an unchanged file', () => assert.deepEqual(mergeTrees({ f: ['x'] }, { f: ['x'] }, {}, L, 'merge').tree, {}))
test('formatDiff of a new file', () => assert.deepEqual(formatDiff('f', undefined, ['x']),
  ['diff --git a/f b/f', 'new file', '--- /dev/null', '+++ b/f', '@@ -0,0 +1,1 @@', '+x']))
test('formatDiff of a changed file', () => assert.deepEqual(formatDiff('f', ['a'], ['a', 'b']),
  ['diff --git a/f b/f', '--- a/f', '+++ b/f', '@@ -1,1 +1,2 @@', ' a', '+b']))
test('formatDiff of an unchanged file is empty', () => assert.deepEqual(formatDiff('f', ['a'], ['a']), []))
test('changedPaths and diffStat', () => {
  assert.deepEqual(changedPaths({ a: ['1'], b: ['2'] }, { a: ['1'], b: ['3'], c: ['4'] }), ['b', 'c'])
  assert.deepEqual(diffStat({ f: ['a'] }, { f: ['a', 'b'], g: ['x'] }), { files: [{ path: 'f', plus: 1, minus: 0 }, { path: 'g', plus: 1, minus: 0 }], plus: 2, minus: 0 })
})
test('blobId is stable and content based', () => {
  assert.equal(blobId(['a']), blobId(['a'])); assert.notEqual(blobId(['a']), blobId(['b'])); assert.match(blobId([]), /^[0-9a-f]{7}$/)
})
