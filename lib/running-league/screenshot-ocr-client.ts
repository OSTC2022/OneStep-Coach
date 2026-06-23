import type { Worker } from 'tesseract.js'
import {
  hasMinimumScreenshotExtraction,
  hasFullScreenshotExtraction,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  buildExtractionFromRaw,
  parseRunningMetricsFromText,
  type RunningScreenshotExtraction,
} from '@/lib/running-league/screenshot-extraction'
import { prepareScreenshotForOcr } from '@/lib/running-league/screenshot-ocr-preprocess-client'

const MAX_OCR_MS = 45_000

let workerPromise: Promise<Worker> | null = null

export function preloadScreenshotOcrWorker(): void {
  void getScreenshotOcrWorker()
}

async function getScreenshotOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const worker = await createWorker('eng+kor', 1, {
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getScreenshotOcrWorker()
  const { data } = await worker.recognize(canvas)
  return data.text ?? ''
}

function mergeOcrTexts(chunks: string[]): string {
  return [...new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))].join('\n')
}

function logOcrTextInDev(text: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[screenshot-ocr-client] ocr_text', text)
  }
}

function shouldStopOcrEarly(extraction: RunningScreenshotExtraction): boolean {
  if (hasFullScreenshotExtraction(extraction)) return true
  // 거리가 없으면 다른 필드만 인식돼도 OCR 변형을 더 시도
  if (extraction.distance_km != null && extraction.duration != null) return true
  return false
}

export type ClientOcrExtractionResult = {
  extraction: RunningScreenshotExtraction
  rawText: string
  ocrStatus: 'success' | 'empty' | 'failed'
  width: number
  height: number
}

export async function extractRunningMetricsWithClientOcr(file: File): Promise<ClientOcrExtractionResult> {
  const startedAt = Date.now()
  const chunks: string[] = []

  try {
    const prepared = await prepareScreenshotForOcr(file)

    for (const canvas of prepared.variants) {
      if (Date.now() - startedAt > MAX_OCR_MS) break

      const remainingMs = Math.max(2000, MAX_OCR_MS - (Date.now() - startedAt))
      try {
        const text = await withTimeout(recognizeCanvas(canvas), remainingMs, 'OCR')
        if (text.trim()) {
          chunks.push(text)
        }
      } catch (error) {
        console.warn('[screenshot-ocr-client] variant recognize failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      const combined = mergeOcrTexts(chunks)
      if (!combined) continue

      logOcrTextInDev(combined)
      const parsed = parseRunningMetricsFromText(combined)
      const extraction = buildExtractionFromRaw(parsed, 'ocr', { raw_text: combined })

      if (shouldStopOcrEarly(extraction)) {
        return {
          extraction,
          rawText: combined,
          ocrStatus: 'success',
          width: prepared.width,
          height: prepared.height,
        }
      }
    }

    const rawText = mergeOcrTexts(chunks)
    logOcrTextInDev(rawText)

    if (!rawText.trim()) {
      return {
        extraction: buildExtractionFromRaw({}, 'ocr'),
        rawText: '',
        ocrStatus: 'empty',
        width: prepared.width,
        height: prepared.height,
      }
    }

    const parsed = parseRunningMetricsFromText(rawText)
    const extraction = buildExtractionFromRaw(parsed, 'ocr', { raw_text: rawText })

    return {
      extraction,
      rawText,
      ocrStatus: hasMinimumScreenshotExtraction(extraction) ? 'success' : 'empty',
      width: prepared.width,
      height: prepared.height,
    }
  } catch (error) {
    console.error('[screenshot-ocr-client] pipeline failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      extraction: buildExtractionFromRaw({}, 'ocr'),
      rawText: '',
      ocrStatus: 'failed',
      width: 0,
      height: 0,
    }
  }
}
