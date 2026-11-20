import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const files = r => viewInfo(r.box.hv).files
// master and dev both change line 1 of f
const BASE = ['echo a > f', 'echo x > g', 'git add .', 'git commit -m base', 'git switch -c dev', 'echo dev > f', 'git commit -am dev', 'git switch master']
const CONFLICT = BASE.concat('echo master > f', 'git commit -am master', 'git merge dev')

test('clean three-way merge: merge commit holds both changes', () => {
  const r = run(BASE.concat('echo y > g', 'git commit -am g', 'git merge dev'))
  const head = r.box.hv.getCommit('HEAD')
  assert.ok(head.parent2); assert.deepEqual(head.tree, { f: ['dev'], g: ['y'] })
  assert.deepEqual(files(r).work, { f: ['dev'], g: ['y'] })
})
test('fast-forward updates index and working tree', () => assert.deepEqual(files(run(BASE.concat('git merge dev'))).work.f, ['dev']))
test('conflict: markers, unmerged status, no commit', () => {
  const r = run(CONFLICT)
  assert.deepEqual(files(r).work.f, ['<<<<<<< HEAD', 'master', '=======', 'dev', '>>>>>>> dev'])
  assert.equal(viewInfo(r.box.hv).status, 'conflict')
  assert.equal(r.box.hv.getCommit('HEAD').message, 'master')
  assert.ok(r.log.some(l => l.text === 'CONFLICT (content): Merge conflict in f'))
})
test('status -s shows UU', () => assert.equal(run(CONFLICT.concat('git status -s')).log.at(-1).text, 'UU f'))
test('status names the unmerged path', () => assert.deepEqual(run(CONFLICT.concat('git status')).log.filter(l => l.kind === 'info').map(l => l.text).slice(-2), ['Unmerged paths:', 'both modified: f']))
test('commit with an open conflict is refused', () => unchanged(CONFLICT, 'git commit -m done'))
test('add + commit concludes the merge', () => {
  const r = run(CONFLICT.concat('echo both > f', 'git add f', 'git commit -m merged'))
  const head = r.box.hv.getCommit('HEAD')
  assert.ok(head.parent2); assert.deepEqual(head.tree.f, ['both']); assert.equal(viewInfo(r.box.hv).status, 'clean')
})
test('merge --continue concludes too', () => assert.ok(run(CONFLICT.concat('echo both > f', 'git add f', 'git merge --continue')).box.hv.getCommit('HEAD').parent2))
test('merge --abort goes back', () => {
  const before = run(BASE.concat('echo master > f', 'git commit -am master'))
  const after = run(CONFLICT.concat('git merge --abort'))
  assert.deepEqual(files(after), files(before)); assert.equal(viewInfo(after.box.hv).status, 'clean')
})
test('checkout --theirs takes their side', () => assert.deepEqual(files(run(CONFLICT.concat('git checkout --theirs f'))).work.f, ['dev']))
test('restore --ours takes our side', () => assert.deepEqual(files(run(CONFLICT.concat('git restore --ours f'))).work.f, ['master']))
test('diff3 conflict style', () => assert.deepEqual(files(run(['git config merge.conflictstyle diff3'].concat(CONFLICT))).work.f,
  ['<<<<<<< HEAD', 'master', '||||||| base', 'a', '=======', 'dev', '>>>>>>> dev']))
test('git config prints and lists values', () => {
  assert.equal(run(['git config merge.conflictstyle diff3', 'git config merge.conflictstyle']).log.at(-1).text, 'diff3')
  assert.equal(run(['git config user.name Ada', 'git config --list']).log.at(-1).text, 'user.name=Ada')
})
test('switching branches during a merge is refused', () => unchanged(CONFLICT, 'git switch dev'))
test('local changes in a file the merge touches stop it', () =>
  unchanged(BASE.concat('echo y > g', 'git commit -am g', 'echo local > f'), 'git merge dev'))
test('the conflict stays with its worktree', () => {
  const r = run(CONFLICT.concat('git worktree add -b other ../wt', 'cd ../wt'))
  assert.equal(viewInfo(r.box.hv).status, 'clean'); r.box.run('cd .'); assert.equal(viewInfo(r.box.hv).status, 'conflict')
})
test('files panel marks the conflict', () => {
  const r = run(CONFLICT)
  assert.ok([...r.box.hv.filesPanel.querySelectorAll('td')].some(td => td.classList.contains('conflict')))
})
test('legacy merges without files are unchanged', () => assert.ok(run(['git switch -c dev', 'git commit', 'git switch master', 'git commit', 'git merge dev']).box.hv.getCommit('HEAD').parent2))
