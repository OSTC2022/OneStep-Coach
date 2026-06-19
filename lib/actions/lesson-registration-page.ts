'use server'

import { format, subDays } from 'date-fns'
import { getMembers } from '@/lib/actions/members'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

const RECENT_LESSON_DAYS = 7

function getRecentLessonDateRange() {
  const today = new Date()
  return {
    dateFrom: format(subDays(today, RECENT_LESSON_DAYS - 1), 'yyyy-MM-dd'),
    dateTo: format(today, 'yyyy-MM-dd'),
  }
}

type MemberPackageRow = {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  is_active: boolean
  note: string | null
  expires_at: string | null
  created_at: string
  paid_at: string | null
}

async function fetchMemberPackages(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  memberIds: string[],
): Promise<MemberPackageRow[]> {
  if (memberIds.length === 0) return []

  let query = supabase
    .from('session_packages')
    .select(
      'id, member_id, total_sessions, remaining_sessions, is_active, note, expires_at, created_at, paid_at',
    )
    .in('member_id', memberIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  let { data, error } = await query

  if (error?.code === '42703' || error?.message?.includes('deleted_at')) {
    const legacy = await supabase
      .from('session_packages')
      .select(
        'id, member_id, total_sessions, remaining_sessions, is_active, note, expires_at, created_at, paid_at',
      )
      .in('member_id', memberIds)
      .order('created_at', { ascending: true })
    data = legacy.data
    error = legacy.error
  }

  if (error) {
    console.error('Error fetching member packages for lesson registration:', error)
    return []
  }

  return (data ?? []) as MemberPackageRow[]
}

export async function getLessonRegistrationPageData() {
  const supabase = await createStaffDataClient()
  const { dateFrom, dateTo } = getRecentLessonDateRange()

  const [{ data: memberRows }, { data: instructors }, { data: recentWeekLessons }] =
    await Promise.all([
      getMembers({
        isActive: true,
        orderBy: 'name',
        orderAsc: true,
        limit: LIST_PAGE_SIZE,
      }),
      supabase
        .from('instructors')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('lessons')
        .select(`
          id,
          member_id,
          instructor_id,
          lesson_date,
          start_time,
          end_time,
          lesson_type,
          title,
          content,
          attendance_status,
          session_deducted,
          lesson_no,
          member:members(name, phone),
          instructor:instructors(name)
        `)
        .gte('lesson_date', dateFrom)
        .lte('lesson_date', dateTo)
        .order('lesson_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(120),
    ])

  const memberIds = memberRows.map((member) => member.id)
  const packages =
    memberIds.length > 0
      ? await fetchMemberPackages(supabase, memberIds)
      : []
  const packagesByMember = new Map<string, MemberPackageRow[]>()

  for (const pkg of packages) {
    const group = packagesByMember.get(pkg.member_id) ?? []
    group.push(pkg)
    packagesByMember.set(pkg.member_id, group)
  }

  const members = memberRows.map((member) => ({
    id: member.id,
    name: member.name,
    phone: member.phone,
    sport: member.sport,
    session_packages: (packagesByMember.get(member.id) ?? []).map((pkg) => ({
      id: pkg.id,
      total_sessions: pkg.total_sessions,
      remaining_sessions: pkg.remaining_sessions,
      is_active: pkg.is_active,
      note: pkg.note,
      expires_at: pkg.expires_at,
      created_at: pkg.created_at,
      paid_at: pkg.paid_at,
    })),
  }))

  return {
    members,
    instructors: instructors ?? [],
    recentWeekLessons: recentWeekLessons ?? [],
  }
}
