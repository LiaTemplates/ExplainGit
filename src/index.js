// ExplainGit for LiaScript: widget, quiz check and collaborative mode
import css from 'bundle-text:./explaingit.css'
import { Sandbox, parseCommands, parseQuiz, viewInfo, refLabel, snapshot, compare, needsStatus } from './repo.js'
import { tr, fill, lang, translatable, noteLang } from './i18n.js'

const PREFIX = 'ExplainGit:'

// --- page setup (once) -------------------------------------------------------

function injectOnce() {
  if (document.getElementById('explaingit-style')) return

  const style = document.createElement('style')
  style.id = 'explaingit-style'
  style.textContent = css
  document.head.appendChild(style)

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  defs.setAttribute('aria-hidden', 'true')
  defs.setAttribute('width', '0')
  defs.setAttribute('height', '0')
  defs.style.position = 'absolute'
  const marker = (id, fill) =>
    `<marker id="${id}" refX="5" refY="5" markerUnits="strokeWidth" fill="${fill}"
       markerWidth="4" markerHeight="3" orient="auto" viewBox="0 0 10 10">
       <path d="M 0 0 L 10 5 L 0 10 z"/></marker>`
  defs.innerHTML =
    marker('explaingit-triangle', '#666') +
    marker('explaingit-faded-triangle', '#DDD') +
    marker('explaingit-brown-triangle', '#663300')
  document.body.appendChild(defs)
}

// runs commands in a hidden sandbox and returns its state
const expectedCache = new Map()
function simulate(cmds, origin, init) {
  const key = JSON.stringify([cmds, origin, init])
  if (expectedCache.has(key)) return expectedCache.get(key)

  injectOnce()
  const host = document.createElement('div')
  host.className = 'explaingit'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:800px;visibility:hidden'
  document.body.appendChild(host)
  const box = new Sandbox(host, 'expected-' + expectedCache.size, { origin, init, intro: '' })
  for (const cmd of cmds) box.run(cmd)
  const state = snapshot(box)
  box.destroy()
  host.remove()

  expectedCache.set(key, state)
  return state
}

// --- widget ------------------------------------------------------------------

const instances = {}
const privateHistory = {} // commands typed alone, kept while the course is open
const collabChoice = {} // widgets switched to collaborative mode

function button() {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'lia-btn lia-btn--outline lia-btn--tiny'
  return b
}

class Widget {
  constructor(id, root, text, options) {
    this.id = id
    this.root = root
    this.options = options || {}

    const quiz = this.options.quiz ? parseQuiz(text) : null
    const plain = quiz ? null : parseCommands(text)
    this.setup = quiz ? quiz.setup : plain.cmds
    this.origin = quiz ? quiz.origin : plain.origin
    this.init = quiz ? quiz.init : plain.init
    this.quiz = quiz

    root.innerHTML = ''
    const toolbar = document.createElement('div')
    toolbar.className = 'explaingit-toolbar'
    this.resetBtn = button()
    this.resetBtn.onclick = () => this.reset()
    this.collabBtn = button()
    this.collabBtn.setAttribute('aria-pressed', 'false')
    this.collabBtn.hidden = true
    this.collabBtn.onclick = () => this.setCollaborative(!this.collab)
    this.status = document.createElement('span')
    this.status.className = 'explaingit-status'
    this.status.setAttribute('aria-live', 'polite')
    toolbar.append(this.resetBtn, this.collabBtn, this.status)

    this.area = document.createElement('div')
    this.area.className = 'explaingit'
    this.summary = document.createElement('div')
    this.summary.className = 'explaingit-sr-only'
    this.summary.setAttribute('aria-live', 'polite')

    root.append(toolbar, this.area, this.summary)

    this.collab = false
    this.shared = null
    this.applied = []
    this.offs = []
    this.observer = () => this.sync()

    this.labels()
    this.rebuild(privateHistory[id] || [])
    this.watchClassroom()
  }

  get alive() {
    return this.root.isConnected
  }

  rebuild(cmds, who) {
    if (this.box) this.box.destroy()
    this.box = new Sandbox(this.area, this.id, { origin: this.origin, init: this.init, intro: tr('intro') })
    this.box.cb.onInput = cmd => this.input(cmd)
    for (const cmd of this.setup) this.box.run(cmd)
    for (const cmd of cmds) this.box.run(cmd)
    this.describe()
  }

  input(cmd) {
    if (this.collab && this.shared) {
      const me = (window.LIA && LIA.classroom.me) || {}
      this.shared.push([
        {
          c: cmd,
          k: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          n: me.name || '',
          s: me.symbol || '',
          col: me.color || ''
        }
      ])
    } else {
      ;(privateHistory[this.id] = privateHistory[this.id] || []).push(cmd)
      this.box.run(cmd)
      this.describe()
    }
  }

  reset() {
    if (this.collab && this.shared) {
      if (!LIA.classroom.owner) {
        this.box.cb.error(tr('ownerOnly'))
        return
      }
      this.shared.delete(0, this.shared.length)
      return
    }
    delete privateHistory[this.id]
    this.rebuild([])
  }

  // the shared list only grows; apply new entries, rebuild on anything else
  sync() {
    if (!this.alive) return this.destroy()
    if (!this.collab || !this.shared) return
    const entries = this.shared.toArray()
    const fits = this.applied.every((k, i) => entries[i] && entries[i].k === k)
    if (!fits || entries.length < this.applied.length) {
      this.applied = []
      this.rebuild([])
      if (entries.length === 0) this.box.cb.info(tr('cleared'))
    }
    for (const e of entries.slice(this.applied.length)) {
      this.box.run(e.c, { name: e.n, symbol: e.s, color: e.col })
      this.applied.push(e.k)
    }
    this.describe()
  }

  setCollaborative(on) {
    if (on && !(window.LIA && LIA.classroom && LIA.classroom.connected)) return
    if (this.shared) this.shared.unobserve(this.observer)
    this.shared = null
    this.applied = []
    this.collab = on
    collabChoice[this.id] = on
    this.collabBtn.setAttribute('aria-pressed', String(on))
    this.labels()

    if (on) {
      this.shared = LIA.classroom.array(PREFIX + this.id)
      if (!this.shared) return this.setCollaborative(false)
      this.shared.observe(this.observer)
      this.rebuild([])
      this.box.cb.info(tr('joined'))
      this.sync()
    } else {
      this.rebuild(privateHistory[this.id] || [])
      this.box.cb.info(tr('left'))
    }
  }

  // texts of the toolbar; Google Translate may translate them only when
  // there are no own texts for the page language
  labels() {
    this.root.setAttribute('translate', translatable() ? 'yes' : 'no')
    this.root.classList.toggle('notranslate', !translatable())
    this.resetBtn.textContent = tr('reset')
    this.resetBtn.title = tr('resetTitle')
    this.collabBtn.textContent = this.collab ? tr('alone') : tr('collab')
    this.collabBtn.title = this.collab ? tr('aloneTitle') : tr('collabTitle')
    this.showPeers()
  }

  // language changed: replay the commands, so every message is in the new language
  relabel() {
    this.labels()
    if (this.collab) {
      this.applied = []
      this.rebuild([])
      this.sync()
    } else this.rebuild(privateHistory[this.id] || [])
  }

  showPeers() {
    // some backends (Local) do not report peers: then no count
    const n = this.collab && window.LIA ? LIA.classroom.peers().length : 0
    fill(this.status, !this.collab ? '' : n ? tr('shared', n) : tr('sharedNoCount'))
  }

  watchClassroom() {
    const room = window.LIA && LIA.classroom
    if (!room || !room.on) return
    this.offs.push(
      room.on('connect', () => {
        if (!this.alive) return this.destroy()
        this.collabBtn.hidden = false
        // a new room has a new document: request the shared list again
        if (collabChoice[this.id]) this.setCollaborative(true)
      }),
      room.on('disconnect', () => {
        if (!this.alive) return this.destroy()
        this.collabBtn.hidden = true
        if (this.collab) this.setCollaborative(false)
      }),
      room.on('peers', () => {
        if (!this.alive) return this.destroy()
        this.showPeers()
      })
    )
  }

  // a short text version of the graph for screen readers
  describe() {
    const v = viewInfo(this.box.hv)
    const parts = [tr('summaryHead', v.branch)]
    for (const name of Object.keys(v.refs).sort()) parts.push(tr('summaryRef', refLabel(name), v.refs[name]))
    fill(this.summary, parts.join(' '))
  }

  check(resolve) {
    const q = this.quiz
    if (resolve) {
      if (this.collab) this.setCollaborative(false)
      privateHistory[this.id] = q.solution.slice()
      this.rebuild(q.solution)
      return false
    }
    const expected = simulate(q.setup.concat(q.solution), q.origin, q.init)
    const problems = compare(snapshot(this.box), expected, { status: needsStatus(q.setup.concat(q.solution)) })
    if (problems.length) throw new Error(problems.join(' '))
    return true
  }

  destroy() {
    if (this.shared) this.shared.unobserve(this.observer)
    this.shared = null
    this.offs.forEach(off => off && off())
    this.offs = []
    if (instances[this.id] === this) delete instances[this.id]
  }
}

// --- public API, used by the macros ------------------------------------------

function mount(id, text, options, tries = 0) {
  const root = document.getElementById('explaingit_' + id)
  if (!root) {
    if (tries < 50) setTimeout(() => mount(id, text, options, tries + 1), 20)
    return
  }
  injectOnce()
  if (instances[id]) instances[id].destroy()
  instances[id] = new Widget(id, root, text, options)
}

function check(id, resolve) {
  const w = instances[id]
  if (!w || !w.quiz) throw new Error(tr('notLoaded'))
  return w.check(resolve === true || resolve === 'true')
}

// <html lang> changes with the course translation and with Google Translate
let shownIn = null
noteLang()
new MutationObserver(() => {
  noteLang()
  const now = lang() + translatable()
  if (now === shownIn) return
  shownIn = now
  for (const w of Object.values(instances)) w.alive ? w.relabel() : w.destroy()
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'class'] })
shownIn = lang() + translatable()

window.ExplainGit = { mount, check }
