import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const O = { origin: true }
const SF = ['@origin git switch -c serverfix', '@origin git commit -m fix', '@origin git switch master']
const id = (hv, ref) => hv.getCommit(ref).id

test('fetch brings new remote branches', () => {
  const r = run(SF.concat('git fetch'), O)
  assert.equal(id(r.box.hv, 'origin/serverfix'), id(r.box.ov, 'serverfix'))
})
for (const cmd of ['git switch serverfix', 'git checkout serverfix', 'git checkout --track origin/serverfix'])
  test(`${cmd} creates a tracking branch`, () => {
    const r = run(SF.concat('git fetch', cmd), O)
    assert.equal(r.box.hv.currentBranch, 'serverfix')
    assert.equal(id(r.box.hv, 'serverfix'), id(r.box.ov, 'serverfix'))
    assert.equal(r.box.hv.upstream.serverfix, 'origin/serverfix')
  })
test('checkout -b / switch -c from a remote branch set the upstream', () => {
  assert.equal(run(SF.concat('git fetch', 'git checkout -b sf origin/serverfix'), O).box.hv.upstream.sf, 'origin/serverfix')
  assert.equal(run(SF.concat('git fetch', 'git switch -c sf origin/serverfix'), O).box.hv.upstream.sf, 'origin/serverfix')
  assert.equal(run(['git switch -c sf'], O).box.hv.upstream.sf, undefined)
})
test('switch to a name no remote has is still an error', () => unchanged(SF.concat('git fetch'), 'git switch nothing', O))
test('fetch with a refspec writes to the destination', () => {
  const r = run(['@origin git commit -m o', 'git fetch origin master:refs/remotes/origin/mymaster'], O)
  assert.equal(id(r.box.hv, 'origin/mymaster'), id(r.box.ov, 'master'))
  assert.notEqual(id(r.box.hv, 'origin/master'), id(r.box.ov, 'master'))
})
test('fetch <remote> <branch> fetches only that branch', () => {
  const r = run(SF.concat('@origin git commit -m o', 'git fetch origin master'), O)
  assert.equal(id(r.box.hv, 'origin/master'), id(r.box.ov, 'master'))
  assert.equal(r.box.hv.getCommit('origin/serverfix'), null)
})
test('push with a refspec to another name', () => {
  const r = run(['git switch -c serverfix', 'git commit -m s', 'git push origin serverfix:awesomebranch'], O)
  assert.equal(id(r.box.ov, 'awesomebranch'), id(r.box.hv, 'serverfix'))
  assert.equal(id(r.box.hv, 'origin/awesomebranch'), id(r.box.hv, 'serverfix'))
})
test('push +src:dst forces', () => {
  const A = ['git switch -c dev', 'git commit -m a', 'git push origin dev', 'git reset --hard HEAD~', 'git commit -m b']
  unchanged(A, 'git push origin dev:dev', O)
  const r = run(A.concat('git push origin +dev:dev'), O)
  assert.equal(id(r.box.ov, 'dev'), id(r.box.hv, 'dev'))
})
test('fetch --all over two remotes', () => {
  const r = run(['git remote add up ../up.git', '@up git commit -m u', '@origin git commit -m o', 'git fetch --all'], { origin: true, world: ['up'] })
  assert.equal(id(r.box.hv, 'up/master'), id(r.box.world.up, 'master'))
  assert.equal(id(r.box.hv, 'origin/master'), id(r.box.ov, 'master'))
})
test('pull <remote> <branch>', () => {
  const r = run(['git remote add up ../up.git', '@up git commit -m u', 'git pull up master'], { origin: true, world: ['up'] })
  assert.equal(id(r.box.hv, 'master'), id(r.box.world.up, 'master'))
})
