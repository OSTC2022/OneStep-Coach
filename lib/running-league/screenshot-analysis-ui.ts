import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'

export type ScreenshotAnalysisUiStatus = 'success' | 'partial' | 'failed'

export const SCREENSHOT_ANALYSIS_MESSAGES = {
  success: '기록을 자동으로 인식했어요. 틀린 항목이 있으면 수정해 주세요.',
  partial: '일부 기록을 인식했어요. 빠진 항목만 확인해 주세요.',
  failed: '자동 인식이 어려워요. 아래 기록을 직접 입력해 주세요.',
} as const

function countRecognizedFields(
  extraction: Pick<
    RunningScreenshotExtraction,
    'distance_km' | 'duration' | 'pace' | 'heart_rate' | 'calories' | 'activity_date' | 'activity_time'
  >,
): number {
  return [
    extraction.distance_km,
    extraction.duration,
    extraction.pace,
    extraction.heart_rate,
    extraction.calories,
    extraction.activity_date,
    extraction.activity_time,
  ].filter((value) => value != null && value !== '').length
}

export function hasMinimumScreenshotExtraction(
  extraction: Pick<
    RunningScreenshotExtraction,
    | 'distance_km'
    | 'duration'
    | 'pace'
    | 'heart_rate'
    | 'calories'
    | 'activity_date'
    | 'activity_time'
    | 'raw_json'
  >,
): boolean {
  if (extraction.raw_json?.success === true) return true
  return countRecognizedFields(extraction) >= 1
}

export function hasFullScreenshotExtraction(
  extraction: Pick<
    RunningScreenshotExtraction,
    'distance_km' | 'duration' | 'activity_date' | 'date_needs_review'
  >,
): boolean {
  return (
    extraction.distance_km != null &&
    Boolean(extraction.duration) &&
    Boolean(extraction.activity_date) &&
    !extraction.date_needs_review
  )
}

export function countRequiredScreenshotFields(
  extraction: Pick<
    RunningScreenshotExtraction,
    'distance_km' | 'duration' | 'activity_date'
  >,
): number {
  return [extraction.distance_km, extraction.duration, extraction.activity_date].filter(
    (value) => value != null && value !== '',
  ).length
}

export function resolveScreenshotAnalysisUi(extraction: RunningScreenshotExtraction): {
  status: ScreenshotAnalysisUiStatus
  message: string
} {
  if (!hasMinimumScreenshotExtraction(extraction)) {
    return { status: 'failed', message: SCREENSHOT_ANALYSIS_MESSAGES.failed }
  }

  if (hasFullScreenshotExtraction(extraction)) {
    return { status: 'success', message: SCREENSHOT_ANALYSIS_MESSAGES.success }
  }

  return { status: 'partial', message: SCREENSHOT_ANALYSIS_MESSAGES.partial }
}
