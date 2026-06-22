import 'server-only'

import { getOpenAiApiKey, getOpenAiVisionModel } from '@/lib/running-league/openai-config'
import { hasMinimumScreenshotExtraction } from '@/lib/running-league/screenshot-analysis-ui'
import { mapOpenAiJsonToRaw } from '@/lib/running-analysis/normalize'
import { buildExtractionFromRaw } from '@/lib/running-league/screenshot-extraction'
import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'
import { OpenAiApiError, isOpenAiApiError, sleep } from '@/lib/running-analysis/openai-errors'

const EXTRACTION_PROMPT = `You extract running workout stats from mobile app screenshots (Samsung Health, Garmin, Strava, Nike, Apple Fitness, etc).
Return ONLY valid JSON. No markdown. No explanation. Use this exact shape:
{
  "success": true,
  "distance_km": 13.5,
  "duration": "1:00:27",
  "pace": "4:29",
  "avg_heart_rate": 154,
  "calories": 714,
  "date": "2026-06-22",
  "activity_time": "11:05",
  "confidence": 0.9,
  "missing_fields": []
}

Rules:
- success is true when distance_km and duration are readable
- distance_km is total run distance in kilometers (number)
- duration is total elapsed time (h:mm:ss or mm:ss)
- pace is min/km without "/km" suffix (e.g. "4:29") — optional
- date is YYYY-MM-DD when possible
- activity_time is HH:mm 24h — optional
- avg_heart_rate and calories are optional numbers
- missing_fields lists field names you could not read
- Read Korean labels: 거리, km, 페이스, 시간, 칼로리, bpm
- If unsure about an optional field, use null and add its name to missing_fields
- Do not guess distance or duration`

type OpenAiVisionDetail = 'high' | 'auto' | 'low'

const MAX_RATE_LIMIT_RETRIES = 2

async function callOpenAiVision(
  buffer: Buffer,
  mimeType: string,
  detail: OpenAiVisionDetail,
): Promise<RunningScreenshotExtraction | null> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) return null

  const model = getOpenAiVisionModel()
  const imageBase64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`

  let lastError: OpenAiApiError | null = null

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000)
      console.info('[running-analysis/openai] rate limit retry', {
        attempt,
        delay_ms: delayMs,
        OPENAI_API_KEY_exists: true,
      })
      await sleep(delayMs)
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl, detail } },
            ],
          },
        ],
      }),
    })

    console.log('ai_status', response.status)

    if (!response.ok) {
      const detailText = await response.text()
      console.log('ai_raw_text_preview', detailText.slice(0, 300))
      console.error('[running-analysis/openai] API error', {
        OPENAI_API_KEY_exists: true,
        status: response.status,
        detail,
        attempt,
        body_preview: detailText.slice(0, 300),
      })

      const apiError = new OpenAiApiError(response.status)
      lastError = apiError

      if (apiError.retryable && attempt < MAX_RATE_LIMIT_RETRIES) {
        continue
      }

      throw apiError
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = payload.choices?.[0]?.message?.content
    console.log('ai_raw_text_preview', content?.slice(0, 300) ?? null)

    if (!content) return null

    try {
      const json = JSON.parse(content) as Record<string, unknown>
      console.log('parsed_result', json)
      const raw = mapOpenAiJsonToRaw(json)
      return buildExtractionFromRaw(raw, 'ai', { raw_json: json })
    } catch (error) {
      console.error('[running-analysis/openai] JSON parse failed', {
        OPENAI_API_KEY_exists: true,
        error: error instanceof Error ? error.message : String(error),
        content_preview: content.slice(0, 200),
      })
      console.error('ai_error_message', error instanceof Error ? error.message : String(error))
      console.error('ai_error_stack', error instanceof Error ? error.stack : 'no_stack')
      throw new Error('OpenAI JSON parse failed')
    }
  }

  if (lastError) {
    throw lastError
  }

  return null
}

function isUsableAiExtraction(result: RunningScreenshotExtraction | null): result is RunningScreenshotExtraction {
  return result != null && hasMinimumScreenshotExtraction(result)
}

export type OpenAiAnalysisResult =
  | { ok: true; extraction: RunningScreenshotExtraction }
  | { ok: false; httpStatus: number | null; reason: 'openai_429' | 'openai_401' | 'parse_failed' | 'empty' | 'unknown' }

export async function analyzeRunningScreenshotWithOpenAi(
  buffer: Buffer,
  mimeType: string,
  options?: { detail?: OpenAiVisionDetail; retryWithLowDetail?: boolean },
): Promise<OpenAiAnalysisResult> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    console.warn('[running-analysis/openai] OPENAI_API_KEY가 설정되지 않았습니다', {
      openai_configured: false,
    })
    return { ok: false, httpStatus: null, reason: 'empty' }
  }

  const model = getOpenAiVisionModel()
  const detail = options?.detail ?? 'high'

  console.info('[running-analysis/openai] calling OpenAI Vision', {
    OPENAI_API_KEY_exists: true,
    model,
    image_bytes: buffer.length,
    mime_type: mimeType || 'image/jpeg',
    detail,
  })
  console.log('ai_processing_start', Date.now())

  const runDetail = async (visionDetail: OpenAiVisionDetail) => {
    try {
      const result = await callOpenAiVision(buffer, mimeType, visionDetail)
      if (isUsableAiExtraction(result)) {
        console.info('[running-analysis/openai] success', {
          openai_configured: true,
          detail: visionDetail,
          distance_km: result.distance_km,
          duration: result.duration,
          pace: result.pace,
          activity_date: result.activity_date,
          analysis_success: result.analysis_success,
        })
        return { ok: true as const, extraction: result }
      }
      return { ok: false as const, httpStatus: null, reason: 'empty' as const }
    } catch (error) {
      console.error('[running-analysis/openai] call failed', {
        openai_configured: true,
        detail: visionDetail,
        error: error instanceof Error ? error.message : String(error),
      })
      console.error('ai_error_message', error instanceof Error ? error.message : String(error))
      console.error('ai_error_stack', error instanceof Error ? error.stack : 'no_stack')

      if (isOpenAiApiError(error)) {
        if (error.status === 429) {
          return { ok: false as const, httpStatus: 429, reason: 'openai_429' as const }
        }
        if (error.status === 401) {
          return { ok: false as const, httpStatus: 401, reason: 'openai_401' as const }
        }
        return { ok: false as const, httpStatus: error.status, reason: 'unknown' as const }
      }

      if (error instanceof Error && error.message.includes('JSON parse failed')) {
        return { ok: false as const, httpStatus: null, reason: 'parse_failed' as const }
      }

      return { ok: false as const, httpStatus: null, reason: 'unknown' as const }
    }
  }

  const primary = await runDetail(detail)
  if (primary.ok) return primary

  if (
    options?.retryWithLowDetail &&
    detail !== 'low' &&
    primary.reason !== 'openai_429' &&
    primary.reason !== 'openai_401'
  ) {
    console.info('[running-analysis/openai] retrying with low detail')
    const retry = await runDetail('low')
    if (retry.ok) return retry
    if (retry.reason === 'openai_429' || retry.reason === 'openai_401') {
      return retry
    }
  }

  return primary
}
