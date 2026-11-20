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
  { name: 'stash', cmds: ['edit', 'git stash', 'git commit', 'edit', 'git stash', 'git stash drop', 'git stash pop'] },
  { name: 'remote', opts: { origin: true }, cmds: ['git commit -m a', 'git push', 'git commit --amend -m b', 'git push --force-with-lease', 'git switch -c dev', 'git commit', 'git push -u origin dev', 'git push origin --delete dev', 'git fetch --prune'] },
  { name: 'worktree', cmds: ['git worktree add -b dev ../wt', 'git -C ../wt commit', 'cd ../wt', 'git commit', 'cd .', 'git worktree add --detach ../wt2 dev^', 'git worktree remove ../wt2'] },
  { name: 'detached commits', cmds: ['git commit', 'git switch --detach HEAD', 'git commit', 'git commit --amend -m x', 'git switch -c saved'] },
  { name: 'files', cmds: ['echo "a b" > f', 'git add f', 'git commit -m one', 'echo c >> f', 'git commit -am two', 'git mv f g', 'git commit -m three'] },
  { name: 'reset and restore', cmds: ['echo v1 > f', 'git add f', 'git commit', 'echo v2 > f', 'git commit -am v2', 'git reset HEAD~', 'git restore f', 'git switch -c dev', 'echo u > u', 'git clean -f', 'git reset --hard'] },
  { name: 'diff and show', cmds: ['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'git diff', 'git diff --stat', 'git show'] },
  { name: 'conflict', cmds: ['echo a > f', 'git add f', 'git commit', 'git switch -c dev', 'echo dev > f', 'git commit -am dev', 'git switch master', 'echo m > f', 'git commit -am m', 'git merge dev', 'git checkout --theirs f', 'git add f', 'git commit -m merged'] },
  { name: 'rebase with conflict', cmds: ['echo 1 > f', 'git add f', 'git commit', 'git switch -c t', 'echo T > f', 'git commit -am t', 'echo b > b', 'git add b', 'git commit -m b', 'git switch master', 'echo M > f', 'git commit -am m', 'git switch t', 'git rebase master', 'echo TM > f', 'git add f', 'git rebase --continue', 'git cherry-pick master', 'git revert HEAD'] },
  { name: 'stash with files', cmds: ['echo a > f', 'git add f', 'git commit', 'echo b >> f', 'echo u > u', 'git stash -u', 'git stash list', 'git stash pop', 'git add f', 'git stash --keep-index', 'git stash apply --index'] },
  { name: 'log', cmds: ['git commit -m one', 'git switch -c dev', 'git commit -m d1', 'git switch master', 'git commit -m m1', 'git merge dev', 'git log --oneline --all', 'git log master..dev'] },
  { name: 'reflog', cmds: ['git commit -m a', 'git commit -m lost', 'git reset --hard HEAD~', 'git branch rescue HEAD@{1}', 'git reflog', 'git log -g'] },
  { name: 'gc', cmds: ['git commit -m a', 'git commit -m lost', 'git reset --hard HEAD~', 'git fsck --no-reflogs', 'git reflog expire --expire=now --all', 'git gc --prune=now'] },
  { name: 'tags', opts: { origin: true }, cmds: ['git commit -m a', 'git tag -a v1 -m one', 'git commit -m b', 'git tag v2', 'git push --follow-tags', 'git describe', 'git tag -d v2'] },
  { name: 'branch info and alias', opts: { origin: true }, cmds: ['git commit -m a', 'git push', 'git commit -m b', 'git branch -vv', 'git config alias.co checkout', 'git co -b dev', 'git branch --merged master'] },
  { name: 'team', opts: { origin: true }, cmds: ['git commit -m start', 'git push', '@origin git config user.name Jessica', '@origin git commit -m j', 'git commit -m john', 'git push', 'git fetch', 'git merge origin/master', 'git push'] },
  { name: 'tracking', opts: { origin: true }, cmds: ['@origin git switch -c serverfix', '@origin git commit -m fix', 'git fetch', 'git switch serverfix', 'git commit -m more', 'git push origin +serverfix:awesome', 'git fetch origin master:refs/remotes/origin/mine'] },
  { name: 'autosquash', cmds: ['echo a > f', 'git add f', 'git commit -m base', 'git switch -c t', 'echo b >> f', 'git commit -am b', 'echo c >> f', 'git commit -a --fixup HEAD', 'git rebase --autosquash master', 'git switch master', 'git merge --no-ff t', 'git revert -m 1 HEAD'] },
  { name: 'rebase-i', cmds: ['echo a > f', 'git add f', 'git commit -m base', 'echo 1 > one', 'git add one', 'git commit -m one', 'echo 2 > two', 'git add two', 'git commit -m two', 'echo 3 > three', 'git add three', 'git commit -m three', 'git rebase -i HEAD~3', 'move 3 1', 'squash 3', 'edit 2', ':wq', 'git commit --amend -m changed', 'git rebase --continue'] },
  { name: 'bisect', cmds: ['echo 0 > f', 'git add f', 'git commit -m c0', 'echo 1 >> f', 'git commit -am c1', 'echo 2 >> f', 'git commit -am c2', 'echo 3 >> f', 'git commit -am c3', 'echo 4 >> f', 'git commit -am c4', 'git bisect start HEAD HEAD~4', 'git bisect bad', 'git bisect skip', 'git bisect good', 'git bisect log', 'git bisect reset'] },
]

// graph, file contents, index and working tree; also in another language
const result = box => ({
  graph: graph(box), index: box.hv.index, work: box.hv.work, reflog: box.hv.reflog,
  selected: box.hv.svg.selectAll('circle.selected').data().map(d => d.id)
})
for (const { name, cmds, opts } of SCRIPTS) {
  test(`replay is identical: ${name}`, () => assert.deepEqual(result(run(cmds, opts).box), result(run(cmds, opts).box)))
  test(`replay does not depend on the language: ${name}`, () =>
    assert.deepEqual(result(run(cmds, { ...opts, lang: 'de' }).box), result(run(cmds, { ...opts, lang: 'en' }).box)))
}
