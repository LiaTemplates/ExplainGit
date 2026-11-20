import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const out = cmds => {
  const r = run(cmds)
  const last = r.log.map(l => l.kind).lastIndexOf('cmd')
  return { r, lines: r.log.slice(last + 1).map(l => l.text) }
}
const msgs = lines => lines.map(l => l.replace(/^[0-9a-f]{7} /, ''))

test('reflog messages like git', () => assert.deepEqual(
  msgs(out(['git commit -m a', 'git switch -c dev', 'git commit -m b', 'git switch master', 'git reset --hard HEAD~', 'git reflog']).lines),
  ['HEAD@{0}: reset: moving to HEAD~', 'HEAD@{1}: checkout: moving from dev to master', 'HEAD@{2}: commit: b',
   'HEAD@{3}: checkout: moving from master to dev', 'HEAD@{4}: commit: a', 'HEAD@{5}: commit (initial): first commit']))
test('merge, amend and branch messages', () => {
  const { lines } = out(['git switch -c dev', 'git commit -m d', 'git switch master', 'git commit -m m', 'git merge dev', 'git commit --amend -m mm', 'git reflog'])
  assert.deepEqual(msgs(lines).slice(0, 2), ['HEAD@{0}: commit (amend): mm', "HEAD@{1}: merge dev: Merge made by the 'ort' strategy."])
  assert.deepEqual(msgs(out(['git switch -c dev', 'git commit -m d', 'git switch master', 'git merge dev', 'git reflog']).lines)[0], 'HEAD@{0}: merge dev: Fast-forward')
})
test('reflog show <branch> and branch@{n}', () => {
  const { r, lines } = out(['git commit -m a', 'git commit -m b', 'git branch dev HEAD~', 'git reflog show dev'])
  assert.deepEqual(msgs(lines), ['dev@{0}: branch: Created from HEAD~'])
  assert.equal(r.box.hv.getCommit('master@{1}').message, 'a')
})
test('HEAD@{1} rescues a commit lost by reset --hard', () => {
  const r = run(['git commit -m a', 'git commit -m lost', 'git reset --hard HEAD~', 'git branch rescue HEAD@{1}'])
  assert.equal(r.box.hv.getCommit('rescue').message, 'lost')
})
test('log -g walks the reflog', () => {
  const { lines } = out(['git commit -m a', 'git commit -m b', 'git log -g -1'])
  assert.deepEqual(lines.slice(1, 4), ['Reflog: HEAD@{0}', 'Reflog message: commit: b', '    b'])
})
test('reflog after a rebase with a conflict', () => {
  const T = ['echo 1 > f', 'git add f', 'git commit -m base', 'git switch -c t', 'echo T > f', 'git commit -am t', 'git switch master', 'echo M > f', 'git commit -am m', 'git switch t',
    'git rebase master', 'echo TM > f', 'git add f', 'git rebase --continue']
  const r = run(T)
  assert.equal(r.box.hv.getCommit('t@{1}').message, 't')
  assert.match(r.box.hv.reflogFor('HEAD')[0].msg, /^rebase \(finish\)/)
})
test('each worktree has its own HEAD reflog', () => {
  const r = run(['git commit -m a', 'git worktree add -b dev ../wt', 'cd ../wt', 'git commit -m w'])
  assert.equal(r.box.hv.reflogFor('HEAD')[0].msg, 'commit: w'); r.box.run('cd .')
  assert.equal(r.box.hv.reflogFor('HEAD')[0].msg, 'commit: a')
})
test('reflog does not change the repository', () => assert.deepEqual(viewInfo(run(['git commit', 'git reflog']).box.hv).refs, viewInfo(run(['git commit']).box.hv).refs))
test('unknown reflog entry is an error', () => unchanged(['git commit'], 'git branch x HEAD@{9}'))
