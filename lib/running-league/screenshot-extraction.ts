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
  runtime?: 'vercel' | 'local' | 'client'
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
  if (seconds == null || seconds < 60 || seconds > 24 * 3600) return false

  const parts = duration.trim().split(':')
  // h:mm:ss — 총 시간 (Garmin 1:00:27)
  if (parts.length === 3) return true
  // mm:ss — 시각(11:05)과 구분: 최소 15분 이상만 총 시간으로 인정
  if (parts.length === 2) {
    const minutes = Number(parts[0])
    return Number.isFinite(minutes) && minutes >= 15 && seconds >= 900
  }
  return false
}

function isClockTimeLike(value: string): boolean {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return false
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours <= 12 && minutes >= 0 && minutes <= 59
}

/** Apple Fitness 등: 1:13:25가 113:25로 읽히는 OCR 오류 보정 */
function tryRepairMisreadHmsDuration(duration: string): string | null {
  const trimmed = duration.trim()
  const parts = trimmed.split(':')
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

function normalizeDurationCandidate(duration: string): string {
  const repaired = tryRepairMisreadHmsDuration(duration)
  return repaired ?? duration
}

function normalizeComparableTime(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value.trim()
  return `${pad2(Number(match[1]))}:${match[2]}`
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
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*(?:월|화|수|목|금|토|일)(?:요일)?)?(?:\s*[@·])?\s*(?:오전|오후)?\s*(\d{1,2})\s*:\s*(\d{2})/,
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

  const slashDateFull = normalized.match(/\b(20\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/)
  if (slashDateFull) {
    return {
      activity_date: `${slashDateFull[1]}-${pad2(Number(slashDateFull[2]))}-${pad2(Number(slashDateFull[3]))}`,
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

  const monthDay = normalized.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*(?:월|화|수|목|금|토|일)(?:요일)?)?/,
  )
  if (monthDay) {
    const month = Number(monthDay[1])
    const day = Number(monthDay[2])
    const year = inferYear(month, day, today)
    return {
      activity_date: `${year}-${pad2(month)}-${pad2(day)}`,
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

  const plainTime = normalized.match(/(?<![\d:])(\d{1,2})\s*:\s*(\d{2})(?!\s*:\s*\d{2})/)
  if (plainTime) {
    const hour = Number(plainTime[1])
    const minute = Number(plainTime[2])
    const matchIndex = plainTime.index ?? 0
    const tail = normalized.slice(matchIndex, matchIndex + 20)
    const looksLikePace = hour <= 7 && /\/\s*km/i.test(tail)
    if (!looksLikePace && hour <= 23 && minute <= 59 && hour >= 8) {
      return {
        activity_date: null,
        activity_time: `${pad2(hour)}:${pad2(minute)}`,
      }
    }
  }

  return { activity_date: null, activity_time: null }
}

function normalizeOcrTextForParsing(text: string): string {
  let normalized = text.replace(/\r\n/g, '\n')

  // OCR이 소수점 대신 공백을 넣는 경우: "13 50 km" / "12 32 km" → "13.50 km"
  normalized = normalized.replace(
    /\b(\d{1,3})\s+(\d{2})\s*(km|KM|킬로|키로|k)?\b/gi,
    '$1.$2 $3',
  )

  // Strava: "1 h 8 m" → "1h 8m", "lh 8m" → "1h 8m"
  normalized = normalized.replace(/\bl\s*h\b/gi, '1h')
  normalized = normalized.replace(
    /(\d{1,2})\s*h(?:ours?|r)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?/gi,
    '$1h $2m',
  )

  // OCR: l/I → 1 (라인 시작·km 앞)
  normalized = normalized.replace(/\bl(\d{1,2}[.,]\d{1,2})\s*km\b/gi, '1$1 km')
  normalized = normalized.replace(/\bI(\d{1,2}[.,]\d{1,2})\s*km\b/gi, '1$1 km')
  normalized = normalized.replace(/\bl(\d{1,2})\.(\d{2})\b/g, '1$1.$2')
  normalized = normalized.replace(/\bS(\d{1,2}:\d{2})\b/g, '5$1')
  normalized = normalized.replace(/\bO(\d{1,2}[.,]\d{1,2})\s*km\b/gi, '0$1 km')

  // 쉼표 소수: "13,50 km"
  normalized = normalized.replace(/(\d{1,3}),(\d{1,2})\s*(km|KM|킬로)?/gi, '$1.$2 $3')

  // 숫자 안의 O/o → 0, l/I → 1 (13.I5 → 13.15)
  normalized = normalized.replace(
    /(\d)[Oo](?=\d|[.,]|\s*(?:km|KM|킬로))/g,
    '$10',
  )
  normalized = normalized.replace(/(\d)[Oo]\b/g, '$10')
  normalized = normalized.replace(/(\d)[Il](\d)/g, '$11$2')
  normalized = normalized.replace(/[Il](\d)/g, '1$1')

  return normalized.replace(/\s+/g, ' ').replace(/[|]/g, ' ').trim()
}

function scanFragmentForDistanceKm(fragment: string): number | null {
  const patterns = [
    /(\d{1,3}[.,]\d{1,2})\s*(?:km|KM|킬로|키로)\b/i,
    /(\d{1,3})\s+(\d{2})\s*(?:km|KM)?\b/i,
    /(\d{1,3}[.,]\d{1,2})\b/,
  ]

  for (const pattern of patterns) {
    const match = fragment.match(pattern)
    if (!match?.[1]) continue
    let token = match[1]
    if (match[2] != null && !match[1].includes('.') && !match[1].includes(',')) {
      token = `${match[1]}.${match[2]}`
    }
    const km = parseKmToken(token)
    if (isValidDistance(km)) return km
  }

  return null
}

/** Garmin(라벨 아래 숫자) · Strava(라벨 위 숫자) 모두 지원 */
function extractDistanceKmFromMultiline(text: string): number | null {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const inline = line.match(/(\d{1,3}[.,]\d{1,2})\s*(?:km|KM)?\s*거리/i)
    if (inline?.[1]) {
      const km = parseKmToken(inline[1])
      if (isValidDistance(km)) return km
    }

    if (!/거리|^distance$/i.test(line)) continue

    const above = lines.slice(Math.max(0, i - 3), i).join(' ')
    const below = lines.slice(i + 1, Math.min(lines.length, i + 4)).join(' ')
    for (const fragment of [above, below]) {
      const km = scanFragmentForDistanceKm(fragment)
      if (km != null) return km
    }
  }

  for (const line of lines) {
    const solo = line.match(/^(\d{1,3}[.,]\d{1,2})\s*(km|KM|킬로|키로)?$/i)
    if (solo?.[1]) {
      const km = parseKmToken(solo[1])
      if (isValidDistance(km)) return km
    }
  }

  return null
}

/** Strava 등: 1h 8m, 45m, 1h 8m 30s */
function parseHumanDurationToken(token: string): string | null {
  const trimmed = token.trim()

  const hms = trimmed.match(
    /^(\d{1,2})\s*h(?:ours?|r)?\s*(\d{1,2})\s*m(?:in(?:ute)?s?)?(?:\s*(\d{1,2})\s*s(?:ec(?:ond)?s?)?)?$/i,
  )
  if (hms) {
    const totalSeconds =
      Number(hms[1]) * 3600 + Number(hms[2]) * 60 + (hms[3] ? Number(hms[3]) : 0)
    if (totalSeconds >= 60 && totalSeconds <= 24 * 3600) {
      return formatSecondsAsDuration(totalSeconds)
    }
  }

  const minutesOnly = trimmed.match(/^(\d{1,3})\s*m(?:in(?:ute)?s?)?$/i)
  if (minutesOnly) {
    const minutes = Number(minutesOnly[1])
    if (minutes >= 15 && minutes <= 600) {
      return formatSecondsAsDuration(minutes * 60)
    }
  }

  return null
}

function extractHumanDurationFromText(text: string): string | null {
  const normalized = normalizeOcrTextForParsing(text)

  const labeledPatterns = [
    /(?:time|elapsed|총\s*시간|total\s*time)[^\d]{0,16}(\d{1,2}\s*h(?:ours?|r)?\s*\d{1,2}\s*m(?:in(?:ute)?s?)?)/i,
    /(?:time|elapsed|총\s*시간|total\s*time)[^\d]{0,16}(\d{2,3}\s*m(?:in(?:ute)?s?)?)/i,
    /\b(\d{1,2}\s*h(?:ours?|r)?\s*\d{1,2}\s*m(?:in(?:ute)?s?)?)(?!\s*\/\s*km)/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (!match?.[1]) continue
    const duration = parseHumanDurationToken(match[1].replace(/\s+/g, ' '))
    if (duration && isValidDuration(duration)) return duration
  }

  return null
}

function impliedDistanceFromMetrics(
  duration: string | null | undefined,
  pace: string | null | undefined,
): number | null {
  if (!duration || !pace) return null
  const durationSeconds = parseDurationToSeconds(duration)
  const paceSeconds = parsePaceToSecondsPerKm(pace)
  if (durationSeconds == null || paceSeconds == null || paceSeconds <= 0) return null
  const implied = Math.round((durationSeconds / paceSeconds) * 100) / 100
  return isValidDistance(implied) ? implied : null
}

function impliedDurationFromDistance(
  distanceKm: number | null | undefined,
  pace: string | null | undefined,
): string | null {
  if (distanceKm == null || !pace) return null
  const paceSeconds = parsePaceToSecondsPerKm(pace)
  if (paceSeconds == null || paceSeconds <= 0) return null
  const totalSeconds = Math.round(distanceKm * paceSeconds)
  if (totalSeconds < 60 || totalSeconds > 24 * 3600) return null
  const formatted = formatSecondsAsDuration(totalSeconds)
  return isValidDuration(formatted) ? formatted : null
}

function isDistancePlausibleVsImplied(ocrKm: number, impliedKm: number): boolean {
  if (impliedKm <= 0) return true
  return Math.abs(ocrKm - impliedKm) / impliedKm <= 0.22
}

function isDurationPlausibleVsImplied(ocrDuration: string, impliedDuration: string): boolean {
  const ocrSeconds = parseDurationToSeconds(ocrDuration)
  const impliedSeconds = parseDurationToSeconds(impliedDuration)
  if (ocrSeconds == null || impliedSeconds == null || impliedSeconds <= 0) return true
  return Math.abs(ocrSeconds - impliedSeconds) / impliedSeconds <= 0.22
}

/** OCR 결과 품질 점수 — 여러 이미지 변형 중 최적 결과 선택용 */
export function scoreRunningExtraction(extraction: {
  distance_km?: number | null
  duration?: string | null
  pace?: string | null
  activity_date?: string | null
  heart_rate?: number | null
  calories?: number | null
}): number {
  let score = 0

  if (extraction.distance_km != null && extraction.distance_km >= 0.1) score += 4
  if (extraction.duration) score += 3
  if (extraction.pace) score += 3
  if (extraction.activity_date) score += 1
  if (extraction.heart_rate != null) score += 0.5
  if (extraction.calories != null) score += 0.5

  if (
    extraction.distance_km != null &&
    extraction.distance_km >= 0.1 &&
    extraction.duration &&
    extraction.pace
  ) {
    const implied = impliedDistanceFromMetrics(extraction.duration, extraction.pace)
    if (implied != null && isDistancePlausibleVsImplied(extraction.distance_km, implied)) {
      score += 10
    } else if (implied != null) {
      score -= 4
    }
  }

  return score
}

/** OCR이 4.46+43:09를 46.43처럼 합치는 경우 — implied 또는 소수점 오류 보정 */
function selectDistanceCandidate(candidates: number[], impliedKm: number | null): number | null {
  if (candidates.length === 0) return null

  if (impliedKm != null) {
    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - impliedKm) <= Math.abs(best - impliedKm) ? candidate : best,
    )
  }

  const sorted = [...new Set(candidates)].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] / sorted[i - 1] >= 4) {
      return sorted[i - 1]
    }
  }

  const plausible = sorted.filter((km) => km >= 0.5 && km <= 42)
  if (plausible.length > 0) {
    return plausible[plausible.length - 1]
  }

  return sorted[sorted.length - 1]
}

function extractDistanceKm(text: string, impliedKm: number | null = null): number | null {
  const multiline = extractDistanceKmFromMultiline(text)
  if (multiline != null) return multiline

  const normalized = normalizeOcrTextForParsing(text)

  const labeledPatterns = [
    /(?:거리|distance|총\s*거리|운동\s*거리|total)[^\d]{0,24}(\d{1,3}[.,]\d{1,2})/i,
    /(?:거리|distance|총\s*거리|운동\s*거리|total)[^\d]{0,24}(\d{1,2})(?!\s*[.:]\d)/i,
    /(\d{1,2}[.,]\d{1,2})\s*(?:km|KM|킬로|키로)?\s*거리/i,
    /(\d{1,2}[.,]\d{1,2})\s*(?:km|KM)\b[^가-힣]{0,12}거리/i,
    /(\d{1,3}[.,]\d{1,2})\s*(?:km|KM|킬로미터|킬로|키로)\b/i,
    /(\d{1,2}[.,]\d{1,2})(?:km|KM)\b/i,
    /(\d{1,2})\s*(?:km|KM|킬로미터|킬로|키로)\b/i,
    /(?:km|KM)\s*(\d{1,3}[.,]\d{1,2})/i,
    /(?:km|KM)\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*[kK]\b/,
    /\b(\d{1,2}[.,]\d{1,2})\s*[kK]\b/,
    /distance[^\d]{0,12}(\d{1,3}[.,]\d{1,2})/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const km = parseKmToken(match[1])
      if (isValidDistance(km)) return km
    }
  }

  const kmValues: number[] = []
  const distancePattern =
    /(\d{1,3}[.,]\d{1,2})\s*(?:km|KM|킬로|키로)?|\b(\d{1,2})\s*(?:km|KM|킬로|키로)\b/gi
  let match: RegExpExecArray | null
  while ((match = distancePattern.exec(normalized)) !== null) {
    const token = match[1] ?? match[2]
    if (!token) continue
    const km = parseKmToken(token)
    if (isValidDistance(km)) kmValues.push(km)
  }

  if (kmValues.length > 0) {
    return selectDistanceCandidate(kmValues, impliedKm)
  }

  const looseDecimals: number[] = []
  const loosePattern = /\b(\d{1,3}[.,]\d{1,2})\b/g
  while ((match = loosePattern.exec(normalized)) !== null) {
    const km = parseKmToken(match[1])
    if (isValidDistance(km) && km >= 0.5) looseDecimals.push(km)
  }
  if (looseDecimals.length > 0) {
    return selectDistanceCandidate(looseDecimals, impliedKm)
  }

  return null
}

function extractPace(normalized: string): string | null {
  const pacePatterns = [
    /(\d{1,2}\s*:\s*\d{2})\s*\/\s*km/i,
    /(\d{1,2})[''′](\d{2})["″]?\s*\/?\s*(?:km|KM)?/i,
    /(\d{1,2})[''′](\d{2})["″]?/i,
    /(?:pace|페이스|평균\s*페이스)[^\d:]{0,12}(\d{1,2}\s*:\s*\d{2})/i,
    /(?:pace|페이스|평균\s*페이스)[^\d'′]{0,12}(\d{1,2})[''′](\d{2})/i,
    /\b([4-9])(\d{2})["″']\b/,
  ]

  for (const pattern of pacePatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      let pace = match[1].replace(/\s+/g, '')
      if (match[2] != null && !pace.includes(':')) {
        pace = `${match[1]}:${match[2]}`
      }
      if (isValidPace(pace)) return pace
    }
  }

  return null
}

function extractDurationFromMultiline(text: string, excludeTimes: string[] = []): string | null {
  const excludes = new Set(excludeTimes.map(normalizeComparableTime))
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/총\s*시간|elapsed|duration|^시간$|^time$/i.test(line)) continue

    const nearby = lines.slice(Math.max(0, i - 2), i + 4).join(' ')
    const human = nearby.match(
      /(\d{1,2}\s*h(?:ours?|r)?\s*\d{1,2}\s*m(?:in(?:ute)?s?)?|\d{2,3}\s*m(?:in(?:ute)?s?)?)/i,
    )
    if (human?.[1]) {
      const duration = parseHumanDurationToken(human[1].replace(/\s+/g, ' '))
      if (
        duration &&
        isValidDuration(duration) &&
        !excludes.has(normalizeComparableTime(duration))
      ) {
        return duration
      }
    }

    const hms = nearby.match(/(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/)
    if (hms?.[1]) {
      const duration = normalizeDurationCandidate(hms[1].replace(/\s+/g, ''))
      if (isValidDuration(duration) && !excludes.has(normalizeComparableTime(duration))) {
        return duration
      }
    }

    const mmss = nearby.match(/(\d{2,3}\s*:\s*\d{2})(?!\s*:\s*\d{2})/)
    if (mmss?.[1]) {
      const duration = normalizeDurationCandidate(mmss[1].replace(/\s+/g, ''))
      if (
        isValidDuration(duration) &&
        !isClockTimeLike(duration) &&
        !excludes.has(normalizeComparableTime(duration))
      ) {
        return duration
      }
    }
  }

  for (const line of lines) {
    const inline = line.match(/(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})\s*(?:총\s*시간)?/i)
    if (inline?.[1]) {
      const duration = inline[1].replace(/\s+/g, '')
      if (isValidDuration(duration) && !excludes.has(normalizeComparableTime(duration))) {
        return duration
      }
    }
  }

  return null
}

function extractDuration(
  text: string,
  pace: string | null,
  excludeTimes: string[] = [],
): string | null {
  const excludes = new Set(excludeTimes.map(normalizeComparableTime))
  const multiline = extractDurationFromMultiline(text, excludeTimes)
  if (multiline) return multiline

  const humanDuration = extractHumanDurationFromText(text)
  if (
    humanDuration &&
    !excludes.has(normalizeComparableTime(humanDuration))
  ) {
    return humanDuration
  }

  const normalized = normalizeOcrTextForParsing(text)

  const labeledPatterns = [
    /(?:총\s*시간|elapsed|total\s*time)[^\d:]{0,16}(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/i,
    /(?:총\s*시간|elapsed|total\s*time)[^\d:]{0,16}(\d{1,2}\s*:\s*\d{2})/i,
    /(?:^|\s)시간[^\d:]{0,8}(\d{1,2}\s*:\s*\d{2})(?!\s*:\s*\d{2})/i,
  ]

  for (const pattern of labeledPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const duration = normalizeDurationCandidate(match[1].replace(/\s+/g, ''))
      if (isValidDuration(duration) && !excludes.has(normalizeComparableTime(duration))) {
        return duration
      }
    }
  }

  const candidates: string[] = []
  const durationPattern = /(\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2})/g
  let match: RegExpExecArray | null
  while ((match = durationPattern.exec(normalized)) !== null) {
    const duration = normalizeDurationCandidate(match[1].replace(/\s+/g, ''))
    if (!isValidDuration(duration)) continue
    if (pace && duration === pace) continue
    if (excludes.has(normalizeComparableTime(duration))) continue
    candidates.push(duration)
  }

  if (candidates.length > 0) {
    return candidates.sort(
      (a, b) => (parseDurationToSeconds(b) ?? 0) - (parseDurationToSeconds(a) ?? 0),
    )[0]
  }

  const mmssCandidates: string[] = []
  const mmssPattern = /(?<![\d:])(\d{2,3}\s*:\s*\d{2})(?!\s*\/\s*km)/gi
  let mmssMatch: RegExpExecArray | null
  while ((mmssMatch = mmssPattern.exec(normalized)) !== null) {
    const duration = normalizeDurationCandidate(mmssMatch[1].replace(/\s+/g, ''))
    if (!isValidDuration(duration)) continue
    if (isClockTimeLike(duration)) continue
    if (pace && duration === pace) continue
    if (excludes.has(normalizeComparableTime(duration))) continue
    mmssCandidates.push(duration)
  }

  if (mmssCandidates.length > 0) {
    return mmssCandidates.sort(
      (a, b) => (parseDurationToSeconds(b) ?? 0) - (parseDurationToSeconds(a) ?? 0),
    )[0]
  }

  return null
}

function extractHeartRate(normalized: string): number | null {
  const patterns = [
    /(\d{2,3})\s*(?:bpm|BPM|심박|심박수|avg\s*hr)/i,
    /(\d{2,3})(?:bpm|BPM)\b/i,
    /(?:심박|심박수|heart|평균\s*심박)[^\d]{0,12}(\d{2,3})/i,
    /(?:avg\.?\s*heart\s*rate|average\s*heart\s*rate)[^\d]{0,8}(\d{2,3})/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (isValidHeartRate(value)) return value
    }
  }

  const looseCandidates: number[] = []
  for (const match of normalized.matchAll(/\b(\d{2,3})\b/g)) {
    const value = Number(match[1])
    if (isValidHeartRate(value) && value >= 80 && value <= 200) {
      looseCandidates.push(value)
    }
  }
  if (looseCandidates.length > 0) {
    const preferred =
      looseCandidates.find((value) => value >= 100 && value <= 150) ??
      looseCandidates.find((value) => value >= 100 && value <= 180)
    return preferred ?? looseCandidates[0]
  }

  return null
}

function extractCalories(normalized: string): number | null {
  const patterns = [
    /(\d{2,4})\s*(?:kcal|KCAL|칼로리)/i,
    /(\d{2,4})(?:kcal|KCAL|cal|CAL)\b/i,
    /(?:칼로리|calories|총\s*칼로리)[^\d]{0,8}(\d{2,4})/i,
    /(\d{2,4})[^\d]{0,16}(?:총\s*칼로리|칼로리)/i,
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

function reconcileRunningMetrics(raw: RunningScreenshotExtractionRaw): RunningScreenshotExtractionRaw {
  const next: RunningScreenshotExtractionRaw = { ...raw }

  if (next.duration) {
    next.duration = normalizeDurationCandidate(next.duration)
  }

  if (
    next.duration &&
    next.activity_time &&
    normalizeComparableTime(next.duration) === normalizeComparableTime(next.activity_time)
  ) {
    next.duration = null
  }

  if (next.duration && isClockTimeLike(next.duration)) {
    next.duration = null
  }

  const impliedKm = impliedDistanceFromMetrics(next.duration, next.pace)

  if (impliedKm != null) {
    if (
      next.distance_km == null ||
      !isValidDistance(next.distance_km) ||
      !isDistancePlausibleVsImplied(next.distance_km, impliedKm)
    ) {
      next.distance_km = impliedKm
    }
  }

  if (next.distance_km != null && next.pace != null) {
    const impliedDuration = impliedDurationFromDistance(next.distance_km, next.pace)
    if (impliedDuration != null) {
      if (
        next.duration == null ||
        !isDurationPlausibleVsImplied(next.duration, impliedDuration)
      ) {
        next.duration = impliedDuration
      }
    }
  }

  return next
}

export function parseRunningMetricsFromText(text: string): RunningScreenshotExtractionRaw {
  const normalized = normalizeOcrTextForParsing(text)
  const dateTime = parseDateTimeFromText(text.replace(/\r\n/g, '\n'))
  const excludeTimes = dateTime.activity_time ? [dateTime.activity_time] : []

  const result: RunningScreenshotExtractionRaw = {
    confidence: 0.55,
    activity_date: dateTime.activity_date,
    activity_time: dateTime.activity_time,
  }

  result.pace = extractPace(normalized)
  result.duration = extractDuration(text, result.pace ?? null, excludeTimes)
  const impliedKm = impliedDistanceFromMetrics(result.duration, result.pace)
  result.distance_km = extractDistanceKm(text, impliedKm)
  result.heart_rate = extractHeartRate(normalized)
  result.calories = extractCalories(normalized)

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

  return reconcileRunningMetrics(result)
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
  const normalized = reconcileRunningMetrics(normalizeRawInput(raw))
  let distance_km = isValidDistance(normalized.distance_km ?? null) ? normalized.distance_km! : null
  let duration = isValidDuration(normalized.duration ?? null) ? normalized.duration! : null
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

  if (distance_km == null && duration != null && pace != null) {
    const inferred = impliedDistanceFromMetrics(duration, pace)
    if (inferred != null && !isClockTimeLike(duration)) {
      distance_km = inferred
    }
  }

  if (
    distance_km != null &&
    duration != null &&
    pace != null
  ) {
    const implied = impliedDistanceFromMetrics(duration, pace)
    if (implied != null && !isDistancePlausibleVsImplied(distance_km, implied)) {
      distance_km = implied
    }
  }

  if (distance_km != null && pace != null) {
    const impliedDuration = impliedDurationFromDistance(distance_km, pace)
    if (
      impliedDuration != null &&
      duration != null &&
      !isDurationPlausibleVsImplied(duration, impliedDuration)
    ) {
      duration = impliedDuration
    }
  }

  if (
    duration &&
    activity_time &&
    normalizeComparableTime(duration) === normalizeComparableTime(activity_time)
  ) {
    duration = null
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

export function rehydrateScreenshotExtraction(
  extraction: RunningScreenshotExtraction,
): RunningScreenshotExtraction {
  return buildExtractionFromRaw(
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
    extraction.extraction_method ?? 'ocr',
    { raw_text: extraction.raw_text, raw_json: extraction.raw_json },
  )
}

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
