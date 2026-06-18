import { getSessionPackages } from '@/lib/actions/sessions'
import {
  buildLessonSessionNumberMap,
  filterLessonsForRecentRecords,
  getTodayDateKey,
  linkPackageTallyToSessions,
  type SessionPackageTally,
} from '@/lib/lesson-record-utils'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'

export type MemberPortalLessonRecord = {
  id: string
  lesson_date: string
  start_time: string | null
  end_time: string | null
  lesson_type: string
  attendance_status: string
  session_deducted: boolean
  lesson_no: number | null
  content: string | null
  special_note: string | null
  created_at: string
  instructor?: { id: string; name: string } | null
  lesson_sessions?: Array<{
    checked_in_at?: string | null
    signature_data?: string | null
  }> | null
}

export type MemberLessonRecordsData = {
  lessons: MemberPortalLessonRecord[]
  sessionNumberByLessonId: Record<string, number>
  packageTally: SessionPackageTally
}

const MEMBER_LESSON_FETCH_LIMIT = 500

const LESSON_SELECT = `
  id,
  lesson_date,
  start_time,
  end_time,
  lesson_type,
  attendance_status,
  session_deducted,
  lesson_no,
  content,
  special_note,
  created_at,
  instructor:instructors(id, name),
  lesson_sessions(checked_in_at, signature_data)
`

export async function loadMemberLessonRecords(
  memberId: string,
): Promise<MemberLessonRecordsData> {
  const supabase = await createStaffDataClient()
  const todayKey = getTodayDateKey()

  const [packagesResult, lessonQuery, numberingQuery] = await Promise.all([
    getSessionPackages({ memberId }),
    supabase
      .from('lessons')
      .select(LESSON_SELECT)
      .eq('member_id', memberId)
      .or(`lesson_date.lte.${todayKey},session_deducted.eq.true`)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(MEMBER_LESSON_FETCH_LIMIT),
    supabase
      .from('lessons')
      .select(
        'id, lesson_date, start_time, created_at, lesson_no, session_deducted, attendance_status',
      )
      .eq('member_id', memberId)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true }),
  ])

  if (lessonQuery.error) {
    console.error('Error fetching member lesson records:', lessonQuery.error.message)
  }

  const lessons = filterLessonsForRecentRecords(
    (lessonQuery.data ?? []) as MemberPortalLessonRecord[],
  )
  const sessionNumberByLessonId = Object.fromEntries(
    buildLessonSessionNumberMap(numberingQuery.data ?? [], { packageOnly: true }),
  )
  const packageTally = linkPackageTallyToSessions(
    packagesResult.data,
    sessionNumberByLessonId,
  )

  return { lessons, sessionNumberByLessonId, packageTally }
}
