import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, graph } from './harness.mjs'

// every task adds a script with its commands: replaying it must give the same graph
export const SCRIPTS = [
  { name: 'merge --no-ff', cmds: ['git checkout -b dev', 'git commit', 'git checkout master', 'git merge --no-ff dev'] },
  { name: 'switch', cmds: ['git switch -c dev', 'git commit', 'git switch -', 'git switch --detach HEAD', 'git checkout -b x HEAD^'] },
  { name: 'branch', cmds: ['git switch -c feature/x', 'git commit', 'git branch -m feature/y', 'git branch -c feature/y copy', 'git branch -f copy HEAD^'] },
  { name: 'commit', cmds: ['git commit -m one', 'git commit --amend -m two', 'git commit -am three', 'git commit --allow-empty'] },
  { name: 'cherry-pick', cmds: ['git switch -c dev', 'git commit -m a', 'git commit -m b', 'git switch master', 'git cherry-pick dev^ dev'] },
  { name: 'merge --squash', cmds: ['git switch -c dev', 'git commit', 'git commit', 'git switch master', 'git merge --squash dev', 'git commit -m all'] },
  { name: 'rebase', cmds: ['git switch -c t1', 'git commit -m B', 'git switch -c t2', 'git commit -m C', 'git switch master', 'git commit -m M', 'git switch t2', 'git rebase --update-refs master', 'git rebase --onto master t1 t2'] },
  { name: 'status', cmds: ['git commit', 'git reset --soft HEAD^', 'git commit', 'edit', 'git add .', 'git restore --staged .', 'git restore .'] },
]

for (const { name, cmds, opts } of SCRIPTS)
  test(`replay is identical: ${name}`, () => assert.deepEqual(graph(run(cmds, opts).box), graph(run(cmds, opts).box)))
