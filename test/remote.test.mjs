import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo } from './harness.mjs'

const O = { origin: true }
const refs = (r, view = 'hv') => viewInfo(r.box[view]).refs

test('push updates origin/<branch> locally', () => {
  const r = run(['git commit', 'git push'], O)
  assert.equal(refs(r)['origin/master'], refs(r).master); assert.equal(refs(r, 'ov').master, refs(r).master)
})
test('push -u creates a remote branch', () => {
  const r = run(['git switch -c dev', 'git commit', 'git push -u origin dev'], O)
  assert.equal(refs(r, 'ov').dev, refs(r).dev); assert.equal(refs(r)['origin/dev'], refs(r).dev)
  assert.equal(r.box.hv.upstream.dev, 'origin/dev')
})
test('pull follows the upstream set by push -u', () => {
  const r = run(['git switch -c dev', 'git commit', 'git push -u origin dev', 'git reset --hard HEAD^', 'git pull'], O)
  assert.equal(refs(r).dev, refs(r, 'ov').dev)
})
test('force-with-lease overwrites after amend', () => {
  const r = run(['git commit -m a', 'git push', 'git commit --amend -m b', 'git push --force-with-lease'], O)
  assert.notEqual(r.log.at(-1).kind, 'error'); assert.equal(refs(r, 'ov').master, refs(r).master)
})
test('plain push after amend is rejected', () => assert.equal(run(['git commit -m a', 'git push', 'git commit --amend -m b', 'git push'], O).log.at(-1).kind, 'error'))
test('push --delete removes the remote branch', () => {
  const r = run(['git switch -c dev', 'git push -u origin dev', 'git push origin --delete dev'], O)
  assert.ok(!('dev' in refs(r, 'ov'))); assert.ok(!('origin/dev' in refs(r)))
})
test('fetch --prune drops tracking refs without remote branch', () => {
  const r = run(['git switch -c dev', 'git push -u origin dev'], O)
  r.box.ov.deleteBranch('dev') // as if someone else deleted it
  r.box.run('git fetch --prune')
  assert.ok(!('origin/dev' in viewInfo(r.box.hv).refs))
})
test('branch -u sets the upstream', () => {
  const r = run(['git switch -c dev', 'git push -u origin dev', 'git switch -c dev2', 'git branch -u origin/dev'], O)
  assert.equal(r.box.hv.upstream.dev2, 'origin/dev')
})
test('pull --ff-only refuses divergence', () => assert.equal(
  run(['git commit -m a', 'git push', 'git reset --hard HEAD^', 'git commit -m b', 'git pull --ff-only'], O).log.at(-1).kind, 'error'))
test('rejects branch -u with unknown upstream', () => assert.equal(run(['git branch -u origin/nope'], O).log.at(-1).kind, 'error'))
