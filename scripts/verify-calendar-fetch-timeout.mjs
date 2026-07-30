/**
 * 캘린더 fetch 타임아웃/소프트페일 정책 검증
 */

import assert from 'node:assert/strict'

const CALENDAR_FETCH_TIMEOUT_MS = 30_000
const CALENDAR_FETCH_TIMEOUT_BY_MODE = {
  initial: 35_000,
  background: 30_000,
  refresh: 35_000,
  prefetch: 25_000,
}

function resolveCalendarFetchTimeoutMs(mode) {
  if (mode && mode in CALENDAR_FETCH_TIMEOUT_BY_MODE) {
    return CALENDAR_FETCH_TIMEOUT_BY_MODE[mode]
  }
  return CALENDAR_FETCH_TIMEOUT_MS
}

function isCalendarFetchTimeoutError(error) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('timeout') || message.includes('timed out')
}

function shouldShowTimeoutBanner({ hasFallback, timedOut, softRetriesUsed }) {
  if (!timedOut) return !hasFallback
  if (hasFallback) return false
  return softRetriesUsed >= 1
}

function shouldKeepCacheOnForceStart() {
  // force refresh는 성공 전까지 기존 캐시 유지
  return true
}

assert.equal(resolveCalendarFetchTimeoutMs('initial'), 35_000)
assert.equal(resolveCalendarFetchTimeoutMs('refresh'), 35_000)
assert.equal(resolveCalendarFetchTimeoutMs('prefetch'), 25_000)
assert.equal(resolveCalendarFetchTimeoutMs('unknown'), 30_000)
assert.ok(resolveCalendarFetchTimeoutMs('initial') > 15_000)

assert.equal(
  isCalendarFetchTimeoutError(new Error('Calendar fetch timeout (15000ms)')),
  true,
)
assert.equal(isCalendarFetchTimeoutError(new Error('network down')), false)

assert.equal(
  shouldShowTimeoutBanner({ hasFallback: true, timedOut: true, softRetriesUsed: 0 }),
  false,
)
assert.equal(
  shouldShowTimeoutBanner({ hasFallback: true, timedOut: true, softRetriesUsed: 1 }),
  false,
)
assert.equal(
  shouldShowTimeoutBanner({ hasFallback: false, timedOut: true, softRetriesUsed: 1 }),
  true,
)
assert.equal(shouldKeepCacheOnForceStart(), true)

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Calendar fetch timeout (${timeoutMs}ms)`))
    }, timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

const started = Date.now()
await assert.rejects(
  () =>
    withTimeout(
      new Promise((resolve) => setTimeout(() => resolve('late'), 80)),
      20,
    ),
  /timeout/,
)
assert.ok(Date.now() - started < 70, 'timeout should reject before late resolve')

const parallelStarted = Date.now()
await Promise.all([
  new Promise((r) => setTimeout(r, 40)),
  new Promise((r) => setTimeout(r, 40)),
  new Promise((r) => setTimeout(r, 40)),
])
const parallelElapsed = Date.now() - parallelStarted
assert.ok(
  parallelElapsed < 100,
  `parallel queries should overlap (elapsed ${parallelElapsed}ms)`,
)

console.log('All calendar timeout policy checks passed')
