import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'

export type ScreenshotAnalysisUiStatus = 'success' | 'partial' | 'failed'

export const SCREENSHOT_ANALYSIS_MESSAGES = {
  success: '스크린샷을 자동으로 인식했어요.',
  partial: '일부 기록을 인식했어요. 빠진 항목만 확인해 주세요.',
  failed: '스크린샷 자동 인식에 실패했어요. 아래 기록을 직접 입력해 주세요.',
} as const

export function hasMinimumScreenshotExtraction(
  extraction: Pick<RunningScreenshotExtraction, 'distance_km' | 'duration' | 'raw_json'>,
): boolean {
  if (extraction.raw_json?.success === true) return true
  return extraction.distance_km != null && Boolean(extraction.duration)
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
