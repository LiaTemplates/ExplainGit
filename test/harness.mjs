// Runs ExplainGit in jsdom: run(cmds) gives the sandbox, the console log and the state
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { pretendToBeVisual: true })
for (const k of ['window', 'document', 'Node', 'Element', 'SVGElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'])
  globalThis[k] = k === 'window' ? dom.window : dom.window[k]
// jsdom has no layout
dom.window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })

const repo = await import('../src/repo.js')
export const { viewInfo, parseCommands, snapshot, compare } = repo

export function run(cmds, opts = {}) {
  const area = document.createElement('div')
  document.body.appendChild(area)
  const box = new repo.Sandbox(area, opts.name || 'test', { origin: !!opts.origin, init: opts.init || 'master', intro: '' })
  for (const cmd of cmds) box.run(cmd)
  const log = [...area.querySelectorAll('.log > div')].map(el => ({
    kind: el.classList.contains('command-entry') ? 'cmd' : el.classList.contains('error') ? 'error' : 'info',
    text: el.textContent.replace(/[⁨⁩]/g, '')
  }))
  return { box, log, state: repo.snapshot(box) }
}

export const same = (a, b, opts) => repo.compare(run(a, opts).state, run(b, opts).state).length === 0

export const graph = box => box.hv.commitData.map(c => [c.id, c.parent, c.parent2 || null, [...c.tags].sort()])

const strip = v => JSON.parse(JSON.stringify({ ...v, byId: undefined }))

// a rejected command shows an error and changes nothing
export function unchanged(cmds, bad, opts) {
  const before = run(cmds, opts)
  const after = run(cmds.concat(bad), opts)
  assert.equal(after.log.at(-1).kind, 'error', bad)
  assert.doesNotMatch(after.log.at(-1).text, /undefined/, bad)
  assert.deepEqual(graph(after.box), graph(before.box), bad)
  assert.deepEqual(strip(viewInfo(after.box.hv)), strip(viewInfo(before.box.hv)), bad)
  if (opts && opts.origin) assert.deepEqual(graph({ hv: after.box.ov }), graph({ hv: before.box.ov }), bad)
}
