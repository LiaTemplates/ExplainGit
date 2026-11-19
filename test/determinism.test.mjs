import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, graph } from './harness.mjs'

// every task adds a script with its commands: replaying it must give the same graph
export const SCRIPTS = [
  { name: 'merge --no-ff', cmds: ['git checkout -b dev', 'git commit', 'git checkout master', 'git merge --no-ff dev'] },
  { name: 'switch', cmds: ['git switch -c dev', 'git commit', 'git switch -', 'git switch --detach HEAD', 'git checkout -b x HEAD^'] },
]

for (const { name, cmds, opts } of SCRIPTS)
  test(`replay is identical: ${name}`, () => assert.deepEqual(graph(run(cmds, opts).box), graph(run(cmds, opts).box)))
