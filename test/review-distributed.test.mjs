import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const id = (hv, ref) => hv.getCommit(ref) && hv.getCommit(ref).id
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)

test('pull without arguments fetches from the remote of the upstream', () => {
  const r = run(['git remote add upstream https://x/upstream', '@upstream git commit -m u1', 'git fetch upstream',
    'git switch -c topic upstream/master', '@upstream git commit -m u2', 'git pull'], { origin: true, world: ['upstream'] })
  assert.equal(id(r.box.hv, 'topic'), id(r.box.world.upstream, 'master'))
})
test('push without arguments goes to the remote of the upstream', () => {
  const r = run(['git remote add myfork ../myfork.git', 'git switch -c featureA', 'git commit -m a', 'git push -u myfork featureA',
    'git commit -m b', 'git push'], { origin: true, world: ['myfork'] })
  assert.deepEqual(errors(r), [])
  assert.equal(id(r.box.world.myfork, 'featureA'), id(r.box.hv, 'featureA'))
  assert.equal(r.box.ov.getCommit('featureA'), null)
})
test('pull and push keep working after remote rename origin', () => {
  const r = run(['git commit -m a', 'git remote rename origin foo', 'git push', '@origin git commit -m o', 'git pull'], { origin: true })
  assert.deepEqual(errors(r), [])
  assert.equal(id(r.box.hv, 'master'), id(r.box.ov, 'master'))
  assert.equal(r.box.hv.upstream.master, 'foo/master')
})
test('branch.<b>.rebase of another repository does not change the local pull', () => {
  const r = run(['@origin git config branch.master.rebase true', 'git commit -m mine', '@origin git commit -m theirs', 'git pull'], { origin: true })
  assert.ok(r.box.hv.getCommit('HEAD').parent2)
  const l = run(['git config branch.master.rebase true', 'git commit -m mine', '@origin git commit -m theirs', 'git pull'], { origin: true })
  assert.ok(!l.box.hv.getCommit('HEAD').parent2)
})
test('remote add origin without create origin: switch guesses the branch', () => {
  const r = run(['git remote add origin https://x/srv.git', '@srv git switch -c dev', '@srv git commit -m x', 'git fetch', 'git switch dev'], { world: ['srv'] })
  assert.deepEqual(errors(r), [])
  assert.equal(r.box.hv.upstream.dev, 'origin/dev')
  assert.deepEqual(r.box.hv.remotes, ['origin'])
})
test('removing one of two remotes on the same repository keeps its pane', () => {
  const r = run(['git remote add a ../srv', 'git remote add b ../srv', 'git remote remove a', 'git commit -m x', 'git push b'], { world: ['srv'] })
  assert.deepEqual(errors(r), [])
  assert.equal(id(r.box.hv, 'b/master'), id(r.box.world.srv, 'master'))
  assert.ok(r.box.world.srv.svg)
})
