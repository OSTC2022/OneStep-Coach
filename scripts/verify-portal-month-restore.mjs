/**
 * 월 선택으로 출석왕·룰렛 복구 + 포털 관리 권한 가드 검증
 * node scripts/verify-portal-month-restore.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { endOfMonth, format, startOfMonth } from 'date-fns'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function rankingPeriodFromMonthKey(monthKey) {
  const reference = new Date(`${monthKey}-01T00:00:00`)
  return {
    start: format(startOfMonth(reference), 'yyyy-MM-dd'),
    end: format(endOfMonth(reference), 'yyyy-MM-dd'),
    monthKey,
  }
}

function isQualified(distanceKm) {
  return Number(distanceKm) >= 3
}

function dayKey(loggedAt) {
  return String(loggedAt).slice(0, 10)
}

function buildAttendanceKingLeaderboard(participants, logs, period) {
  const tallies = new Map()

  for (const participant of participants) {
    const days = new Set()
    let totalKm = 0
    for (const log of logs) {
      if (log.member_id !== participant.member_id) continue
      if (log.logged_at < period.start || log.logged_at > period.end) continue
      if (!isQualified(log.distance_km)) continue
      days.add(dayKey(log.logged_at))
      totalKm += Number(log.distance_km) || 0
    }
    if (days.size <= 0) continue
    tallies.set(participant.member_id, {
      memberId: participant.member_id,
      memberName: participant.member?.name ?? '회원',
      attendanceCount: days.size,
      totalKm: Math.round(totalKm * 10) / 10,
    })
  }

  return [...tallies.values()].sort(
    (a, b) =>
      b.attendanceCount - a.attendanceCount ||
      b.totalKm - a.totalKm ||
      a.memberName.localeCompare(b.memberName, 'ko'),
  )
}

function buildPortalRouletteSlots(attendanceRows) {
  const slots = []
  if (attendanceRows.length === 0) {
    slots.push({ id: 'empty', label: '출석왕' })
    return slots
  }
  for (const row of attendanceRows) {
    for (let i = 0; i < Math.max(1, row.attendanceCount); i += 1) {
      slots.push({
        id: `${row.memberId}-${i}`,
        label: '출석왕',
        memberId: row.memberId,
      })
    }
  }
  return slots
}

function canManageAdultRunningPortal(user) {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role !== 'instructor' && user.role !== 'coach') return false
  if (!user.adult_running_portal_manage) return false
  return user.approval_status === 'approved'
}

// --- July restore: Aug cycle hides July; month filter restores it ---
const participants = [
  { member_id: 'm1', member: { name: '김러너' } },
  { member_id: 'm2', member: { name: '이출석' } },
]
const logs = [
  { member_id: 'm1', distance_km: 5, logged_at: '2026-07-03' },
  { member_id: 'm1', distance_km: 4.2, logged_at: '2026-07-10' },
  { member_id: 'm2', distance_km: 3.1, logged_at: '2026-07-15' },
  { member_id: 'm1', distance_km: 2.5, logged_at: '2026-07-20' }, // <3km ignore
  { member_id: 'm1', distance_km: 6, logged_at: '2026-08-01' },
]

const augustCycle = { start: '2026-08-01', end: '2026-08-02' }
const julyPeriod = rankingPeriodFromMonthKey('2026-07')

assert.equal(julyPeriod.start, '2026-07-01')
assert.equal(julyPeriod.end, '2026-07-31')

const augustAttendance = buildAttendanceKingLeaderboard(participants, logs, augustCycle)
assert.equal(augustAttendance.length, 1)
assert.equal(augustAttendance[0].memberId, 'm1')
assert.equal(augustAttendance[0].attendanceCount, 1)

const julyAttendance = buildAttendanceKingLeaderboard(participants, logs, julyPeriod)
assert.equal(julyAttendance.length, 2)
assert.equal(julyAttendance[0].memberId, 'm1')
assert.equal(julyAttendance[0].attendanceCount, 2)
assert.equal(julyAttendance[1].memberId, 'm2')
assert.equal(julyAttendance[1].attendanceCount, 1)

const julySlots = buildPortalRouletteSlots(julyAttendance)
assert.equal(julySlots.length, 3) // 2 + 1 attendance slices
assert.ok(julySlots.every((slot) => slot.label === '출석왕'))

const augustSlots = buildPortalRouletteSlots(augustAttendance)
assert.equal(augustSlots.length, 1)

// --- Access guards ---
assert.equal(canManageAdultRunningPortal({ role: 'admin' }), true)
assert.equal(
  canManageAdultRunningPortal({
    role: 'instructor',
    approval_status: 'approved',
    adult_running_portal_manage: true,
  }),
  true,
)
assert.equal(
  canManageAdultRunningPortal({
    role: 'instructor',
    approval_status: 'pending',
    adult_running_portal_manage: true,
  }),
  false,
)
assert.equal(
  canManageAdultRunningPortal({
    role: 'instructor',
    approval_status: 'approved',
    adult_running_portal_manage: false,
  }),
  false,
)
assert.equal(
  canManageAdultRunningPortal({
    role: 'adult_member',
    approval_status: 'approved',
    adult_running_portal_manage: true,
  }),
  false,
)

// --- Source wiring ---
const managePage = readFileSync(
  join(root, 'app/dashboard/running-portal/manage/page.tsx'),
  'utf8',
)
const manageAccess = readFileSync(
  join(root, 'lib/running-league/portal-manage-access.ts'),
  'utf8',
)
const cycleSettings = readFileSync(
  join(root, 'lib/actions/adult-running-portal-settings.ts'),
  'utf8',
)
const mileageBoard = readFileSync(
  join(root, 'lib/running-league/mileage-leaderboard.ts'),
  'utf8',
)
const sidebar = readFileSync(join(root, 'components/dashboard/sidebar.tsx'), 'utf8')
const menuOrder = readFileSync(join(root, 'lib/dashboard-menu-order.ts'), 'utf8')

assert.match(managePage, /requireAdultRunningPortalManageAccess/)
assert.match(managePage, /getAdultRunningPortalManageMonthData/)
assert.match(manageAccess, /adult_running_portal_manage/)
assert.match(cycleSettings, /읽기 시 DB에 당월 1일을 쓰지 않음/)
assert.match(mileageBoard, /participant\.mileage_km 폴백은 출석·룰렛과 어긋남/)
assert.match(menuOrder, /러닝 포털 관리/)
assert.match(sidebar, /canManageAdultRunningPortal/)
assert.match(sidebar, /RUNNING_PORTAL_MANAGE_MENU_ID/)

console.log('[verify-portal-month-restore] OK — July month restore + manage access')
