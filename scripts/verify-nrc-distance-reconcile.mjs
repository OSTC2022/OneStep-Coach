/**
 * NRC 4.46km + 43:09 + 9'40" — 46.43km OCR 오인식 보정 검증
 */
import assert from 'node:assert/strict'

function parseDurationToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function parsePaceToSeconds(pace) {
  const parts = pace.replace(/\s+/g, '').split(':').map(Number)
  if (parts.length !== 2) return null
  return parts[0] * 60 + parts[1]
}

const duration = '43:09'
const pace = '9:40'
const ocrDistance = 46.43

const implied = Math.round((parseDurationToSeconds(duration) / parsePaceToSeconds(pace)) * 100) / 100

assert.ok(Math.abs(implied - 4.46) < 0.1, `implied ${implied} expected ~4.46`)

const relError = Math.abs(ocrDistance - implied) / implied
assert.ok(relError > 0.22, '46.43 should be flagged inconsistent')

function selectDistanceCandidate(candidates, impliedKm) {
  if (impliedKm != null) {
    return candidates.reduce((best, c) =>
      Math.abs(c - impliedKm) <= Math.abs(best - impliedKm) ? c : best,
    )
  }
  return candidates[0]
}

const fixed = selectDistanceCandidate([4.46, 46.43], implied)
assert.ok(Math.abs(fixed - 4.46) < 0.1, `fixed ${fixed}`)

console.log('[verify-nrc-distance-reconcile] OK', { ocr: ocrDistance, implied, fixed })
