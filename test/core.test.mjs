import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, graph, viewInfo } from './harness.mjs'

const SETUP = ['git checkout -b dev', 'git commit', 'git checkout master', 'git commit', 'git checkout dev']

test('quiz from 0.1.0 still accepted', () => {
  assert.ok(same(
    ['git commit', 'git checkout -b feature', 'git commit', 'git commit', 'git checkout master', 'git merge --no-ff feature'],
    ['git commit', 'git branch feature', 'git checkout feature', 'git commit', 'git commit', 'git checkout master', 'git merge --no-ff feature']))
})

test('rebase is not a merge', () => assert.ok(!same(SETUP.concat('git rebase master'), SETUP.concat('git merge master'))))

test('merge --no-ff with one commit on the branch', () => {
  const { log, box } = run(['git checkout -b dev', 'git commit', 'git checkout master', 'git merge --no-ff dev'])
  assert.deepEqual(log.filter(l => l.kind === 'error'), [])
  assert.notEqual(graph(box).at(-1)[2], null) // merge commit has parent2
})

test('pull applies at once', () => {
  const { box } = run(['git commit', 'git push', 'git reset HEAD^', 'git pull'], { origin: true })
  assert.equal(viewInfo(box.hv).refs.master, viewInfo(box.ov).refs.master)
})

test('pushed commits keep their message', () => {
  const { box } = run(['git commit -m hello', 'git push'], { origin: true })
  assert.ok(box.ov.commitData.some(c => c.message === 'hello'))
})

test('refs with ^ and ~N', () => {
  const { box } = run(['git commit -m a', 'git commit -m b', 'git commit -m c', 'git branch dev'])
  assert.equal(box.hv.getCommit('dev^').message, 'b')
  assert.equal(box.hv.getCommit('HEAD~2').message, 'a')
  assert.equal(box.hv.getCommit('master~1^').message, 'a')
  assert.equal(box.hv.getCommit('HEAD^^').message, 'a')
})

test('commit ids look like hashes, not a counter', () => {
  const ids = run(['git commit', 'git commit', 'git commit', 'git commit', 'git commit']).box.hv.commitData.slice(1).map(c => c.id)
  assert.equal(new Set(ids.map(id => id.slice(1, 4))).size, ids.length)
})

test('internal methods are not git commands', () => {
  for (const cmd of ['git destroy', 'git render', 'git command x', 'git _changeBranch master', 'git init']) {
    const { log, box } = run([cmd, 'git commit'])
    assert.equal(log.find(l => l.kind === 'error')?.text, "I don't understand that.", cmd)
    assert.notEqual(box.hv.getCommit('HEAD').id, 'e137e9b', cmd)
  }
})
