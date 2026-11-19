import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo } from './harness.mjs'

test('slash names are local branches', () => {
  const { box } = run(['git switch -c feature/login', 'git commit'])
  assert.equal(box.hv.currentBranch, 'feature/login')
  assert.equal(box.hv.svg.selectAll('g.branch-tag.remote-branch').size(), 0)
  assert.notEqual(viewInfo(box.hv).refs['feature/login'], 'e137e9b')
})
test('origin/ names stay remote branches', () => {
  const { box } = run(['git commit'], { origin: true })
  assert.equal(box.hv.svg.selectAll('g.branch-tag.remote-branch').size(), 1)
})
test('branch with start point', () => assert.equal(viewInfo(run(['git commit', 'git branch old HEAD^']).box.hv).refs.old, 'e137e9b'))
test('branch -m renames the current branch', () => {
  const { box } = run(['git branch -m main'])
  assert.equal(box.hv.currentBranch, 'main'); assert.ok(!('master' in viewInfo(box.hv).refs))
})
test('branch -m old new renames another branch', () => {
  const r = viewInfo(run(['git branch dev', 'git branch -m dev feature']).box.hv).refs
  assert.ok('feature' in r); assert.ok(!('dev' in r))
})
test('branch -c copies', () => { const r = viewInfo(run(['git branch -c master copy']).box.hv).refs; assert.equal(r.copy, r.master) })
test('branch -f moves another branch', () => { const r = viewInfo(run(['git branch dev', 'git commit', 'git branch -f dev HEAD']).box.hv).refs; assert.equal(r.dev, r.master) })
test('branch -D deletes', () => assert.ok(!('dev' in viewInfo(run(['git branch dev', 'git branch -D dev']).box.hv).refs)))
test('rejects -m onto existing name without -M', () => assert.equal(run(['git branch dev', 'git branch -m dev']).log.at(-1).kind, 'error'))
test('-M overwrites', () => {
  const { box } = run(['git branch dev', 'git branch -M dev'])
  assert.equal(box.hv.currentBranch, 'dev'); assert.ok(!('master' in viewInfo(box.hv).refs))
})
test('rejects -f on the current branch', () => assert.equal(run(['git commit', 'git branch -f master HEAD^']).log.at(-1).kind, 'error'))
test('rename message names the old branch', () => assert.equal(run(['git branch -m main']).log.at(-1).text, 'Renamed master to main.'))
