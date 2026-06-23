import type { AnalyzeRunningScreenshotResponse } from '@/lib/running-league/screenshot-extraction'
import { prepareScreenshotForUpload } from '@/lib/running-league/prepare-screenshot-upload'
import {
  fromScreenshotApiErrorCode,
  screenshotApiErrorMessage,
  toScreenshotApiErrorCode,
  type ScreenshotFailureReason,
} from '@/lib/running-league/screenshot-analysis-errors'

const ANALYZE_API_URL = '/api/running-league/analyze-screenshot'

function isSuccessPayload(
  payload: AnalyzeRunningScreenshotResponse,
): payload is Extract<AnalyzeRunningScreenshotResponse, { ok: true }> {
  return payload.ok === true
}

function resolvePayloadErrorCode(payload: AnalyzeRunningScreenshotResponse): ScreenshotFailureReason {
  if (!payload.ok) {
    if (payload.error_code) return payload.error_code
    if (payload.errorCode) return fromScreenshotApiErrorCode(payload.errorCode)
  }
  return 'unknown'
}

/** Optional OpenAI Vision 폴백 — NEXT_PUBLIC_ENABLE_OPENAI_SCREENSHOT_FALLBACK=true 일 때만 */
export async function analyzeRunningScreenshotViaApi(
  file: File,
): Promise<AnalyzeRunningScreenshotResponse> {
  let uploadFile: File
  try {
    uploadFile = await prepareScreenshotForUpload(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 준비에 실패했습니다.'
    return {
      ok: false,
      success: false,
      error: message,
      message,
      errorCode: 'UNKNOWN_ERROR',
      error_code: 'unknown',
      manualInputRequired: true,
    }
  }

  const formData = new FormData()
  formData.append('image', uploadFile, uploadFile.name)

  let response: Response
  try {
    response = await fetch(ANALYZE_API_URL, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    })
  } catch {
    const message = screenshotApiErrorMessage('NETWORK_ERROR')
    return {
      ok: false,
      success: false,
      error: message,
      message,
      errorCode: 'NETWORK_ERROR',
      error_code: 'network_error',
      manualInputRequired: true,
    }
  }

  let payload: AnalyzeRunningScreenshotResponse
  try {
    payload = (await response.json()) as AnalyzeRunningScreenshotResponse
  } catch {
    const message = `이미지 분석 응답을 읽지 못했습니다. (HTTP ${response.status})`
    return {
      ok: false,
      success: false,
      error: message,
      message,
      errorCode: 'UNKNOWN_ERROR',
      error_code: 'unknown',
      manualInputRequired: true,
    }
  }

  if (!response.ok || !isSuccessPayload(payload)) {
    const reason = resolvePayloadErrorCode(payload)
    const errorCode =
      (!payload.ok && payload.errorCode) || toScreenshotApiErrorCode(reason)
    const message = !payload.ok
      ? payload.message || payload.error || screenshotApiErrorMessage(errorCode)
      : screenshotApiErrorMessage(errorCode)

    return {
      ok: false,
      success: false,
      error: message,
      message,
      errorCode,
      error_code: reason,
      manualInputRequired: !payload.ok ? (payload.manualInputRequired ?? true) : true,
      diagnostics: !payload.ok ? payload.diagnostics : undefined,
    }
  }

  return payload
}
