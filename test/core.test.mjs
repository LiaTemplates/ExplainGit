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
