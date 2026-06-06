'use server'

import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import type { DashboardStats } from '@/lib/types'
import {
  getMonthlySessionRevenue,
  getRecentSessionPayments,
} from '@/lib/actions/sessions'

async function countMembers(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  activeOnly?: boolean,
) {
  let query = supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  let result = await query

  if (result.error?.code === '42703') {
    let fallback = supabase.from('members').select('id', { count: 'exact', head: true })
    if (activeOnly) fallback = fallback.eq('is_active', true)
    result = await fallback
  }

  return result.count ?? 0
}

/** count·sum·최근 데이터만 — 전체 테이블 로드 없음 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createStaffDataClient()
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [
    totalMembers,
    activeMembers,
    todayLessonsRes,
    expiringRes,
    lowSessionRes,
    monthlyRevenue,
  ] = await Promise.all([
    countMembers(supabase),
    countMembers(supabase, true),
    supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_date', today),
    supabase
      .from('session_packages')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .lte('expires_at', sevenDaysLater)
      .gte('expires_at', today),
    supabase
      .from('session_packages')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .lte('remaining_sessions', 3)
      .gt('remaining_sessions', 0),
    getMonthlySessionRevenue(),
  ])

  return {
    totalMembers,
    activeMembers,
    todayLessons: todayLessonsRes.count ?? 0,
    monthlyRevenue,
    expiringPackages: expiringRes.count ?? 0,
    lowSessionMembers: lowSessionRes.count ?? 0,
  }
}

export async function getInstructorDashboardStats(): Promise<Pick<DashboardStats, 'todayLessons'>> {
  const supabase = await createStaffDataClient()
  const today = new Date().toISOString().split('T')[0]

  const { count } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_date', today)

  return { todayLessons: count ?? 0 }
}

export async function getRecentActivity(limit: number = 8) {
  return getRecentSessionPayments(limit)
}
