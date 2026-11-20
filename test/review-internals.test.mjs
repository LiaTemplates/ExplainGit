import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'
import { blobId } from '../src/files.js'

const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)
const A = ['echo a > f', 'git add f', 'git commit -m a']

test('update-ref -d of a branch in another worktree is refused', () =>
  unchanged(A.concat('git branch dev', 'git worktree add ../wt dev'), 'git update-ref -d refs/heads/dev'))
test('update-ref of a new branch keeps refs with a similar name', () => {
  const r = run(A.concat('git tag v1', 'echo b > f', 'git commit -am b', 'git update-ref refs/heads/v1 HEAD'))
  assert.ok(r.box.hv.getCommit('[v1]'))
  assert.equal(r.box.hv.getCommit('[v1]').message, 'a')
  const id = run(A).box.hv.getCommit('HEAD').id
  const s = run(A.concat('echo b > f', 'git commit -am b', `git branch dev ${id}`, `git update-ref refs/heads/${id} HEAD`))
  assert.equal(s.box.hv.getCommit('dev').id, id)
})
test('.gitignore path patterns: * stays in its folder, **/ matches no folder too', () => {
  const r = run(A.concat('echo "doc/*.txt" > .gitignore', 'echo "doc/**/*.pdf" >> .gitignore',
    'echo n > doc/notes.txt', 'echo s > doc/server/arch.txt', 'echo p > doc/a.pdf', 'echo q > doc/x/y.pdf', 'git status -s'))
  assert.deepEqual(lines(r), ['?? .gitignore', '?? doc/server/arch.txt'])
})
test('prune drops written objects nothing reaches', () => {
  const v = cmds => Object.fromEntries(lines(run(cmds)).map(l => l.split(': ')))
  assert.equal(v(A.concat('echo z > z', 'git hash-object -w z', 'git gc --prune=now', 'git count-objects -v')).count, '0')
  assert.equal(run(A.concat('echo z > z', 'git hash-object -w z', 'git prune')).box.hv.findObject(blobId(['z'])), null)
  assert.ok(run(A.concat('echo z > z', 'git hash-object -w z')).box.hv.findObject(blobId(['z'])))
  // still reachable through the index: stays
  const kept = run(A.concat('echo z > z', 'git add z', 'git write-tree', 'git prune', 'git cat-file -t ' + run(A.concat('echo z > z', 'git add z', 'git write-tree')).log.at(-1).text))
  assert.deepEqual(errors(kept), [])
})
