import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { dedupeLessonsBySlot } from '@/lib/lesson-slot-dedupe'
import {
  isLessonCountedAsMemberAttendance,
  type LessonAttendanceRow,
} from '@/lib/lesson-record-utils'
import { formatAttendanceStatus } from '@/lib/member-backup/fetch-data'
import {
  getKstYearMonthKey,
  listYearMonthsThroughCurrent,
  type KstYearMonth,
} from '@/lib/member-backup/kst-month'
import { isLessonSchedulePassedInKst } from '@/lib/member-backup/kst-date'

export const BACKUP_ROW_KEY = '기록키' as const

export type MonthlyBackupRow = {
  [BACKUP_ROW_KEY]: string
  구분: '출석' | '결제'
  회원ID: string
  회원명: string
  종목: string
  연락처: string
  일자: string
  시작시간: string
  종료시간: string
  출석상태: string
  수업권차감: string
  결제금액: number | ''
  구매횟수: number | ''
  남은횟수: number | ''
  사용횟수: number | ''
  결제방법: string
  만료일: string
  메모: string
  패키지ID: string
  수업ID: string
}

type LessonBackupRow = LessonAttendanceRow & {
  id: string
  member_id: string | null
  event_type?: string | null
  event_status?: string | null
}

type PackageBackupRow = {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  price: number | null
  paid_at: string | null
  expires_at: string | null
  payment_method: string | null
  note: string | null
  created_at: string
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

function paymentDateKey(pkg: PackageBackupRow): string {
  const source = pkg.paid_at ?? pkg.created_at
  return source ? source.split('T')[0] : ''
}

function buildAttendanceRow(
  lesson: LessonBackupRow,
  member: { name: string; sport: string | null; phone: string | null },
): MonthlyBackupRow {
  const start = lesson.start_time?.slice(0, 5) ?? ''
  return {
    [BACKUP_ROW_KEY]: `att|${lesson.member_id}|${lesson.lesson_date}|${start}`,
    구분: '출석',
    회원ID: lesson.member_id!,
    회원명: member.name,
    종목: member.sport ?? '',
    연락처: member.phone ?? '',
    일자: lesson.lesson_date,
    시작시간: start,
    종료시간: lesson.end_time?.slice(0, 5) ?? '',
    출석상태: formatAttendanceStatus(lesson.attendance_status),
    수업권차감: lesson.session_deducted ? 'Y' : 'N',
    결제금액: '',
    구매횟수: '',
    남은횟수: '',
    사용횟수: '',
    결제방법: '',
    만료일: '',
    메모: '',
    패키지ID: '',
    수업ID: lesson.id,
  }
}

function buildPaymentRow(
  pkg: PackageBackupRow,
  member: { name: string; sport: string | null; phone: string | null },
): MonthlyBackupRow {
  const used = Math.max(pkg.total_sessions - pkg.remaining_sessions, 0)
  const paidDate = paymentDateKey(pkg)
  return {
    [BACKUP_ROW_KEY]: `pay|${pkg.id}`,
    구분: '결제',
    회원ID: pkg.member_id,
    회원명: member.name,
    종목: member.sport ?? '',
    연락처: member.phone ?? '',
    일자: paidDate,
    시작시간: '',
    종료시간: '',
    출석상태: '',
    수업권차감: '',
    결제금액: pkg.price != null ? Number(pkg.price) : '',
    구매횟수: pkg.total_sessions,
    남은횟수: pkg.remaining_sessions,
    사용횟수: used,
    결제방법: pkg.payment_method ?? '',
    만료일: pkg.expires_at ? pkg.expires_at.split('T')[0] : '',
    메모: pkg.note ?? '',
    패키지ID: pkg.id,
    수업ID: '',
  }
}

function sortMonthlyRows(rows: MonthlyBackupRow[]): MonthlyBackupRow[] {
  return [...rows].sort((a, b) => {
    if (a.일자 !== b.일자) return a.일자.localeCompare(b.일자)
    if (a.구분 !== b.구분) return a.구분 === '결제' ? -1 : 1
    return a.회원명.localeCompare(b.회원명, 'ko')
  })
}

export async function fetchMonthlyBackupSheets(
  supabase: SupabaseClient,
  asOf = new Date(),
): Promise<Map<string, MonthlyBackupRow[]>> {
  const months = listYearMonthsThroughCurrent(asOf)
  const monthKeys = new Set(months.map((m) => m.key))
  const sheetByKey = new Map<string, MonthlyBackupRow[]>(
    months.map((m) => [m.sheetName, []]),
  )

  const [membersRes, packagesRes, lessonsRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, name, sport, phone')
      .is('deleted_at', null),
    supabase
      .from('session_packages')
      .select(
        'id, member_id, total_sessions, remaining_sessions, price, paid_at, expires_at, payment_method, note, created_at',
      )
      .is('deleted_at', null),
    supabase
      .from('lessons')
      .select(
        'id, member_id, lesson_date, start_time, end_time, attendance_status, session_deducted, signature_id, event_type, event_status, created_at, lesson_sessions(checked_in_at)',
      )
      .not('member_id', 'is', null)
      .neq('event_type', 'recurring_master')
      .neq('attendance_status', 'cancelled'),
  ])

  if (membersRes.error) throw new Error(membersRes.error.message)
  if (packagesRes.error) throw new Error(packagesRes.error.message)
  if (lessonsRes.error) throw new Error(lessonsRes.error.message)

  const memberById = new Map(
    (membersRes.data ?? []).map((m) => [
      m.id,
      { name: m.name, sport: m.sport, phone: m.phone },
    ]),
  )

  for (const pkg of (packagesRes.data ?? []) as PackageBackupRow[]) {
    const member = memberById.get(pkg.member_id)
    if (!member) continue
    const monthKey = getKstYearMonthKey(pkg.paid_at ?? pkg.created_at)
    if (!monthKeys.has(monthKey)) continue
    const sheetName = months.find((m) => m.key === monthKey)?.sheetName
    if (!sheetName) continue
    sheetByKey.get(sheetName)!.push(buildPaymentRow(pkg, member))
  }

  const lessons = dedupeLessonsBySlot((lessonsRes.data ?? []) as LessonBackupRow[])
  for (const lesson of lessons) {
    if (!isBackupAttendanceLesson(lesson)) continue
    const member = memberById.get(lesson.member_id!)
    if (!member) continue
    const monthKey = getKstYearMonthKey(lesson.lesson_date)
    if (!monthKeys.has(monthKey)) continue
    const sheetName = months.find((m) => m.key === monthKey)?.sheetName
    if (!sheetName) continue
    sheetByKey.get(sheetName)!.push(buildAttendanceRow(lesson, member))
  }

  for (const [name, rows] of sheetByKey) {
    sheetByKey.set(name, sortMonthlyRows(rows))
  }

  return sheetByKey
}

export function listCurrentYearMonthSheets(asOf = new Date()): KstYearMonth[] {
  return listYearMonthsThroughCurrent(asOf)
}
