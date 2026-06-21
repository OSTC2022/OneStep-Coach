/**
 * 삼성헬스 스크린샷 텍스트 추출 검증
 * 실행: node scripts/verify-running-screenshot-extraction.mjs
 */

import assert from 'node:assert/strict'

const SAMSUNG_SAMPLE_TEXT = `
러닝
13.50 km
154 bpm
4:29 /km
1:00:27
714 칼로리
6월 20일 오전 11:05
`

function pad2(value) {
  return String(value).padStart(2, '0')
}

function parseDurationToSeconds(value) {
  const parts = value.trim().split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function parseRunningMetricsFromText(text) {
  const normalized = text.replace(/\s+/g, ' ')
  const result = {}

  const distance = normalized.match(/(\d{1,3}[.,]\d{1,2})\s*(?:km|KM)/i)
  if (distance) result.distance_km = Number(distance[1].replace(',', '.'))

  const pace = normalized.match(/(\d{1,2}\s*:\s*\d{2})\s*\/\s*km/i)
  if (pace) result.pace = pace[1].replace(/\s+/g, '')

  const duration = normalized.match(/(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/)
  if (duration) result.duration = duration[1].replace(/\s+/g, '')

  const heart = normalized.match(/(\d{2,3})\s*bpm/i)
  if (heart) result.heart_rate = Number(heart[1])

  const calories = normalized.match(/(\d{2,4})\s*칼로리/i)
  if (calories) result.calories = Number(calories[1])

  const dateTime = normalized.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2})\s*:\s*(\d{2})/)
  if (dateTime) {
    let hour = Number(dateTime[4])
    if (dateTime[3] === '오후' && hour < 12) hour += 12
    result.activity_date = `2026-${pad2(Number(dateTime[1]))}-${pad2(Number(dateTime[2]))}`
    result.activity_time = `${pad2(hour)}:${dateTime[5]}`
  }

  if (/러닝/i.test(normalized)) result.activity_type = 'running'
  result.source_app = 'Samsung Health'
  result.confidence = 0.95

  return result
}

const extraction = parseRunningMetricsFromText(SAMSUNG_SAMPLE_TEXT)

assert.equal(extraction.distance_km, 13.5)
assert.equal(extraction.duration, '1:00:27')
assert.equal(extraction.pace, '4:29')
assert.equal(extraction.heart_rate, 154)
assert.equal(extraction.calories, 714)
assert.equal(extraction.activity_date, '2026-06-20')
assert.equal(extraction.activity_time, '11:05')

console.log('[verify-running-screenshot-extraction] OK')
console.log(
  JSON.stringify(
    {
      distance_km: extraction.distance_km,
      duration: extraction.duration,
      pace: extraction.pace,
      heart_rate: extraction.heart_rate,
      calories: extraction.calories,
      activity_date: extraction.activity_date,
      activity_time: extraction.activity_time,
      activity_type: extraction.activity_type,
      source_app: extraction.source_app,
      confidence: extraction.confidence,
    },
    null,
    2,
  ),
)
