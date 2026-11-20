import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

// output of the last command only
const out = cmds => {
  const log = run(cmds).log
  const last = log.map(l => l.kind).lastIndexOf('cmd')
  return log.slice(last + 1).filter(l => l.kind !== 'cmd').map(l => l.text)
}
const A = ['echo a > f', 'git add f', 'git commit -m one']

test('git diff: working tree against index', () => assert.deepEqual(out(A.concat('echo b >> f', 'git diff')),
  ['diff --git a/f b/f', '--- a/f', '+++ b/f', '@@ -1,1 +1,2 @@', ' a', '+b']))
test('git diff is empty after add, --staged shows it', () => {
  assert.deepEqual(out(A.concat('echo b >> f', 'git add f', 'git diff')), [])
  assert.deepEqual(out(A.concat('echo b >> f', 'git add f', 'git diff --staged')), ['diff --git a/f b/f', '--- a/f', '+++ b/f', '@@ -1,1 +1,2 @@', ' a', '+b'])
  assert.deepEqual(out(A.concat('echo b >> f', 'git add f', 'git diff --cached')).length, 6)
})
test('git diff between commits', () => {
  const B = A.concat('echo b >> f', 'git commit -am two')
  assert.deepEqual(out(B.concat('git diff HEAD~1 HEAD')).slice(-2), [' a', '+b'])
  assert.deepEqual(out(B.concat('git diff HEAD~1..HEAD')).slice(-2), [' a', '+b'])
})
test('git diff a...b starts at the merge base', () => {
  const D = A.concat('git switch -c dev', 'echo d > d', 'git add d', 'git commit -m d', 'git switch master', 'echo m > m', 'git add m', 'git commit -m m')
  assert.deepEqual(out(D.concat('git diff master...dev'))[0], 'diff --git a/d b/d')
  assert.equal(out(D.concat('git diff master...dev')).filter(l => l.startsWith('diff')).length, 1)
  assert.equal(out(D.concat('git diff master dev')).filter(l => l.startsWith('diff')).length, 2)
})
test('git diff --stat', () => assert.deepEqual(out(A.concat('echo b >> f', 'git diff --stat')), [' f | 1 +', '1 file changed, 1 insertion(+)']))
test('git diff -- path', () => assert.deepEqual(out(A.concat('echo b >> f', 'echo x > g', 'git add g', 'echo y >> g', 'git diff -- g'))[0], 'diff --git a/g b/g'))
test('git show prints the commit and its diff', () => {
  const lines = out(A.concat('echo b >> f', 'git commit -am two', 'git show'))
  assert.match(lines[0], /^commit [0-9a-f]{7}$/)
  assert.equal(lines[1], 'Author: you')
  assert.equal(lines[2], '    two')
  assert.deepEqual(lines.slice(-2), [' a', '+b'])
})
test('git show of the first commit shows new files', () => assert.deepEqual(out(A.concat('git show HEAD')).slice(-3), ['+++ b/f', '@@ -0,0 +1,1 @@', '+a']))
test('git show of a merge names both parents', () =>
  assert.match(out(A.concat('git switch -c dev', 'echo d > d', 'git add d', 'git commit -m d', 'git switch master', 'echo m > m', 'git add m', 'git commit -m m', 'git merge dev', 'git show'))[1], /^Merge: [0-9a-f]{7} [0-9a-f]{7}$/))
test('diff lines are marked for colors and stay untranslated', () => {
  const { box } = run(A.concat('echo b >> f', 'git diff'))
  const lines = [...box.cb.log.node().querySelectorAll('.diff')]
  assert.deepEqual(lines.map(l => l.className.replace('diff ', '').replace(' notranslate', '')).slice(-3), ['diff-hunk', 'diff-ctx', 'diff-add'])
  assert.ok(lines.every(l => l.getAttribute('translate') === 'no'))
})
test('unknown refs are errors', () => { unchanged(A, 'git diff nope'); unchanged(A, 'git show nope') })
