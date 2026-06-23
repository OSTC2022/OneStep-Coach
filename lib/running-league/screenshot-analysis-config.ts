/** OpenAI Vision 폴백 — 기본 OFF. true일 때만 클라이언트 OCR 실패 후 서버 API 호출 */
export function isOpenAiScreenshotFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_OPENAI_SCREENSHOT_FALLBACK === 'true'
}
