export type ScreenshotFailureReason =
  | 'missing_openai_key'
  | 'missing_supabase'
  | 'unauthorized'
  | 'invalid_image'
  | 'image_too_large'
  | 'ai_request_failed'
  | 'ai_timeout'
  | 'parse_failed'
  | 'extraction_empty'
  | 'network_error'
  | 'unknown'

const USER_MESSAGES: Record<ScreenshotFailureReason, string> = {
  missing_openai_key: '서버 AI 설정이 누락되었습니다.',
  missing_supabase: '서버 Supabase 설정이 누락되었습니다.',
  unauthorized: '로그인이 필요합니다.',
  invalid_image: '이미지 파일만 업로드할 수 있습니다.',
  image_too_large: '이미지 용량이 커서 분석하지 못했습니다.',
  ai_request_failed: 'AI 분석 서버 응답이 실패했습니다.',
  ai_timeout: 'AI 분석 시간이 초과되었습니다. 다시 시도하거나 수동 입력해주세요.',
  parse_failed: '분석 결과를 입력값으로 변환하지 못했습니다.',
  extraction_empty: '스크린샷 자동 인식에 실패했어요. 아래 기록을 직접 입력해 주세요.',
  network_error: '분석 서버에 연결하지 못했습니다.',
  unknown: '스크린샷 자동 인식에 실패했어요. 아래 기록을 직접 입력해 주세요.',
}

export function screenshotFailureUserMessage(
  reason: ScreenshotFailureReason | null | undefined,
  fallback?: string,
): string {
  if (reason && USER_MESSAGES[reason]) {
    return USER_MESSAGES[reason]
  }
  return fallback ?? USER_MESSAGES.unknown
}

export function resolveFailureReasonFromDiagnostics(diagnostics?: {
  openai_configured?: boolean
  ai_status?: string
  ocr_status?: string
  failure_reason?: ScreenshotFailureReason | null
  field_count?: number
  ocr_supported?: boolean
  runtime?: string
}): ScreenshotFailureReason {
  if (diagnostics?.failure_reason) {
    return diagnostics.failure_reason
  }

  if (diagnostics?.openai_configured === false && diagnostics?.runtime === 'vercel') {
    return 'missing_openai_key'
  }

  if (diagnostics?.ai_status === 'timeout') {
    return 'ai_timeout'
  }

  if (diagnostics?.ai_status === 'failed') {
    return 'ai_request_failed'
  }

  if (diagnostics?.ai_status === 'empty' && diagnostics?.field_count === 0) {
    return 'extraction_empty'
  }

  return 'extraction_empty'
}
