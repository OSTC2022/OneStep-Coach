import type { AnalyzeRunningScreenshotResponse } from '@/lib/running-league/screenshot-extraction'
import { isOpenAiScreenshotFallbackEnabled } from '@/lib/running-league/screenshot-analysis-config'
import { extractRunningMetricsWithClientOcr } from '@/lib/running-league/screenshot-ocr-client'
import { hashScreenshotFile } from '@/lib/running-league/screenshot-hash-client'
import {
  hasMinimumScreenshotExtraction,
  resolveScreenshotAnalysisUi,
} from '@/lib/running-league/screenshot-analysis-ui'
import { screenshotApiErrorMessage, type ScreenshotFailureReason } from '@/lib/running-league/screenshot-analysis-errors'
import { analyzeRunningScreenshotViaApi } from '@/lib/running-league/analyze-running-screenshot-openai-fallback'

export async function analyzeRunningScreenshotFile(
  file: File,
): Promise<AnalyzeRunningScreenshotResponse> {
  console.info('[analyze-running-screenshot-client] file selected', {
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
    ocr_mode: 'client',
    openai_fallback: isOpenAiScreenshotFallbackEnabled(),
  })

  try {
    const ocrResult = await extractRunningMetricsWithClientOcr(file)
    const imageHash = await hashScreenshotFile(file)

    const { extraction, rawText, ocrStatus, width, height } = ocrResult
    const fieldCount = [
      extraction.distance_km,
      extraction.duration,
      extraction.pace,
      extraction.heart_rate,
      extraction.calories,
      extraction.activity_date,
      extraction.activity_time,
    ].filter((value) => value != null && value !== '').length

    const diagnostics = {
      openai_configured: false,
      ai_status: 'skipped' as const,
      ocr_status: ocrStatus,
      field_count: fieldCount,
      runtime: 'client' as const,
      ocr_supported: true,
      failure_reason: null as ScreenshotFailureReason | null,
    }

    if (hasMinimumScreenshotExtraction(extraction)) {
      const ui = resolveScreenshotAnalysisUi(extraction)
      console.info('[analyze-running-screenshot-client] client OCR success', {
        ui_status: ui.status,
        ui_message: ui.message,
        distance_km: extraction.distance_km,
        duration: extraction.duration,
        pace: extraction.pace,
        activity_date: extraction.activity_date,
        ocr_text_length: rawText.length,
      })

      return {
        ok: true,
        success: true,
        extraction,
        image_hash: imageHash,
        image_meta: {
          original_size: file.size,
          mime_type: file.type || 'image/jpeg',
          width,
          height,
          resized_width: width,
          resized_height: height,
          file_name: file.name,
        },
        diagnostics,
      }
    }

    if (isOpenAiScreenshotFallbackEnabled()) {
      console.info('[analyze-running-screenshot-client] client OCR empty — trying OpenAI fallback')
      return analyzeRunningScreenshotViaApi(file)
    }

    console.warn('[analyze-running-screenshot-client] client OCR found no usable fields', {
      ocr_status: ocrStatus,
      field_count: fieldCount,
    })

    return {
      ok: true,
      success: true,
      extraction,
      image_hash: imageHash,
      image_meta: {
        original_size: file.size,
        mime_type: file.type || 'image/jpeg',
        width,
        height,
        resized_width: width,
        resized_height: height,
        file_name: file.name,
      },
      diagnostics: {
        ...diagnostics,
        failure_reason: 'extraction_empty',
      },
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : screenshotApiErrorMessage('UNKNOWN_ERROR')

    if (isOpenAiScreenshotFallbackEnabled()) {
      console.warn('[analyze-running-screenshot-client] client OCR failed — trying OpenAI fallback', {
        error: message,
      })
      return analyzeRunningScreenshotViaApi(file)
    }

    return {
      ok: false,
      success: false,
      error: message,
      message:
        message === 'SCREENSHOT_ANALYSIS_TIMEOUT'
          ? '사진 분석이 지연되고 있어요. 아래에서 직접 입력해 주세요.'
          : message,
      errorCode: message === 'SCREENSHOT_ANALYSIS_TIMEOUT' ? 'TIMEOUT' : 'UNKNOWN_ERROR',
      error_code: message === 'SCREENSHOT_ANALYSIS_TIMEOUT' ? 'timeout' : 'unknown',
      manualInputRequired: true,
    }
  }
}
