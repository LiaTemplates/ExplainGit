import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, unchanged } from './harness.mjs'

const O = { origin: true }
const lines = r => r.log.slice(r.log.map(l => l.kind).lastIndexOf('cmd') + 1).map(l => l.text)

test('Pro Git: Jessica pushes first, John is rejected, fetches, merges, pushes', () => {
  const A = ['git commit -m start', 'git push',
    '@origin git config user.name Jessica', '@origin git commit -m "Add reset task"',
    'git commit -m "Remove invalid default value"', 'git push']
  assert.equal(run(A, O).log.at(-1).kind, 'error')
  const r = run(A.concat('git fetch', 'git merge origin/master', 'git push'), O)
  assert.notEqual(r.log.at(-1).kind, 'error')
  assert.equal(r.box.ov.getCommit('master').parent2 !== undefined, true)
  assert.equal(r.box.ov.getCommit('master^2').author, 'Jessica')
})
test('@repo with files', () => {
  const r = run(['@origin echo x > f', '@origin git add f', '@origin git commit -m f', 'git fetch', 'git merge origin/master'], O)
  assert.deepEqual(r.box.hv.work, { f: ['x'] })
})
test('authors: default, user.name, --author', () => {
  assert.equal(run(['git commit -m a']).box.hv.getCommit('HEAD').author, 'you')
  assert.equal(run(['git config user.name Ada', 'git commit -m a']).box.hv.getCommit('HEAD').author, 'Ada')
  assert.equal(run(['git commit -m a --author="Ann"']).box.hv.getCommit('HEAD').author, 'Ann')
  assert.equal(run(['git commit --author=Bob -m a']).box.hv.getCommit('HEAD').message, 'a')
})
test('log shows the author', () => assert.deepEqual(lines(run(['git config user.name Ada', 'git commit -m a', 'git log -1'])).slice(1, 3), ['Author: Ada', '    a']))
test('@repo errors: unknown repository, nested @', () => {
  unchanged(['git commit'], '@nope git commit', O)
  unchanged(['git commit'], '@origin @origin git commit', O)
})
test('a repository used with @ gets a pane', () => {
  const r = run(['@upstream git commit -m u'], { world: ['upstream'] })
  assert.equal(r.box.playground.selectAll('.remote-container').size(), 1)
})
test('cherry-pick and rebase keep the author, the graph shows it as tooltip', () => {
  const r = run(['git switch -c dev', 'git commit -m d --author=Ann', 'git switch master', 'git commit -m m', 'git cherry-pick dev'])
  assert.equal(r.box.hv.getCommit('HEAD').author, 'Ann')
  assert.equal(run(['git switch -c dev', 'git commit -m d --author=Ann', 'git switch master', 'git commit -m m', 'git switch dev', 'git rebase master']).box.hv.getCommit('HEAD').author, 'Ann')
  assert.equal(r.box.hv.svg.select('#' + r.box.hv.name + '-' + r.box.hv.getCommit('HEAD').id + ' title').text(), 'Ann')
})
