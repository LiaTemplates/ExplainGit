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
