import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo } from './harness.mjs'

test('stash saves changes and cleans', () => {
  const { box } = run(['edit', 'git stash'])
  const v = viewInfo(box.hv)
  assert.equal(v.status, 'clean'); assert.ok('stash@{0}' in v.refs)
  assert.equal(box.hv.getCommit('stash@{0}').parent, 'e137e9b')
  assert.equal(box.hv.svg.selectAll('circle.stash').size(), 1)
  assert.equal(box.hv.svg.selectAll('g.stash-tag').size(), 1)
})
test('stash push -m works like stash', () => assert.ok('stash@{0}' in viewInfo(run(['edit', 'git stash push -m wip']).box.hv).refs))
test('pop restores and removes', () => {
  const v = viewInfo(run(['edit', 'git stash', 'git stash pop']).box.hv)
  assert.equal(v.status, 'unstaged'); assert.ok(!('stash@{0}' in v.refs))
})
test('apply keeps the stash', () => assert.ok('stash@{0}' in viewInfo(run(['edit', 'git stash', 'git stash apply']).box.hv).refs))
test('stack renumbers', () => {
  const { box } = run(['edit', 'git stash', 'git commit', 'edit', 'git stash'])
  assert.ok('stash@{1}' in viewInfo(box.hv).refs)
  assert.equal(box.hv.getCommit('stash@{1}').parent, 'e137e9b')
})
test('drop removes one entry', () => {
  const r = viewInfo(run(['edit', 'git stash', 'edit', 'git stash', 'git stash drop']).box.hv).refs
  assert.ok('stash@{0}' in r); assert.ok(!('stash@{1}' in r))
})
test('list names the entries', () => assert.equal(run(['edit', 'git stash', 'git stash list']).log.at(-1).text, 'stash@{0}: WIP on master'))
test('a stash is not a branch', () => assert.equal(run(['edit', 'git stash', 'git switch stash@{0}']).log.at(-1).kind, 'error'))
test('stash on a clean tree only informs', () => {
  const { log, box } = run(['git stash'])
  assert.equal(log.at(-1).kind, 'info'); assert.ok(!('stash@{0}' in viewInfo(box.hv).refs))
})
test('rejects pop without stash', () => assert.equal(run(['git stash pop']).log.at(-1).kind, 'error'))

test('quiz feedback names a missing stash as stash', async () => {
  const { compare, snapshot } = await import('./harness.mjs')
  const msg = compare(run(['git commit']).state, run(['git commit', 'edit', 'git stash']).state).join(' ').replace(/[⁨⁩]/g, '')
  assert.equal(msg, 'stash@{0} is missing.')
})
