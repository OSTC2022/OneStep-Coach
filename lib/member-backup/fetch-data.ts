import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isLessonSchedulePassedInKst } from '@/lib/member-backup/kst-date'
import { dedupeLessonsBySlot } from '@/lib/lesson-slot-dedupe'
import {
  isLessonCountedAsMemberAttendance,
  tallySessionPackages,
  type LessonAttendanceRow,
} from '@/lib/lesson-record-utils'

export type MemberBackupRow = {
  memberId: string
  name: string
  sport: string | null
  phone: string | null
  isActive: boolean
  totalSessions: number
  remainingSessions: number
  usedSessions: number
  memberRemainingCached: number
  paymentCount: number
  lastPaymentDate: string | null
  lastAttendanceDate: string | null
  attendanceCount: number
}

export type MemberAttendanceRow = {
  memberId: string
  memberName: string
  lessonDate: string
  startTime: string | null
  endTime: string | null
  status: string
  sessionDeducted: boolean
}

const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  present: '출석',
  makeup: '보강',
  absent: '결석',
  cancelled: '취소',
}

export function formatAttendanceStatus(status: string): string {
  return ATTENDANCE_STATUS_LABEL[status] ?? status
}

type LessonBackupRow = LessonAttendanceRow & {
  id: string
  member_id: string | null
  event_type?: string | null
  event_status?: string | null
}

function isBackupAttendanceLesson(lesson: LessonBackupRow): boolean {
  if (!lesson.member_id) return false
  if (lesson.event_type === 'recurring_master') return false
  if (lesson.event_status === 'cancelled') return false

  return isLessonCountedAsMemberAttendance(lesson, {
    schedulePassed: (row) =>
      isLessonSchedulePassedInKst(row.lesson_date, row.start_time),
  })
}

export async function fetchMemberBackupData(
  supabase: SupabaseClient,
): Promise<{
  members: MemberBackupRow[]
  attendance: MemberAttendanceRow[]
}> {
  const [membersRes, packagesRes, lessonsRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, name, sport, phone, is_active, remaining_sessions')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('session_packages')
      .select('member_id, total_sessions, remaining_sessions, paid_at, created_at')
      .is('deleted_at', null),
    supabase
      .from('lessons')
      .select(
        'id, member_id, lesson_date, start_time, end_time, attendance_status, session_deducted, signature_id, event_type, event_status, created_at, lesson_sessions(checked_in_at)',
      )
      .not('member_id', 'is', null)
      .neq('event_type', 'recurring_master')
      .neq('attendance_status', 'cancelled')
      .order('lesson_date', { ascending: true }),
  ])

  if (membersRes.error) throw new Error(membersRes.error.message)
  if (packagesRes.error) throw new Error(packagesRes.error.message)
  if (lessonsRes.error) throw new Error(lessonsRes.error.message)

  const members = membersRes.data ?? []
  const packages = packagesRes.data ?? []
  const lessons = dedupeLessonsBySlot((lessonsRes.data ?? []) as LessonBackupRow[])

  const packagesByMember = new Map<
    string,
    Array<{
      total_sessions: number
      remaining_sessions: number
      paid_at: string | null
      created_at: string
    }>
  >()
  const paymentStats = new Map<
    string,
    { count: number; lastDate: string | null }
  >()
  for (const pkg of packages) {
    const list = packagesByMember.get(pkg.member_id) ?? []
    list.push(pkg)
    packagesByMember.set(pkg.member_id, list)

    const paidDate = (pkg.paid_at ?? pkg.created_at)?.split('T')[0] ?? null
    const stats = paymentStats.get(pkg.member_id) ?? { count: 0, lastDate: null }
    stats.count += 1
    if (paidDate && (!stats.lastDate || paidDate > stats.lastDate)) {
      stats.lastDate = paidDate
    }
    paymentStats.set(pkg.member_id, stats)
  }

  const memberNameById = new Map(members.map((m) => [m.id, m.name]))

  const attendanceStats = new Map<
    string,
    { count: number; lastDate: string | null }
  >()
  const attendance: MemberAttendanceRow[] = []

  for (const lesson of lessons) {
    if (!isBackupAttendanceLesson(lesson)) continue

    const memberId = lesson.member_id!
    const stats = attendanceStats.get(memberId) ?? {
      count: 0,
      lastDate: null,
    }
    stats.count += 1
    if (!stats.lastDate || lesson.lesson_date > stats.lastDate) {
      stats.lastDate = lesson.lesson_date
    }
    attendanceStats.set(memberId, stats)

    attendance.push({
      memberId,
      memberName: memberNameById.get(memberId) ?? '(알 수 없음)',
      lessonDate: lesson.lesson_date,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      status: lesson.attendance_status,
      sessionDeducted: Boolean(lesson.session_deducted),
    })
  }

  const memberRows: MemberBackupRow[] = members.map((member) => {
    const tally = tallySessionPackages(packagesByMember.get(member.id) ?? [])
    const stats = attendanceStats.get(member.id)
    const payments = paymentStats.get(member.id)
    return {
      memberId: member.id,
      name: member.name,
      sport: member.sport,
      phone: member.phone,
      isActive: member.is_active,
      totalSessions: tally.total,
      remainingSessions: tally.remaining,
      usedSessions: tally.used,
      memberRemainingCached: member.remaining_sessions ?? 0,
      paymentCount: payments?.count ?? 0,
      lastPaymentDate: payments?.lastDate ?? null,
      lastAttendanceDate: stats?.lastDate ?? null,
      attendanceCount: stats?.count ?? 0,
    }
  })

  return { members: memberRows, attendance }
}
