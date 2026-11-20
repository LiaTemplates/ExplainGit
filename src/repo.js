// The repository without the widget: sandbox, parsing and comparing states.
// No CSS import, so the tests can load it in Node.
import { select } from 'd3-selection'
import { ControlBox, HistoryView, ROOT } from './explaingit.js'
import { tr } from './i18n.js'
import { blobId } from './files.js'

// --- commands ----------------------------------------------------------------

// one command per line, empty lines and # comments are skipped
// `git init -b <name>` as the first command names the first branch
export function parseCommands(text) {
  const cmds = []
  const world = []
  let init = 'master'
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    const named = cmds.length === 0 && /^git init (?:-b |--initial-branch=)(\S+)$/.exec(line)
    const create = /^create (\S+)$/.exec(line)
    if (create) world.push(create[1])
    else if (named) init = named[1]
    else cmds.push(line)
  }
  // `create origin` also makes it the remote origin (as in 0.1.0)
  return { cmds, origin: world.includes('origin'), init, world }
}

// quiz text: setup commands, a line of ---, solution commands
export function parseQuiz(text) {
  const parts = String(text || '').split(/^\s*-{3,}\s*$/m)
  const setup = parts.length > 1 ? parts[0] : ''
  const solution = parts.length > 1 ? parts.slice(1).join('\n') : parts[0]
  const s = parseCommands(setup)
  const l = parseCommands(solution)
  return {
    origin: s.origin || l.origin,
    world: [...new Set(s.world.concat(l.world))],
    init: s.init !== 'master' ? s.init : l.init,
    setup: s.cmds,
    solution: l.cmds
  }
}

export const initialCommits = (branch = 'master') => [
  { id: 'e137e9b', tags: [branch], message: 'first commit' }
]

// a repository with its views, rendered into `area`
export class Sandbox {
  constructor(area, name, { origin = false, init = 'master', intro = '', world = [] } = {}) {
    this.name = name
    const playground = select(area).append('div').classed('playground-container', true)

    const local = initialCommits(init)
    // with a remote, the first branch tracks origin/<branch>, otherwise git pull fails
    if (origin) local[0].tags = ['origin/' + init, init]

    this.hv = new HistoryView({
      name: 'ExplainGit-' + name,
      seed: name,
      height: '100%',
      currentBranch: init,
      commitData: local
    })

    // the world: other repositories (servers, colleagues); origin is also a remote of ours
    this.world = Object.create(null)
    this.playground = playground
    this.panes = []
    const names = [...new Set((origin ? ['origin'] : []).concat(world || []))]
    names.forEach(repo => {
      this.world[repo] = new HistoryView({
        name: 'ExplainGit-' + name + (repo === 'origin' ? '-Origin' : '-World-' + repo),
        seed: name + '-' + repo,
        width: 300,
        height: 225,
        commitRadius: 15,
        remoteName: repo,
        currentBranch: init,
        commitData: initialCommits(init)
      })
    })
    this.ov = this.world.origin || null
    const remotes = Object.create(null)
    if (origin) {
      remotes.origin = this.ov
      this.showRepo(this.ov)
    }

    this.cb = new ControlBox({
      historyView: this.hv,
      remotes: remotes,
      world: this.world,
      showRepo: view => this.showRepo(view),
      initialMessage: intro
    })
    this.cb.render(playground)
    this.hv.render(playground)
    this.hv.svg.attr('role', 'img').attr('aria-label', tr('graph'))
    this.hv.initReflog()

    // files panel below the graph area
    this.filesPanel = document.createElement('table')
    this.filesPanel.className = 'explaingit-files'
    area.insertAdjacentElement('afterend', this.filesPanel)
    this.hv.filesPanel = this.filesPanel
    this.hv.renderFiles()
  }

  // a pane for a repository of the world, stacked on the right
  showRepo(view) {
    if (this.panes.includes(view)) return
    view.render(this.playground)
    view.svgContainer.style('top', this.panes.length * 230 + 'px')
    this.panes.push(view)
  }

  run(cmd, who) {
    this.cb.command(cmd, who)
  }

  destroy() {
    try {
      this.cb.destroy()
      this.hv.destroy()
      this.panes.forEach(view => view.destroy())
    } catch (e) {}
    this.playground.remove()
    this.filesPanel.remove()
  }
}

// --- comparing repositories --------------------------------------------------

export function refLabel(name) {
  if (name.startsWith('stash@{')) return name
  return /^\[.*\]$/.test(name) ? tr('tag', name.slice(1, -1)) : tr('branch', name)
}

export function viewInfo(hv) {
  const byId = {}
  const refs = {}
  for (const c of hv.commitData) {
    if (!(c.id in byId)) byId[c.id] = c
    for (const tag of c.tags) if (tag !== 'HEAD') refs[tag] = c.id
  }
  const headCommit = hv.getCommit('HEAD')
  return {
    byId,
    refs,
    branch: hv.currentBranch,
    head: headCommit ? headCommit.id : null,
    status: hv.status || 'clean',
    operation: hv.operation ? hv.operation.type : null,
    tags: Object.fromEntries(hv.tagNames().map(t => [t, hv.tagInfo[t] ? 'annotated' : 'lightweight'])),
    files: JSON.parse(JSON.stringify({ head: hv.headTree(), index: hv.index, work: hv.work })),
    // [path, branch, head] of every worktree, by path
    worktrees: hv.worktrees
      .map((w, i) => [w.path, i === hv.active ? hv.currentBranch : w.branch, hv.worktreeHead(i)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }
}

// Numbers the commits reachable from the given start points in a fixed order.
// Two repositories give the same encoding exactly when their graphs (parent
// order included) and their refs are the same, whatever the commit ids are.
// with trees, the content of every commit counts too (blob ids of its files)
const treeKey = tree => Object.keys(tree || {}).sort().map(p => p + ':' + blobId(tree[p])).join(',')

export function encode(starts, withTrees) {
  // commits reachable through parents; copy sources (cherry-pick, squash, revert) count only
  // when reachable, so a gc that removed an unreachable source changes nothing
  const reachable = new Set()
  const walk = (id, byId) => {
    while (id && byId[id] && !reachable.has(id)) {
      reachable.add(id)
      walk(byId[id].parent2, byId)
      id = byId[id].parent
    }
  }
  starts.forEach(([, id, byId]) => walk(id, byId))
  const num = new Map()
  const nodes = []
  const visit = (id, byId) => {
    if (!id || id === ROOT || !byId[id]) return '-'
    if (num.has(id)) return num.get(id)
    const n = num.size
    num.set(id, n)
    const c = byId[id]
    const copy = id => (!id ? '-' : reachable.has(id) ? visit(id, byId) : 'x')
    nodes[n] = [visit(c.parent, byId), visit(c.parent2, byId), copy(c.cherryPickedFrom), copy(c.squashOf), copy(c.reverts)]
    if (withTrees) nodes[n].push(treeKey(c.tree))
    return n
  }
  const marks = starts.map(([label, id, byId]) => [label, visit(id, byId)])
  return JSON.stringify({ marks, nodes })
}

export function snapshot(sandbox) {
  const views = [['', viewInfo(sandbox.hv)]]
  const remotes = sandbox.cb.remotes
  Object.keys(remotes).sort().forEach(name => views.push([name + '/', viewInfo(remotes[name])]))
  return views
}

// quizzes from 0.1.0 had no working tree (every reset was --hard): compare the status
// only when the quiz uses working tree commands
export function needsStatus(cmds) {
  return cmds.some(c =>
    /^edit\b/.test(c) ||
    /^git (-C \S+ )?(add|restore|stash|status)\b/.test(c) ||
    /--(soft|mixed|hard|squash)\b/.test(c))
}

// quizzes that change files: compare contents too
export function needsFiles(cmds) {
  return cmds.some(c =>
    /^(echo|cat|rm|mv|edit)\b/.test(c) ||
    /^git (-C \S+ )?(add|rm|mv|restore|diff|show|clean|stash)\b/.test(c) ||
    /^git (-C \S+ )?checkout\b.* --( |$)/.test(c))
}

// an index that is still being merged: compare its parts
const plainTree = t => JSON.stringify(Object.keys(t).sort().map(p => [p, Array.isArray(t[p]) ? blobId(t[p]) : t[p]]))

export function compare(actual, expected, { status = true, files = false } = {}) {
  const enc = starts => encode(starts, files)
  const problems = []
  // start points for the whole graph: the refs of the solution, then the HEAD of every worktree
  const starts = views =>
    views.flatMap(([scope, v], i) => {
      const names = Object.keys(expected[i][1].refs).sort()
      const list = names.map(name => [scope + name, v.refs[name], v.byId])
      if (scope === '')
        for (const [path, branch, head] of v.worktrees) list.push(['HEAD ' + path, head, v.byId], ['HEAD ' + path + '->' + (branch || ''), null, v.byId])
      return list
    })

  for (let i = 0; i < expected.length; i++) {
    const [scope, exp] = expected[i]
    const act = (actual[i] || [scope, { refs: {}, byId: {} }])[1]
    const say = s => (scope ? tr('origin', s) : s)
    for (const name of Object.keys(exp.refs).sort()) {
      if (!(name in act.refs)) problems.push(say(tr('missing', refLabel(name))))
      else if (
        enc([[name, act.refs[name], act.byId]]) !==
        enc([[name, exp.refs[name], exp.byId]])
      )
        problems.push(say(tr('wrongRef', refLabel(name))))
    }
    for (const name of Object.keys(act.refs).sort()) {
      // remote tracking branches only matter if the solution has them
      if (!(name in exp.refs) && !expected.some(([sc]) => sc && name.startsWith(sc)))
        problems.push(say(tr('extra', refLabel(name))))
    }
  }
  if (problems.length) return problems

  // an annotated tag where a lightweight one is expected is fine, not the other way round
  for (const [t, kind] of Object.entries(expected[0][1].tags || {}))
    if (kind === 'annotated' && (actual[0][1].tags || {})[t] !== kind) return [tr('wrongTagKind', t)]
  if (status && actual[0][1].status !== expected[0][1].status) return [tr('wrongStatus')]
  if (files) {
    const fa = actual[0][1].files, fe = expected[0][1].files
    if (plainTree(fa.index) !== plainTree(fe.index) || plainTree(fa.work) !== plainTree(fe.work)) return [tr('wrongFiles')]
  }

  // every worktree by path: its branch and where its HEAD is ('.' is the main one)
  const a = actual[0][1], e = expected[0][1]
  const byPath = v => new Map(v.worktrees.map(w => [w[0], w]))
  const wa = byPath(a), we = byPath(e)
  for (const [path, w] of we) {
    const got = wa.get(path)
    if (!got) problems.push(tr('worktreeMissing', path))
    else if (got[1] !== w[1] || enc([['wt', got[2], a.byId]]) !== enc([['wt', w[2], e.byId]]))
      problems.push(path === '.' ? tr('head') : tr('worktreeWrong', path))
  }
  for (const path of wa.keys()) if (!we.has(path)) problems.push(tr('worktreeExtra', path))
  if (problems.length) return problems

  if (enc(starts(actual)) !== enc(starts(expected))) problems.push(tr('shape'))
  return problems
}

