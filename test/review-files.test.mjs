// findings of the phase-1 review
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const op = r => viewInfo(r.box.hv).operation
const files = r => viewInfo(r.box.hv).files
const M = ['echo a > f', 'git add f', 'git commit', 'git switch -c dev', 'echo dev > f', 'git commit -am dev', 'git switch master', 'echo m > f', 'git commit -am m']

test('reset ends a merge in conflict', () => {
  const r = run(M.concat('git merge dev', 'git reset --hard', 'git commit --allow-empty -m y'))
  assert.equal(r.box.hv.getCommit('HEAD').parent2, undefined); assert.equal(op(r), null)
  assert.equal(run(M.concat('git merge dev', 'git reset --hard HEAD', 'git merge dev')).log.at(-2).text, 'CONFLICT (content): Merge conflict in f')
})
test('a soft reset during a conflict is refused', () => unchanged(M.concat('git merge dev'), 'git reset --soft HEAD~'))
test('git commit concludes a cherry-pick', () => {
  const r = run(M.concat('git cherry-pick dev', 'echo x > f', 'git add f', 'git commit -m resolved'))
  assert.equal(op(r), null); assert.equal(r.box.hv.getCommit('HEAD').message, 'resolved'); assert.ok(r.box.hv.getCommit('HEAD').cherryPickedFrom)
  assert.equal(run(M.concat('git cherry-pick dev', 'echo x > f', 'git add f', 'git commit -m resolved', 'git switch dev')).box.hv.currentBranch, 'dev')
})
test('git commit inside a rebase, then --continue, makes no empty commit', () => {
  const T = ['echo a > f', 'git add f', 'git commit', 'git switch -c t', 'echo t > f', 'git commit -am t', 'echo b > b', 'git add b', 'git commit -m b', 'git switch master', 'echo m > f', 'git commit -am m', 'git switch t']
  const r = run(T.concat('git rebase master', 'echo tm > f', 'git add f', 'git commit -m t', 'git rebase --continue'))
  assert.equal(op(r), null); assert.deepEqual(['b', 't', 'm'].map((x, i) => r.box.hv.getCommit('HEAD' + '~'.repeat(i)).message), ['b', 't', 'm'])
})
test('a rejected cherry-pick or revert leaves nothing behind', () => {
  unchanged(M.concat('echo n > g', 'git add g'), 'git cherry-pick dev')
  unchanged(M.concat('echo dirty > f'), 'git revert HEAD')
})
test('restore and checkout -- of a conflicted file are refused', () => {
  unchanged(M.concat('git merge dev'), 'git restore f')
  unchanged(M.concat('git merge dev'), 'git checkout -- f')
})
test('stash with a conflict is refused', () => unchanged(M.concat('git merge dev'), 'git stash'))
test('merge base is the best common ancestor', () => {
  const r = run(['echo 1 > f', 'git add f', 'git commit -m old', 'git branch side', 'echo 2 > f', 'git commit -am new', 'git switch -c dev', 'echo d > d', 'git add d', 'git commit -m d1',
    'echo d2 >> d', 'git commit -am d2', 'git switch side', 'echo e > e', 'git add e', 'git commit -m e', 'git switch dev', 'git merge side', 'git switch master', 'echo 3 > f', 'git commit -am three', 'git merge dev'])
  assert.equal(op(r), null); assert.deepEqual(files(r).work.f, ['3'])
})
test('--update-refs with --skip moves the branch of the skipped commit', () => {
  const TOPIC = ['echo 1 > f', 'git add f', 'git commit -m base', 'git switch -c topic', 'echo a > a', 'git add a', 'git commit -m a', 'echo T > f', 'git commit -am t1',
    'echo b > b', 'git add b', 'git commit -m b', 'git switch master', 'echo M > f', 'git commit -am m1', 'git switch topic']
  const r = run(TOPIC.concat('git branch stacked HEAD~', 'git rebase --update-refs master', 'git rebase --skip'))
  assert.equal(r.box.hv.getCommit('stacked').message, 'a'); assert.equal(r.box.hv.getCommit('stacked~').message, 'm1')
})
test('file names and text with quotes and spaces', () => {
  assert.deepEqual(run(['echo a > "my file"']).box.hv.work, { 'my file': ['a'] })
  assert.deepEqual(run(['echo "a" "b" > f']).box.hv.work, { f: ['a b'] })
  assert.deepEqual(run(['echo "  x  " > f']).box.hv.work, { f: ['  x  '] })
  assert.deepEqual(run(['echo a>f']).box.hv.work, { f: ['a'] })
  assert.equal(run(['echo a > "my file"', 'cat "my file"']).log.at(-1).text, 'a')
  unchanged([], 'echo a > f g')
  unchanged([], 'echo "open > f')
})
test('file contents in the console are never translated', () => {
  const { box } = run(['echo Hello > f', 'cat f'])
  const last = [...box.cb.log.node().children].at(-1)
  assert.equal(last.getAttribute('translate'), 'no')
})
test('pull shows its conflict', () => {
  const r = run(['echo a > f', 'git add f', 'git commit -m a', 'git push', 'echo o > f', 'git commit -am o', 'git push', 'git reset --hard HEAD~', 'echo l > f', 'git commit -am l', 'git pull'], { origin: true })
  assert.ok(r.log.some(l => l.text === 'CONFLICT (content): Merge conflict in f'))
})
test('rebase <upstream> <branch> with changes does not switch first', () => unchanged(
  ['echo a > f', 'git add f', 'git commit', 'git switch -c topic', 'echo t > t', 'git add t', 'git commit -m t', 'git switch master', 'echo x >> f'], 'git rebase master topic'))
test('commit -a that has nothing to commit changes nothing', () => unchanged(['echo a > f', 'git add f', 'git commit', 'echo b > f', 'git add f', 'echo a > f'], 'git commit -a'))
test('nothing staged but unstaged changes: git says so', () =>
  assert.equal(run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'git commit']).log.at(-1).text, 'no changes added to commit (use "git add")'))
test('add -u stages tracked files', () => assert.deepEqual(run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'echo n > n', 'git add -u']).box.hv.index, { f: ['a', 'b'] }))
test('missing arguments are named', () => { unchanged(['echo a > f', 'git add f', 'git commit'], 'git revert'); unchanged(['echo a > f'], 'mv f') })
test('stash messages do not depend on the language', () => {
  document.documentElement.lang = 'de'
  try { assert.equal(run(['edit', 'git stash']).box.hv.getCommit('stash@{0}').message, 'WIP on master') } finally { document.documentElement.lang = 'en' }
})
