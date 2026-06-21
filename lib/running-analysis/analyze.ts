import 'server-only'

import { analyzeRunningScreenshotWithOpenAi } from '@/lib/running-analysis/openai'
import {
  countExtractedFields,
  hasUsableExtraction,
  mergeExtractions,
  buildExtractionFromRaw,
  type AnalyzeRunningScreenshotResponse,
  type RunningScreenshotAnalysisDiagnostics,
  type RunningScreenshotExtraction,
} from '@/lib/running-league/screenshot-extraction'
import {
  hashScreenshotBuffer,
  prepareScreenshotForAnalysis,
} from '@/lib/running-league/screenshot-image-server'
import { extractRunningMetricsWithOcr } from '@/lib/running-league/screenshot-ocr-server'
import { getOpenAiApiKey, isOpenAiConfigured } from '@/lib/running-league/openai-config'

const AI_TIMEOUT_MS = 25000
const OCR_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function emptyExtraction(): RunningScreenshotExtraction {
  return buildExtractionFromRaw({}, 'none')
}

function resolveExtraction(aiResult: RunningScreenshotExtraction, ocrResult: RunningScreenshotExtraction) {
  if (hasUsableExtraction(aiResult) && hasUsableExtraction(ocrResult)) {
    return mergeExtractions(aiResult, ocrResult)
  }
  if (hasUsableExtraction(aiResult)) return aiResult
  if (hasUsableExtraction(ocrResult)) return ocrResult
  const merged = mergeExtractions(aiResult, ocrResult)
  merged.extraction_method = 'none'
  return merged
}

export async function analyzeRunningScreenshotBuffer(
  originalBuffer: Buffer,
  mimeType: string,
  options?: { logMeta?: boolean; fileName?: string },
): Promise<AnalyzeRunningScreenshotResponse> {
  const openaiConfigured = isOpenAiConfigured()
  const diagnostics: RunningScreenshotAnalysisDiagnostics = {
    openai_configured: openaiConfigured,
    ai_status: 'skipped',
    ocr_status: 'skipped',
    field_count: 0,
  }

  try {
    const { buffer, meta } = await prepareScreenshotForAnalysis(originalBuffer, mimeType)
    const image_hash = hashScreenshotBuffer(originalBuffer)

    if (options?.logMeta) {
      console.info('[running-analysis] start', {
        file_name: options.fileName ?? null,
        openai_configured: openaiConfigured,
        original_size: meta.original_size,
        buffer_length: originalBuffer.length,
        width: meta.width,
        height: meta.height,
      })
    }

    let aiResult = emptyExtraction()
    const hasKey = Boolean(getOpenAiApiKey({ logIfMissing: true }))

    if (hasKey) {
      try {
        const result = await withTimeout(
          analyzeRunningScreenshotWithOpenAi(buffer, 'image/jpeg'),
          AI_TIMEOUT_MS,
          'AI',
        )
        if (result && hasUsableExtraction(result)) {
          aiResult = result
          diagnostics.ai_status = 'success'
        } else {
          diagnostics.ai_status = 'empty'
          console.warn('[running-analysis] OpenAI returned no usable fields', {
            file_name: options?.fileName ?? null,
            openai_configured: true,
          })
        }
      } catch (error) {
        diagnostics.ai_status =
          error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'failed'
        console.warn('[running-analysis] OpenAI failed', {
          file_name: options?.fileName ?? null,
          openai_configured: true,
          status: diagnostics.ai_status,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    let ocrResult = emptyExtraction()
    const shouldRunOcr = !hasKey || !hasUsableExtraction(aiResult) || countExtractedFields(aiResult) < 2

    if (shouldRunOcr) {
      try {
        ocrResult = await withTimeout(extractRunningMetricsWithOcr(buffer), OCR_TIMEOUT_MS, 'OCR')
        diagnostics.ocr_status = hasUsableExtraction(ocrResult) ? 'success' : 'empty'
      } catch (error) {
        diagnostics.ocr_status =
          error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'failed'
        console.warn('[running-analysis] OCR fallback failed', {
          file_name: options?.fileName ?? null,
          status: diagnostics.ocr_status,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const extraction = resolveExtraction(aiResult, ocrResult)
    diagnostics.field_count = countExtractedFields(extraction)

    if (options?.logMeta) {
      console.info('[running-analysis] done', {
        file_name: options.fileName ?? null,
        openai_configured: openaiConfigured,
        ai_status: diagnostics.ai_status,
        ocr_status: diagnostics.ocr_status,
        field_count: diagnostics.field_count,
        distance_km: extraction.distance_km,
        duration: extraction.duration,
        pace: extraction.pace,
        activity_date: extraction.activity_date,
      })
    }

    return {
      ok: true,
      extraction,
      image_meta: meta,
      image_hash,
      diagnostics,
    }
  } catch (error) {
    console.error('[running-analysis] fatal error', {
      openai_configured: openaiConfigured,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      error: '이미지 분석에 실패했습니다.',
      diagnostics,
    }
  }
}
