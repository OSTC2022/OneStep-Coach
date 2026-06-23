import type { Worker } from 'tesseract.js'
import {
  hasMinimumScreenshotExtraction,
  hasFullScreenshotExtraction,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  buildExtractionFromRaw,
  parseDurationToSeconds,
  parsePaceToSecondsPerKm,
  parseRunningMetricsFromText,
  type RunningScreenshotExtraction,
} from '@/lib/running-league/screenshot-extraction'
import { prepareScreenshotForOcr } from '@/lib/running-league/screenshot-ocr-preprocess-client'
import { getTesseractBrowserOptions } from '@/lib/running-league/tesseract-browser-config'

const MAX_OCR_MS = 45_000

let workerPromise: Promise<Worker> | null = null

export function preloadScreenshotOcrWorker(): void {
  void getScreenshotOcrWorker().catch((error) => {
    console.error('[screenshot-ocr-client] preload failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

function resetWorkerPromise() {
  workerPromise = null
}

async function createOcrWorker(langs: string): Promise<Worker> {
  const { createWorker, PSM } = await import('tesseract.js')
  const options = getTesseractBrowserOptions()

  console.info('[screenshot-ocr-client] creating worker', {
    langs,
    workerPath: options.workerPath,
    corePath: options.corePath,
    workerBlobURL: options.workerBlobURL,
  })

  const worker = await createWorker(langs, 1, options)
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
  })
  return worker
}

async function getScreenshotOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker('eng+kor').catch(async (error) => {
      console.warn('[screenshot-ocr-client] eng+kor worker failed; retrying eng only', {
        error: error instanceof Error ? error.message : String(error),
      })
      resetWorkerPromise()
      return createOcrWorker('eng')
    })
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
  try {
    const worker = await getScreenshotOcrWorker()
    const { data } = await worker.recognize(canvas)
    return data.text ?? ''
  } catch (error) {
    resetWorkerPromise()
    throw error
  }
}

function mergeOcrTexts(chunks: string[]): string {
  return [...new Set(chunks.map((chunk) => chunk.trim()).filter(Boolean))].join('\n')
}

function logOcrText(text: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[screenshot-ocr-client] ocr_text', text)
  }
}

function shouldStopOcrEarly(extraction: RunningScreenshotExtraction): boolean {
  if (hasFullScreenshotExtraction(extraction)) return true

  const durationParts = extraction.duration?.split(':').length ?? 0
  if (extraction.distance_km != null && durationParts === 3) return true

  if (extraction.distance_km != null && extraction.duration && extraction.pace) {
    const durSec = parseDurationToSeconds(extraction.duration)
    const paceSec = parsePaceToSecondsPerKm(extraction.pace)
    if (durSec != null && paceSec != null && paceSec > 0) {
      const impliedKm = durSec / paceSec
      if (extraction.distance_km >= impliedKm * 0.75) return true
    }
  }

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

      logOcrText(combined)
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
    logOcrText(rawText)

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
      stack: error instanceof Error ? error.stack : undefined,
    })
    resetWorkerPromise()
    return {
      extraction: buildExtractionFromRaw({}, 'ocr'),
      rawText: '',
      ocrStatus: 'failed',
      width: 0,
      height: 0,
    }
  }
}
