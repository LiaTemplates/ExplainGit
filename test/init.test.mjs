import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, viewInfo, parseCommands } from './harness.mjs'
import { parseQuiz } from '../src/repo.js'

test('init -b main', () => {
  const p = parseCommands('git init -b main\ngit commit')
  assert.equal(p.init, 'main'); assert.deepEqual(p.cmds, ['git commit'])
})
test('init --initial-branch=trunk', () => assert.equal(parseCommands('git init --initial-branch=trunk').init, 'trunk'))
test('init only counts as first line', () => assert.deepEqual(parseCommands('git commit\ngit init -b main').cmds, ['git commit', 'git init -b main']))
test('quiz takes init from the setup', () => assert.equal(parseQuiz('git init -b main\n---\ngit commit').init, 'main'))
test('main with origin', () => {
  const { box } = run(['git push'], { origin: true, init: 'main' })
  assert.ok('origin/main' in viewInfo(box.hv).refs); assert.ok('main' in viewInfo(box.ov).refs)
  assert.equal(box.hv.currentBranch, 'main')
})
test('default stays master', () => assert.equal(parseCommands('git commit').init, 'master'))
