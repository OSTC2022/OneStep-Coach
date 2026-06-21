/**
 * ONE STEP RUNNING LEAGUE 점수 계산 검증
 * 실행: node scripts/verify-running-league-scoring.mjs
 *
 * lib/running-league/scoring.ts 와 동일 공식을 JS로 재현해 검증합니다.
 */

const SCORE_WEIGHTS = { attendance: 0.3, goal: 0.25, record: 0.2, mileage: 0.15, recovery: 0.1 }
const MILEAGE_CAP_KM = 80

function clamp(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function computeTotal(scores) {
  const total =
    clamp(scores.attendance) * SCORE_WEIGHTS.attendance +
    clamp(scores.goal) * SCORE_WEIGHTS.goal +
    clamp(scores.record) * SCORE_WEIGHTS.record +
    clamp(scores.mileage) * SCORE_WEIGHTS.mileage +
    clamp(scores.recovery) * SCORE_WEIGHTS.recovery
  return Math.round(clamp(total) * 10) / 10
}

function mileageScoreFromKm(km) {
  const capped = Math.min(Math.max(0, km), MILEAGE_CAP_KM)
  const tiers = [
    { km: 20, score: 40 },
    { km: 40, score: 60 },
    { km: 60, score: 80 },
    { km: 80, score: 100 },
  ]
  if (capped <= 0) return 0
  if (capped >= 80) return 100
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    if (capped <= tier.km) {
      const prev = tiers[i - 1]
      if (!prev) return Math.round((capped / tier.km) * tier.score)
      const ratio = (capped - prev.km) / (tier.km - prev.km)
      return Math.round(prev.score + ratio * (tier.score - prev.score))
    }
  }
  return 100
}

function goalScore(rate) {
  const r = clamp(rate)
  if (r >= 100) return 100
  if (r >= 80) return 80
  if (r >= 60) return 60
  if (r >= 40) return 40
  if (r > 0) return 20
  return 0
}

function parseTime(text) {
  const cleaned = text.replace(/^(1km|3km|5km|10km)\s*/i, '')
  const parts = cleaned.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function recordScore(baseline, current) {
  const base = parseTime(baseline)
  const cur = parseTime(current)
  if (!base || !cur || cur >= base) return 0
  const rate = ((base - cur) / base) * 100
  if (rate >= 10) return 100
  if (rate >= 8) return 80
  if (rate >= 5) return 60
  if (rate >= 2) return 40
  return 20
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

assert(mileageScoreFromKm(20) === 40, '20km=40')
assert(mileageScoreFromKm(40) === 60, '40km=60')
assert(mileageScoreFromKm(60) === 80, '60km=80')
assert(mileageScoreFromKm(80) === 100, '80km=100')
assert(mileageScoreFromKm(100) === 100, '100km capped')
assert(mileageScoreFromKm(30) === 50, '30km interpolated')

assert(goalScore(100) === 100, 'goal 100')
assert(goalScore(85) === 80, 'goal 85')
assert(goalScore(0) === 0, 'goal 0')

assert(recordScore('32:10', '28:00') === 100, 'record 10%+ improvement')
assert(recordScore('32:10', '32:10') === 0, 'record flat')
assert(recordScore('32:10', '30:45') > 0, 'record improved gets score')
assert(recordScore('30:45', '32:10') === 0, 'record declined gets zero score')

function formatDelta(deltaSeconds) {
  const abs = Math.abs(Math.round(deltaSeconds))
  if (abs === 0) return '변화 없음'
  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  const parts = []
  if (minutes > 0) parts.push(`${minutes}분`)
  if (seconds > 0 || minutes === 0) parts.push(`${seconds}초`)
  const span = parts.join(' ')
  if (deltaSeconds > 0) return `${span} 단축`
  if (deltaSeconds < 0) return `${span} 느려짐`
  return '변화 없음'
}

const improvedDelta = parseTime('32:10') - parseTime('30:45')
assert(improvedDelta === 85, '32:10 to 30:45 is 85s improvement')
assert(formatDelta(improvedDelta) === '1분 25초 단축', 'improvement label')

const declinedDelta = parseTime('5:05') - parseTime('5:20')
assert(declinedDelta === -15, '5:05 to 5:20 is slower by 15s')
assert(formatDelta(declinedDelta) === '15초 느려짐', 'decline label')

const smallImprovement = parseTime('5:20') - parseTime('5:05')
assert(smallImprovement === 15, '5:20 to 5:05 is 15s improvement')
assert(formatDelta(smallImprovement) === '15초 단축', 'small improvement label')

function dailyRecoveryPoints(entry) {
  let points = 4
  if (entry.condition === 'good') points += 3
  else if (entry.condition === 'normal') points += 2
  else points += 1
  if (entry.pain === 'none') points += 3
  else if (entry.pain === 'mild') points += 1
  if (entry.stretching === 'done') points += 3
  if (entry.intensity === 'light') points += 3
  else if (entry.intensity === 'moderate') points += 2
  else if (entry.intensity === 'hard') points += 1
  if (entry.coach_compliance === 'followed') points += 3
  else if (entry.coach_compliance === 'slightly_fast') points += 1
  return points
}

function monthlyRecoveryScore(entries) {
  if (entries.length === 0) return 0
  const total = entries.reduce((sum, row) => sum + row.points, 0)
  return Math.min(100, Math.round((total / 120) * 100))
}

const sampleEntry = {
  condition: 'good',
  pain: 'none',
  stretching: 'done',
  intensity: 'moderate',
  coach_compliance: 'followed',
}
assert(dailyRecoveryPoints(sampleEntry) >= 15, 'positive recovery day')
assert(monthlyRecoveryScore([{ points: 15 }, { points: 15 }]) === 25, 'recovery scales with count')
assert(monthlyRecoveryScore(Array.from({ length: 8 }, () => ({ points: 15 }))) === 100, '8 checks near max')

const total = computeTotal({ attendance: 80, goal: 80, record: 60, mileage: 100, recovery: 50 })
assert(total === 76, `total expected 76 got ${total}`)
assert(total <= 100 && total >= 0, 'total range')

// 동점 순위 1224
const sorted = [
  { name: 'A', total: 76 },
  { name: 'B', total: 76 },
  { name: 'C', total: 50 },
].sort((a, b) => b.total - a.total)

let rank = 0
let prev = null
const rows = sorted.map((row, i) => {
  if (prev === null || row.total !== prev) {
    rank = i + 1
    prev = row.total
  }
  return { ...row, rank }
})

assert(rows[0].rank === 1 && rows[1].rank === 1 && rows[2].rank === 3, 'competition ranks')

console.log('[verify-running-league-scoring] OK')
console.log('  sample total:', total, '/ 100')
console.log('  mileage 100km:', mileageScoreFromKm(100), 'pts (capped at 80km tier)')
console.log('  tied ranks:', rows.map((r) => `${r.name}:${r.rank}`).join(', '))
