import { requireMemberViewer } from '@/lib/auth/member-access'
import { getMember } from '@/lib/actions/members'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import { getMemberAccountEmail } from '@/lib/actions/member-account'
import { getDeletedSessionPackagesCount, getSessionPackages } from '@/lib/actions/sessions'
import {
  buildLessonSessionNumberMap,
  filterLessonsForRecentRecords,
  getTodayDateKey,
} from '@/lib/lesson-record-utils'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { notFound } from 'next/navigation'
import { MemberDetail } from './member-detail'

const MEMBER_LESSON_FETCH_LIMIT = 500

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { canManage } = await requireMemberViewer()
  const { id } = await params
  const [member, packagesResult, trashCount, accountEmailInfo] = await Promise.all([
    getMember(id),
    getSessionPackages({ memberId: id }),
    getDeletedSessionPackagesCount(id),
    getMemberAccountEmail(id),
  ])
  const sessionPackages = packagesResult.data

  if (!member) {
    notFound()
  }

  const supabase = await createStaffDataClient()
  const todayKey = getTodayDateKey()

  const lessonSelect = `
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

  const lessonQuery = await supabase
    .from('lessons')
    .select(lessonSelect)
    .eq('member_id', id)
    .or(`lesson_date.lte.${todayKey},session_deducted.eq.true`)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(MEMBER_LESSON_FETCH_LIMIT)

  let lessonRows = lessonQuery.data

  if (lessonQuery.error) {
    console.error('Error fetching member lessons:', lessonQuery.error.message)
    const fallback = await supabase
      .from('lessons')
      .select(
        `id, lesson_date, start_time, end_time, lesson_type, attendance_status, session_deducted, lesson_no, content, special_note, created_at, instructor:instructors(id, name)`,
      )
      .eq('member_id', id)
      .or(`lesson_date.lte.${todayKey},session_deducted.eq.true`)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(MEMBER_LESSON_FETCH_LIMIT)
    if (!fallback.error) {
      lessonRows = fallback.data
    }
  }

  const { data: numberingLessons } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, created_at, lesson_no, session_deducted, attendance_status',
    )
    .eq('member_id', id)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true })

  const lessons = filterLessonsForRecentRecords(lessonRows ?? [])
  const sessionNumberByLessonId = buildLessonSessionNumberMap(numberingLessons ?? [], {
    packageOnly: true,
  })

  const { records: bodyRecords, tableReady: bodyTableReady } =
    await getMemberBodyRecords(member.id, {
      weight_kg: member.weight_kg,
      height_cm: member.height_cm,
      registered_at: member.registered_at,
    })

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <MemberDetail
        member={member}
        sessionPackages={sessionPackages}
        lessons={lessons}
        sessionNumberByLessonId={Object.fromEntries(sessionNumberByLessonId)}
        initialTrashCount={trashCount}
        accountEmail={accountEmailInfo.email}
        accountEmailSource={accountEmailInfo.source}
        bodyRecords={bodyRecords}
        bodyTableReady={bodyTableReady}
        canManage={canManage}
      />
    </div>
  )
}
