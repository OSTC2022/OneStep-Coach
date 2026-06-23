import type { Worker } from 'tesseract.js'
import {
  hasMinimumScreenshotExtraction,
  hasFullScreenshotExtraction,
} from '@/lib/running-league/screenshot-analysis-ui'
import {
  buildExtractionFromRaw,
  parseRunningMetricsFromText,
  rehydrateScreenshotExtraction,
  scoreRunningExtraction,
  type RunningScreenshotExtraction,
} from '@/lib/running-league/screenshot-extraction'
import {
  prepareScreenshotOcrPipeline,
  type OcrImageVariant,
  type OcrPreprocessResult,
} from '@/lib/running-league/screenshot-ocr-preprocess-client'
import { getTesseractBrowserOptions } from '@/lib/running-league/tesseract-browser-config'

/** 전체 분석 예산 (ms) — eng+kor 워커 초기화·보완 OCR 포함 */
const MAX_OCR_MS = 14_000
/** variant 1회당 상한 */
const VARIANT_TIMEOUT_MS = 3_000
const HIGH_CONFIDENCE_SCORE = 12

let workerPromise: Promise<Worker> | null = null
let defaultPsm: number | null = null

export function preloadScreenshotOcrWorker(): void {
  void getScreenshotOcrWorker().catch((error) => {
    console.error('[screenshot-ocr-client] preload failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

function resetWorkerPromise() {
  workerPromise = null
  defaultPsm = null
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
  defaultPsm = PSM.AUTO
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

async function recognizeVariant(variant: OcrImageVariant): Promise<string> {
  const worker = await getScreenshotOcrWorker()
  const { PSM } = await import('tesseract.js')

  const params: Record<string, string | number> = {
    tessedit_pageseg_mode: variant.psm ?? defaultPsm ?? PSM.AUTO,
  }
  if (variant.whitelist) {
    params.tessedit_char_whitelist = variant.whitelist
  }

  await worker.setParameters(params)

  try {
    const { data } = await worker.recognize(variant.canvas)
    return data.text ?? ''
  } finally {
    await worker.setParameters({
      tessedit_pageseg_mode: defaultPsm ?? PSM.AUTO,
      tessedit_char_whitelist: '',
    })
  }
}

function mergeOcrTexts(chunks: string[]): string {
  const lines = new Set<string>()
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length >= 2) {
        lines.add(trimmed)
      }
    }
  }
  return [...lines].join('\n')
}

function logOcrText(text: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[screenshot-ocr-client] ocr_text', text)
  }
}

function hasReliableDistance(extraction: RunningScreenshotExtraction | null): boolean {
  return extraction?.distance_km != null && extraction.distance_km >= 0.5
}

function pickBetterExtraction(
  current: RunningScreenshotExtraction | null,
  candidate: RunningScreenshotExtraction,
): RunningScreenshotExtraction {
  const hydratedCandidate = rehydrateScreenshotExtraction(candidate)
  if (!current) return hydratedCandidate

  const hydratedCurrent = rehydrateScreenshotExtraction(current)

  const currentHasDistance = hasReliableDistance(hydratedCurrent)
  const candidateHasDistance = hasReliableDistance(hydratedCandidate)
  if (candidateHasDistance && !currentHasDistance) return hydratedCandidate
  if (currentHasDistance && !candidateHasDistance) return hydratedCurrent

  return scoreRunningExtraction(hydratedCandidate) >= scoreRunningExtraction(hydratedCurrent)
    ? hydratedCandidate
    : hydratedCurrent
}

function hasGoodEnoughExtraction(extraction: RunningScreenshotExtraction): boolean {
  const hasDistance = hasReliableDistance(extraction)
  const secondaryCount = [extraction.duration, extraction.pace, extraction.heart_rate, extraction.calories].filter(
    (value) => value != null && value !== '',
  ).length
  return hasDistance && secondaryCount >= 1
}

function shouldStopOcrEarly(extraction: RunningScreenshotExtraction): boolean {
  if (hasFullScreenshotExtraction(extraction)) return true
  if (!hasReliableDistance(extraction)) return false
  if (hasGoodEnoughExtraction(extraction)) return true
  return scoreRunningExtraction(extraction) >= HIGH_CONFIDENCE_SCORE
}

function variantTimeoutMs(startedAt: number): number {
  const remaining = MAX_OCR_MS - (Date.now() - startedAt)
  if (remaining <= 0) return 0
  return Math.min(VARIANT_TIMEOUT_MS, remaining)
}

type OcrLoopState = {
  chunks: string[]
  bestExtraction: RunningScreenshotExtraction | null
}

async function runOcrVariants(
  prepared: Pick<OcrPreprocessResult, 'variants'>,
  startedAt: number,
  state: OcrLoopState,
): Promise<{ stoppedEarly: boolean }> {
  for (const variant of prepared.variants) {
    if (Date.now() - startedAt >= MAX_OCR_MS) break

    const timeoutMs = variantTimeoutMs(startedAt)
    if (timeoutMs <= 0) break

    try {
      const text = await withTimeout(recognizeVariant(variant), timeoutMs, 'OCR')
      if (text.trim()) {
        state.chunks.push(text)
      }
    } catch (error) {
      console.warn('[screenshot-ocr-client] variant recognize failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const combined = mergeOcrTexts(state.chunks)
    if (!combined) continue

    logOcrText(combined)
    const parsed = parseRunningMetricsFromText(combined)
    const extraction = buildExtractionFromRaw(parsed, 'ocr', { raw_text: combined })
    state.bestExtraction = pickBetterExtraction(state.bestExtraction, extraction)

    if (shouldStopOcrEarly(extraction)) {
      return { stoppedEarly: true }
    }
  }

  return { stoppedEarly: false }
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
  const state: OcrLoopState = { chunks: [], bestExtraction: null }

  try {
    const pipeline = await prepareScreenshotOcrPipeline(file)
    const firstPass = await runOcrVariants(pipeline, startedAt, state)

    if (
      !firstPass.stoppedEarly &&
      !hasReliableDistance(state.bestExtraction) &&
      Date.now() - startedAt < MAX_OCR_MS
    ) {
      await runOcrVariants({ variants: pipeline.supplementVariants }, startedAt, state)
    }

    const rawText = mergeOcrTexts(state.chunks)
    logOcrText(rawText)

    if (!rawText.trim()) {
      return {
        extraction: buildExtractionFromRaw({}, 'ocr'),
        rawText: '',
        ocrStatus: 'empty',
        width: pipeline.width,
        height: pipeline.height,
      }
    }

    const parsed = parseRunningMetricsFromText(rawText)
    const extraction = buildExtractionFromRaw(parsed, 'ocr', { raw_text: rawText })
    const finalExtraction = rehydrateScreenshotExtraction(
      pickBetterExtraction(state.bestExtraction, extraction) ?? extraction,
    )

    return {
      extraction: finalExtraction,
      rawText,
      ocrStatus: hasMinimumScreenshotExtraction(finalExtraction) ? 'success' : 'empty',
      width: pipeline.width,
      height: pipeline.height,
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
