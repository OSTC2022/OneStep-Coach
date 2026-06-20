'use server'

import { createClient } from '@/lib/supabase/server'
import { buildInstructorPayroll } from '@/lib/instructor-pay'
import { INSTRUCTOR_LIST_SELECT } from '@/lib/supabase-selects'
import {
  getMonthlySessionRevenue,
  sumSessionPackageRevenue,
} from '@/lib/actions/sessions'

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

export type ReportDashboardData = {
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
}

export async function getReportDashboardData(): Promise<ReportDashboardData> {
  const supabase = await createClient()
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  const thisMonthStr = thisMonth.toISOString().split('T')[0]
  const lastMonthStr = lastMonth.toISOString().split('T')[0]
  const lastMonthEndStr = lastMonthEnd.toISOString().split('T')[0]

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
  ] = await Promise.all([
    getMonthlySessionRevenue(),
    sumSessionPackageRevenue({
      paidFrom: lastMonthStr,
      paidTo: lastMonthEndStr,
    }),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date, instructor_id')
      .gte('lesson_date', thisMonthStr),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date, instructor_id')
      .gte('lesson_date', lastMonthStr)
      .lte('lesson_date', lastMonthEndStr),
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
      .gte('registered_at', thisMonthStr)
      .is('deleted_at', null),
    supabase
      .from('lessons')
      .select(
        'instructor_id, instructor:instructors(name), attendance_status',
      )
      .gte('lesson_date', thisMonthStr)
      .eq('attendance_status', 'present'),
    supabase
      .from('lessons')
      .select(
        'id, lesson_date, start_time, instructor_id, attendance_status, lesson_type, member_id, session_deducted, end_time, special_note, event_status, event_type, created_at, lesson_sessions(checked_in_at)',
      )
      .gte('lesson_date', thisMonthStr)
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

  return {
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
  }
}
