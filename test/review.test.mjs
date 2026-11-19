// findings of the whole-branch review
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, same, graph, viewInfo, compare } from './harness.mjs'
import * as repo from '../src/repo.js'
const needsStatus = cmds => repo.needsStatus(cmds)

const O = { origin: true }
const strip = v => JSON.parse(JSON.stringify({ ...v, byId: undefined }))

// a rejected command must not change anything
function unchanged(cmds, bad, opts) {
  const before = run(cmds, opts)
  const after = run(cmds.concat(bad), opts)
  assert.equal(after.log.at(-1).kind, 'error', bad)
  assert.deepEqual(graph(after.box), graph(before.box), bad)
  assert.deepEqual(strip(viewInfo(after.box.hv)), strip(viewInfo(before.box.hv)), bad)
  if (opts && opts.origin) assert.deepEqual(graph({ hv: after.box.ov }), graph({ hv: before.box.ov }), bad)
}

test('pull when the local branch is ahead makes no merge commit', () => {
  const { box, log } = run(['git commit', 'git push', 'git commit', 'git pull'], O)
  assert.equal(box.hv.getCommit('HEAD').parent2, undefined)
  assert.equal(log.at(-1).kind, 'info')
})
test('merging an ancestor is up to date', () => {
  for (const flag of ['', '--no-ff ', '--ff-only ']) {
    const { box, log } = run(['git commit', 'git switch -c dev', 'git commit', 'git merge ' + flag + 'master'])
    assert.equal(box.hv.getCommit('HEAD').parent2, undefined, flag)
    assert.equal(log.at(-1).text, 'Already up-to-date.', flag)
    assert.equal(log.at(-1).kind, 'info', flag)
  }
})
test('only git commands can be called', () => {
  for (const cmd of ['git onInput edit', 'git constructor', 'git toString', 'git hasOwnProperty x', 'git valueOf'])
    assert.equal(run([cmd]).log.at(-1).text, "I don't understand that.", cmd)
})
test('the internal first commit cannot be named', () => {
  for (const bad of ['git reset --hard initial', 'git checkout initial', 'git branch x initial', 'git switch -c x initial'])
    unchanged(['git commit'], bad)
})
test('the current branch of the remote cannot be deleted', () =>
  unchanged(['git commit', 'git push'], 'git push origin --delete master', O))
test('old reset quizzes: plain and --hard reset are still equal', () => {
  const solution = ['git commit', 'git commit', 'git reset HEAD^']
  const learner = ['git commit', 'git commit', 'git reset --hard HEAD^']
  assert.equal(needsStatus(solution), false)
  assert.deepEqual(compare(run(learner).state, run(solution).state, { status: needsStatus(solution) }), [])
})
test('quizzes with working tree commands compare the status', () => {
  assert.equal(needsStatus(['git commit', 'git reset --soft HEAD^']), true)
  assert.equal(needsStatus(['edit', 'git add .']), true)
  assert.equal(needsStatus(['git stash']), true)
})
test('quiz tells cherry-pick from a plain commit', () =>
  assert.ok(!same(['git switch -c dev', 'git commit -m fix', 'git switch master', 'git cherry-pick dev'],
                  ['git switch -c dev', 'git commit -m fix', 'git switch master', 'git commit'])))
test('quiz tells squash from a plain commit', () =>
  assert.ok(!same(['git switch -c dev', 'git commit', 'git switch master', 'git merge --squash dev', 'git commit'],
                  ['git switch -c dev', 'git commit', 'git switch master', 'git commit'])))
test('commits on a detached HEAD work as in git', () => {
  const { box, log } = run(['git commit', 'git switch --detach HEAD', 'git commit -m loose'])
  assert.notEqual(log.at(-1).kind, 'error')
  assert.equal(box.hv.getCommit('HEAD').message, 'loose')
  assert.equal(box.hv.currentBranch, null)
  assert.notEqual(viewInfo(box.hv).refs.master, box.hv.getCommit('HEAD').id)
})
test('commit in a detached worktree', () => {
  const { box, log } = run(['git commit', 'git worktree add --detach ../review HEAD', 'git -C ../review commit -m r'])
  assert.notEqual(log.at(-1).kind, 'error')
  assert.equal(box.hv.getCommit(viewInfo(box.hv).worktrees[1][2]).message, 'r')
})
