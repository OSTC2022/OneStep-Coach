/**
 * Apple Fitness 1:13:25 → 113:25 OCR 오인식 보정 검증
 * 실행: node scripts/verify-apple-fitness-metrics.mjs
 */
import assert from 'node:assert/strict'

function pad2(value) {
  return String(value).padStart(2, '0')
}

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
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  }
  return `${minutes}:${pad2(seconds)}`
}

function tryRepairMisreadHmsDuration(duration) {
  const parts = duration.trim().split(':')
  if (parts.length !== 2) return null
  const left = parts[0]
  const seconds = Number(parts[1])
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 59) return null
  if (left.length === 3) {
    const hours = Number(left[0])
    const minutes = Number(left.slice(1))
    if (hours >= 0 && hours <= 9 && minutes >= 0 && minutes <= 59) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    }
  }
  return null
}

function parsePaceToSeconds(pace) {
  const parts = pace.replace(/\s+/g, '').split(':').map(Number)
  if (parts.length !== 2) return null
  return parts[0] * 60 + parts[1]
}

function inferYear(month, day, today = new Date('2026-06-23')) {
  const year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  if (candidate.getTime() > today.getTime() + 7 * 24 * 3600 * 1000) return year - 1
  return year
}

function parseDateTimeFromText(text, today = new Date('2026-06-23')) {
  const normalized = text.replace(/\s+/g, ' ').replace(/[@·|]/g, ' ')
  const monthDay = normalized.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*(?:월|화|수|목|금|토|일)(?:요일)?)?/,
  )
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    const year = inferYear(month, day, today)
    return { activity_date: `${year}-${pad2(month)}-${pad2(day)}` }
  }
  return { activity_date: null }
}

const APPLE_OCR = `
실내 걷기
4월 11일 수요일
오후 8:24 - 9:37
404 CAL
활동 대사량
509 CAL
총 칼로리
5.46 KM
거리
113:25
총 시간
108 BPM
평균 심박수
13'26"/KM
평균 페이스
`

const repaired = tryRepairMisreadHmsDuration('113:25')
assert.equal(repaired, '1:13:25', `repaired ${repaired}`)

const paceSec = parsePaceToSeconds('13:26')
const durSec = parseDurationToSeconds(repaired)
const impliedKm = Math.round((durSec / paceSec) * 100) / 100
assert.ok(Math.abs(impliedKm - 5.46) < 0.15, `implied km ${impliedKm}`)

const wrongKm = Math.round((parseDurationToSeconds('113:25') / paceSec) * 100) / 100
assert.ok(Math.abs(wrongKm - 8.43) < 0.15, `wrong km ${wrongKm}`)

const date = parseDateTimeFromText(APPLE_OCR)
assert.equal(date.activity_date, '2026-04-11', `date ${date.activity_date}`)

console.log('[verify-apple-fitness-metrics] OK', {
  repaired_duration: repaired,
  implied_km: impliedKm,
  wrong_km_without_repair: wrongKm,
  activity_date: date.activity_date,
})
