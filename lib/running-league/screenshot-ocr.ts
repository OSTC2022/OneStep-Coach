export {
  preloadScreenshotOcrWorker,
  extractRunningMetricsWithClientOcr,
} from '@/lib/running-league/screenshot-ocr-client'

/** @deprecated screenshot-ocr-client 사용 */
export async function recognizeRunningScreenshotText(
  file: File,
  onPartialText?: (text: string) => string | null,
): Promise<string> {
  const { extractRunningMetricsWithClientOcr } = await import(
    '@/lib/running-league/screenshot-ocr-client'
  )
  const result = await extractRunningMetricsWithClientOcr(file)
  if (onPartialText) {
    const early = onPartialText(result.rawText)
    if (early != null) return early
  }
  return result.rawText
}
