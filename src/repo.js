// The repository without the widget: sandbox, parsing and comparing states.
// No CSS import, so the tests can load it in Node.
import { select } from 'd3-selection'
import { ControlBox, HistoryView } from './explaingit.js'
import { tr } from './i18n.js'

// --- commands ----------------------------------------------------------------

// one command per line, empty lines and # comments are skipped
export function parseCommands(text) {
  const cmds = []
  let origin = false
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    if (line === 'create origin') origin = true
    else cmds.push(line)
  }
  return { cmds, origin }
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
    setup: s.cmds,
    solution: l.cmds
  }
}

export const initialCommits = (branch = 'master') => [
  { id: 'e137e9b', tags: [branch], message: 'first commit' }
]

// a repository with its views, rendered into `area`
export class Sandbox {
  constructor(area, name, { origin = false, init = 'master', intro = '' } = {}) {
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

    this.ov = null
    if (origin) {
      this.ov = new HistoryView({
        name: 'ExplainGit-' + name + '-Origin',
        seed: name + '-origin',
        width: 300,
        height: 225,
        commitRadius: 15,
        remoteName: 'origin',
        currentBranch: init,
        commitData: initialCommits(init)
      })
      this.ov.render(playground)
    }

    this.cb = new ControlBox({
      historyView: this.hv,
      originView: this.ov,
      initialMessage: intro
    })
    this.cb.render(playground)
    this.hv.render(playground)
    this.hv.svg.attr('role', 'img').attr('aria-label', tr('graph'))
    this.playground = playground
  }

  run(cmd, who) {
    this.cb.command(cmd, who)
  }

  destroy() {
    try {
      this.cb.destroy()
      this.hv.destroy()
      if (this.ov) this.ov.destroy()
    } catch (e) {}
    this.playground.remove()
  }
}

// --- comparing repositories --------------------------------------------------

export function refLabel(name) {
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
    head: headCommit ? headCommit.id : null
  }
}

// Numbers the commits reachable from the given start points in a fixed order.
// Two repositories give the same encoding exactly when their graphs (parent
// order included) and their refs are the same, whatever the commit ids are.
export function encode(starts) {
  const num = new Map()
  const nodes = []
  const visit = (id, byId) => {
    if (!id || id === 'initial' || !byId[id]) return '-'
    if (num.has(id)) return num.get(id)
    const n = num.size
    num.set(id, n)
    const c = byId[id]
    nodes[n] = [visit(c.parent, byId), visit(c.parent2, byId)]
    return n
  }
  const marks = starts.map(([label, id, byId]) => [label, visit(id, byId)])
  return JSON.stringify({ marks, nodes })
}

export function snapshot(sandbox) {
  const views = [['', viewInfo(sandbox.hv)]]
  if (sandbox.ov) views.push(['origin/', viewInfo(sandbox.ov)])
  return views
}

export function compare(actual, expected) {
  const problems = []
  // start points for the whole graph: the refs of the solution, then HEAD
  const starts = views =>
    views.flatMap(([scope, v], i) => {
      const names = Object.keys(expected[i][1].refs).sort()
      const list = names.map(name => [scope + name, v.refs[name], v.byId])
      if (scope === '') list.push(['HEAD', v.head, v.byId], ['HEAD->' + (v.branch || ''), null, v.byId])
      return list
    })

  for (let i = 0; i < expected.length; i++) {
    const [scope, exp] = expected[i]
    const act = (actual[i] || [scope, { refs: {}, byId: {} }])[1]
    const say = s => (scope ? tr('origin', s) : s)
    for (const name of Object.keys(exp.refs).sort()) {
      if (!(name in act.refs)) problems.push(say(tr('missing', refLabel(name))))
      else if (
        encode([[name, act.refs[name], act.byId]]) !==
        encode([[name, exp.refs[name], exp.byId]])
      )
        problems.push(say(tr('wrongRef', refLabel(name))))
    }
    for (const name of Object.keys(act.refs).sort()) {
      // remote tracking branches only matter if the solution has them
      if (!(name in exp.refs) && !name.startsWith('origin/'))
        problems.push(say(tr('extra', refLabel(name))))
    }
  }
  if (problems.length) return problems

  if (encode(starts(actual)) !== encode(starts(expected))) {
    const a = actual[0][1]
    const e = expected[0][1]
    if (
      a.branch !== e.branch ||
      encode([['HEAD', a.head, a.byId]]) !== encode([['HEAD', e.head, e.byId]])
    )
      problems.push(tr('head'))
    else problems.push(tr('shape'))
  }
  return problems
}

