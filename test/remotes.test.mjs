import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { run, graph, viewInfo, parseCommands } from './harness.mjs'

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/remote-0.4.json', import.meta.url)))

for (const f of fixtures)
  test(`create origin behaves as in 0.4: ${f.cmds.join('; ')}`, () => {
    const c = f.init === 'main' ? f.cmds.slice(1) : f.cmds
    const r = run(c, { origin: true, init: f.init })
    assert.deepEqual(graph(r.box), f.local)
    assert.deepEqual(graph({ hv: r.box.ov }), f.origin)
    assert.deepEqual(viewInfo(r.box.hv).refs, f.refs)
    assert.deepEqual(r.log.map(l => l.kind + ':' + l.text), f.log)
  })

test('create <name> lines', () => {
  const p = parseCommands('create origin\ncreate upstream\ngit commit')
  assert.equal(p.origin, true); assert.deepEqual(p.world, ['origin', 'upstream']); assert.deepEqual(p.cmds, ['git commit'])
})
test('a world repository without remote entry has no pane', () => {
  const r = run(['git commit'], { origin: true, world: ['origin', 'upstream'] })
  assert.ok(r.box.world.upstream); assert.equal(r.box.cb.remotes.upstream, undefined)
  assert.equal(r.box.playground.selectAll('.remote-container').size(), 1)
})
