// Small text files: line diff, three-way merge and trees.
// A file is an array of lines, a tree is { path: lines }. No DOM, so Node can test it.

const same = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((l, i) => l === b[i]))

// id of a content, like a short blob hash (FNV-1a + murmur3 final mix)
export function blobId(lines) {
  const str = 'blob ' + lines.join('\n')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return ('0000000' + h.toString(16)).slice(-7)
}

// lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  return t
}

export function diffLines(a, b) {
  const t = lcsTable(a, b)
  const out = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ op: ' ', line: a[i] }); i++; j++
    } else if (j >= b.length || (i < a.length && t[i + 1][j] >= t[i][j + 1])) {
      out.push({ op: '-', line: a[i] }); i++
    } else {
      out.push({ op: '+', line: b[j] }); j++
    }
  }
  return out
}

// base index -> index in the other version, for lines both keep
function matches(base, other) {
  const t = lcsTable(base, other)
  const map = new Map()
  let i = 0, j = 0
  while (i < base.length && j < other.length) {
    if (base[i] === other[j]) { map.set(i, j); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) i++
    else j++
  }
  return map
}

// diff3: lines that stay in all three versions are anchors; between them each side
// either kept the base, or both changed the same way, or it is a conflict
export function merge3(base, ours, theirs, labels, style) {
  const mo = matches(base, ours)
  const mt = matches(base, theirs)
  const lines = []
  let conflict = false
  let b = 0, o = 0, t = 0
  const chunk = (bEnd, oEnd, tEnd) => {
    const cb = base.slice(b, bEnd), co = ours.slice(o, oEnd), ct = theirs.slice(t, tEnd)
    if (same(co, cb)) lines.push(...ct)
    else if (same(ct, cb) || same(co, ct)) lines.push(...co)
    else {
      conflict = true
      lines.push('<<<<<<< ' + labels.ours, ...co)
      if (style === 'diff3') lines.push('||||||| base', ...cb)
      lines.push('=======', ...ct, '>>>>>>> ' + labels.theirs)
    }
  }
  for (let i = 0; i < base.length; i++) {
    if (!mo.has(i) || !mt.has(i) || mo.get(i) < o || mt.get(i) < t) continue
    chunk(i, mo.get(i), mt.get(i))
    lines.push(base[i])
    b = i + 1; o = mo.get(i) + 1; t = mt.get(i) + 1
  }
  chunk(base.length, ours.length, theirs.length)
  return { lines, conflict }
}

// merge whole trees; a file deleted on one side and changed on the other is a conflict
export function mergeTrees(base, ours, theirs, labels, style) {
  const tree = {}
  const conflicts = []
  const unmerged = {}
  const paths = [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort()
  for (const p of paths) {
    const b = base[p], o = ours[p], t = theirs[p]
    let result
    if (same(o, t)) result = o
    else if (same(o, b)) result = t
    else if (same(t, b)) result = o
    else if (o && t) {
      const m = merge3(b || [], o, t, labels, style)
      result = m.lines
      if (m.conflict) { conflicts.push(p); unmerged[p] = { base: b, ours: o, theirs: t } }
    } else {
      // deleted on one side, changed on the other: keep the changed file, mark it
      result = o || t
      conflicts.push(p)
      unmerged[p] = { base: b, ours: o, theirs: t }
    }
    if (result) tree[p] = result
  }
  return { tree, conflicts, unmerged }
}

// one hunk over the whole file (the files are small)
export function formatDiff(path, a, b) {
  if (same(a, b)) return []
  const head = ['diff --git a/' + path + ' b/' + path]
  if (!a) head.push('new file', '--- /dev/null', '+++ b/' + path)
  else if (!b) head.push('deleted file', '--- a/' + path, '+++ /dev/null')
  else head.push('--- a/' + path, '+++ b/' + path)
  const x = a || [], y = b || []
  head.push(`@@ -${x.length ? 1 : 0},${x.length} +${y.length ? 1 : 0},${y.length} @@`)
  return head.concat(diffLines(x, y).map(d => d.op + d.line))
}

export function changedPaths(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(p => !same(a[p], b[p])).sort()
}

export function diffStat(a, b) {
  const files = changedPaths(a, b).map(path => {
    const d = diffLines(a[path] || [], b[path] || [])
    return { path, plus: d.filter(x => x.op === '+').length, minus: d.filter(x => x.op === '-').length }
  })
  return { files, plus: files.reduce((s, f) => s + f.plus, 0), minus: files.reduce((s, f) => s + f.minus, 0) }
}

export const sameLines = same
