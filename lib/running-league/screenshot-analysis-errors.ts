export type ScreenshotFailureReason =
  | 'missing_openai_key'
  | 'missing_supabase'
  | 'unauthorized'
  | 'invalid_image'
  | 'image_too_large'
  | 'openai_429'
  | 'openai_401'
  | 'ai_request_failed'
  | 'ai_timeout'
  | 'parse_failed'
  | 'extraction_empty'
  | 'network_error'
  | 'unknown'

/** API / 프론트 공통 에러 코드 (대문자) */
export type ScreenshotApiErrorCode =
  | 'OPENAI_429'
  | 'OPENAI_401'
  | 'IMAGE_TOO_LARGE'
  | 'PARSE_FAILED'
  | 'UNKNOWN_ERROR'
  | 'MISSING_OPENAI_KEY'
  | 'MISSING_SUPABASE'
  | 'UNAUTHORIZED'
  | 'INVALID_IMAGE'
  | 'NETWORK_ERROR'
  | 'AI_TIMEOUT'
  | 'EXTRACTION_EMPTY'

const API_ERROR_MESSAGES: Record<ScreenshotApiErrorCode, string> = {
  OPENAI_429:
    'OpenAI API 사용량 또는 요청 제한에 걸렸습니다. 잠시 후 다시 시도하거나 API 결제/한도를 확인해 주세요.',
  OPENAI_401: 'OpenAI API 키 인증에 실패했습니다. API 키를 확인해 주세요.',
  IMAGE_TOO_LARGE: '이미지 용량이 너무 큽니다. 스크린샷을 압축해서 다시 올려 주세요.',
  PARSE_FAILED: '이미지에서 기록을 정확히 찾지 못했습니다. 아래 항목을 직접 확인해 주세요.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  MISSING_OPENAI_KEY: '서버 AI 설정이 누락되었습니다.',
  MISSING_SUPABASE: '서버 Supabase 설정이 누락되었습니다.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  INVALID_IMAGE: '이미지 파일만 업로드할 수 있습니다.',
  NETWORK_ERROR: '분석 서버에 연결하지 못했습니다.',
  AI_TIMEOUT: 'AI 분석 시간이 초과되었습니다. 다시 시도하거나 수동 입력해 주세요.',
  EXTRACTION_EMPTY:
    '스크린샷 자동 인식에 실패했어요. 아래 기록을 직접 입력해 주세요.',
}

const REASON_TO_API_CODE: Record<ScreenshotFailureReason, ScreenshotApiErrorCode> = {
  missing_openai_key: 'MISSING_OPENAI_KEY',
  missing_supabase: 'MISSING_SUPABASE',
  unauthorized: 'UNAUTHORIZED',
  invalid_image: 'INVALID_IMAGE',
  image_too_large: 'IMAGE_TOO_LARGE',
  openai_429: 'OPENAI_429',
  openai_401: 'OPENAI_401',
  ai_request_failed: 'UNKNOWN_ERROR',
  ai_timeout: 'AI_TIMEOUT',
  parse_failed: 'PARSE_FAILED',
  extraction_empty: 'EXTRACTION_EMPTY',
  network_error: 'NETWORK_ERROR',
  unknown: 'UNKNOWN_ERROR',
}

const API_CODE_TO_REASON: Partial<Record<ScreenshotApiErrorCode, ScreenshotFailureReason>> =
  Object.fromEntries(
    Object.entries(REASON_TO_API_CODE).map(([reason, code]) => [code, reason]),
  ) as Partial<Record<ScreenshotApiErrorCode, ScreenshotFailureReason>>

export function toScreenshotApiErrorCode(
  reason: ScreenshotFailureReason | null | undefined,
): ScreenshotApiErrorCode {
  if (reason && REASON_TO_API_CODE[reason]) {
    return REASON_TO_API_CODE[reason]
  }
  return 'UNKNOWN_ERROR'
}

export function fromScreenshotApiErrorCode(
  code: string | null | undefined,
): ScreenshotFailureReason {
  if (!code) return 'unknown'
  const upper = code.toUpperCase() as ScreenshotApiErrorCode
  if (API_CODE_TO_REASON[upper]) {
    return API_CODE_TO_REASON[upper]!
  }
  const lower = code.toLowerCase() as ScreenshotFailureReason
  if (REASON_TO_API_CODE[lower]) {
    return lower
  }
  return 'unknown'
}

export function screenshotApiErrorMessage(
  code: ScreenshotApiErrorCode | string | null | undefined,
  fallback?: string,
): string {
  if (!code) {
    return fallback ?? API_ERROR_MESSAGES.UNKNOWN_ERROR
  }
  const upper = code.toUpperCase() as ScreenshotApiErrorCode
  if (API_ERROR_MESSAGES[upper]) {
    return API_ERROR_MESSAGES[upper]
  }
  return fallback ?? API_ERROR_MESSAGES.UNKNOWN_ERROR
}

/** @deprecated use screenshotApiErrorMessage + toScreenshotApiErrorCode */
export function screenshotFailureUserMessage(
  reason: ScreenshotFailureReason | null | undefined,
  fallback?: string,
): string {
  return screenshotApiErrorMessage(toScreenshotApiErrorCode(reason), fallback)
}

export function resolveFailureReasonFromDiagnostics(diagnostics?: {
  openai_configured?: boolean
  openai_http_status?: number | null
  ai_status?: string
  ocr_status?: string
  failure_reason?: ScreenshotFailureReason | null
  failure_detail?: string | null
  field_count?: number
  ocr_supported?: boolean
  runtime?: string
}): ScreenshotFailureReason {
  if (diagnostics?.failure_reason) {
    return diagnostics.failure_reason
  }

  if (diagnostics?.openai_http_status === 429) {
    return 'openai_429'
  }
  if (diagnostics?.openai_http_status === 401) {
    return 'openai_401'
  }

  if (diagnostics?.openai_configured === false && diagnostics?.runtime === 'vercel') {
    return 'missing_openai_key'
  }

  if (diagnostics?.ai_status === 'timeout') {
    return 'ai_timeout'
  }

  if (diagnostics?.ai_status === 'failed') {
    if (diagnostics.failure_detail === 'parse_failed') {
      return 'parse_failed'
    }
    return 'ai_request_failed'
  }

  if (diagnostics?.ai_status === 'empty' && diagnostics?.field_count === 0) {
    return 'extraction_empty'
  }

  return 'extraction_empty'
}

export function resolveOpenAiFailureReason(httpStatus: number | null | undefined): ScreenshotFailureReason {
  if (httpStatus === 429) return 'openai_429'
  if (httpStatus === 401) return 'openai_401'
  return 'ai_request_failed'
}

export type ScreenshotApiErrorBody = {
  ok: false
  success: false
  errorCode: ScreenshotApiErrorCode
  message: string
  manualInputRequired: boolean
  error: string
  error_code: ScreenshotFailureReason
  diagnostics?: import('@/lib/running-league/screenshot-extraction').RunningScreenshotAnalysisDiagnostics
}

export function buildScreenshotApiErrorBody(params: {
  reason: ScreenshotFailureReason
  message?: string
  manualInputRequired?: boolean
  diagnostics?: ScreenshotApiErrorBody['diagnostics']
}): ScreenshotApiErrorBody {
  const errorCode = toScreenshotApiErrorCode(params.reason)
  const message = params.message ?? screenshotApiErrorMessage(errorCode)
  return {
    ok: false,
    success: false,
    errorCode,
    message,
    manualInputRequired: params.manualInputRequired ?? true,
    error: message,
    error_code: params.reason,
    diagnostics: params.diagnostics,
  }
}

export function httpStatusForScreenshotError(reason: ScreenshotFailureReason): number {
  switch (reason) {
    case 'unauthorized':
      return 401
    case 'invalid_image':
      return 400
    case 'image_too_large':
      return 413
    case 'missing_supabase':
    case 'missing_openai_key':
      return 503
    case 'openai_429':
      return 429
    case 'openai_401':
      return 502
    default:
      return 500
  }
}
