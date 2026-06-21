import 'server-only'

import {
  buildAiExtraction,
  extractRunningMetricsWithAi,
} from '@/lib/running-league/screenshot-ai-vision'
import {
  hashScreenshotBuffer,
  prepareScreenshotForAnalysis,
} from '@/lib/running-league/screenshot-image-server'
import { extractRunningMetricsWithOcr } from '@/lib/running-league/screenshot-ocr-server'
import { getOpenAiApiKey, isOpenAiConfigured } from '@/lib/running-league/openai-config'
import {
  buildExtractionFromRaw,
  countExtractedFields,
  hasUsableExtraction,
  mergeExtractions,
  type AnalyzeRunningScreenshotResponse,
  type RunningScreenshotExtraction,
} from '@/lib/running-league/screenshot-extraction'

const ANALYSIS_BUDGET_MS = 12000
const OCR_BUDGET_MS = 9000
const AI_BUDGET_MS = 7000
const AI_CONFIDENCE_THRESHOLD = 0.7

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

export async function analyzeRunningScreenshotBuffer(
  originalBuffer: Buffer,
  mimeType: string,
  options?: { logMeta?: boolean; fileName?: string },
): Promise<AnalyzeRunningScreenshotResponse> {
  const startedAt = Date.now()

  try {
    const { buffer, meta } = await prepareScreenshotForAnalysis(originalBuffer, mimeType)
    const image_hash = hashScreenshotBuffer(originalBuffer)

    if (options?.logMeta) {
      console.info('[analyze-running-screenshot]', {
        file_name: options.fileName ?? null,
        openai_configured: isOpenAiConfigured(),
        mime_type: meta.mime_type,
        original_size: meta.original_size,
        width: meta.width,
        height: meta.height,
        resized_width: meta.resized_width,
        resized_height: meta.resized_height,
        image_hash: image_hash.slice(0, 12),
      })
    }

    const remainingBudget = () => Math.max(500, ANALYSIS_BUDGET_MS - (Date.now() - startedAt))

    const ocrPromise = withTimeout(
      extractRunningMetricsWithOcr(buffer),
      Math.min(OCR_BUDGET_MS, remainingBudget()),
      'OCR',
    ).catch((error) => {
      console.warn('[analyze-running-screenshot] OCR failed', error)
      return emptyExtraction()
    })

    const openAiApiKey = getOpenAiApiKey({ logIfMissing: true })
    const aiPromise = openAiApiKey
      ? withTimeout(
          extractRunningMetricsWithAi(buffer, 'image/jpeg'),
          Math.min(AI_BUDGET_MS, remainingBudget()),
          'AI',
        )
          .then((raw) => (raw ? buildAiExtraction(raw, raw as Record<string, unknown>) : emptyExtraction()))
          .catch((error) => {
            console.warn('[analyze-running-screenshot] AI failed', error)
            return emptyExtraction()
          })
      : Promise.resolve(emptyExtraction())

    const [ocrResult, aiResult] = await Promise.all([ocrPromise, aiPromise])

    let extraction: RunningScreenshotExtraction
    if (
      aiResult.extraction_method === 'ai' &&
      aiResult.confidence >= AI_CONFIDENCE_THRESHOLD &&
      hasUsableExtraction(aiResult)
    ) {
      extraction = mergeExtractions(aiResult, ocrResult)
    } else if (hasUsableExtraction(ocrResult)) {
      extraction = mergeExtractions(ocrResult, aiResult)
    } else if (hasUsableExtraction(aiResult)) {
      extraction = aiResult
    } else {
      extraction = mergeExtractions(ocrResult, aiResult)
      extraction.extraction_method = 'none'
    }

    return {
      ok: true,
      extraction,
      image_meta: meta,
      image_hash,
    }
  } catch (error) {
    console.error('[analyze-running-screenshot]', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : '이미지 분석에 실패했습니다.',
    }
  }
}
