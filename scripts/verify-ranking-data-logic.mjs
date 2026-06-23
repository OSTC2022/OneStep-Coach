/**
 * 랭킹 예시 데이터 로직 검증 (PB 누적·순위 스냅샷·월 마일리지 합산)
 * node scripts/verify-ranking-data-logic.mjs
 */

import assert from 'node:assert/strict'

function parseRunningTimeToSeconds(value) {
  if (!value?.trim()) return null
  const parts = value.trim().split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function resolvePbTimeSeconds(row) {
  if (row.time_seconds != null && row.time_seconds > 0) return row.time_seconds
  return parseRunningTimeToSeconds(row.time_text)
}

function bestPbSecondsAsOf({ participantId, distance, records, asOfDate }) {
  let best = null
  for (const record of records) {
    if (record.participant_id !== participantId) continue
    if (record.distance_event !== distance) continue
    if (record.measured_at > asOfDate) continue
    const seconds = resolvePbTimeSeconds(record)
    if (seconds == null) continue
    if (best == null || seconds < best) best = seconds
  }
  return best
}

function computeMemberPbRankAtDate({ memberId, distance, participants, records, asOfDate }) {
  const rows = []
  for (const participant of participants) {
    const timeSeconds = bestPbSecondsAsOf({
      participantId: participant.id,
      distance,
      records,
      asOfDate,
    })
    if (timeSeconds == null) continue
    rows.push({ memberId: participant.member_id, timeSeconds })
  }
  rows.sort((a, b) => a.timeSeconds - b.timeSeconds || a.memberId.localeCompare(b.memberId))
  let rank = 0
  let previous = null
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (previous === null || row.timeSeconds !== previous) {
      rank = index + 1
      previous = row.timeSeconds
    }
    if (row.memberId === memberId) return rank
  }
  return null
}

function buildMemberRankingHistorySeries({ memberId, distance, participants, records }) {
  const participant = participants.find((row) => row.member_id === memberId)
  if (!participant) return []

  const events = records
    .filter((row) => row.participant_id === participant.id && row.distance_event === distance)
    .map((row) => {
      const timeSeconds = resolvePbTimeSeconds(row)
      return timeSeconds != null ? { measured_at: row.measured_at, timeSeconds } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))

  let cumulativePb = null
  return events.map((row) => {
    const rawTimeSeconds = row.timeSeconds
    const previousPb = cumulativePb
    if (cumulativePb == null || rawTimeSeconds < cumulativePb) cumulativePb = rawTimeSeconds
    return {
      rawTimeSeconds,
      timeSeconds: cumulativePb,
      isPbImprovement: previousPb == null || rawTimeSeconds < previousPb,
      rank: computeMemberPbRankAtDate({
        memberId,
        distance,
        participants,
        records,
        asOfDate: row.measured_at,
      }),
    }
  })
}

function aggregateMonthlyMileageByMember(logs) {
  const totals = new Map()
  for (const log of logs) {
    const next = (totals.get(log.member_id) ?? 0) + Number(log.distance_km ?? 0)
    totals.set(log.member_id, Math.round(next * 10) / 10)
  }
  return totals
}

function buildMileageDistanceLeaderboard(participants, logs) {
  const totals = aggregateMonthlyMileageByMember(logs)
  const ranked = participants
    .map((p) => ({
      memberId: p.member_id,
      mileageKm: totals.get(p.member_id) ?? 0,
    }))
    .filter((row) => row.mileageKm > 0)
    .sort((a, b) => b.mileageKm - a.mileageKm)
  return { ranked }
}

const PB_DISTANCE_SOURCES = {
  '5km': { specField: 'pb_5k_seconds', distanceEvent: '5km' },
  '10km': { specField: 'pb_10k_seconds', distanceEvent: '10km' },
  half: { specField: 'pb_half_seconds', distanceEvent: 'half' },
  full: { specField: 'pb_full_seconds', distanceEvent: 'full' },
}

const participants = [
  { id: 'p-a', member_id: 'm-a' },
  { id: 'p-b', member_id: 'm-b' },
]

const records = [
  {
    participant_id: 'p-a',
    member_id: 'm-a',
    distance_event: '5km',
    record_phase: 'month_start',
    time_text: '25:00',
    time_seconds: 1500,
    measured_at: '2026-01-05',
  },
  {
    participant_id: 'p-a',
    member_id: 'm-a',
    distance_event: '5km',
    record_phase: 'other',
    time_text: '23:30',
    time_seconds: 1410,
    measured_at: '2026-02-10',
  },
  {
    participant_id: 'p-b',
    member_id: 'm-b',
    distance_event: '5km',
    record_phase: 'other',
    time_text: '24:00',
    time_seconds: 1440,
    measured_at: '2026-02-01',
  },
]

assert.equal(PB_DISTANCE_SOURCES['5km'].specField, 'pb_5k_seconds')

const history = buildMemberRankingHistorySeries({
  memberId: 'm-a',
  distance: '5km',
  participants,
  records,
})
assert.equal(history.length, 2)
assert.equal(history[0].timeSeconds, 1500)
assert.equal(history[1].timeSeconds, 1410)
assert.equal(history[1].isPbImprovement, true)
assert.equal(
  computeMemberPbRankAtDate({
    memberId: 'm-a',
    distance: '5km',
    participants,
    records,
    asOfDate: '2026-02-10',
  }),
  1,
)

const mileageBoard = buildMileageDistanceLeaderboard(participants, [
  { member_id: 'm-a', distance_km: 10, logged_at: '2026-06-03' },
  { member_id: 'm-a', distance_km: 5, logged_at: '2026-06-10' },
  { member_id: 'm-b', distance_km: 12, logged_at: '2026-06-08' },
])
assert.equal(mileageBoard.ranked[0].memberId, 'm-a')
assert.equal(mileageBoard.ranked[0].mileageKm, 15)

console.log('[verify-ranking-data-logic] OK')
