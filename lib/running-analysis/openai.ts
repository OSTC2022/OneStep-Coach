import 'server-only'

import { getOpenAiApiKey, getOpenAiVisionModel } from '@/lib/running-league/openai-config'
import { countCoreExtractionFields } from '@/lib/running-league/screenshot-analysis-status'
import { mapOpenAiJsonToRaw } from '@/lib/running-analysis/normalize'
import { buildExtractionFromRaw } from '@/lib/running-league/screenshot-extraction'
import type { RunningScreenshotExtraction } from '@/lib/running-league/screenshot-extraction'

const EXTRACTION_PROMPT = `You extract running workout stats from mobile app screenshots (Samsung Health, Garmin, Strava, Nike, Apple Fitness, etc).
Return ONLY valid JSON in this exact shape:
{
  "distanceKm": 13.5,
  "duration": "1:00:27",
  "averagePace": "4:29",
  "date": "2026-06-20",
  "calories": 714,
  "confidence": 0.9,
  "needsReview": false
}

Rules:
- distanceKm is total run distance in kilometers (number, e.g. 13.5 for "13.50 km")
- duration is total elapsed time (h:mm:ss or mm:ss)
- averagePace is min/km without "/km" suffix (e.g. "4:29")
- date is YYYY-MM-DD
- Read Korean labels: 거리, km, 페이스, 시간, 칼로리, bpm
- If unsure about a field, use null
- Do not guess`

type OpenAiVisionDetail = 'high' | 'auto' | 'low'

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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
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

  if (!response.ok) {
    const detailText = await response.text()
    console.error('[running-analysis/openai] API error', {
      OPENAI_API_KEY_exists: true,
      status: response.status,
      detail,
      body_preview: detailText.slice(0, 300),
    })
    throw new Error(`OpenAI API HTTP ${response.status}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const json = JSON.parse(content) as Record<string, unknown>
    const raw = mapOpenAiJsonToRaw(json)
    return buildExtractionFromRaw(raw, 'ai', { raw_json: json })
  } catch (error) {
    console.error('[running-analysis/openai] JSON parse failed', {
      OPENAI_API_KEY_exists: true,
      error: error instanceof Error ? error.message : String(error),
      content_preview: content.slice(0, 200),
    })
    throw new Error('OpenAI JSON parse failed')
  }
}

function isUsableAiExtraction(result: RunningScreenshotExtraction | null): result is RunningScreenshotExtraction {
  return result != null && countCoreExtractionFields(result) >= 1
}

export async function analyzeRunningScreenshotWithOpenAi(
  buffer: Buffer,
  mimeType: string,
  options?: { detail?: OpenAiVisionDetail; retryWithLowDetail?: boolean },
): Promise<RunningScreenshotExtraction | null> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    console.warn('[running-analysis/openai] OPENAI_API_KEY가 설정되지 않았습니다', {
      openai_configured: false,
    })
    return null
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

  try {
    const result = await callOpenAiVision(buffer, mimeType, detail)
    if (isUsableAiExtraction(result)) {
      console.info('[running-analysis/openai] success', {
        openai_configured: true,
        detail,
        distance_km: result.distance_km,
        duration: result.duration,
        pace: result.pace,
        activity_date: result.activity_date,
        core_fields: countCoreExtractionFields(result),
      })
      return result
    }
  } catch (error) {
    console.error('[running-analysis/openai] call failed', {
      openai_configured: true,
      detail,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (options?.retryWithLowDetail && detail !== 'low') {
    console.info('[running-analysis/openai] retrying with low detail')
    try {
      const retry = await callOpenAiVision(buffer, mimeType, 'low')
      if (isUsableAiExtraction(retry)) return retry
    } catch (error) {
      console.error('[running-analysis/openai] retry failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return null
}
