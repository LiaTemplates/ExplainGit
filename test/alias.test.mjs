import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, unchanged } from './harness.mjs'

test('alias for a command', () => assert.equal(run(['git config --global alias.co checkout', 'git branch dev', 'git co dev']).box.hv.currentBranch, 'dev'))
test('alias with several words', () => {
  const r = run(['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'git add f', "git config --global alias.unstage 'reset HEAD --'", 'git unstage f'])
  assert.deepEqual(r.box.hv.index.f, ['a'])
})
test('alias last', () => assert.match(run(['git commit -m x', "git config alias.last 'log -1 HEAD'", 'git last']).log.at(-1).text, /^ {4}x$/))
test('an alias that calls itself is an error', () => unchanged(['git config alias.x x'], 'git x'))
test('shell aliases are not supported', () => unchanged(["git config alias.vis '!gitk'"], 'git vis'))
test('aliases cannot replace git commands', () => assert.equal(run(['git config alias.commit status', 'git commit -m y']).box.hv.getCommit('HEAD').message, 'y'))
