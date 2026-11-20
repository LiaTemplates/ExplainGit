import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from './harness.mjs'

// output lines of the last command
const out = (cmds, opts) => {
  const r = run(cmds, opts)
  const last = r.log.map(l => l.kind).lastIndexOf('cmd')
  return { r, lines: r.log.slice(last + 1).map(l => l.text) }
}
const id = (r, ref) => r.box.hv.getCommit(ref).id
const TWO = ['git commit -m one', 'git commit -m two']
const DEV = ['git commit -m one', 'git switch -c dev', 'git commit -m d1', 'git commit -m d2', 'git switch master', 'git commit -m m1']

test('log prints commits newest first', () => {
  const { r, lines } = out(TWO.concat('git log'))
  assert.deepEqual(lines.slice(0, 6), [`commit ${id(r, 'HEAD')} (HEAD -> master)`, 'Author: you', '    two', `commit ${id(r, 'HEAD~')}`, 'Author: you', '    one'])
})
test('log --oneline with decorations', () => {
  const { r, lines } = out(['git commit -m one', 'git push', 'git tag v1', 'git commit -m two', 'git log --oneline'], { origin: true })
  assert.deepEqual(lines.slice(0, 2), [`${id(r, 'HEAD')} (HEAD -> master) two`, `${id(r, 'HEAD~')} (tag: v1, origin/master) one`])
})
test('log -n and -<n>', () => {
  assert.equal(out(TWO.concat('git log --oneline -1')).lines.length, 1)
  assert.equal(out(TWO.concat('git log --oneline -n 2')).lines.length, 2)
})
test('log --all shows other branches', () => assert.equal(out(DEV.concat('git log --oneline --all')).lines.length, 5))
test('ranges: a..b, ^a b, b --not a are the same', () => {
  const msgs = cmd => out(DEV.concat(cmd)).lines.map(l => l.split(' ').at(-1))
  assert.deepEqual(msgs('git log --oneline master..dev'), ['d2', 'd1'])
  assert.deepEqual(msgs('git log --oneline ^master dev'), ['d2', 'd1'])
  assert.deepEqual(msgs('git log --oneline dev --not master'), ['d2', 'd1'])
})
test('a...b --left-right', () => assert.deepEqual(out(DEV.concat('git log --oneline --left-right master...dev')).lines.map(l => l[0] + ' ' + l.split(' ').at(-1)),
  ['< m1', '> d2', '> d1']))
test('--merges, --no-merges, --first-parent', () => {
  const M = DEV.concat('git merge dev')
  assert.equal(out(M.concat('git log --oneline --merges')).lines.length, 1)
  assert.equal(out(M.concat('git log --oneline --no-merges')).lines.length, 5)
  assert.equal(out(M.concat('git log --oneline --first-parent')).lines.length, 4)
})
test('--graph puts a star in front', () => assert.match(out(TWO.concat('git log --oneline --graph')).lines[0], /^\* [0-9a-f]{7} /))
test('-p, --stat, -- path and -S on files', () => {
  const F = ['echo a > f', 'git add f', 'git commit -m f1', 'echo x > g', 'git add g', 'git commit -m g1', 'echo needle >> f', 'git commit -am f2']
  assert.ok(out(F.concat('git log -p -1')).lines.includes('+needle'))
  assert.ok(out(F.concat('git log --stat -1')).lines.includes(' f | 1 +'))
  assert.deepEqual(out(F.concat('git log --oneline -- f')).lines.map(l => l.split(' ').at(-1)), ['f2', 'f1'])
  assert.deepEqual(out(F.concat('git log --oneline -S needle')).lines.map(l => l.split(' ').at(-1)), ['f2'])
})
test('log highlights its commits until the next command', () => {
  const r = run(DEV.concat('git log master..dev'))
  const selected = () => r.box.hv.svg.selectAll('circle.selected').data().map(d => d.id).sort()
  assert.deepEqual(selected(), [id(r, 'dev'), id(r, 'dev~')].sort())
  r.box.run('git status'); assert.deepEqual(selected(), [])
})
test('log of an unknown ref is an error', () => assert.equal(run(TWO.concat('git log nope')).log.at(-1).kind, 'error'))
