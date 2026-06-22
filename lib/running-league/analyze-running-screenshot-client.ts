import type { AnalyzeRunningScreenshotResponse } from '@/lib/running-league/screenshot-extraction'

export async function analyzeRunningScreenshotFile(
  file: File,
): Promise<AnalyzeRunningScreenshotResponse> {
  if (process.env.NODE_ENV === 'development') {
    console.info('[analyze-running-screenshot-client] uploading original file', {
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      last_modified: file.lastModified,
    })
  }

  const formData = new FormData()
  formData.append('image', file, file.name)

  const response = await fetch('/api/running-league/analyze-screenshot', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  })

  let payload: AnalyzeRunningScreenshotResponse
  try {
    payload = (await response.json()) as AnalyzeRunningScreenshotResponse
  } catch {
    return { ok: false, error: `이미지 분석 응답을 읽지 못했습니다. (HTTP ${response.status})` }
  }

    if (process.env.NODE_ENV === 'development' && payload.ok) {
    console.info('[analyze-running-screenshot-client] result', {
      diagnostics: payload.diagnostics,
      distanceKm: payload.extraction.distance_km,
      duration: payload.extraction.duration,
      pace: payload.extraction.pace,
      status: payload.extraction.analysis_status,
      reason: payload.extraction.analysis_reason,
    })
  }

  if (payload.ok && payload.extraction.analysis_status === 'failed') {
    console.warn('[analyze-running-screenshot-client] extraction empty on server', payload.diagnostics)
  }

  if (!response.ok || !payload.ok) {
    if (!payload.ok) {
      return { ok: false, error: 'AI 분석 실패, 수동 입력 필요', diagnostics: payload.diagnostics }
    }
    return { ok: false, error: 'AI 분석 실패, 수동 입력 필요' }
  }

  return payload
}
