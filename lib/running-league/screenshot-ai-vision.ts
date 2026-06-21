import 'server-only'

import {
  buildExtractionFromRaw,
  type RunningScreenshotExtractionRaw,
} from '@/lib/running-league/screenshot-extraction'
import { getOpenAiApiKey, getOpenAiVisionModel } from '@/lib/running-league/openai-config'

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

  const visionModel = getOpenAiVisionModel()
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64}`

  console.info('[screenshot-ai-vision] calling OpenAI Vision', {
    model: visionModel,
    image_bytes: buffer.length,
    mime_type: mimeType || 'image/jpeg',
    openai_configured: true,
  })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: visionModel,
      temperature: 0,
      max_tokens: 350,
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

  if (!response.ok) {
    const detail = await response.text()
    console.error('[screenshot-ai-vision] OpenAI error', {
      status: response.status,
      body_preview: detail.slice(0, 300),
      openai_configured: true,
    })
    return null
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    console.warn('[screenshot-ai-vision] OpenAI returned empty content', {
      openai_configured: true,
    })
    return null
  }

  try {
    const parsed = JSON.parse(content) as RunningScreenshotExtractionRaw
    console.info('[screenshot-ai-vision] OpenAI parsed response', {
      openai_configured: true,
      has_distance: parsed.distance_km != null,
      has_duration: Boolean(parsed.duration),
      has_pace: Boolean(parsed.pace),
      confidence: parsed.confidence ?? null,
    })
    return {
      ...parsed,
      confidence: Number(parsed.confidence ?? 0.85),
    }
  } catch (error) {
    console.error('[screenshot-ai-vision] JSON parse failed', {
      openai_configured: true,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function buildAiExtraction(raw: RunningScreenshotExtractionRaw, rawJson: Record<string, unknown>) {
  return buildExtractionFromRaw(raw, 'ai', { raw_json: rawJson })
}
