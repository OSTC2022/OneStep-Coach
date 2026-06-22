import 'server-only'

import {
  countRequiredExtractionFields,
  enrichExtractionWithAnalysis,
} from '@/lib/running-league/screenshot-analysis-status'
import { hasMinimumScreenshotExtraction } from '@/lib/running-league/screenshot-analysis-ui'
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
  prepareScreenshotForOpenAi,
} from '@/lib/running-league/screenshot-image-server'
import { extractRunningMetricsWithOcr } from '@/lib/running-league/screenshot-ocr-server'
import { getOpenAiApiKey, isOpenAiConfigured } from '@/lib/running-league/openai-config'
import { getScreenshotRuntimeProfile } from '@/lib/running-league/screenshot-runtime'
import {
  buildScreenshotApiErrorBody,
  type ScreenshotFailureReason,
} from '@/lib/running-league/screenshot-analysis-errors'

function resolveDiagnosticsFailureReason(
  diagnostics: RunningScreenshotAnalysisDiagnostics,
  requiredFieldCount: number,
  openaiConfigured: boolean,
  isVercel: boolean,
): ScreenshotFailureReason | null {
  if (requiredFieldCount >= 2) return null

  if (!openaiConfigured && isVercel) {
    return 'missing_openai_key'
  }
  if (diagnostics.ai_status === 'timeout') {
    return 'ai_timeout'
  }
  if (diagnostics.ai_status === 'failed') {
    if (diagnostics.openai_http_status === 429) {
      return 'openai_429'
    }
    if (diagnostics.openai_http_status === 401) {
      return 'openai_401'
    }
    if (diagnostics.failure_detail === 'parse_failed') {
      return 'parse_failed'
    }
    return 'ai_request_failed'
  }
  if (diagnostics.ai_status === 'empty' && openaiConfigured) {
    return 'extraction_empty'
  }
  if (!openaiConfigured) {
    return 'missing_openai_key'
  }
  return 'extraction_empty'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) {
    return Promise.reject(new Error(`${label} disabled`))
  }
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
  const runtime = getScreenshotRuntimeProfile()
  const openaiConfigured = isOpenAiConfigured()
  const diagnostics: RunningScreenshotAnalysisDiagnostics = {
    openai_configured: openaiConfigured,
    ai_status: 'skipped',
    ocr_status: 'skipped',
    field_count: 0,
    runtime: runtime.isVercel ? 'vercel' : 'local',
    vercel_env: runtime.vercelEnv,
    ocr_supported: runtime.ocrSupported,
  }

  try {
    const image_hash = hashScreenshotBuffer(originalBuffer)
    const { buffer: aiBuffer, meta } = await prepareScreenshotForOpenAi(originalBuffer, mimeType)

    if (options?.logMeta) {
      console.info('[running-analysis] start', {
        file_name: options.fileName ?? null,
        runtime: diagnostics.runtime,
        vercel_env: runtime.vercelEnv,
        ocr_supported: runtime.ocrSupported,
        openai_configured: openaiConfigured,
        ai_timeout_ms: runtime.aiTimeoutMs,
        original_size: meta.original_size,
        ai_image_bytes: aiBuffer.length,
        width: meta.width,
        height: meta.height,
        resized_width: meta.resized_width,
        resized_height: meta.resized_height,
      })
    }

    let aiResult = emptyExtraction()
    let aiHardFailure: ScreenshotFailureReason | null = null
    const hasKey = Boolean(getOpenAiApiKey({ logIfMissing: true }))

    if (hasKey) {
      try {
        const aiResponse = await withTimeout(
          analyzeRunningScreenshotWithOpenAi(aiBuffer, 'image/jpeg', {
            detail: runtime.openAiDetail,
            retryWithLowDetail: runtime.isVercel,
          }),
          runtime.aiTimeoutMs,
          'AI',
        )

        if (aiResponse.ok) {
          aiResult = aiResponse.extraction
          diagnostics.ai_status = 'success'
        } else if (aiResponse.reason === 'openai_429' || aiResponse.reason === 'openai_401') {
          diagnostics.ai_status = 'failed'
          diagnostics.openai_http_status = aiResponse.httpStatus
          diagnostics.failure_reason = aiResponse.reason
          aiHardFailure = aiResponse.reason
          console.warn('[running-analysis] OpenAI HTTP error', {
            file_name: options?.fileName ?? null,
            OPENAI_API_KEY_exists: true,
            runtime: diagnostics.runtime,
            http_status: aiResponse.httpStatus,
            reason: aiResponse.reason,
          })
        } else if (aiResponse.reason === 'parse_failed') {
          diagnostics.ai_status = 'failed'
          diagnostics.failure_detail = 'parse_failed'
          console.warn('[running-analysis] OpenAI parse failed', {
            file_name: options?.fileName ?? null,
            OPENAI_API_KEY_exists: true,
            runtime: diagnostics.runtime,
          })
        } else {
          diagnostics.ai_status = 'empty'
          console.warn('[running-analysis] OpenAI returned no usable core fields', {
            file_name: options?.fileName ?? null,
            openai_configured: true,
            runtime: diagnostics.runtime,
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('timeout')) {
          diagnostics.ai_status = 'timeout'
        } else if (message.includes('JSON parse failed')) {
          diagnostics.ai_status = 'failed'
          diagnostics.failure_detail = 'parse_failed'
        } else {
          diagnostics.ai_status = 'failed'
        }
        console.warn('[running-analysis] OpenAI failed', {
          file_name: options?.fileName ?? null,
          OPENAI_API_KEY_exists: true,
          runtime: diagnostics.runtime,
          status: diagnostics.ai_status,
          error: message,
        })
      }
    } else if (runtime.isVercel) {
      console.error('[running-analysis] Vercel에서 OPENAI_API_KEY가 없으면 스크린샷 인식 불가 (OCR 미지원)', {
        file_name: options?.fileName ?? null,
      })
    }

    let ocrResult = emptyExtraction()
    const shouldRunOcr =
      runtime.ocrSupported &&
      (!hasKey ||
        !hasMinimumScreenshotExtraction(aiResult) ||
        countExtractedFields(aiResult) < 3)

    if (shouldRunOcr) {
      try {
        const { buffer: ocrBuffer } = await prepareScreenshotForAnalysis(originalBuffer, mimeType)
        ocrResult = await withTimeout(
          extractRunningMetricsWithOcr(ocrBuffer),
          runtime.ocrTimeoutMs,
          'OCR',
        )
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
    } else if (runtime.isVercel) {
      diagnostics.ocr_status = 'skipped'
    }

    const extraction = enrichExtractionWithAnalysis(resolveExtraction(aiResult, ocrResult))
    diagnostics.field_count = countExtractedFields(extraction)
    const coreFieldCount = countRequiredExtractionFields(extraction)
    diagnostics.failure_reason =
      aiHardFailure ??
      resolveDiagnosticsFailureReason(
        diagnostics,
        coreFieldCount,
        openaiConfigured,
        runtime.isVercel,
      )

    if (aiHardFailure && !hasMinimumScreenshotExtraction(extraction)) {
      const errorBody = buildScreenshotApiErrorBody({
        reason: aiHardFailure,
        diagnostics,
      })
      return errorBody
    }

    if (options?.logMeta) {
      console.info('[running-analysis] parsed extraction', {
        file_name: options.fileName ?? null,
        distance_km: extraction.distance_km,
        duration: extraction.duration,
        pace: extraction.pace,
        activity_date: extraction.activity_date,
        activity_time: extraction.activity_time,
        heart_rate: extraction.heart_rate,
        calories: extraction.calories,
        raw_json: extraction.raw_json ?? null,
        failure_reason: diagnostics.failure_reason,
      })
    }
    if (options?.logMeta) {
      console.info('[running-analysis] done', {
        file_name: options.fileName ?? null,
        runtime: diagnostics.runtime,
        vercel_env: runtime.vercelEnv,
        openai_configured: openaiConfigured,
        ai_status: diagnostics.ai_status,
        ocr_status: diagnostics.ocr_status,
        field_count: diagnostics.field_count,
        core_field_count: countRequiredExtractionFields(extraction),
        analysis_status: extraction.analysis_status,
        analysis_reason: extraction.analysis_reason,
        distance_km: extraction.distance_km,
        duration: extraction.duration,
        pace: extraction.pace,
      })
    }

    return {
      ok: true,
      success: true,
      extraction,
      image_meta: meta,
      image_hash,
      diagnostics,
    }
  } catch (error) {
    console.error('[running-analysis] fatal error', {
      openai_configured: openaiConfigured,
      runtime: diagnostics.runtime,
      error: error instanceof Error ? error.message : String(error),
    })
    return buildScreenshotApiErrorBody({
      reason: 'unknown',
      diagnostics,
    })
  }
}
