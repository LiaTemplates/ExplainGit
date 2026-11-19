import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, viewInfo } from './harness.mjs'

const wt = r => viewInfo(r.box.hv).worktrees

test('one worktree by default', () => assert.deepEqual(wt(run([])), [['.', 'master', 'e137e9b']]))
test('worktree add with -b', () => assert.deepEqual(wt(run(['git worktree add -b dev ../wt'])), [['.', 'master', 'e137e9b'], ['../wt', 'dev', 'e137e9b']]))
test('worktree add <path> <branch>', () => assert.deepEqual(wt(run(['git branch dev', 'git worktree add ../wt dev']))[1], ['../wt', 'dev', 'e137e9b']))
test('worktree add <path> names the branch after the folder', () => assert.equal(wt(run(['git worktree add ../hotfix']))[1][1], 'hotfix'))
test('worktree add --detach', () => assert.deepEqual(wt(run(['git commit', 'git worktree add --detach ../wt HEAD^']))[1], ['../wt', null, 'e137e9b']))
test('commit in the other worktree moves only its branch', () => {
  const v = viewInfo(run(['git worktree add -b dev ../wt', 'git -C ../wt commit']).box.hv)
  assert.notEqual(v.refs.dev, v.refs.master); assert.equal(v.branch, 'master')
})
test('-C returns to the worktree you were in', () => assert.equal(run(['git worktree add -b dev ../wt', 'git -C ../wt commit']).box.hv.currentBranch, 'master'))
test('a branch can be checked out in one worktree only', () => {
  assert.equal(run(['git worktree add -b dev ../wt', 'git switch dev']).log.at(-1).kind, 'error')
  assert.equal(run(['git worktree add ../wt master']).log.at(-1).kind, 'error')
  assert.equal(run(['git worktree add -b dev ../wt', 'git branch -D dev']).log.at(-1).kind, 'error')
})
test('cd switches HEAD and back', () => {
  assert.equal(run(['git worktree add -b dev ../wt', 'cd ../wt']).box.hv.currentBranch, 'dev')
  assert.equal(run(['git worktree add -b dev ../wt', 'cd ../wt', 'cd .']).box.hv.currentBranch, 'master')
})
test('each worktree keeps its status', () => {
  const { box } = run(['git worktree add -b dev ../wt', 'edit', 'cd ../wt'])
  assert.equal(box.hv.status, 'clean'); box.run('cd .'); assert.equal(box.hv.status, 'unstaged')
})
test('list shows every worktree', () => {
  const log = run(['git worktree add -b dev ../wt', 'git worktree list']).log
  assert.deepEqual(log.slice(-2).map(l => l.text), ['.  e137e9b [master]', '../wt  e137e9b [dev]'])
})
test('remove frees the branch', () => assert.equal(run(['git worktree add -b dev ../wt', 'git worktree remove ../wt', 'git switch dev']).box.hv.currentBranch, 'dev'))
test('remove refuses changes, --force removes', () => {
  assert.equal(run(['git worktree add -b dev ../wt', 'cd ../wt', 'edit', 'cd .', 'git worktree remove ../wt']).log.at(-1).kind, 'error')
  assert.equal(wt(run(['git worktree add -b dev ../wt', 'cd ../wt', 'edit', 'cd .', 'git worktree remove --force ../wt'])).length, 1)
})
test('the other HEAD is drawn and keeps its commits visible', () => {
  const { box } = run(['git commit', 'git worktree add --detach ../wt HEAD', 'git reset --hard HEAD^'])
  assert.equal(box.hv.svg.selectAll('g.worktree-head').size(), 1)
  assert.ok(!box.hv.commitData.find(c => c.id === wt({ box })[1][2]).branchless)
})
test('two HEAD tags do not overlap', () => {
  const ys = run(['git worktree add --detach ../wt', 'git worktree add --detach ../wt2']).box.hv
    .svg.selectAll('g.head-tag rect').nodes().map(n => n.getAttribute('y'))
  assert.equal(ys.length, 3); assert.equal(new Set(ys).size, ys.length)
})
test('quiz sees worktrees', () => {
  assert.ok(!same(['git worktree add -b dev ../wt'], ['git branch dev']))
  assert.ok(same(['git worktree add -b dev ../wt'], ['git branch dev', 'git worktree add ../wt dev']))
})
test('rejects worktree add without path', () => assert.equal(run(['git worktree add']).log.at(-1).kind, 'error'))
test('rejects cd to an unknown path', () => assert.equal(run(['cd ../nope']).log.at(-1).kind, 'error'))
