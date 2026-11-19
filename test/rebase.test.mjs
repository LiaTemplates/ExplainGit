import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from './harness.mjs'

// master: M on top of the first commit; topic1 from the first commit: B; topic2 from B: C
const STACK = ['git switch -c topic1', 'git commit -m B', 'git switch -c topic2', 'git commit -m C', 'git switch master', 'git commit -m M']
const msg = (hv, ref) => hv.getCommit(ref).message

test('onto moves only commits after upstream', () => {
  const { box } = run(STACK.concat('git rebase --onto master topic1 topic2'))
  assert.equal(box.hv.currentBranch, 'topic2')
  assert.equal(msg(box.hv, 'topic2'), 'C')
  assert.equal(msg(box.hv, 'topic2^'), 'M')
  assert.equal(msg(box.hv, 'topic1'), 'B') // untouched
})
test('rebase <upstream> <branch> switches first', () => {
  const { box } = run(STACK.concat('git rebase master topic1'))
  assert.equal(box.hv.currentBranch, 'topic1'); assert.equal(msg(box.hv, 'topic1^'), 'M')
})
test('update-refs moves the stacked branch', () => {
  const { box } = run(STACK.concat('git switch topic2', 'git rebase --update-refs master'))
  assert.equal(msg(box.hv, 'topic1'), 'B'); assert.equal(msg(box.hv, 'topic1^'), 'M')
  assert.equal(box.hv.getCommit('topic2').parent, box.hv.getCommit('topic1').id)
})
test('without update-refs the stacked branch stays behind', () => {
  const { box } = run(STACK.concat('git switch topic2', 'git rebase master'))
  assert.equal(msg(box.hv, 'topic1^'), 'first commit')
})
test('plain rebase unchanged', () => {
  const { box } = run(STACK.concat('git switch topic1', 'git rebase master'))
  assert.equal(msg(box.hv, 'HEAD^'), 'M')
})
test('rejects onto without argument', () => assert.equal(run(['git rebase --onto']).log.at(-1).kind, 'error'))
test('rejects onto an unknown ref', () => assert.equal(run(STACK.concat('git rebase --onto nope topic1 topic2')).log.at(-1).kind, 'error'))
