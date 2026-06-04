'use server'

import { createClient } from '@/lib/supabase/server'

export async function getTodayAttendanceData() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: todayLessons }, { data: instructors }] = await Promise.all([
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
        attendance_status,
        session_deducted,
        member:members(id, name, phone, sport),
        instructor:instructors(id, name)
      `)
      .eq('lesson_date', today)
      .order('start_time'),
    supabase
      .from('instructors')
      .select('id, name')
      .eq('is_active', true),
  ])

  return {
    todayLessons: todayLessons ?? [],
    instructors: instructors ?? [],
  }
}
