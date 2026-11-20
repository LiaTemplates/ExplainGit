import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, viewInfo, unchanged } from './harness.mjs'

test('switch -c equals checkout -b', () => assert.ok(same(['git switch -c dev', 'git commit'], ['git checkout -b dev', 'git commit'])))
test('switch -c with start point', () => assert.equal(viewInfo(run(['git commit', 'git switch -c old HEAD^']).box.hv).refs.old, 'e137e9b'))
test('checkout -b with start point uses the name', () => {
  const v = viewInfo(run(['git commit', 'git checkout -b old HEAD^']).box.hv)
  assert.equal(v.refs.old, 'e137e9b'); assert.equal(v.branch, 'old')
})
test('switch to a commit needs --detach', () => {
  const { log, box } = run(['git commit', 'git switch HEAD^'])
  assert.equal(log.at(-1).kind, 'error'); assert.equal(box.hv.currentBranch, 'master')
})
test('switch --detach', () => assert.equal(run(['git commit', 'git switch --detach HEAD^']).box.hv.currentBranch, null))
test('checkout of a commit detaches', () => assert.equal(run(['git commit', 'git checkout HEAD^']).box.hv.currentBranch, null))
test('switch - goes back', () => assert.equal(run(['git switch -c dev', 'git switch master', 'git switch -']).box.hv.currentBranch, 'dev'))
test('checkout - goes back', () => assert.equal(run(['git switch -c dev', 'git checkout master', 'git checkout -']).box.hv.currentBranch, 'dev'))
test('switch -c onto an existing name is refused, -C moves it', () => {
  unchanged(['git branch dev'], 'git switch -c dev')
  const v = viewInfo(run(['git branch dev', 'git commit', 'git switch -C dev']).box.hv)
  assert.equal(v.refs.dev, v.refs.master); assert.equal(v.branch, 'dev')
})
test('rejects switch without argument', () => unchanged([], 'git switch'))
test('rejects switch - without previous branch', () => unchanged([], 'git switch -'))
