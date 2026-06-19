export const CALENDAR_FETCH_TIMEOUT_MS = 15000

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
  payload?: CalendarFetchLogPayload,
) {
  if (process.env.NODE_ENV !== 'development') return
  if (phase === 'success') {
    console.log('[calendar] fetch success', payload?.length ?? payload)
    return
  }
  if (phase === 'error') {
    console.log('[calendar] fetch error', payload)
    return
  }
  console.log(`[calendar] fetch ${phase}`, payload ?? '')
}
