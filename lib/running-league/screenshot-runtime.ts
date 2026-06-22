import 'server-only'

export type ScreenshotRuntimeProfile = {
  isVercel: boolean
  vercelEnv: string | null
  ocrSupported: boolean
  aiTimeoutMs: number
  ocrTimeoutMs: number
  openAiDetail: 'high' | 'auto' | 'low'
}

/** Vercel 서버리스 — OCR(Tesseract) 미지원, 실행 시간 제한 있음 */
export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL)
}

export function getScreenshotRuntimeProfile(): ScreenshotRuntimeProfile {
  const isVercel = isVercelRuntime()
  const configuredAiTimeout = Number(process.env.SCREENSHOT_AI_TIMEOUT_MS)

  if (isVercel) {
    return {
      isVercel: true,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      ocrSupported: false,
      // Hobby 플랜 10초 제한 — 이미지 전처리 여유 포함
      aiTimeoutMs:
        Number.isFinite(configuredAiTimeout) && configuredAiTimeout > 0
          ? configuredAiTimeout
          : 8000,
      ocrTimeoutMs: 0,
      openAiDetail: 'auto',
    }
  }

  return {
    isVercel: false,
    vercelEnv: null,
    ocrSupported: true,
    aiTimeoutMs:
      Number.isFinite(configuredAiTimeout) && configuredAiTimeout > 0
        ? configuredAiTimeout
        : 25000,
    ocrTimeoutMs: 8000,
    openAiDetail: 'high',
  }
}
