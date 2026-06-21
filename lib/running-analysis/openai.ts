import 'server-only'

import { getOpenAiApiKey, getOpenAiVisionModel } from '@/lib/running-league/openai-config'
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

export async function analyzeRunningScreenshotWithOpenAi(
  buffer: Buffer,
  mimeType: string,
): Promise<RunningScreenshotExtraction | null> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    console.warn('[running-analysis/openai] OPENAI_API_KEY가 설정되지 않았습니다', {
      openai_configured: false,
    })
    return null
  }

  const model = getOpenAiVisionModel()
  const imageBase64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`

  console.info('[running-analysis/openai] calling OpenAI Vision', {
    openai_configured: true,
    model,
    image_bytes: buffer.length,
    mime_type: mimeType || 'image/jpeg',
  })

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
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
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    })
  } catch (error) {
    console.error('[running-analysis/openai] network error', {
      openai_configured: true,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('[running-analysis/openai] API error', {
      openai_configured: true,
      status: response.status,
      body_preview: detail.slice(0, 300),
    })
    return null
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    console.warn('[running-analysis/openai] empty response content', { openai_configured: true })
    return null
  }

  try {
    const json = JSON.parse(content) as Record<string, unknown>
    const raw = mapOpenAiJsonToRaw(json)
    const result = buildExtractionFromRaw(raw, 'ai', { raw_json: json })

    console.info('[running-analysis/openai] success', {
      openai_configured: true,
      distance_km: result.distance_km,
      duration: result.duration,
      pace: result.pace,
      activity_date: result.activity_date,
      confidence: result.confidence,
      partial_failure: result.partial_failure,
    })

    return result
  } catch (error) {
    console.error('[running-analysis/openai] JSON parse failed', {
      openai_configured: true,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
