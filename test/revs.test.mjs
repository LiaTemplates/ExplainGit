import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const MERGE = ['git switch -c dev', 'git commit -m d', 'git switch master', 'git commit -m m', 'git merge dev']
const msg = (r, ref) => r.box.hv.getCommit(ref).message

test('HEAD^2 is the second parent', () => assert.equal(msg(run(MERGE), 'HEAD^2'), 'd'))
test('HEAD^1 is the first parent', () => assert.equal(msg(run(MERGE), 'HEAD^1'), 'm'))
test('HEAD^2~1 and HEAD~1^0', () => {
  const r = run(MERGE)
  assert.equal(r.box.hv.getCommit('HEAD^2~1').id, 'e137e9b'); assert.equal(msg(r, 'HEAD~1^0'), 'm')
})
test('@ is HEAD', () => assert.equal(run(['git commit -m x']).box.hv.getCommit('@').message, 'x'))
test('@{u} and <branch>@{upstream}', () => {
  const r = run(['git commit -m a', 'git push', 'git commit -m b'], { origin: true })
  assert.equal(msg(r, '@{u}'), 'a'); assert.equal(msg(r, 'master@{upstream}'), 'a')
})
test('stash@{0} still names the stash', () => assert.ok(run(['edit', 'git stash']).box.hv.getCommit('stash@{0}').stash))
test('rev-parse prints ids', () => {
  const r = run(['git commit -m a', 'git commit -m b', 'git rev-parse HEAD~1'])
  assert.equal(r.log.at(-1).text, r.box.hv.getCommit('HEAD~1').id)
  assert.equal(run(['git switch -c dev', 'git rev-parse --abbrev-ref HEAD']).log.at(-1).text, 'dev')
})
test('rev-parse of an unknown ref is an error', () => unchanged(['git commit'], 'git rev-parse nope'))
test('@{u} without upstream is an error', () => unchanged(['git commit'], 'git rev-parse @{u}'))
