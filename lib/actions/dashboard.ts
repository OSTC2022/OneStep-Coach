'use server'

import { createClient } from '@/lib/supabase/server'
import type { DashboardStats } from '@/lib/types'

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Total members
  const { count: totalMembers } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })

  // Active members
  const { count: activeMembers } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Today's lessons
  const { count: todayLessons } = await supabase
    .from('lessons')
    .select('*', { count: 'exact', head: true })
    .eq('lesson_date', today)

  // Monthly revenue (sum of session packages paid this month)
  const { data: packages } = await supabase
    .from('session_packages')
    .select('price')
    .gte('paid_at', startOfMonth)

  const monthlyRevenue = packages?.reduce((sum, pkg) => sum + (pkg.price || 0), 0) || 0

  // Expiring packages (within 7 days)
  const { count: expiringPackages } = await supabase
    .from('session_packages')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .lte('expires_at', sevenDaysLater)
    .gte('expires_at', today)

  // Low session members (3 or less)
  const { count: lowSessionMembers } = await supabase
    .from('session_packages')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .lte('remaining_sessions', 3)
    .gt('remaining_sessions', 0)

  return {
    totalMembers: totalMembers || 0,
    activeMembers: activeMembers || 0,
    todayLessons: todayLessons || 0,
    monthlyRevenue,
    expiringPackages: expiringPackages || 0,
    lowSessionMembers: lowSessionMembers || 0,
  }
}

export async function getRecentActivity(limit: number = 10) {
  const supabase = await createClient()
  
  const { data: lessons } = await supabase
    .from('lessons')
    .select('*, member:members(name), instructor:instructors(name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  return lessons || []
}

export async function getUpcomingLessons(limit: number = 5) {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  
  const { data: lessons } = await supabase
    .from('lessons')
    .select('*, member:members(name), instructor:instructors(name)')
    .gte('lesson_date', today)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(limit)

  return lessons || []
}
