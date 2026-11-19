import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same } from './harness.mjs'

test('amend replaces HEAD', () => {
  const { box } = run(['git commit -m one', 'git commit --amend -m two'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'two'); assert.equal(head.parent, 'e137e9b')
  assert.ok(box.hv.commitData.find(c => c.message === 'one').branchless)
})
test('amend without -m keeps the message', () => assert.equal(run(['git commit -m one', 'git commit --amend']).box.hv.getCommit('HEAD').message, 'one'))
test('amend keeps the parents of a merge', () => {
  const { box } = run(['git switch -c dev', 'git commit', 'git switch master', 'git commit', 'git merge dev', 'git commit --amend -m merged'])
  assert.ok(box.hv.getCommit('HEAD').parent2)
})
test('-am and --allow-empty are commits', () => assert.ok(same(['git commit -am x', 'git commit --allow-empty'], ['git commit', 'git commit'])))
test('-a -m "two words" keeps the message', () => assert.equal(run(['git commit -a -m "two words"']).box.hv.getCommit('HEAD').message, 'two words'))
test('rejects amend on the first commit', () => assert.equal(run(['git commit --amend']).log.at(-1).kind, 'error'))
