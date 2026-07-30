export const CALENDAR_FETCH_TIMEOUT_MS = 30_000

/** 모드별 타임아웃 — 월간·반복 확장 조회가 15초를 자주 넘김 */
export const CALENDAR_FETCH_TIMEOUT_BY_MODE = {
  initial: 35_000,
  background: 30_000,
  refresh: 35_000,
  prefetch: 25_000,
} as const

export type CalendarFetchTimeoutMode = keyof typeof CALENDAR_FETCH_TIMEOUT_BY_MODE

export function resolveCalendarFetchTimeoutMs(
  mode?: CalendarFetchTimeoutMode | string | null,
): number {
  if (mode && mode in CALENDAR_FETCH_TIMEOUT_BY_MODE) {
    return CALENDAR_FETCH_TIMEOUT_BY_MODE[mode as CalendarFetchTimeoutMode]
  }
  return CALENDAR_FETCH_TIMEOUT_MS
}

export function isCalendarFetchTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('timeout') || message.includes('timed out')
}

export function withCalendarFetchTimeout<T>(
  promise: Promise<T>,
  timeoutMs = CALENDAR_FETCH_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Calendar fetch timeout (${timeoutMs}ms)`))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

type CalendarFetchLogPayload = Record<string, unknown>

export function logCalendarFetch(
  phase: 'start' | 'success' | 'error' | 'end',
  payload?: CalendarFetchLogPayload | number,
) {
  if (process.env.NODE_ENV !== 'development') return
  if (phase === 'success') {
    console.log(
      '[calendar] fetch success',
      typeof payload === 'number' ? payload : payload?.length ?? payload,
    )
    return
  }
  if (phase === 'error') {
    console.log('[calendar] fetch error', payload)
    return
  }
  console.log(`[calendar] fetch ${phase}`, payload ?? '')
}
