import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)
const idOf = (r, msg) => r.box.hv.commitData.find(c => c.message === msg && !c.rebased && c.tags).id
const errors = r => r.log.filter(l => l.kind === 'error').map(l => l.text)

// Ann writes two lines, Bob changes the second and adds a third
const H = ['git config user.name Ann', 'echo flour > bread', 'echo water >> bread', 'git add bread', 'git commit -m start',
  'git config user.name Bob', 'echo flour > bread', 'echo milk >> bread', 'echo salt >> bread', 'git commit -am milk']

test('blame names the commit and author of every line', () => {
  const r = run(H.concat('git blame bread'))
  const s = idOf(r, 'start'), m = idOf(r, 'milk')
  assert.deepEqual(lines(r), [`${s} (Ann 1) flour`, `${m} (Bob 2) milk`, `${m} (Bob 3) salt`])
})
test('blame -L and uncommitted lines', () => {
  const r = run(H.concat('git blame -L 2,3 bread'))
  assert.equal(lines(r).length, 2)
  assert.match(lines(r)[0], /\(Bob 2\) milk$/)
  const w = run(H.concat('echo sugar >> bread', 'git blame bread'))
  assert.equal(lines(w)[3], '0000000 (Not Committed Yet 4) sugar')
})
test('blame of an older revision', () => {
  const r = run(H.concat('git blame HEAD~ bread'))
  assert.deepEqual(lines(r).map(l => l.split(' ').slice(1).join(' ')), ['(Ann 1) flour', '(Ann 2) water'])
})
test('blame follows lines through a merge', () => {
  const r = run(['echo a > f', 'echo b >> f', 'git add f', 'git commit -m base', 'git switch -c side', 'echo a > f', 'echo b >> f', 'echo side >> f',
    'git commit -am side', 'git switch master', 'echo top > f', 'echo a >> f', 'echo b >> f', 'git commit -am top', 'git merge side', 'git blame f'])
  assert.deepEqual(errors(r), [])
  const ids = lines(r).map(l => l.split(' ')[0])
  assert.deepEqual(ids, [idOf(r, 'top'), idOf(r, 'base'), idOf(r, 'base'), idOf(r, 'side')])
})
test('blame after git mv starts at the move (no -C)', () => {
  const r = run(H.concat('git mv bread loaf', 'git commit -m move', 'git blame loaf'))
  assert.ok(lines(r).every(l => l.startsWith(idOf(r, 'move'))))
})
test('blame errors', () => {
  unchanged(H, 'git blame nope')
  unchanged(H, 'git blame')
  unchanged(H, 'git blame -L 5,9 bread')
})
test('grep in the working tree and in a revision', () => {
  const r = run(H.concat('echo salt > notes', 'git add notes', 'echo "no salt" > untracked', 'git grep salt'))
  assert.deepEqual(lines(r), ['bread:salt', 'notes:salt'])
  assert.deepEqual(lines(run(H.concat('git grep -n milk'))), ['bread:2:milk'])
  assert.deepEqual(lines(run(H.concat('git grep water HEAD~'))), ['HEAD~:bread:water'])
  assert.deepEqual(lines(run(H.concat('git grep -c l'))), ['bread:3'])
  assert.deepEqual(lines(run(H.concat('git grep nothing-here'))), [])
  assert.deepEqual(lines(run(H.concat('git grep "(a+)+$"'))), [])
  unchanged(H, 'git grep')
})
test('log -L shows the commits that changed the range', () => {
  const r = run(H.concat('echo pepper >> bread', 'git commit -am pepper', 'git log -L 2,2:bread'))
  const heads = lines(r).filter(l => l.startsWith('commit '))
  assert.deepEqual(heads, [`commit ${idOf(r, 'milk')}`, `commit ${idOf(r, 'start')}`])
  assert.ok(lines(r).includes('+milk'))
  assert.ok(lines(r).includes('-water'))
  unchanged(H, 'git log -L 7,8:bread')
  unchanged(H, 'git log -L 1,2:nope')
})
