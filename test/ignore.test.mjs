import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)
const G = ['echo a > f', 'git add f', 'git commit -m base', 'echo "*.log" > .gitignore', 'echo x > a.log', 'echo y > notes']

test('status leaves ignored files out, .gitignore itself is untracked', () =>
  assert.deepEqual(lines(run(G.concat('git status -s'))), ['?? .gitignore', '?? notes']))
test('add . skips ignored files; add <ignored> is refused, add -f forces', () => {
  assert.deepEqual(Object.keys(run(G.concat('git add .')).box.hv.index).sort(), ['.gitignore', 'f', 'notes'])
  unchanged(G, 'git add a.log')
  assert.deepEqual(run(G.concat('git add -f a.log')).box.hv.index['a.log'], ['x'])
})
test('negation and directory patterns', () => {
  const r = run(G.concat('echo "!keep.log" >> .gitignore', 'echo "build/" >> .gitignore', 'echo k > keep.log',
    'echo o > build/out', 'echo p > builder', 'git status -s'))
  assert.deepEqual(lines(r), ['?? .gitignore', '?? builder', '?? keep.log', '?? notes'])
})
test('a tracked file stays tracked although it matches', () => {
  const r = run(G.concat('git add -f a.log', 'git commit -m log', 'echo z >> a.log', 'git status -s'))
  assert.deepEqual(lines(r), ['?? .gitignore', ' M a.log', '?? notes'])
})
test('clean keeps ignored files, -x removes them, -X only them', () => {
  assert.deepEqual(Object.keys(run(G.concat('git clean -f')).box.hv.work).sort(), ['a.log', 'f'])
  assert.deepEqual(Object.keys(run(G.concat('git clean -fx')).box.hv.work).sort(), ['f'])
  assert.deepEqual(Object.keys(run(G.concat('git clean -fX')).box.hv.work).sort(), ['.gitignore', 'f', 'notes'])
})
test('check-ignore', () => {
  assert.deepEqual(lines(run(G.concat('git check-ignore -v a.log'))), ['.gitignore:1:*.log\ta.log'])
  assert.deepEqual(lines(run(G.concat('git check-ignore a.log notes'))), ['a.log'])
  assert.deepEqual(lines(run(G.concat('echo "# comment" > .gitignore', 'git check-ignore a.log'))), [])
})
