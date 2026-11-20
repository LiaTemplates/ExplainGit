import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged, same } from './harness.mjs'

const out = (cmds, opts) => {
  const r = run(cmds, opts)
  const last = r.log.map(l => l.kind).lastIndexOf('cmd')
  return { r, lines: r.log.slice(last + 1).map(l => l.text) }
}
const O = { origin: true }
const tags = r => viewInfo(r.box.hv).tags

test('annotated and lightweight tags', () => {
  const r = run(['git commit -m a', 'git tag -a v1 -m "release one"', 'git commit -m b', 'git tag v2 HEAD~'])
  assert.deepEqual(tags(r), { v1: 'annotated', v2: 'lightweight' })
  assert.equal(r.box.hv.getCommit('v2').message, 'a')
  assert.equal(r.box.hv.svg.selectAll('g.git-tag.annotated').size(), 1)
})
test('tag listing with pattern, deletion', () => {
  assert.deepEqual(out(['git commit', 'git tag v1.1', 'git tag v1.0', 'git tag v2.0', 'git tag']).lines, ['v1.0', 'v1.1', 'v2.0'])
  assert.deepEqual(out(['git commit', 'git tag v1.1', 'git tag v2.0', 'git tag -l "v1*"']).lines, ['v1.1'])
  assert.deepEqual(tags(run(['git commit', 'git tag v1', 'git tag -d v1'])), {})
})
test('an existing tag name is an error', () => unchanged(['git commit', 'git tag v1'], 'git tag v1'))
test('show of an annotated tag', () => assert.deepEqual(out(['git commit -m a', 'git tag -a v1 -m "release one"', 'git show v1']).lines.slice(0, 3), ['tag v1', 'release one', '']))
test('push a tag, --tags, --follow-tags, delete', () => {
  assert.ok('v1' in viewInfo(run(['git commit', 'git tag v1', 'git push origin v1'], O).box.ov).tags)
  assert.deepEqual(viewInfo(run(['git commit', 'git tag v1', 'git tag v2', 'git push --tags'], O).box.ov).tags, { v1: 'lightweight', v2: 'lightweight' })
  assert.deepEqual(viewInfo(run(['git commit', 'git tag v1', 'git tag -a v2 -m x', 'git push --follow-tags'], O).box.ov).tags, { v2: 'annotated' })
  assert.deepEqual(viewInfo(run(['git commit', 'git tag v1', 'git push origin v1', 'git push origin --delete v1'], O).box.ov).tags, {})
})
test('describe', () => {
  assert.equal(out(['git commit', 'git tag -a v1 -m x', 'git describe']).lines[0], 'v1')
  const r = out(['git commit', 'git tag -a v1 -m x', 'git commit', 'git commit', 'git describe'])
  assert.equal(r.lines[0], 'v1-2-g' + r.r.box.hv.getCommit('HEAD').id)
  assert.equal(out(['git commit', 'git tag v1', 'git describe']).r.log.at(-1).kind, 'error')
  assert.equal(out(['git commit', 'git tag v1', 'git describe --tags']).lines[0], 'v1')
})
test('quiz compares the kind of tag', () => assert.ok(!same(['git commit', 'git tag v1'], ['git commit', 'git tag -a v1 -m x'])))
