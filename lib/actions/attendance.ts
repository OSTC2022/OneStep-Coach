'use server'

import { createClient } from '@/lib/supabase/server'
import { INSTRUCTOR_PICKER_SELECT } from '@/lib/supabase-selects'

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
        content,
        created_at,
        attendance_status,
        session_deducted,
        signature_id,
        member:members(id, name, phone, sport),
        instructor:instructors(id, name, calendar_color)
      `)
      .eq('lesson_date', today)
      .order('start_time'),
    supabase
      .from('instructors')
      .select(INSTRUCTOR_PICKER_SELECT)
      .eq('is_active', true)
      .order('name'),
  ])

  return {
    todayLessons: todayLessons ?? [],
    instructors: instructors ?? [],
  }
}
