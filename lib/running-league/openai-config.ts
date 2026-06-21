import 'server-only'

export function getOpenAiApiKey(options?: { logIfMissing?: boolean }): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ''
  if (!apiKey) {
    if (options?.logIfMissing) {
      console.warn('[openai-config] OPENAI_API_KEY가 설정되지 않았습니다')
    }
    return null
  }
  return apiKey
}

export function getOpenAiVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey() != null
}
