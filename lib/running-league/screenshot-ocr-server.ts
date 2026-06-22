import 'server-only'

import path from 'node:path'
import {
  buildExtractionFromRaw,
  parseRunningMetricsFromText,
} from '@/lib/running-league/screenshot-extraction'
import { buildOcrImageVariants } from '@/lib/running-league/screenshot-ocr-preprocess'

const TESSERACT_WORKER_PATH = path.join(
  process.cwd(),
  'node_modules',
  'tesseract.js',
  'src',
  'worker-script',
  'node',
  'index.js',
)

let workerPromise: Promise<import('tesseract.js').Worker> | null = null

function resetWorker() {
  workerPromise = null
}

async function createOcrWorker() {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('kor+eng', 1, {
    workerPath: TESSERACT_WORKER_PATH,
    logger: () => undefined,
  })
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
  })
  return worker
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error) => {
      resetWorker()
      throw error
    })
  }
  return workerPromise
}

async function recognizeBuffer(buffer: Buffer): Promise<string> {
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(buffer)
    return data.text ?? ''
  } catch (error) {
    resetWorker()
    console.warn('[screenshot-ocr-server] recognize failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

function mergeOcrTexts(chunks: string[]): string {
  return [...new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))].join('\n')
}

export async function extractRunningMetricsWithOcr(buffer: Buffer) {
  try {
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
      parsed.pace != null

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
  } catch (error) {
    resetWorker()
    console.warn('[screenshot-ocr-server] OCR pipeline failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return buildExtractionFromRaw({}, 'ocr')
  }
}
