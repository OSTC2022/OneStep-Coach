export class OpenAiApiError extends Error {
  readonly status: number
  readonly retryable: boolean

  constructor(status: number, message?: string) {
    super(message ?? `OpenAI API HTTP ${status}`)
    this.name = 'OpenAiApiError'
    this.status = status
    this.retryable = status === 429 || status === 503
  }
}

export function isOpenAiApiError(error: unknown): error is OpenAiApiError {
  return error instanceof OpenAiApiError
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
