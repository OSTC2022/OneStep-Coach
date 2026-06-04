'use server'

import { createClient } from '@/lib/supabase/server'

export type ReportDashboardData = {
  stats: {
    thisMonthRevenue: number
    lastMonthRevenue: number
    thisMonthLessons: number
    lastMonthLessons: number
    totalMembers: number
    activeMembers: number
    newMembersThisMonth: number
  }
  instructorStats: { name: string; count: number }[]
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
    thisMonthPackagesRes,
    lastMonthPackagesRes,
    thisMonthLessonsRes,
    lastMonthLessonsRes,
    totalMembersRes,
    activeMembersRes,
    newMembersRes,
    instructorLessonsRes,
    memberSportsRes,
  ] = await Promise.all([
    supabase
      .from('session_packages')
      .select('price, paid_at')
      .gte('paid_at', thisMonthStr),
    supabase
      .from('session_packages')
      .select('price, paid_at')
      .gte('paid_at', lastMonthStr)
      .lte('paid_at', lastMonthEndStr),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date')
      .gte('lesson_date', thisMonthStr),
    supabase
      .from('lessons')
      .select('id, attendance_status, lesson_date')
      .gte('lesson_date', lastMonthStr)
      .lte('lesson_date', lastMonthEndStr),
    supabase.from('members').select('id', { count: 'exact', head: true }),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .gte('registered_at', thisMonthStr),
    supabase
      .from('lessons')
      .select(
        'instructor_id, instructor:instructors(name), attendance_status',
      )
      .gte('lesson_date', thisMonthStr)
      .eq('attendance_status', 'present'),
    supabase.from('members').select('sport').eq('is_active', true),
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

  const thisMonthPackages = thisMonthPackagesRes.data ?? []
  const lastMonthPackages = lastMonthPackagesRes.data ?? []
  const thisMonthLessons = thisMonthLessonsRes.data ?? []
  const lastMonthLessons = lastMonthLessonsRes.data ?? []

  return {
    stats: {
      thisMonthRevenue: thisMonthPackages.reduce(
        (sum, p) => sum + (p.price || 0),
        0,
      ),
      lastMonthRevenue: lastMonthPackages.reduce(
        (sum, p) => sum + (p.price || 0),
        0,
      ),
      thisMonthLessons: thisMonthLessons.filter(
        (l) => l.attendance_status === 'present',
      ).length,
      lastMonthLessons: lastMonthLessons.filter(
        (l) => l.attendance_status === 'present',
      ).length,
      totalMembers: totalMembersRes.count ?? 0,
      activeMembers: activeMembersRes.count ?? 0,
      newMembersThisMonth: newMembersRes.count ?? 0,
    },
    instructorStats: Object.values(instructorStatsMap),
    sportStats,
  }
}
