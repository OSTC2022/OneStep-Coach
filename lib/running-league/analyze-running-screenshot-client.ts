import type { AnalyzeRunningScreenshotResponse } from '@/lib/running-league/screenshot-extraction'
import { prepareScreenshotForUpload } from '@/lib/running-league/prepare-screenshot-upload'
import {
  hasMinimumScreenshotExtraction,
  resolveScreenshotAnalysisUi,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  resolveFailureReasonFromDiagnostics,
  screenshotFailureUserMessage,
  type ScreenshotFailureReason,
} from '@/lib/running-league/screenshot-analysis-errors'

const ANALYZE_API_URL = '/api/running-league/analyze-screenshot'

function isSuccessPayload(
  payload: AnalyzeRunningScreenshotResponse,
): payload is Extract<AnalyzeRunningScreenshotResponse, { ok: true }> {
  return payload.ok === true
}

function logAnalyzeFailure(context: {
  url: string
  status: number
  body: unknown
  errorCode?: ScreenshotFailureReason
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
      message,
    })
    return { ok: false, error: message, error_code: 'unknown' }
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
    const message = screenshotFailureUserMessage('network_error')
    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
      errorCode: 'network_error',
      message,
    })
    return { ok: false, error: message, error_code: 'network_error' }
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
      message,
    })
    return { ok: false, error: message, error_code: 'unknown' }
  }

  console.info('[analyze-running-screenshot-client] API response', {
    http_status: response.status,
    payload_ok: isSuccessPayload(payload) ? payload.ok : payload.ok,
    analysis_status: isSuccessPayload(payload) ? payload.extraction.analysis_status : null,
    analysis_success: isSuccessPayload(payload) ? payload.extraction.analysis_success : null,
    distance_km: isSuccessPayload(payload) ? payload.extraction.distance_km : null,
    duration: isSuccessPayload(payload) ? payload.extraction.duration : null,
    diagnostics: isSuccessPayload(payload) ? payload.diagnostics : null,
  })

  if (!response.ok || !isSuccessPayload(payload)) {
    const errorCode =
      (!payload.ok && payload.error_code) ||
      resolveFailureReasonFromDiagnostics(!payload.ok ? payload.diagnostics : undefined) ||
      (response.status === 413 ? 'image_too_large' : response.status === 503 ? 'missing_openai_key' : 'unknown')

    const message = !payload.ok
      ? payload.error || screenshotFailureUserMessage(errorCode)
      : screenshotFailureUserMessage(errorCode)

    logAnalyzeFailure({
      url: ANALYZE_API_URL,
      status: response.status,
      body: payload,
      errorCode,
      message,
    })

    return {
      ok: false,
      error: message,
      error_code: errorCode,
      diagnostics: !payload.ok ? payload.diagnostics : undefined,
    }
  }

  const ui = resolveScreenshotAnalysisUi(payload.extraction)
  console.info('[analyze-running-screenshot-client] resolved UI', {
    ui_status: ui.status,
    ui_message: ui.message,
    has_minimum: hasMinimumScreenshotExtraction(payload.extraction),
    form_values: {
      distanceKm: payload.extraction.distance_km,
      duration: payload.extraction.duration,
      pace: payload.extraction.pace,
      heartRate: payload.extraction.heart_rate,
      calories: payload.extraction.calories,
      date: payload.extraction.activity_date,
      startTime: payload.extraction.activity_time,
    },
  })

  return payload
}
