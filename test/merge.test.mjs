import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same } from './harness.mjs'

const BRANCH = ['git switch -c dev', 'git commit', 'git commit', 'git switch master']

test('squash makes one commit with one parent', () => {
  const { box } = run(BRANCH.concat('git merge --squash dev', 'git commit -m all'))
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.parent2, undefined); assert.ok(head.squashOf); assert.equal(head.parent, 'e137e9b')
  assert.equal(box.hv.svg.selectAll('circle.squashed').size(), 1)
})
test('squash alone makes no commit', () => assert.equal(run(BRANCH.concat('git merge --squash dev')).box.hv.getCommit('HEAD').id, 'e137e9b'))
test('only the next commit is squashed', () => {
  const { box } = run(BRANCH.concat('git merge --squash dev', 'git commit', 'git commit'))
  assert.equal(box.hv.getCommit('HEAD').squashOf, undefined)
})
test('ff-only refuses a real merge', () => {
  const { log, box } = run(['git switch -c dev', 'git commit', 'git switch master', 'git commit', 'git merge --ff-only dev'])
  assert.equal(log.at(-1).kind, 'error'); assert.equal(box.hv.getCommit('HEAD').parent2, undefined)
})
test('ff-only fast-forwards', () => assert.ok(same(
  ['git switch -c dev', 'git commit', 'git switch master', 'git merge --ff-only dev'],
  ['git switch -c dev', 'git commit', 'git switch master', 'git merge dev'])))
test('rejects squash of an unknown branch', () => assert.equal(run(['git merge --squash nope']).log.at(-1).kind, 'error'))
