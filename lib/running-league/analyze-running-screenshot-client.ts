import type { AnalyzeRunningScreenshotResponse } from '@/lib/running-league/screenshot-extraction'
import { prepareScreenshotForUpload } from '@/lib/running-league/prepare-screenshot-upload'
import {
  hasMinimumScreenshotExtraction,
  resolveScreenshotAnalysisUi,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  fromScreenshotApiErrorCode,
  resolveFailureReasonFromDiagnostics,
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
    if (payload.error_code) {
      return payload.error_code
    }
    if (payload.errorCode) {
      return fromScreenshotApiErrorCode(payload.errorCode)
    }
  }
  return 'unknown'
}

function resolvePayloadMessage(
  payload: AnalyzeRunningScreenshotResponse,
  reason: ScreenshotFailureReason,
): string {
  if (!payload.ok) {
    return (
      payload.message ||
      payload.error ||
      screenshotApiErrorMessage(payload.errorCode ?? toScreenshotApiErrorCode(reason))
    )
  }
  return screenshotApiErrorMessage(toScreenshotApiErrorCode(reason))
}

function logAnalyzeFailure(context: {
  url: string
  status: number
  body: unknown
  errorCode?: string
  message: string
}) {
  console.error('[analyze-running-screenshot-client] analysis failed', context)
}

export async function analyzeRunningScreenshotFile(
  file: File,
): Promise<AnalyzeRunningScreenshotResponse> {
  console.info('[analyze-running-screenshot-client] file selected', {
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
  })

  let uploadFile: File
  try {
    uploadFile = await prepareScreenshotForUpload(file)
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 준비에 실패했습니다.'
    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: 0,
      body: null,
      errorCode: 'UNKNOWN_ERROR',
      message,
    })
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

  console.info('[analyze-running-screenshot-client] calling analyze API', {
    url: ANALYZE_API_URL,
    upload_file_name: uploadFile.name,
    upload_file_size: uploadFile.size,
    upload_mime_type: uploadFile.type,
  })

  let response: Response
  try {
    response = await fetch(ANALYZE_API_URL, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    })
  } catch (error) {
    const message = screenshotApiErrorMessage('NETWORK_ERROR')
    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
      errorCode: 'NETWORK_ERROR',
      message,
    })
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
  let rawBody: unknown = null
  try {
    rawBody = await response.json()
    payload = rawBody as AnalyzeRunningScreenshotResponse
  } catch {
    const message = `이미지 분석 응답을 읽지 못했습니다. (HTTP ${response.status})`
    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: response.status,
      body: rawBody,
      errorCode: 'UNKNOWN_ERROR',
      message,
    })
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

  console.info('[analyze-running-screenshot-client] API response', {
    http_status: response.status,
    payload_ok: payload.ok,
    success: 'success' in payload ? payload.success : null,
    errorCode: !payload.ok ? payload.errorCode : null,
    analysis_status: isSuccessPayload(payload) ? payload.extraction.analysis_status : null,
    distance_km: isSuccessPayload(payload) ? payload.extraction.distance_km : null,
    duration: isSuccessPayload(payload) ? payload.extraction.duration : null,
  })

  if (!response.ok || !isSuccessPayload(payload)) {
    const errorCode =
      (!payload.ok && payload.errorCode) ||
      toScreenshotApiErrorCode(resolvePayloadErrorCode(payload))
    const reason = resolvePayloadErrorCode(payload)
    const message = resolvePayloadMessage(payload, reason)

    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: response.status,
      body: payload,
      errorCode,
      message,
    })

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

  const ui = resolveScreenshotAnalysisUi(payload.extraction)
  console.info('[analyze-running-screenshot-client] resolved UI', {
    ui_status: ui.status,
    ui_message: ui.message,
    has_minimum: hasMinimumScreenshotExtraction(payload.extraction),
  })

  return payload
}
