import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from './harness.mjs'

const id = (hv, ref) => hv.getCommit(ref) && hv.getCommit(ref).id
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)

test('integration manager: fork, upstream, rebase, force push, maintainer pulls', () => {
  const r = run([
    'git remote add upstream https://github.com/project/upstream',
    'git switch -c topic', 'git commit -m feature', 'git push -u origin topic',
    '@upstream git commit -m "maintainer moves on"',
    'git fetch upstream', 'git rebase upstream/master', 'git push -f origin topic',
    '@upstream git remote add fork ../origin.git', '@upstream git fetch fork', '@upstream git merge fork/topic'
  ], { origin: true, world: ['upstream'] })
  assert.deepEqual(errors(r), [])
  const up = r.box.world.upstream
  assert.equal(id(up, 'master'), id(r.box.hv, 'topic'))
  assert.equal(up.getCommit('master').message, 'feature')
  assert.equal(up.getCommit('master~').message, 'maintainer moves on')
  assert.equal(id(up, 'fork/topic'), id(r.box.ov, 'topic'))
  assert.equal(up.isRemoteRef('fork/topic'), true)
  assert.equal(up.isLocalBranch('fork/topic'), false)
})
test('dictator and lieutenants', () => {
  const r = run([
    'git remote add lt ../lt.git', 'git remote add blessed ../blessed.git',
    'git switch -c work', 'git commit -m dev', 'git push lt work:master',
    '@dictator git remote add lt ../lt.git', '@dictator git remote add blessed ../blessed.git',
    '@dictator git pull lt master', '@dictator git push blessed master',
    'git switch master', 'git pull blessed master'
  ], { world: ['blessed', 'lt', 'dictator'] })
  assert.deepEqual(errors(r), [])
  assert.equal(id(r.box.world.blessed, 'master'), id(r.box.hv, 'work'))
  assert.equal(id(r.box.hv, 'master'), id(r.box.hv, 'work'))
})
test('squash a feature into featureBv2 and push it to a fork', () => {
  const r = run([
    'git remote add myfork ../myfork.git',
    'git switch -c featureB', 'echo b > b', 'git add b', 'git commit -m b1', 'echo bb >> b', 'git commit -am b2',
    'git push -u myfork featureB',
    '@origin git commit -m "upstream work"', 'git fetch origin',
    'git switch -c featureBv2 origin/master', 'git merge --squash featureB', 'git commit -m featureBv2',
    'git push myfork featureBv2'
  ], { origin: true, world: ['myfork'] })
  assert.deepEqual(errors(r), [])
  const fork = r.box.world.myfork
  assert.equal(fork.getCommit('featureBv2').message, 'featureBv2')
  assert.equal(fork.getCommit('featureBv2~').message, 'upstream work')
  assert.deepEqual(fork.getCommit('featureBv2').tree, { b: ['b', 'bb'] })
})
