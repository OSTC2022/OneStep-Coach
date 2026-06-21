import {
  buildAnalysisResult,
  parseKmToken,
  normalizeTimeToken,
} from '@/lib/running-analysis/normalize'
import type { RunningAnalysisRaw, RunningAnalysisResult } from '@/lib/running-analysis/types'

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function inferYear(month: number, day: number, today = new Date()): number {
  const year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  if (candidate.getTime() > today.getTime() + 7 * 24 * 3600 * 1000) return year - 1
  return year
}

export function parseDateTimeFromText(text: string, today = new Date()) {
  const normalized = text.replace(/\s+/g, ' ')

  const koreanDateTime = normalized.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2})\s*:\s*(\d{2})/,
  )
  if (koreanDateTime) {
    const month = Number(koreanDateTime[1])
    const day = Number(koreanDateTime[2])
    let hour = Number(koreanDateTime[4])
    const minute = Number(koreanDateTime[5])
    const meridiem = koreanDateTime[3]
    if (meridiem === '오후' && hour < 12) hour += 12
    if (meridiem === '오전' && hour === 12) hour = 0
    const year = inferYear(month, day, today)
    return {
      activity_date: `${year}-${pad2(month)}-${pad2(day)}`,
      activity_time: `${pad2(hour)}:${minute}`,
    }
  }

  const isoLike = normalized.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/)
  if (isoLike) {
    return {
      activity_date: `${isoLike[1]}-${pad2(Number(isoLike[2]))}-${pad2(Number(isoLike[3]))}`,
      activity_time: null,
    }
  }

  const monthDay = normalized.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    const year = inferYear(month, day, today)
    return {
      activity_date: `${year}-${pad2(month)}-${pad2(day)}`,
      activity_time: null,
    }
  }

  return { activity_date: null, activity_time: null }
}

/** 13.50 km · 13.50km · 13,50 km 등 인식 */
export function extractDistanceKm(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ')

  const patterns = [
    /(\d{1,3}[,.]\d{1,2})\s*km\b/i,
    /(\d{1,3}[,.]\d{1,2})km\b/i,
    /(\d{1,3},\d{1,2})\s*km\b/i,
    /(?:거리|distance)[^\d]{0,20}(\d{1,3}[,.]\d{1,2})/i,
    /\bkm\s*(\d{1,3}[,.]\d{1,2})\b/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const km = parseKmToken(match[1])
      if (km != null) return km
    }
  }

  const all: number[] = []
  const globalPattern = /(\d{1,3}[,.]\d{1,2})\s*km?/gi
  let match: RegExpExecArray | null
  while ((match = globalPattern.exec(normalized)) !== null) {
    const km = parseKmToken(match[1])
    if (km != null) all.push(km)
  }

  return all.length > 0 ? Math.max(...all) : null
}

export function parseRunningMetricsFromText(text: string): RunningAnalysisRaw {
  const normalized = text.replace(/\s+/g, ' ')
  const result: RunningAnalysisRaw = { confidence: 0.55 }

  result.distance_km = extractDistanceKm(normalized)

  const paceMatch = normalized.match(/(\d{1,2}\s*:\s*\d{2})\s*\/\s*km/i)
  if (paceMatch?.[1]) {
    result.pace = normalizeTimeToken(paceMatch[1].replace(/\s+/g, ''))
  }

  const durationMatch = normalized.match(/(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/)
  if (durationMatch?.[1]) {
    result.duration = normalizeTimeToken(durationMatch[1].replace(/\s+/g, ''))
  }

  const heartMatch = normalized.match(/(\d{2,3})\s*bpm/i)
  if (heartMatch?.[1]) result.heart_rate = Number(heartMatch[1])

  const calorieMatch = normalized.match(/(\d{2,4})\s*(?:kcal|칼로리)/i)
  if (calorieMatch?.[1]) result.calories = Number(calorieMatch[1])

  const dateTime = parseDateTimeFromText(normalized)
  result.activity_date = dateTime.activity_date
  result.activity_time = dateTime.activity_time

  if (/러닝|running/i.test(normalized)) result.activity_type = 'running'
  if (/samsung|삼성|러닝|칼로리|bpm/i.test(normalized)) result.source_app = 'Samsung Health'

  const found = [result.distance_km, result.duration, result.pace, result.activity_date].filter(Boolean).length
  result.confidence = Math.min(0.9, 0.35 + found * 0.14)

  return result
}

export function buildRegexAnalysisFromText(text: string): RunningAnalysisResult {
  const raw = parseRunningMetricsFromText(text)
  return buildAnalysisResult(raw, 'ocr', { raw_text: text })
}
