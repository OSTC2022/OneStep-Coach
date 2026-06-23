/**
 * Garmin Connect 거리 파싱 검증
 * 실행: node scripts/verify-garmin-distance-extraction.mjs
 */
import assert from 'node:assert/strict'
const GARMIN_OCR_TEXT = `6월 20일 @ 오전 11:05
13.50 km
거리
154 bpm
평균 심박수
4:29 /km
평균 페이스
1:00:27
총 시간
714
총 칼로리`

function extractGarminDistance(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (!/거리/i.test(lines[i])) continue
    const above = lines.slice(Math.max(0, i - 3), i).join(' ')
    const m = above.match(/(\d{1,2}[.,]\d{1,2})\s*(?:km|KM)?/i)
    if (m) return Number(m[1])
  }
  return null
}

const km = extractGarminDistance(GARMIN_OCR_TEXT)
assert.equal(km, 13.5)
console.log('[verify-garmin-distance-extraction] OK', { distance_km: km })
