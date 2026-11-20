import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

const out = box => [...box.cb.log.node().querySelectorAll('div')].map(d => d.textContent.replace(/[⁨⁩]/g, ''))
const idOf = (box, msg) => box.hv.commitData.find(c => c.message === msg).id

// the bug is the file `bug`; answer good/bad until git names the first bad commit
function hunt(box, start) {
  box.run(start)
  for (let i = 0; i < 20; i++) {
    const last = out(box).filter(l => / is the first bad commit$/.test(l))
    if (last.length) return last[0].split(' ')[0]
    box.run(box.hv.work.bug ? 'git bisect bad' : 'git bisect good')
  }
  throw new Error('bisect did not end: ' + out(box).slice(-5).join(' | '))
}

const linear = k => {
  const cmds = ['echo 0 > f', 'git add f', 'git commit -m c0']
  for (let i = 1; i <= 8; i++) {
    cmds.push(`echo ${i} >> f`)
    if (i === k) cmds.push('echo x > bug', 'git add bug')
    cmds.push(`git commit -am c${i}`)
  }
  return cmds
}
for (let k = 1; k <= 8; k++)
  test(`bisect finds c${k} in a line of 8 commits`, () => {
    const r = run(linear(k))
    assert.equal(hunt(r.box, 'git bisect start HEAD HEAD~8'), idOf(r.box, 'c' + k))
  })

const merged = x => {
  const step = (name, cmds) => cmds.concat(x === name ? ['echo x > bug', 'git add bug'] : [], `git commit -am ${name}`)
  let c = ['echo 0 > f', 'git add f', 'git commit -m c0', 'git switch -c side', 'echo s >> f']
  c = step('s1', c); c.push('echo t > t', 'git add t'); c = step('s2', c)
  c.push('git switch master', 'echo m > m', 'git add m'); c = step('m1', c); c.push('echo mm >> m'); c = step('m2', c)
  c.push('git merge side', 'echo z >> m'); c = step('m3', c)
  return c
}
for (const x of ['s1', 's2', 'm1', 'm2', 'm3'])
  test(`bisect with a merge finds ${x}`, () => {
    const r = run(merged(x))
    assert.equal(hunt(r.box, 'git bisect start'.concat(' master c0'.replace('c0', idOf(r.box, 'c0')))), idOf(r.box, x))
  })

test('bisect prints the steps and detaches HEAD in the middle', () => {
  const r = run(linear(5).concat('git bisect start', 'git bisect bad', 'git bisect good HEAD~8'))
  assert.match(out(r.box).at(-1), /^Bisecting: \d+ revisions? left to test after this \(roughly \d+ steps?\)$/)
  assert.equal(r.box.hv.currentBranch, null)
  assert.ok(r.box.hv.svg.select('circle.commit.bisect-bad').size() === 1)
})
test('bisect reset goes back and clears the marks', () => {
  const r = run(linear(5).concat('git bisect start HEAD HEAD~8', 'git bisect good', 'git bisect reset'))
  assert.equal(r.box.hv.currentBranch, 'master')
  assert.equal(r.box.hv.bisectState, null)
  assert.equal(r.box.hv.svg.selectAll('circle.commit.bisect-good, circle.commit.bisect-bad').size(), 0)
})
test('bisect skip and log', () => {
  const r = run(linear(3))
  r.box.run('git bisect start HEAD HEAD~8'); r.box.run('git bisect skip')
  assert.equal(hunt(r.box, 'git bisect log'), idOf(r.box, 'c3'))
  r.box.run('git bisect log')
  const log = out(r.box)
  assert.ok(log.includes('git bisect start'))
  assert.ok(log.some(l => /^git bisect skip [0-9a-f]{7}$/.test(l)))
})
test('bisect needs start; reset without bisect is an error', () => {
  unchanged(linear(3), 'git bisect good')
  unchanged(linear(3), 'git bisect bad')
  unchanged(linear(3), 'git bisect reset')
  unchanged(linear(3), 'git bisect start nope')
})
