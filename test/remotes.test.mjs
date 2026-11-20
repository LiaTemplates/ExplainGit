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

// --- Task 2: git remote, ls-remote
import { unchanged } from './harness.mjs'
const O = { origin: true }
const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)

test('remote and remote -v', () => {
  assert.deepEqual(lines(run(['git remote'], O)), ['origin'])
  assert.deepEqual(lines(run(['git remote -v'], O)), ['origin\t../origin.git (fetch)', 'origin\t../origin.git (push)'])
})
test('remote add connects a world repository by the last part of its url', () => {
  const r = run(['git commit -m t', 'git remote add pb https://github.com/paulboone/ticgit', 'git push pb master', 'git fetch pb'], { origin: true, world: ['origin', 'ticgit'] })
  assert.equal(r.box.cb.remotes.pb, r.box.world.ticgit)
  assert.equal(r.box.world.ticgit.getCommit('master').message, 't')
  assert.ok(r.box.hv.isRemoteRef('pb/master'))
})
test('remote add of an unknown url makes a new repository', () => {
  const r = run(['git remote add backup ../backup.git', 'git push backup master'], O)
  assert.ok(r.box.world.backup); assert.ok('master' in viewInfo(r.box.world.backup).refs)
})
test('remote rename renames tracking branches and upstreams', () => {
  const r = run(['git commit', 'git push -u origin master', 'git remote rename origin up'], O)
  assert.ok('up/master' in viewInfo(r.box.hv).refs); assert.ok(!('origin/master' in viewInfo(r.box.hv).refs))
  assert.equal(r.box.hv.upstream.master, 'up/master'); assert.deepEqual(lines(run(['git remote rename origin up', 'git remote'], O)), ['up'])
})
test('remote remove drops tracking branches and the pane', () => {
  const r = run(['git commit', 'git push', 'git remote remove origin'], O)
  assert.ok(!Object.keys(viewInfo(r.box.hv).refs).some(n => n.startsWith('origin/')))
  assert.equal(r.box.playground.selectAll('.remote-container').size(), 0)
})
test('remote show', () => {
  const out = lines(run(['git commit', 'git push -u origin master', 'git remote show origin'], O))
  assert.deepEqual(out.slice(0, 5), ['* remote origin', '  Fetch URL: ../origin.git', '  Push  URL: ../origin.git', '  HEAD branch: master', '  Remote branch:'])
  assert.ok(out.includes('    master tracked'))
  assert.ok(out.includes('    master merges with remote master'))
})
test('ls-remote', () => {
  const r = run(['git commit', 'git tag v1', 'git push origin master', 'git push origin v1', 'git ls-remote origin'], O)
  const id = r.box.ov.getCommit('master').id
  assert.deepEqual(lines(r), [`${id}\tHEAD`, `${id}\trefs/heads/master`, `${id}\trefs/tags/v1`])
})
test('errors: duplicate remote, unknown remote', () => {
  unchanged([], 'git remote add origin ../x.git', O)
  unchanged([], 'git remote remove nope', O)
  unchanged([], 'git fetch nope', O)
})
