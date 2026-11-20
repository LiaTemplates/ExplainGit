import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

test('cherry-pick copies onto HEAD', () => {
  const { box } = run(['git switch -c dev', 'git commit -m fix', 'git switch master', 'git cherry-pick dev'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'fix'); assert.equal(head.parent, 'e137e9b')
  assert.equal(head.cherryPickedFrom, viewInfo(box.hv).refs.dev)
  assert.equal(box.hv.svg.selectAll('circle.cherry-picked').size(), 1)
})
test('several refs in order', () => {
  const { box } = run(['git switch -c dev', 'git commit -m a', 'git commit -m b', 'git switch master', 'git cherry-pick dev^ dev'])
  const head = box.hv.getCommit('HEAD')
  assert.equal(head.message, 'b'); assert.equal(box.hv.getCommit(head.parent).message, 'a')
})
test('the log names both commits', () => {
  const { log, box } = run(['git switch -c dev', 'git commit -m fix', 'git switch master', 'git cherry-pick dev'])
  assert.equal(log.at(-1).text, `Copied ${viewInfo(box.hv).refs.dev} as ${box.hv.getCommit('HEAD').id}.`)
})
test('rejects unknown ref', () => unchanged([], 'git cherry-pick nope'))
test('rejects a commit already in HEAD', () => unchanged(['git commit'], 'git cherry-pick HEAD'))
test('rejects cherry-pick without ref', () => unchanged([], 'git cherry-pick'))
