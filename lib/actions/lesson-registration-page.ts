'use server'

import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

export async function getLessonRegistrationPageData() {
  const supabase = await createStaffDataClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: members }, { data: instructors }, { data: todayLessons }] =
    await Promise.all([
      supabase
        .from('members')
        .select(`
          id,
          name,
          phone,
          sport,
          session_packages(id, total_sessions, remaining_sessions, is_active)
        `)
        .eq('is_active', true)
        .order('name')
        .limit(LIST_PAGE_SIZE),
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
        .eq('lesson_date', today)
        .order('start_time'),
    ])

  return {
    members: members ?? [],
    instructors: instructors ?? [],
    todayLessons: todayLessons ?? [],
  }
}
