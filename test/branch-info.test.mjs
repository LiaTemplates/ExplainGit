import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const out = (cmds, opts) => {
  const r = run(cmds, opts)
  const last = r.log.map(l => l.kind).lastIndexOf('cmd')
  return { r, lines: r.log.slice(last + 1).map(l => l.text) }
}
const id = (r, ref) => r.box.hv.getCommit(ref).id
const O = { origin: true }

test('branch lists branches with a star', () => assert.deepEqual(out(['git branch dev', 'git branch']).lines, ['  dev', '* master']))
test('branch -v', () => {
  const { r, lines } = out(['git commit -m a', 'git branch dev', 'git commit -m b', 'git branch -v'])
  assert.deepEqual(lines, [`  dev    ${id(r, 'dev')} a`, `* master ${id(r, 'master')} b`])
})
test('branch -vv shows ahead and behind', () => {
  const { r, lines } = out(['git commit -m a', 'git push', 'git commit -m b', 'git commit -m c', 'git branch -vv'], O)
  assert.deepEqual(lines, [`* master ${id(r, 'master')} [origin/master: ahead 2] c`])
  const both = out(['git commit -m a', 'git push', 'git commit -m o', 'git push', 'git reset --hard HEAD~', 'git commit -m l', 'git fetch', 'git branch -vv'], O)
  assert.match(both.lines[0], /\[origin\/master: ahead 1, behind 1\]/)
})
test('--merged and --no-merged', () => {
  const B = ['git commit -m a', 'git branch old', 'git switch -c dev', 'git commit -m d', 'git switch master']
  assert.deepEqual(out(B.concat('git branch --merged')).lines, ['* master', '  old'])
  assert.deepEqual(out(B.concat('git branch --no-merged')).lines, ['  dev'])
})
test('-a and -r', () => {
  assert.deepEqual(out(['git commit', 'git push', 'git branch -a'], O).lines, ['* master', '  remotes/origin/master'])
  assert.deepEqual(out(['git commit', 'git push', 'git branch -r'], O).lines, ['  origin/master'])
})
