import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'

export type ScreenshotAnalysisStatus = 'success' | 'partial' | 'failed'

export const CORE_EXTRACTION_FIELDS = ['distance_km', 'duration', 'pace'] as const
export const OPTIONAL_EXTRACTION_FIELDS = [
  'heart_rate',
  'calories',
  'activity_date',
  'activity_time',
] as const

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
  const core_field_count = countCoreExtractionFields(extraction)

  const missing_core_fields = CORE_EXTRACTION_FIELDS.filter((field) => {
    if (field === 'distance_km') return extraction.distance_km == null
    if (field === 'duration') return !extraction.duration
    if (field === 'pace') return !extraction.pace
    return false
  })

  const missing_optional_fields = OPTIONAL_EXTRACTION_FIELDS.filter((field) => {
    if (field === 'heart_rate') return extraction.heart_rate == null
    if (field === 'calories') return extraction.calories == null
    if (field === 'activity_date') return extraction.date_needs_review === true
    if (field === 'activity_time') return !extraction.activity_time
    return false
  })

  const date_needs_review = Boolean(extraction.date_needs_review)

  if (core_field_count === 0) {
    return {
      status: 'failed',
      reason: 'core_fields_empty',
      messages: ['AI 분석 실패, 수동 입력 필요'],
      date_needs_review,
      missing_core_fields,
      missing_optional_fields,
      core_field_count,
    }
  }

  if (core_field_count === 1) {
    const messages = ['일부 항목 확인 필요']
    if (date_needs_review) messages.push('날짜를 확인해주세요')
    return {
      status: 'partial',
      reason: 'single_core_field',
      messages,
      date_needs_review,
      missing_core_fields,
      missing_optional_fields,
      core_field_count,
    }
  }

  const messages = ['주요 기록 인식 완료']
  if (missing_optional_fields.length > 0) {
    messages.push('일부 항목 확인 필요')
  }
  if (date_needs_review) {
    messages.push('날짜를 확인해주세요')
  }

  const hasOptionalGaps = missing_optional_fields.length > 0 || date_needs_review

  return {
    status: hasOptionalGaps ? 'partial' : 'success',
    reason: hasOptionalGaps ? 'optional_fields_missing' : 'core_fields_complete',
    messages,
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
  }
}

export function logExtractionDebug(
  label: string,
  extraction: RunningScreenshotExtraction,
  extras?: { raw_text?: string },
): void {
  if (process.env.NODE_ENV !== 'development') return

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
  })
}
