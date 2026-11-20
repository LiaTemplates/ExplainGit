import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const infos = log => log.filter(l => l.kind === 'info').map(l => l.text)

test('echo, add, commit stores the file', () => {
  const { box } = run(['echo "hello world" > a.txt', 'git add a.txt', 'git commit -m a'])
  assert.deepEqual(box.hv.getCommit('HEAD').tree, { 'a.txt': ['hello world'] })
  assert.equal(viewInfo(box.hv).status, 'clean')
  assert.deepEqual(viewInfo(box.hv).files, { head: { 'a.txt': ['hello world'] }, index: { 'a.txt': ['hello world'] }, work: { 'a.txt': ['hello world'] } })
})
test('quotes and > inside the text', () => assert.equal(run(['echo "a > b" > f', 'cat f']).log.at(-1).text, 'a > b'))
test('unquoted words up to >', () => assert.deepEqual(run(['echo two words > f']).box.hv.work.f, ['two words']))
test('>> appends', () => assert.deepEqual(run(['echo a > f', 'echo b >> f']).box.hv.work.f, ['a', 'b']))
test('echo without redirect prints', () => assert.equal(run(['echo hi there']).log.at(-1).text, 'hi there'))
test('ls, rm, mv', () => {
  assert.equal(run(['echo a > f', 'echo b > g', 'ls']).log.at(-1).text, 'f  g')
  assert.deepEqual(run(['echo a > f', 'rm f']).box.hv.work, {})
  assert.deepEqual(run(['echo a > f', 'mv f g']).box.hv.work, { g: ['a'] })
})
test('status sections', () => assert.deepEqual(
  infos(run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'echo n > new', 'git status']).log).slice(-4),
  ['Changes not staged for commit:', 'modified: f', 'Untracked files:', 'new']))
test('status of staged files', () => assert.deepEqual(
  infos(run(['echo a > f', 'git add f', 'git status']).log).slice(-2), ['Changes to be committed:', 'new file: f']))
test('status when clean', () => assert.equal(run(['echo a > f', 'git add f', 'git commit', 'git status']).log.at(-1).text, 'nothing to commit, working tree clean'))
test('status -s', () => assert.equal(run(['echo a > f', 'git add f', 'echo b >> f', 'git status -s']).log.at(-1).text, 'AM f'))
test('status -s of an untracked file', () => assert.equal(run(['echo a > f', 'git status -s']).log.at(-1).text, '?? f'))
test('nothing to commit once files exist', () => unchanged(['echo a > f', 'git add f', 'git commit'], 'git commit'))
test('--allow-empty still commits', () => assert.equal(run(['echo a > f', 'git add f', 'git commit', 'git commit --allow-empty']).box.hv.commitData.length, 3))
test('commit -a stages tracked files only', () => {
  const { box } = run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'echo n > new', 'git commit -am two'])
  assert.deepEqual(box.hv.getCommit('HEAD').tree, { f: ['a', 'b'] }); assert.deepEqual(box.hv.fileStatus(), [{ path: 'new', x: '?', y: '?' }])
})
test('add . stages everything, also deletions', () => {
  const { box } = run(['echo a > f', 'echo b > g', 'git add .', 'git commit', 'rm g', 'echo c > h', 'git add .'])
  assert.deepEqual(box.hv.index, { f: ['a'], h: ['c'] })
})
test('legacy: empty commits without files', () => assert.equal(run(['git commit', 'git commit']).box.hv.commitData.length, 3))
test('legacy: edit then add then commit', () => assert.equal(viewInfo(run(['edit', 'git add .', 'git commit']).box.hv).status, 'clean'))
test('edit with a file appends a line', () => assert.deepEqual(run(['echo a > f', 'edit f']).box.hv.work.f, ['a', 'change 2']))
const C = ['echo a > f', 'git add f', 'git commit']
test('git rm', () => { const { box } = run(C.concat('git rm f')); assert.equal(box.hv.index.f, undefined); assert.equal(box.hv.work.f, undefined) })
test('git rm --cached keeps the file untracked', () => {
  const { box } = run(C.concat('git rm --cached f'))
  assert.equal(box.hv.index.f, undefined); assert.deepEqual(box.hv.work.f, ['a'])
  assert.deepEqual(box.hv.fileStatus(), [{ path: 'f', x: 'D', y: '?' }])
})
test('git mv', () => { const { box } = run(C.concat('git mv f g')); assert.deepEqual(box.hv.index, { g: ['a'] }); assert.deepEqual(box.hv.work, { g: ['a'] }) })
test('cat of a missing file is an error', () => unchanged([], 'cat nope'))
test('add of a missing path is an error', () => unchanged(['echo a > f'], 'git add nope'))
test('git rm of an untracked file is an error', () => unchanged(['echo a > f'], 'git rm f'))
test('echo > without a file name is an error', () => unchanged([], 'echo a >'))

// --- Task 3: reset, restore, checkout -- path, switching with changes, clean
const V = ['echo v1 > f', 'git add f', 'git commit -m v1', 'echo v2 > f', 'git add f', 'git commit -m v2', 'echo v3 > f', 'git add f', 'git commit -m v3']
const files = r => viewInfo(r.box.hv).files

test('reset --soft keeps index and working tree', () => {
  const f = files(run(V.concat('git reset --soft HEAD~')))
  assert.deepEqual([f.head.f, f.index.f, f.work.f], [['v2'], ['v3'], ['v3']])
})
test('reset --mixed sets the index', () => {
  const f = files(run(V.concat('git reset HEAD~')))
  assert.deepEqual([f.head.f, f.index.f, f.work.f], [['v2'], ['v2'], ['v3']])
})
test('reset --hard sets index and working tree, keeps untracked files', () => {
  const f = files(run(V.concat('echo u > u', 'git reset --hard HEAD~')))
  assert.deepEqual([f.head.f, f.index.f, f.work.f, f.work.u], [['v2'], ['v2'], ['v2'], ['u']])
})
test('reset -- path only touches the index', () => {
  const r = run(V.concat('echo v4 > f', 'git add f', 'git reset -- f'))
  assert.deepEqual([files(r).index.f, files(r).work.f], [['v3'], ['v4']]); assert.equal(r.box.hv.getCommit('HEAD').message, 'v3')
})
test('reset <ref> -- path takes the file from that commit', () => assert.deepEqual(files(run(V.concat('git reset HEAD~2 -- f'))).index.f, ['v1']))
test('restore takes the file from the index', () => assert.deepEqual(files(run(V.concat('echo x > f', 'git restore f'))).work.f, ['v3']))
test('restore --staged takes the index entry from HEAD', () => {
  const f = files(run(V.concat('echo x > f', 'git add f', 'git restore --staged f')))
  assert.deepEqual([f.index.f, f.work.f], [['v3'], ['x']])
})
test('restore --source', () => assert.deepEqual(files(run(V.concat('git restore --source=HEAD~2 f'))).work.f, ['v1']))
test('checkout -- path and checkout <ref> -- path', () => {
  assert.deepEqual(files(run(V.concat('echo x > f', 'git checkout -- f'))).work.f, ['v3'])
  const f = files(run(V.concat('git checkout HEAD~1 -- f')))
  assert.deepEqual([f.index.f, f.work.f], [['v2'], ['v2']])
})
test('switching updates index and working tree', () => {
  const f = files(run(['echo a > f', 'git add f', 'git commit', 'git switch -c dev', 'echo b > f', 'git commit -am b', 'git switch master']))
  assert.deepEqual([f.head.f, f.index.f, f.work.f], [['a'], ['a'], ['a']])
})
test('local changes come along when the file is the same on both branches', () => {
  const f = files(run(['echo a > f', 'echo g > g', 'git add .', 'git commit', 'git branch dev', 'echo changed > g', 'git switch dev']))
  assert.deepEqual(f.work.g, ['changed'])
})
test('local changes that would be overwritten stop the switch', () =>
  unchanged(['echo a > f', 'git add f', 'git commit', 'git switch -c dev', 'echo b > f', 'git commit -am b', 'git switch master', 'echo local > f'], 'git switch dev'))
test('switch -c with start point and local changes is refused before creating the branch', () =>
  unchanged(['echo a > f', 'git add f', 'git commit', 'echo b > f', 'git commit -am b', 'echo local > f'], 'git switch -c old HEAD~'))
test('clean -n lists, clean -f removes untracked files only', () => {
  const r = run(['echo a > f', 'git add f', 'git commit', 'echo u > u', 'git clean -n'])
  assert.equal(r.log.at(-1).text, 'Would remove u')
  assert.deepEqual(files(run(['echo a > f', 'git add f', 'git commit', 'echo u > u', 'git clean -f'])).work, { f: ['a'] })
})
test('clean without -n or -f is refused', () => unchanged(['echo a > f', 'git add f', 'git commit', 'echo u > u'], 'git clean'))
test('legacy reset still works without files', () => assert.equal(viewInfo(run(['git commit', 'git reset --soft HEAD^']).box.hv).status, 'staged'))
