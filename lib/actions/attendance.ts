'use server'

import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { collectInstructorsFromLessons } from '@/lib/instructor-lesson-utils'
import { ATTENDANCE_LESSON_SELECT } from '@/lib/supabase-selects'

/** 출석 페이지 전용 — 오늘 수업만 조회, 강사는 수업에서 추출 */
export async function getTodayAttendanceData() {
  const supabase = await createStaffDataClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: todayLessons } = await supabase
    .from('lessons')
    .select(ATTENDANCE_LESSON_SELECT)
    .eq('lesson_date', today)
    .order('start_time')

  const lessons = todayLessons ?? []

  return {
    todayLessons: lessons,
    instructors: collectInstructorsFromLessons(lessons),
  }
}
