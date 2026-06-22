export type RunningScreenshotExtractionRaw = {
  distance_km?: number | null
  duration?: string | null
  pace?: string | null
  heart_rate?: number | null
  calories?: number | null
  activity_date?: string | null
  activity_time?: string | null
  activity_type?: string | null
  source_app?: string | null
  confidence?: number | null
}

export type RunningScreenshotExtraction = {
  distance_km: number | null
  duration: string | null
  pace: string | null
  heart_rate: number | null
  calories: number | null
  activity_date: string | null
  activity_time: string | null
  activity_type: string | null
  source_app: string | null
  confidence: number
  extraction_method: 'ai' | 'ocr' | 'hybrid' | 'none'
  partial_failure: boolean
  missing_fields: string[]
  missing_core_fields?: string[]
  missing_optional_fields?: string[]
  analysis_status?: 'success' | 'partial' | 'failed'
  analysis_reason?: string
  analysis_messages?: string[]
  analysis_success?: boolean
  date_needs_review?: boolean
  raw_text?: string
  raw_json?: Record<string, unknown>
}

export type RunningScreenshotImageMeta = {
  original_size: number
  mime_type: string
  width: number
  height: number
  resized_width: number
  resized_height: number
  file_name?: string
}

import type { ScreenshotFailureReason } from '@/lib/running-league/screenshot-analysis-errors'

export type RunningScreenshotAnalysisDiagnostics = {
  openai_configured: boolean
  ai_status: 'skipped' | 'success' | 'empty' | 'failed' | 'timeout'
  ocr_status: 'skipped' | 'success' | 'empty' | 'failed' | 'timeout'
  field_count: number
  runtime?: 'vercel' | 'local'
  vercel_env?: string | null
  ocr_supported?: boolean
  openai_http_status?: number | null
  failure_reason?: ScreenshotFailureReason | null
  failure_detail?: string | null
}

export type AnalyzeRunningScreenshotResponse = {
  ok: true
  success: true
  extraction: RunningScreenshotExtraction
  image_meta: RunningScreenshotImageMeta
  image_hash: string
  diagnostics: RunningScreenshotAnalysisDiagnostics
} | {
  ok: false
  success: false
  error: string
  message: string
  errorCode?: string
  error_code?: ScreenshotFailureReason
  manualInputRequired?: boolean
  diagnostics?: RunningScreenshotAnalysisDiagnostics
}

const CORE_FIELD_LABELS = ['distance_km', 'duration', 'pace'] as const
const OPTIONAL_FIELD_LABELS = [
  'heart_rate',
  'calories',
  'activity_date',
  'activity_time',
] as const

export function parseDurationToSeconds(value: string): number | null {
  const trimmed = value.trim()
  const parts = trimmed.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return null

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return hours * 3600 + minutes * 60 + seconds
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return minutes * 60 + seconds
  }
  return null
}

export function formatSecondsAsDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.round(totalSeconds % 60)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function parsePaceToSecondsPerKm(value: string): number | null {
  const normalized = value.replace(/\s*\/\s*km/gi, '').trim()
  const seconds = parseDurationToSeconds(normalized)
  if (seconds == null) return null
  return seconds
}

export function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = Math.round(secondsPerKm % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function parseKmToken(token: string): number | null {
  const normalized = token.replace(',', '.').trim()
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function isValidDistance(km: number | null): km is number {
  return km != null && km >= 0.1 && km <= 100
}

function isValidDuration(duration: string | null): duration is string {
  if (!duration) return false
  const seconds = parseDurationToSeconds(duration)
  return seconds != null && seconds >= 60 && seconds <= 24 * 3600
}

function isValidPace(pace: string | null): pace is string {
  if (!pace) return false
  const seconds = parsePaceToSecondsPerKm(pace)
  return seconds != null && seconds >= 120 && seconds <= 900
}

function isValidHeartRate(value: number | null): value is number {
  return value != null && value >= 40 && value <= 230
}

function isValidCalories(value: number | null): value is number {
  return value != null && value >= 0 && value <= 5000
}

function isValidDate(value: string | null): value is string {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidTime(value: string | null): value is string {
  return value != null && /^\d{1,2}:\d{2}$/.test(value)
}

function normalizeTimeValue(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value.trim()
  return `${pad2(Number(match[1]))}:${match[2]}`
}

function inferYear(month: number, day: number, today = new Date()): number {
  const year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  if (candidate.getTime() > today.getTime() + 7 * 24 * 3600 * 1000) {
    return year - 1
  }
  return year
}

export function parseDateTimeFromText(text: string, today = new Date()): {
  activity_date: string | null
  activity_time: string | null
} {
  const normalized = text.replace(/\s+/g, ' ').replace(/[@·|]/g, ' ')

  const koreanDateTime = normalized.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s+)?(?:오전|오후)?\s*(\d{1,2})\s*:\s*(\d{2})/,
  )
  if (koreanDateTime) {
    const month = Number(koreanDateTime[1])
    const day = Number(koreanDateTime[2])
    let hour = Number(koreanDateTime[3])
    const minute = Number(koreanDateTime[4])
    const meridiemMatch = normalized.match(
      /(\d{1,2})\s*월\s*(\d{1,2})\s*일[\s\S]{0,24}?(오전|오후)/,
    )
    const meridiem = meridiemMatch?.[3]
    if (meridiem === '오후' && hour < 12) hour += 12
    if (meridiem === '오전' && hour === 12) hour = 0
    const year = inferYear(month, day, today)
    return {
      activity_date: `${year}-${pad2(month)}-${pad2(day)}`,
      activity_time: `${pad2(hour)}:${pad2(minute)}`,
    }
  }

  const dottedDate = normalized.match(/\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/)
  if (dottedDate) {
    return {
      activity_date: `${dottedDate[1]}-${pad2(Number(dottedDate[2]))}-${pad2(Number(dottedDate[3]))}`,
      activity_time: null,
    }
  }

  const isoDate = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (isoDate) {
    return {
      activity_date: `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`,
      activity_time: null,
    }
  }

  const slashDate = normalized.match(/\b(\d{1,2})\/(\d{1,2})\b/)
  if (slashDate) {
    const month = Number(slashDate[1])
    const day = Number(slashDate[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = inferYear(month, day, today)
      return {
        activity_date: `${year}-${pad2(month)}-${pad2(day)}`,
        activity_time: null,
      }
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

  const timeOnly = normalized.match(/(오전|오후)\s*(\d{1,2})\s*:\s*(\d{2})/)
  if (timeOnly) {
    let hour = Number(timeOnly[2])
    const minute = Number(timeOnly[3])
    if (timeOnly[1] === '오후' && hour < 12) hour += 12
    if (timeOnly[1] === '오전' && hour === 12) hour = 0
    return {
      activity_date: null,
      activity_time: `${pad2(hour)}:${pad2(minute)}`,
    }
  }

  return { activity_date: null, activity_time: null }
}

function extractDistanceKm(normalized: string): number | null {
  const labeledPatterns = [
    /(?:거리|distance|총\s*거리|운동\s*거리)[^\d]{0,24}(\d{1,3}[.,]\d{1,2})/i,
    /(\d{1,3}[.,]\d{1,2})\s*(?:km|KM|킬로미터|킬로|키로)/i,
    /(?:km|KM)\s*(\d{1,3}[.,]\d{1,2})/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const km = parseKmToken(match[1])
      if (isValidDistance(km)) return km
    }
  }

  const kmValues: number[] = []
  const distancePattern = /(\d{1,3}[.,]\d{1,2})\s*(?:km|KM|킬로|키로)?/gi
  let match: RegExpExecArray | null
  while ((match = distancePattern.exec(normalized)) !== null) {
    const km = parseKmToken(match[1])
    if (isValidDistance(km)) kmValues.push(km)
  }

  if (kmValues.length > 0) {
    return Math.max(...kmValues)
  }

  return null
}

function extractPace(normalized: string): string | null {
  const pacePatterns = [
    /(\d{1,2}\s*:\s*\d{2})\s*\/\s*km/i,
    /(?:pace|페이스|평균\s*페이스)[^\d:]{0,12}(\d{1,2}\s*:\s*\d{2})/i,
  ]

  for (const pattern of pacePatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const pace = match[1].replace(/\s+/g, '')
      if (isValidPace(pace)) return pace
    }
  }

  return null
}

function extractDuration(normalized: string, pace: string | null): string | null {
  const labeledPatterns = [
    /(?:총\s*시간|운동\s*시간|시간|duration|elapsed)[^\d:]{0,16}(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/i,
    /(?:총\s*시간|운동\s*시간|시간|duration|elapsed)[^\d:]{0,16}(\d{1,2}\s*:\s*\d{2})/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const duration = match[1].replace(/\s+/g, '')
      if (isValidDuration(duration)) return duration
    }
  }

  const candidates: string[] = []
  const durationPattern = /(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/g
  let match: RegExpExecArray | null
  while ((match = durationPattern.exec(normalized)) !== null) {
    const duration = match[1].replace(/\s+/g, '')
    if (!isValidDuration(duration)) continue
    if (pace && duration === pace) continue
    candidates.push(duration)
  }

  if (candidates.length > 0) {
    return candidates.sort(
      (a, b) => (parseDurationToSeconds(b) ?? 0) - (parseDurationToSeconds(a) ?? 0),
    )[0]
  }

  return null
}

function extractHeartRate(normalized: string): number | null {
  const patterns = [
    /(\d{2,3})\s*(?:bpm|BPM|심박|심박수|avg\s*hr)/i,
    /(?:심박|심박수|heart)[^\d]{0,8}(\d{2,3})/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (isValidHeartRate(value)) return value
    }
  }

  return null
}

function extractCalories(normalized: string): number | null {
  const patterns = [
    /(\d{2,4})\s*(?:kcal|KCAL|칼로리)/i,
    /(?:칼로리|calories)[^\d]{0,8}(\d{2,4})/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (isValidCalories(value)) return value
    }
  }

  return null
}

export function parseRunningMetricsFromText(text: string): RunningScreenshotExtractionRaw {
  const normalized = text.replace(/\s+/g, ' ').replace(/[|]/g, ' ')
  const result: RunningScreenshotExtractionRaw = {
    confidence: 0.55,
  }

  result.pace = extractPace(normalized)
  result.distance_km = extractDistanceKm(normalized)
  result.duration = extractDuration(normalized, result.pace ?? null)
  result.heart_rate = extractHeartRate(normalized)
  result.calories = extractCalories(normalized)

  const dateTime = parseDateTimeFromText(normalized)
  result.activity_date = dateTime.activity_date
  result.activity_time = dateTime.activity_time

  if (/러닝|running/i.test(normalized)) {
    result.activity_type = 'running'
  }

  if (/samsung|삼성|shealth|s\s*health/i.test(normalized)) result.source_app = 'Samsung Health'
  else if (/garmin|가민/i.test(normalized)) result.source_app = 'Garmin'
  else if (/strava|스트라바/i.test(normalized)) result.source_app = 'Strava'
  else if (/nike|나이키/i.test(normalized)) result.source_app = 'Nike Run Club'
  else if (/apple|애플|fitness/i.test(normalized)) result.source_app = 'Apple Fitness'
  else if (/런데이|runday/i.test(normalized)) result.source_app = '런데이'
  else if (/러닝|칼로리|bpm/i.test(normalized)) result.source_app = 'Samsung Health'

  const foundCount = [
    result.distance_km,
    result.duration,
    result.pace,
    result.activity_date,
    result.heart_rate,
    result.calories,
  ].filter((value) => value != null).length
  result.confidence = Math.min(0.95, 0.3 + foundCount * 0.11)

  return result
}

function normalizeRawInput(raw: RunningScreenshotExtractionRaw): RunningScreenshotExtractionRaw {
  const next: RunningScreenshotExtractionRaw = { ...raw }

  if (typeof next.distance_km === 'string') {
    const parsed = Number(String(next.distance_km).replace(',', '.'))
    next.distance_km = Number.isFinite(parsed) ? parsed : null
  }

  if (next.pace != null) {
    next.pace = String(next.pace).replace(/\s*\/\s*km/gi, '').trim()
  }

  if (next.duration != null) {
    next.duration = String(next.duration).replace(/\s+/g, '')
  }

  if (next.activity_time != null) {
    const match = String(next.activity_time).match(/(\d{1,2}):(\d{2})/)
    if (match) {
      next.activity_time = `${pad2(Number(match[1]))}:${match[2]}`
    }
  }

  if (typeof next.heart_rate === 'string') {
    const parsed = Number(next.heart_rate)
    next.heart_rate = Number.isFinite(parsed) ? parsed : null
  }

  if (typeof next.calories === 'string') {
    const parsed = Number(next.calories)
    next.calories = Number.isFinite(parsed) ? parsed : null
  }

  return next
}

function sanitizeRaw(raw: RunningScreenshotExtractionRaw): RunningScreenshotExtraction {
  const normalized = normalizeRawInput(raw)
  const distance_km = isValidDistance(normalized.distance_km ?? null) ? normalized.distance_km! : null
  const duration = isValidDuration(normalized.duration ?? null) ? normalized.duration! : null
  let pace = isValidPace(normalized.pace ?? null) ? normalized.pace! : null
  const heart_rate = isValidHeartRate(normalized.heart_rate ?? null) ? normalized.heart_rate! : null
  const calories = isValidCalories(normalized.calories ?? null) ? normalized.calories! : null
  const activity_date = isValidDate(normalized.activity_date ?? null) ? normalized.activity_date! : null
  const activity_time = isValidTime(normalized.activity_time ?? null)
    ? normalizeTimeValue(normalized.activity_time!)
    : null

  if (distance_km != null && duration != null && pace == null) {
    const durationSeconds = parseDurationToSeconds(duration)
    if (durationSeconds != null) {
      const paceSeconds = durationSeconds / distance_km
      if (paceSeconds >= 120 && paceSeconds <= 900) {
        pace = formatPace(paceSeconds)
      }
    }
  }

  const missing_core_fields = CORE_FIELD_LABELS.filter((field) => {
    if (field === 'distance_km') return distance_km == null
    if (field === 'duration') return duration == null
    if (field === 'pace') return pace == null
    return false
  })

  const missing_optional_fields = OPTIONAL_FIELD_LABELS.filter((field) => {
    if (field === 'heart_rate') return heart_rate == null
    if (field === 'calories') return calories == null
    if (field === 'activity_date') return activity_date == null
    if (field === 'activity_time') return activity_time == null
    return false
  })

  const partial_failure = missing_core_fields.length > 0

  return {
    distance_km,
    duration,
    pace,
    heart_rate,
    calories,
    activity_date,
    activity_time,
    activity_type: normalized.activity_type ?? null,
    source_app: normalized.source_app ?? null,
    confidence: Math.max(0, Math.min(1, Number(normalized.confidence ?? 0.5))),
    extraction_method: 'none',
    partial_failure,
    missing_fields: [...missing_core_fields, ...missing_optional_fields],
    missing_core_fields,
    missing_optional_fields,
  }
}

import { enrichExtractionWithAnalysis } from '@/lib/running-league/screenshot-analysis-status'

export function buildExtractionFromRaw(
  raw: RunningScreenshotExtractionRaw,
  method: RunningScreenshotExtraction['extraction_method'],
  extras?: { raw_text?: string; raw_json?: Record<string, unknown> },
): RunningScreenshotExtraction {
  const sanitized = sanitizeRaw(raw)
  const base: RunningScreenshotExtraction = {
    ...sanitized,
    extraction_method: method,
    raw_text: extras?.raw_text,
    raw_json: extras?.raw_json,
  }
  return enrichExtractionWithAnalysis(base)
}

function pickField<T>(ai: T | null, ocr: T | null, aiConfidence: number): T | null {
  if (ai != null && aiConfidence >= 0.72) return ai
  if (ocr != null) return ocr
  return ai
}

export function mergeExtractions(
  primary: RunningScreenshotExtraction,
  secondary: RunningScreenshotExtraction,
): RunningScreenshotExtraction {
  const ai = primary.extraction_method === 'ai' ? primary : secondary
  const ocr = primary.extraction_method === 'ocr' ? primary : secondary
  const aiConfidence = ai.confidence

  const mergedRaw: RunningScreenshotExtractionRaw = {
    distance_km: pickField(ai.distance_km, ocr.distance_km, aiConfidence),
    duration: pickField(ai.duration, ocr.duration, aiConfidence),
    pace: pickField(ai.pace, ocr.pace, aiConfidence),
    heart_rate: pickField(ai.heart_rate, ocr.heart_rate, aiConfidence),
    calories: pickField(ai.calories, ocr.calories, aiConfidence),
    activity_date: pickField(ai.activity_date, ocr.activity_date, aiConfidence),
    activity_time: pickField(ai.activity_time, ocr.activity_time, aiConfidence),
    activity_type: pickField(ai.activity_type, ocr.activity_type, aiConfidence),
    source_app: pickField(ai.source_app, ocr.source_app, aiConfidence),
    confidence: Math.max(primary.confidence, secondary.confidence, aiConfidence),
  }

  return buildExtractionFromRaw(mergedRaw, 'hybrid', {
    raw_text: [primary.raw_text, secondary.raw_text].filter(Boolean).join('\n---\n'),
    raw_json: {
      primary: primary.raw_json ?? null,
      secondary: secondary.raw_json ?? null,
    },
  })
}

export function hasUsableExtraction(extraction: RunningScreenshotExtraction): boolean {
  return (
    extraction.distance_km != null ||
    extraction.duration != null ||
    extraction.pace != null ||
    extraction.activity_date != null ||
    extraction.heart_rate != null ||
    extraction.calories != null
  )
}

export function countExtractedFields(extraction: RunningScreenshotExtraction): number {
  return [
    extraction.distance_km,
    extraction.duration,
    extraction.pace,
    extraction.heart_rate,
    extraction.calories,
    extraction.activity_date,
    extraction.activity_time,
  ].filter((value) => value != null).length
}

export function countCoreExtractedFields(extraction: RunningScreenshotExtraction): number {
  return [extraction.distance_km, extraction.duration, extraction.pace].filter(
    (value) => value != null,
  ).length
}
