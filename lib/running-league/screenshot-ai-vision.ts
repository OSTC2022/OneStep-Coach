import 'server-only'

import {
  buildExtractionFromRaw,
  type RunningScreenshotExtractionRaw,
} from '@/lib/running-league/screenshot-extraction'
import { getOpenAiApiKey, getOpenAiVisionModel } from '@/lib/running-league/openai-config'

const VISION_MODEL = getOpenAiVisionModel()

const EXTRACTION_PROMPT = `You extract running workout stats from mobile app screenshots.
Return ONLY valid JSON with these keys:
distance_km (number),
duration (string like 1:00:27 or 45:12),
pace (string like 4:29 without /km),
heart_rate (integer),
calories (integer),
activity_date (YYYY-MM-DD),
activity_time (HH:mm 24h),
activity_type (running),
source_app (app name in English),
confidence (0 to 1 number).

Rules:
- Read the main total distance in km, not lap distance.
- Use Korean or English labels (거리, km, pace, 페이스, bpm, kcal, 시간).
- If unsure, set that field to null instead of guessing.
- Prefer Samsung Health, Garmin, Strava, Nike Run Club, Apple Fitness, 런데이 layouts.`

export async function extractRunningMetricsWithAi(
  buffer: Buffer,
  mimeType: string,
): Promise<RunningScreenshotExtractionRaw | null> {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) return null

  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 350,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error('[screenshot-ai-vision] OpenAI error', response.status, detail.slice(0, 300))
    return null
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) return null

  try {
    const parsed = JSON.parse(content) as RunningScreenshotExtractionRaw
    return {
      ...parsed,
      confidence: Number(parsed.confidence ?? 0.85),
    }
  } catch (error) {
    console.error('[screenshot-ai-vision] JSON parse failed', error)
    return null
  }
}

export function buildAiExtraction(raw: RunningScreenshotExtractionRaw, rawJson: Record<string, unknown>) {
  return buildExtractionFromRaw(raw, 'ai', { raw_json: rawJson })
}
