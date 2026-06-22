import type { RunningAnalysisRaw, RunningAnalysisResult } from '@/lib/running-analysis/types'

const CORE_FIELDS = ['distance_km', 'duration', 'pace', 'activity_date'] as const

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function parseKmToken(token: string): number | null {
  const normalized = token.replace(/\s+/g, '').replace(',', '.').trim()
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0.1 || value > 100) return null
  return Math.round(value * 100) / 100
}

export function normalizeTimeToken(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, '')
  const parts = trimmed.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return trimmed

  if (parts.length === 3) {
    return `${parts[0]}:${pad2(parts[1])}:${pad2(parts[2])}`
  }
  if (parts.length === 2) {
    return `${parts[0]}:${pad2(parts[1])}`
  }
  return trimmed
}

export function mapOpenAiJsonToRaw(json: Record<string, unknown>): RunningAnalysisRaw {
  const distance =
    json.distance_km ??
    json.distanceKm ??
    json.distance ??
    json.mileage_km ??
    null

  let distance_km: number | null = null
  if (typeof distance === 'number' && Number.isFinite(distance)) {
    distance_km = Math.round(distance * 100) / 100
  } else if (distance != null) {
    distance_km = parseKmToken(String(distance))
  }

  const durationSource =
    json.duration ?? json.total_time ?? json.totalTime ?? json.elapsed_time ?? null

  const pace =
    json.pace ??
    json.averagePace ??
    json.average_pace ??
    json.avg_pace ??
    null

  const date = json.date ?? json.activity_date ?? json.activityDate ?? null
  const time = json.activity_time ?? json.activityTime ?? json.time ?? null

  const heartRateSource =
    json.avg_heart_rate ??
    json.avgHeartRate ??
    json.heart_rate ??
    json.heartRate ??
    null

  let heart_rate: number | null = null
  if (heartRateSource != null) {
    const parsed = Number(heartRateSource)
    heart_rate = Number.isFinite(parsed) ? parsed : null
  }

  let calories: number | null = null
  const caloriesSource = json.calories ?? json.calories_kcal ?? json.caloriesKcal ?? null
  if (caloriesSource != null) {
    const parsed = Number(caloriesSource)
    calories = Number.isFinite(parsed) ? parsed : null
  }

  return {
    distance_km,
    duration:
      durationSource != null ? normalizeTimeToken(String(durationSource)) : null,
    pace: pace != null ? normalizeTimeToken(String(pace).replace(/\s*\/\s*km/gi, '')) : null,
    heart_rate,
    calories,
    activity_date: date != null ? String(date).slice(0, 10) : null,
    activity_time: time != null ? String(time).slice(0, 5) : null,
    activity_type: json.activity_type != null ? String(json.activity_type) : 'running',
    source_app:
      json.source_app != null
        ? String(json.source_app)
        : json.sourceApp != null
          ? String(json.sourceApp)
          : null,
    confidence: json.confidence != null ? Number(json.confidence) : 0.85,
    needs_review: json.needsReview === true || json.needs_review === true,
  }
}

function isValidDate(value: string | null): value is string {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isValidTime(value: string | null): value is string {
  return value != null && /^\d{1,2}:\d{2}$/.test(value)
}

export function buildAnalysisResult(
  raw: RunningAnalysisRaw,
  method: RunningAnalysisResult['extraction_method'],
  extras?: { raw_text?: string; raw_json?: Record<string, unknown> },
): RunningAnalysisResult {
  const distance_km =
    raw.distance_km != null && Number.isFinite(raw.distance_km) ? raw.distance_km : null
  const duration = raw.duration?.trim() || null
  let pace = raw.pace?.trim() || null
  const heart_rate =
    raw.heart_rate != null && raw.heart_rate >= 40 && raw.heart_rate <= 230
      ? raw.heart_rate
      : null
  const calories =
    raw.calories != null && raw.calories >= 0 && raw.calories <= 5000 ? raw.calories : null
  const activity_date = isValidDate(raw.activity_date ?? null) ? raw.activity_date! : null
  const activity_time = isValidTime(raw.activity_time ?? null) ? raw.activity_time! : null

  const missing_fields = CORE_FIELDS.filter((field) => {
    if (field === 'distance_km') return distance_km == null
    if (field === 'duration') return !duration
    if (field === 'pace') return !pace
    if (field === 'activity_date') return !activity_date
    return false
  })

  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5)))
  const needs_review = Boolean(raw.needs_review) || confidence < 0.75 || missing_fields.length > 0

  return {
    distance_km,
    duration,
    pace,
    heart_rate,
    calories,
    activity_date,
    activity_time,
    activity_type: raw.activity_type ?? null,
    source_app: raw.source_app ?? null,
    confidence,
    needs_review,
    extraction_method: method,
    partial_failure: missing_fields.length > 0,
    missing_fields: [...missing_fields],
    raw_text: extras?.raw_text,
    raw_json: extras?.raw_json,
  }
}

export function mergeAnalysisResults(
  primary: RunningAnalysisResult,
  secondary: RunningAnalysisResult,
): RunningAnalysisResult {
  const pick = <T,>(a: T | null, b: T | null) => (a != null ? a : b)
  return buildAnalysisResult(
    {
      distance_km: pick(primary.distance_km, secondary.distance_km),
      duration: pick(primary.duration, secondary.duration),
      pace: pick(primary.pace, secondary.pace),
      heart_rate: pick(primary.heart_rate, secondary.heart_rate),
      calories: pick(primary.calories, secondary.calories),
      activity_date: pick(primary.activity_date, secondary.activity_date),
      activity_time: pick(primary.activity_time, secondary.activity_time),
      activity_type: pick(primary.activity_type, secondary.activity_type),
      source_app: pick(primary.source_app, secondary.source_app),
      confidence: Math.max(primary.confidence, secondary.confidence),
      needs_review: primary.needs_review || secondary.needs_review,
    },
    'hybrid',
    {
      raw_text: [primary.raw_text, secondary.raw_text].filter(Boolean).join('\n---\n'),
      raw_json: { primary: primary.raw_json ?? null, secondary: secondary.raw_json ?? null },
    },
  )
}

export function countAnalysisFields(result: RunningAnalysisResult): number {
  return [
    result.distance_km,
    result.duration,
    result.pace,
    result.activity_date,
    result.activity_time,
    result.heart_rate,
    result.calories,
  ].filter((value) => value != null).length
}

export function hasUsableAnalysis(result: RunningAnalysisResult): boolean {
  return result.distance_km != null || result.duration != null || result.activity_date != null
}

export function formatDistanceKmInput(km: number): string {
  const rounded = Math.round(km * 100) / 100
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
}
