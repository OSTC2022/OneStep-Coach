/**
 * 서명+상태창 셸 리사이즈/잠금 저장 검증
 */

import assert from 'node:assert/strict'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function clampShellPrefs(prefs) {
  return {
    widthRatio: clamp(prefs?.widthRatio ?? 0.94, 0.45, 1),
    heightRatio: clamp(prefs?.heightRatio ?? 0.9, 0.45, 1),
    locked: Boolean(prefs?.locked),
  }
}

function applyShellResize(edge, start, clientX, clientY) {
  const dx = clientX - start.clientX
  const dy = clientY - start.clientY
  let width = start.width
  let height = start.height
  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('w')) width = start.width - dx
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('n')) height = start.height - dy
  return {
    width: clamp(Math.round(width), 320, 1200),
    height: clamp(Math.round(height), 420, 900),
  }
}

const prefs = clampShellPrefs({ widthRatio: 1.5, heightRatio: 0.2, locked: 1 })
assert.equal(prefs.widthRatio, 1)
assert.equal(prefs.heightRatio, 0.45)
assert.equal(prefs.locked, true)

const se = applyShellResize(
  'se',
  { width: 800, height: 600, clientX: 100, clientY: 100 },
  150,
  140,
)
assert.equal(se.width, 850)
assert.equal(se.height, 640)

const nw = applyShellResize(
  'nw',
  { width: 800, height: 600, clientX: 100, clientY: 100 },
  80,
  80,
)
assert.equal(nw.width, 820)
assert.equal(nw.height, 620)

console.log('All signature shell resize checks passed')
