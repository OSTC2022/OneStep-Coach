/**
 * Strava 오버레이 텍스트 파싱 검증
 * 실행: node scripts/verify-strava-metrics.mjs
 */
import assert from 'node:assert/strict'

function parseDurationToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function formatSecondsAsDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function parseHumanDurationToken(token) {
  const hms = token.trim().match(
    /^(\d{1,2})\s*h(?:ours?|r)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?(?:\s*(\d{1,2})\s*s(?:ec(?:ond)?s?)?)?$/i,
  )
  if (hms) {
    const totalSeconds =
      Number(hms[1]) * 3600 + Number(hms[2]) * 60 + (hms[3] ? Number(hms[3]) : 0)
    return formatSecondsAsDuration(totalSeconds)
  }
  return null
}

function scanFragmentForDistanceKm(fragment) {
  const match = fragment.match(/(\d{1,3}[.,]\d{1,2})\s*(?:km|KM)?/i)
  if (!match) return null
  return Math.round(Number(match[1].replace(',', '.')) * 100) / 100
}

const STRAVA_TEXT = `
STRAVA
Distance
12.32 km
Pace
5:35 /km
Time
1h 8m
`

const lines = STRAVA_TEXT.trim().split('\n').map((l) => l.trim())
let distance = null
let duration = null
let pace = null

for (let i = 0; i < lines.length; i++) {
  if (/^distance$/i.test(lines[i])) {
    distance = scanFragmentForDistanceKm(lines.slice(i + 1, i + 3).join(' '))
  }
  if (/^time$/i.test(lines[i])) {
    const nearby = lines.slice(i + 1, i + 3).join(' ')
    const human = nearby.match(/(\d{1,2}\s*h\s*\d{1,2}\s*m)/i)
    if (human) duration = parseHumanDurationToken(human[1])
  }
}

const paceMatch = STRAVA_TEXT.match(/(\d{1,2}\s*:\s*\d{2})\s*\/\s*km/i)
pace = paceMatch?.[1].replace(/\s+/g, '')

assert.equal(distance, 12.32, `distance ${distance}`)
assert.equal(duration, '1:08:00', `duration ${duration}`)
assert.equal(pace, '5:35', `pace ${pace}`)

const durSec = parseDurationToSeconds(duration)
const paceSec = 5 * 60 + 35
const implied = Math.round((durSec / paceSec) * 100) / 100
assert.ok(Math.abs(implied - 12.32) < 0.2, `implied ${implied}`)

console.log('[verify-strava-metrics] OK', { distance, duration, pace, implied })
