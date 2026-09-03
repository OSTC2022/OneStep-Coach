'use server'

import { createClient } from '@/lib/supabase/server'
import { buildInstructorPayroll } from '@/lib/instructor-pay'
import { INSTRUCTOR_LIST_SELECT } from '@/lib/supabase-selects'
import { sumSessionPackageRevenue } from '@/lib/actions/sessions'

export type InstructorPayrollRow = {
  id: string
  name: string
  totalLessons: number
  weekdaySlots: number
  weekendSlots: number
  weekdayPay: number
  weekendPay: number
  totalPay: number
}

export type MonthlyRevenueTrendPoint = {
  month: string
  label: string
  revenue: number
}

export type ReportDashboardData = {
  selectedMonth: string
  previousMonth: string
  isCurrentMonth: boolean
  daysInSelectedMonth: number
  stats: {
    thisMonthRevenue: number
    lastMonthRevenue: number
    thisMonthLessons: number
    lastMonthLessons: number
    totalMembers: number
    activeMembers: number
    newMembersThisMonth: number
    totalInstructorPay: number
  }
  instructorStats: { name: string; count: number }[]
  instructorPayroll: InstructorPayrollRow[]
  sportStats: Record<string, number>
  monthlyRevenueTrend: MonthlyRevenueTrendPoint[]
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`
}

function parseMonthKey(monthKey?: string | null): { year: number; month: number } {
  const now = new Date()
  const match = monthKey?.trim().match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  return { year, month }
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    startKey: formatLocalDateKey(start),
    endKey: formatLocalDateKey(end),
    monthKey: formatMonthKey(year, month),
    label: formatMonthLabel(year, month),
    dayCount: end.getDate(),
  }
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export async function getReportDashboardData(
  monthKey?: string | null,
): Promise<ReportDashboardData> {
  const supabase = await createClient()
  const now = new Date()
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const selected = parseMonthKey(monthKey)
  const previous = shiftMonth(selected.year, selected.month, -1)

  const selectedRange = getMonthRange(selected.year, selected.month)
  const previousRange = getMonthRange(previous.year, previous.month)
  const isCurrentMonth =
    selected.year === current.year && selected.month === current.month

  const daysInSelectedMonth = isCurrentMonth
    ? Math.max(1, now.getDate())
    : selectedRange.dayCount

  const trendMonths = Array.from({ length: 12 }, (_, index) => {
    const point = shiftMonth(selected.year, selected.month, index - 11)
    return getMonthRange(point.year, point.month)
  })

  const nextMonthAfterSelected = shiftMonth(selected.year, selected.month, 1)
  const nextMonthStartKey = getMonthRange(
    nextMonthAfterSelected.year,
    nextMonthAfterSelected.month,
  ).startKey

  const [
    thisMonthRevenue,
    lastMonthRevenue,
    thisMonthLessonsRes,
    lastMonthLessonsRes,
    totalMembersRes,
    activeMembersRes,
    newMembersRes,
    instructorLessonsRes,
    payrollLessonsRes,
    instructorsRes,
    memberSportsRes,
    ...trendRevenues
  ] = await Promise.all([
    sumSessionPackageRevenue({
      paidFrom: selectedRange.startKey,
      paidTo: `${selectedRange.endKey}T23:59:59.999`,
    }),
    sumSessionPackageRevenue({
      paidFrom: previousRange.startKey,
      paidTo: `${previousRange.endKey}T23:59:59.999`,
    }),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date, instructor_id')
      .gte('lesson_date', selectedRange.startKey)
      .lte('lesson_date', selectedRange.endKey),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date, instructor_id')
      .gte('lesson_date', previousRange.startKey)
      .lte('lesson_date', previousRange.endKey),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('deleted_at', null),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .gte('registered_at', selectedRange.startKey)
      .lt('registered_at', nextMonthStartKey)
      .is('deleted_at', null),
    supabase
      .from('lessons')
      .select(
        'instructor_id, instructor:instructors(name), attendance_status',
      )
      .gte('lesson_date', selectedRange.startKey)
      .lte('lesson_date', selectedRange.endKey)
      .eq('attendance_status', 'present'),
    supabase
      .from('lessons')
      .select(
        'id, lesson_date, start_time, instructor_id, attendance_status, lesson_type, member_id, session_deducted, end_time, special_note, event_status, event_type, created_at, lesson_sessions(checked_in_at)',
      )
      .gte('lesson_date', selectedRange.startKey)
      .lte('lesson_date', selectedRange.endKey)
      .neq('event_type', 'recurring_master')
      .not('instructor_id', 'is', null),
    supabase
      .from('instructors')
      .select(INSTRUCTOR_LIST_SELECT)
      .eq('is_active', true),
    supabase
      .from('members')
      .select('sport')
      .eq('is_active', true)
      .is('deleted_at', null),
    ...trendMonths.map((range) =>
      sumSessionPackageRevenue({
        paidFrom: range.startKey,
        paidTo: `${range.endKey}T23:59:59.999`,
      }),
    ),
  ])

  const instructorStatsMap: Record<string, { name: string; count: number }> = {}
  instructorLessonsRes.data?.forEach((lesson) => {
    if (lesson.instructor_id && lesson.instructor) {
      const instructorData = lesson.instructor as { name: string }
      if (!instructorStatsMap[lesson.instructor_id]) {
        instructorStatsMap[lesson.instructor_id] = {
          name: instructorData.name,
          count: 0,
        }
      }
      instructorStatsMap[lesson.instructor_id].count++
    }
  })

  const sportStats: Record<string, number> = {}
  memberSportsRes.data?.forEach((member) => {
    const sport = member.sport || '미지정'
    sportStats[sport] = (sportStats[sport] || 0) + 1
  })

  const thisMonthLessons = thisMonthLessonsRes.data ?? []
  const lastMonthLessons = lastMonthLessonsRes.data ?? []
  const instructors = instructorsRes.data ?? []
  const instructorPayroll = buildInstructorPayroll(
    instructors,
    payrollLessonsRes.data ?? [],
  ).filter((row) => row.totalPay > 0 || row.totalLessons > 0)
  const totalInstructorPay = instructorPayroll.reduce(
    (sum, row) => sum + row.totalPay,
    0,
  )

  const monthlyRevenueTrend: MonthlyRevenueTrendPoint[] = trendMonths.map(
    (range, index) => ({
      month: range.monthKey,
      label: range.label,
      revenue: Number(trendRevenues[index]) || 0,
    }),
  )

  return {
    selectedMonth: selectedRange.monthKey,
    previousMonth: previousRange.monthKey,
    isCurrentMonth,
    daysInSelectedMonth,
    stats: {
      thisMonthRevenue,
      lastMonthRevenue,
      thisMonthLessons: thisMonthLessons.filter(
        (l) => l.attendance_status === 'present' && l.instructor_id,
      ).length,
      lastMonthLessons: lastMonthLessons.filter(
        (l) => l.attendance_status === 'present' && l.instructor_id,
      ).length,
      totalMembers: totalMembersRes.count ?? 0,
      activeMembers: activeMembersRes.count ?? 0,
      newMembersThisMonth: newMembersRes.count ?? 0,
      totalInstructorPay,
    },
    instructorStats: Object.values(instructorStatsMap),
    instructorPayroll,
    sportStats,
    monthlyRevenueTrend,
  }
}
