// findings of the phase-2 review
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged, same } from './harness.mjs'

const top = (r, ref = 'HEAD') => r.box.hv.reflogFor(ref)[0].msg

test('tag -l with many stars stays fast and correct', () => {
  const t = Date.now()
  const r = run(['git commit', 'git tag ' + 'a'.repeat(40), 'git tag v1.2', 'git tag -l *a*a*a*a*a*a*a*a*a*a*a*a*a*a*b'])
  assert.ok(Date.now() - t < 2000)
  assert.equal(r.log.at(-1).kind, 'cmd')
  assert.equal(run(['git commit', 'git tag v1.2', 'git tag v2', 'git tag -l "v1.*"']).log.at(-1).text, 'v1.2')
})
test('names like constructor and toString are ordinary names', () => {
  const r = run(['git branch constructor', 'git commit', 'git tag toString', 'git switch constructor', 'git commit -m c'])
  assert.equal(r.box.hv.currentBranch, 'constructor'); assert.equal(viewInfo(r.box.hv).tags.toString, 'lightweight')
  unchanged(['git commit'], 'git reflog show __proto__')
})
test('gc keeps a rebase stopped in another worktree', () => {
  const r = run(['echo 1 > f', 'git add f', 'git commit -m base', 'git switch -c t', 'echo T > f', 'git commit -am t', 'echo U > f', 'git commit -am u',
    'git switch master', 'echo M > f', 'git commit -am m', 'git worktree add --detach ../wt master', 'git switch t', 'git rebase master',
    'cd ../wt', 'git reflog expire --expire=now --all', 'git gc --prune=now', 'cd .', 'git rebase --abort'])
  assert.equal(r.box.hv.getCommit('t').message, 'u'); assert.equal(viewInfo(r.box.hv).operation, null)
})
test('aliases and -C write the resolved command to the reflog', () => {
  const a = run(['git config alias.co checkout', 'git co -b dev', 'git co master'])
  assert.equal(top(a), 'checkout: moving from dev to master')
  const c = run(['git commit -m a', 'git worktree add -b dev ../wt', 'git -C ../wt commit -m w'])
  assert.equal(top(c, 'dev'), 'commit: w')
  c.box.run('cd ../wt'); assert.equal(top(c), 'commit: w')
})
test('quiz: an annotated tag is fine where a lightweight one is expected', () => {
  assert.ok(same(['git commit', 'git tag -a v1 -m x'], ['git commit', 'git tag v1']))
  assert.ok(!same(['git commit', 'git tag v1'], ['git commit', 'git tag -a v1 -m x']))
})
test('reflog messages like git: merge -m, rebase start/abort, branch -f, -m, created from, pull --rebase', () => {
  const D = ['git switch -c dev', 'git commit -m d', 'git switch master', 'git commit -m m']
  assert.equal(top(run(D.concat('git merge --no-ff -m "merge it" dev'))), "merge dev: Merge made by the 'ort' strategy.")
  const T = ['echo 1 > f', 'git add f', 'git commit -m base', 'git switch -c t', 'echo T > f', 'git commit -am t', 'git switch master', 'echo M > f', 'git commit -am m', 'git switch t']
  assert.equal(top(run(T.concat('git rebase master'))), 'rebase (start): checkout master')
  assert.equal(top(run(T.concat('git rebase master', 'git rebase --abort'))), 'rebase (abort): returning to refs/heads/t')
  assert.equal(top(run(['git commit', 'git checkout -b x HEAD^']), 'x'), 'branch: Created from HEAD^')
  assert.equal(top(run(['git branch dev', 'git commit', 'git branch -f dev HEAD']), 'dev'), 'branch: Reset to HEAD')
  const m = run(['git branch dev', 'git branch -m dev feature'])
  assert.deepEqual(m.box.hv.reflogFor('feature').map(e => e.msg), ['Branch: renamed refs/heads/dev to refs/heads/feature', 'branch: Created from HEAD'])
  assert.equal(top(run(['git commit -m a', 'git push', 'git commit -m b', 'git push', 'git reset --hard HEAD~', 'git commit -m c', 'git pull --rebase'], { origin: true })),
    'pull --rebase (finish): returning to refs/heads/master')
})
test('@{1} is the reflog of the current branch', () => {
  const r = run(['git commit -m a', 'git commit -m b', 'git switch -c dev', 'git commit -m d', 'git switch master'])
  assert.equal(r.box.hv.getCommit('@{1}').message, 'a'); assert.equal(r.box.hv.getCommit('HEAD@{1}').message, 'd')
})
test('gc does not change how a quiz is graded', () => {
  const S = ['git switch -c dev', 'git commit -m d', 'git switch master', 'git cherry-pick dev', 'git branch -D dev']
  assert.ok(same(S, S.concat('git reflog expire --expire=now --all', 'git gc --prune=now')))
})
test('clean merges get the default message', () =>
  assert.equal(run(['git switch -c dev', 'git commit', 'git switch master', 'git commit', 'git merge dev']).box.hv.getCommit('HEAD').message, "Merge branch 'dev'"))
test('small outputs: reflog -1, abbrev-ref when detached, log -n without number', () => {
  const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1)
  assert.equal(lines(run(['git commit', 'git commit', 'git reflog -1'])).length, 1)
  assert.equal(run(['git commit', 'git switch --detach', 'git rev-parse --abbrev-ref HEAD']).log.at(-1).text, 'HEAD')
  unchanged(['git commit'], 'git log -n')
})
test('--left-right across a merge', () => {
  const r = run(['git commit -m one', 'git switch -c dev', 'git commit -m d1', 'git switch master', 'git commit -m m1', 'git switch dev', 'git merge master', 'git commit -m d2',
    'git switch master', 'git commit -m m2', 'git log --oneline --left-right master...dev'])
  const out = r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text[0] + ' ' + l.text.split(' ').at(-1))
  assert.deepEqual(out, ['< m2', '> d2', "> 'master'", '> d1'])
})
