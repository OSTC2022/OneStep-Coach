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
  })

  const payload = (await response.json()) as AnalyzeRunningScreenshotResponse
  if (!response.ok && payload.ok === false) {
    return payload
  }
  if (!payload.ok) {
    return { ok: false, error: '이미지 분석에 실패했습니다.' }
  }
  return payload
}
