import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'
import {
  hasFullScreenshotExtraction,
  hasMinimumScreenshotExtraction,
  SCREENSHOT_ANALYSIS_MESSAGES,
} from '@/lib/running-league/screenshot-analysis-ui'

export type ScreenshotAnalysisStatus = 'success' | 'partial' | 'failed'

/** 필수: 거리, 총 시간, 날짜 */
export const REQUIRED_EXTRACTION_FIELDS = ['distance_km', 'duration', 'activity_date'] as const
/** 선택: 페이스, 심박, 칼로리, 운동 시각 */
export const OPTIONAL_EXTRACTION_FIELDS = [
  'pace',
  'heart_rate',
  'calories',
  'activity_time',
] as const

/** @deprecated pace는 선택값 — 하위 호환용 */
export const CORE_EXTRACTION_FIELDS = ['distance_km', 'duration', 'pace'] as const

export type ScreenshotAnalysisClassification = {
  status: ScreenshotAnalysisStatus
  reason: string
  messages: string[]
  date_needs_review: boolean
  missing_core_fields: string[]
  missing_optional_fields: string[]
  core_field_count: number
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function countCoreExtractionFields(
  extraction: Pick<
    RunningScreenshotExtraction,
    'distance_km' | 'duration' | 'pace'
  >,
): number {
  return [extraction.distance_km, extraction.duration, extraction.pace].filter(
    (value) => value != null && value !== '',
  ).length
}

export function countRequiredExtractionFields(
  extraction: Pick<
    RunningScreenshotExtraction,
    'distance_km' | 'duration' | 'activity_date'
  >,
): number {
  return [extraction.distance_km, extraction.duration, extraction.activity_date].filter(
    (value) => value != null && value !== '',
  ).length
}

export function applyDateDefaultIfMissing(
  extraction: RunningScreenshotExtraction,
): RunningScreenshotExtraction {
  if (extraction.activity_date) {
    return {
      ...extraction,
      date_needs_review: extraction.date_needs_review ?? false,
    }
  }

  return {
    ...extraction,
    activity_date: todayIsoDate(),
    date_needs_review: true,
  }
}

export function classifyScreenshotExtraction(
  extraction: RunningScreenshotExtraction,
): ScreenshotAnalysisClassification {
  const core_field_count = countRequiredExtractionFields(extraction)

  const missing_core_fields = REQUIRED_EXTRACTION_FIELDS.filter((field) => {
    if (field === 'distance_km') return extraction.distance_km == null
    if (field === 'duration') return !extraction.duration
    if (field === 'activity_date') {
      return !extraction.activity_date || extraction.date_needs_review === true
    }
    return false
  })

  const missing_optional_fields = OPTIONAL_EXTRACTION_FIELDS.filter((field) => {
    if (field === 'pace') return !extraction.pace
    if (field === 'heart_rate') return extraction.heart_rate == null
    if (field === 'calories') return extraction.calories == null
    if (field === 'activity_time') return !extraction.activity_time
    return false
  })

  const date_needs_review = Boolean(extraction.date_needs_review)

  if (!hasMinimumScreenshotExtraction(extraction)) {
    return {
      status: 'failed',
      reason: 'required_fields_empty',
      messages: [SCREENSHOT_ANALYSIS_MESSAGES.failed],
      date_needs_review,
      missing_core_fields,
      missing_optional_fields,
      core_field_count,
    }
  }

  if (hasFullScreenshotExtraction(extraction)) {
    return {
      status: missing_optional_fields.length > 0 ? 'partial' : 'success',
      reason:
        missing_optional_fields.length > 0 ? 'optional_fields_missing' : 'required_fields_complete',
      messages:
        missing_optional_fields.length > 0
          ? [SCREENSHOT_ANALYSIS_MESSAGES.partial]
          : [SCREENSHOT_ANALYSIS_MESSAGES.success],
      date_needs_review,
      missing_core_fields,
      missing_optional_fields,
      core_field_count,
    }
  }

  return {
    status: 'partial',
    reason: 'required_fields_incomplete',
    messages: [SCREENSHOT_ANALYSIS_MESSAGES.partial],
    date_needs_review,
    missing_core_fields,
    missing_optional_fields,
    core_field_count,
  }
}

export function enrichExtractionWithAnalysis(
  extraction: RunningScreenshotExtraction,
): RunningScreenshotExtraction {
  const withDate = applyDateDefaultIfMissing(extraction)
  const classification = classifyScreenshotExtraction(withDate)

  const partial_failure =
    classification.status === 'failed' || classification.status === 'partial'

  return {
    ...withDate,
    analysis_status: classification.status,
    analysis_reason: classification.reason,
    analysis_messages: classification.messages,
    date_needs_review: classification.date_needs_review,
    missing_core_fields: classification.missing_core_fields,
    missing_optional_fields: classification.missing_optional_fields,
    partial_failure,
    missing_fields: [
      ...classification.missing_core_fields,
      ...classification.missing_optional_fields,
    ],
    analysis_success: classification.status !== 'failed',
  }
}

export function logExtractionDebug(
  label: string,
  extraction: RunningScreenshotExtraction,
  extras?: { raw_text?: string },
): void {
  console.info(`[running-analysis/debug] ${label}`, {
    ocr_raw_text: extras?.raw_text?.slice(0, 500) ?? extraction.raw_text?.slice(0, 500) ?? null,
    distanceKm: extraction.distance_km,
    duration: extraction.duration,
    pace: extraction.pace,
    heartRate: extraction.heart_rate,
    calories: extraction.calories,
    date: extraction.activity_date,
    startTime: extraction.activity_time,
    date_needs_review: extraction.date_needs_review ?? false,
    status: extraction.analysis_status ?? null,
    reason: extraction.analysis_reason ?? null,
    messages: extraction.analysis_messages ?? null,
    analysis_success: extraction.analysis_success ?? null,
  })
}
