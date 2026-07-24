'use server'

import { format, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, getMemberForCurrentUser } from '@/lib/actions/auth'
import { loadMemberPortalData } from '@/lib/member-portal-data'
import {
  getMemberBodyRecords,
  type MemberBodyRecord,
} from '@/lib/actions/member-body-records'
import { isBootstrapBodyRecord } from '@/lib/member-body-record-utils'
import { isAdultGeneralSport } from '@/lib/adult-member-programs'
import type { MemberPortalData } from '@/lib/member-portal-types'
import {
  ADULT_GENERAL_PROTEIN_SETTINGS,
  type MemberProteinSettings,
} from '@/lib/member-body-protein-types'

export type AttendanceRankEntry = {
  memberId: string
  name: string
  presentCount: number
  totalScheduled: number
  rate: number
  rank: number
  isCurrent: boolean
}

export type AdultGeneralPortalData = {
  portal: MemberPortalData
  bodyRecords: MemberBodyRecord[]
  bodyTableReady: boolean
  wellnessColumnsReady: boolean
  nutritionColumnsReady: boolean
  proteinSettings: MemberProteinSettings
  attendanceRanking: AttendanceRankEntry[]
  attendancePeriodLabel: string
  previousBodyRecord: MemberBodyRecord | null
  latestBodyRecord: MemberBodyRecord | null
}

const ATTENDANCE_LOOKBACK_DAYS = 60

async function buildAttendanceRanking(
  currentMemberId: string,
): Promise<{ entries: AttendanceRankEntry[]; periodLabel: string }> {
  const supabase = await createClient()
  const end = format(new Date(), 'yyyy-MM-dd')
  const start = format(subDays(new Date(), ATTENDANCE_LOOKBACK_DAYS - 1), 'yyyy-MM-dd')
  const periodLabel = `최근 ${ATTENDANCE_LOOKBACK_DAYS}일`

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('member_id, attendance_status')
    .gte('lesson_date', start)
    .lte('lesson_date', end)
    .not('member_id', 'is', null)
    .limit(8000)

  if (error || !lessons?.length) {
    return { entries: [], periodLabel }
  }

  const stats = new Map<
    string,
    { present: number; total: number }
  >()

  for (const row of lessons) {
    const memberId = row.member_id as string | null
    if (!memberId) continue
    const status = row.attendance_status as string | null
    if (status === 'cancelled') continue

    const current = stats.get(memberId) ?? { present: 0, total: 0 }
    current.total += 1
    if (status === 'present' || status === 'makeup') {
      current.present += 1
    }
    stats.set(memberId, current)
  }

  if (stats.size === 0) {
    return { entries: [], periodLabel }
  }

  const memberIds = Array.from(stats.keys())
  const { data: members } = await supabase
    .from('members')
    .select('id, name, sport, is_active, deleted_at')
    .in('id', memberIds)
    .eq('is_active', true)
    .is('deleted_at', null)

  // 성인회원(일반)만 랭킹에 포함
  const nameById = new Map(
    (members ?? [])
      .filter((m) => isAdultGeneralSport(m.sport as string | null))
      .map((m) => [m.id as string, (m.name as string) || '회원']),
  )

  const ranked = Array.from(stats.entries())
    .filter(([id]) => nameById.has(id))
    .map(([memberId, value]) => {
      const rate =
        value.total > 0
          ? Math.round((value.present / value.total) * 1000) / 10
          : 0
      return {
        memberId,
        name: nameById.get(memberId) ?? '회원',
        presentCount: value.present,
        totalScheduled: value.total,
        rate,
        rank: 0,
        isCurrent: memberId === currentMemberId,
      }
    })
    .filter((row) => row.totalScheduled >= 2)
    .sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate
      if (b.presentCount !== a.presentCount) return b.presentCount - a.presentCount
      return a.name.localeCompare(b.name, 'ko')
    })

  ranked.forEach((row, index) => {
    row.rank = index + 1
  })

  return { entries: ranked, periodLabel }
}

async function loadAdultGeneralPortalForMember(
  portal: MemberPortalData,
): Promise<AdultGeneralPortalData> {
  const member = portal.member
  const [{ records, tableReady, wellnessColumnsReady, nutritionColumnsReady }, attendance] =
    await Promise.all([
      getMemberBodyRecords(member.id, {
        weight_kg: member.weight_kg,
        height_cm: member.height_cm,
        registered_at: member.registered_at,
        body_baseline_recorded_at: member.body_baseline_recorded_at,
      }),
      buildAttendanceRanking(member.id),
    ])

  const measured = records
    .filter((record) => !isBootstrapBodyRecord(record))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))

  return {
    portal,
    bodyRecords: measured,
    bodyTableReady: tableReady,
    wellnessColumnsReady,
    nutritionColumnsReady,
    proteinSettings: ADULT_GENERAL_PROTEIN_SETTINGS,
    attendanceRanking: attendance.entries,
    attendancePeriodLabel: attendance.periodLabel,
    latestBodyRecord: measured[0] ?? null,
    previousBodyRecord: measured[1] ?? null,
  }
}

export async function getAdultGeneralPortalData(): Promise<AdultGeneralPortalData | null> {
  await requireAuth()
  const member = await getMemberForCurrentUser()
  if (!member) return null
  if (!isAdultGeneralSport(member.sport)) return null

  const portal = await loadMemberPortalData(member)
  return loadAdultGeneralPortalForMember(portal)
}

export async function getAdultGeneralPortalDataForStaff(
  memberId: string,
): Promise<AdultGeneralPortalData | null> {
  const { getMember } = await import('@/lib/actions/members')
  const { getMemberLinkedProfileRole } = await import('@/lib/actions/member-account')
  const { requireMemberViewer } = await import('@/lib/auth/member-access')

  await requireMemberViewer()
  const linkedRole = await getMemberLinkedProfileRole(memberId)
  if (linkedRole !== 'adult_member') return null

  const member = await getMember(memberId)
  if (!member || !isAdultGeneralSport(member.sport)) return null

  const portal = await loadMemberPortalData(member)
  return loadAdultGeneralPortalForMember(portal)
}
