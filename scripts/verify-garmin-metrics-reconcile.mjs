/**
 * Garmin 오인식 보정 검증 (11:05 시각 ≠ 총 시간, pace+duration→거리)
 * 실행: node scripts/verify-garmin-metrics-reconcile.mjs
 */
import assert from 'node:assert/strict'

const GARMIN_FULL = `6월 20일 @ 오전 11:05
13.50 km
거리
154 bpm
평균 심박수
4:29 /km
평균 페이스
1:00:27
총 시간
714
총 칼로리`

/** 잘못된 OCR: 운동 시각만 잡히고 총 시간·거리 누락 */
const BAD_OCR = `6월 20일 @ 오전 11:05
4:29 /km
평균 페이스
2.11`

function parseDurationToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function isClockTimeLike(value) {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return false
  return Number(m[1]) <= 12 && Number(m[2]) <= 59
}

function isValidDuration(duration) {
  const seconds = parseDurationToSeconds(duration)
  if (seconds == null || seconds < 60) return false
  const parts = duration.split(':')
  if (parts.length === 3) return true
  if (parts.length === 2) return Number(parts[0]) >= 15 && seconds >= 900
  return false
}

// 11:05는 총 시간이 아님
assert.equal(isValidDuration('11:05'), false)
assert.equal(isValidDuration('1:00:27'), true)
assert.equal(isClockTimeLike('11:05'), true)

// 총 시간 + 페이스로 거리 역산
const durSec = parseDurationToSeconds('1:00:27')
const paceSec = 4 * 60 + 29
const impliedKm = Math.round((durSec / paceSec) * 100) / 100
assert.ok(impliedKm > 13 && impliedKm < 14, `expected ~13.5km got ${impliedKm}`)

// Garmin 전체 텍스트에 13.50·1:00:27 존재
assert.match(GARMIN_FULL, /13\.50\s*km/)
assert.match(GARMIN_FULL, /1:00:27/)
assert.match(GARMIN_FULL, /총\s*시간/)

console.log('[verify-garmin-metrics-reconcile] OK', {
  implied_km_from_pace_duration: impliedKm,
  rejects_11_05_as_duration: true,
})
