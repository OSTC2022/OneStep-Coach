'use server'

import { getInstructors } from '@/lib/actions/instructors'
import { getLessonsForStatusView } from '@/lib/actions/lessons'
import { logLessonViewFetch } from '@/lib/lesson-data-sync'

/** 출석 페이지 — 캘린더·수업현황과 동일한 확장·중복 제거 로직 */
export async function getTodayAttendanceData() {
  const today = new Date().toISOString().split('T')[0]
  const [lessons, instructors] = await Promise.all([
    getLessonsForStatusView({ date: today, limit: 400 }),
    getInstructors({ isActive: true, calendar: true, limit: 80 }),
  ])

  logLessonViewFetch('attendance', {
    dateFrom: today,
    dateTo: today,
    count: lessons.length,
    sample: lessons.map((lesson) => ({
      id: lesson.id,
      instructor_id: lesson.instructor_id,
      google_event_id: lesson.google_event_id,
    })),
  })

  return {
    todayLessons: lessons,
    instructors,
  }
}
