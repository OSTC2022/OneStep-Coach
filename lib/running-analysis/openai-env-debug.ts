import 'server-only'

import { getOpenAiVisionModel } from '@/lib/running-league/openai-config'

/** TEMPORARY DEBUG — remove after verifying OPENAI_API_KEY on Vercel */
export type OpenAiEnvDebugPayload = {
  hasOpenAIKey: boolean
  keyLength: number
  vercelEnv: string | null
  nodeEnv: string
  visionModel: string
  debugEnabled: boolean
}

/**
 * TEMPORARY DEBUG — safe OpenAI env snapshot (never exposes the key value).
 * Delete `lib/running-analysis/openai-env-debug.ts` after verification.
 */
export function getOpenAiEnvDebugPayload(): OpenAiEnvDebugPayload {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ''

  return {
    hasOpenAIKey: apiKey.length > 0,
    keyLength: apiKey.length,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    visionModel: getOpenAiVisionModel(),
    debugEnabled: process.env.ENABLE_OPENAI_ENV_DEBUG === 'true',
  }
}
