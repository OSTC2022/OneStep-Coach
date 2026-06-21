import 'server-only'

import {
  buildExtractionFromRaw,
  parseRunningMetricsFromText,
} from '@/lib/running-league/screenshot-extraction'
import { buildOcrImageVariants } from '@/lib/running-league/screenshot-ocr-preprocess'

let workerPromise: Promise<import('tesseract.js').Worker> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const worker = await createWorker('kor+eng', 1, {
        logger: () => undefined,
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      })
      return worker
    })()
  }
  return workerPromise
}

async function recognizeBuffer(buffer: Buffer): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(buffer)
  return data.text ?? ''
}

function mergeOcrTexts(chunks: string[]): string {
  return [...new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))].join('\n')
}

export async function extractRunningMetricsWithOcr(buffer: Buffer) {
  const variants = await buildOcrImageVariants(buffer)
  const chunks: string[] = []

  for (const variant of variants) {
    const text = await recognizeBuffer(variant)
    if (text.trim()) chunks.push(text)

    const combined = mergeOcrTexts(chunks)
    const parsed = parseRunningMetricsFromText(combined)
    const coreFound =
      parsed.distance_km != null &&
      parsed.duration != null &&
      parsed.pace != null &&
      parsed.activity_date != null

    if (coreFound) break
  }

  const rawText = mergeOcrTexts(chunks)
  const raw = parseRunningMetricsFromText(rawText)

  if (!raw.source_app && /러닝|삼성|samsung|칼로리|bpm/i.test(rawText)) {
    raw.source_app = 'Samsung Health'
  }

  if (raw.confidence != null) {
    raw.confidence = Math.min(0.95, raw.confidence + 0.1)
  }

  return buildExtractionFromRaw(raw, 'ocr', { raw_text: rawText })
}
