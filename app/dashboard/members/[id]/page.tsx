import {
  canAddBodyRecordFor,
  canEditMemberBasicInfoFor,
  requireMemberViewer,
} from '@/lib/auth/member-access'
import { canSavePhysicalBaseline, canViewPhysicalEditButton } from '@/lib/roles'
import { getMember } from '@/lib/actions/members'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { toVisibleSnsAccount } from '@/lib/sns-account'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import { getMemberAccountEmail, getMemberLinkedProfileRole } from '@/lib/actions/member-account'
import { getDeletedSessionPackagesCount, getSessionPackages } from '@/lib/actions/sessions'
import {
  buildLessonSessionNumberMap,
  filterLessonsForRecentRecords,
  getTodayDateKey,
} from '@/lib/lesson-record-utils'
import { getMemberRunningLeagueHomeForStaff } from '@/lib/actions/running-league'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { notFound } from 'next/navigation'
import { MemberDetail } from './member-detail'

export const dynamic = 'force-dynamic'

const MEMBER_LESSON_FETCH_LIMIT = 500

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { canManage, role } = await requireMemberViewer()
  const { id } = await params
  const linkedProfileRole = await getMemberLinkedProfileRole(id)
  const [member, packagesResult, trashCount, accountEmailInfo, canEditBasicInfo, centerSettings, canAddBodyRecord, runningLeagueHome] =
    await Promise.all([
    getMember(id),
    getSessionPackages({ memberId: id }),
    getDeletedSessionPackagesCount(id),
    getMemberAccountEmail(id),
    canEditMemberBasicInfoFor(id),
    getCenterSettings(),
    canAddBodyRecordFor(id),
    linkedProfileRole === 'adult_member'
      ? getMemberRunningLeagueHomeForStaff(id)
      : Promise.resolve(null),
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
      body_baseline_recorded_at: member.body_baseline_recorded_at,
    })

  const instructor = member.primary_instructor
  const instructorAccount = instructor
    ? toVisibleSnsAccount(instructor.name, {
        kakaoId: instructor.kakao_id,
        instagramId: instructor.instagram_id,
        blogUrl: instructor.blog_url,
      })
    : null
  const centerAccount = toVisibleSnsAccount(centerSettings.name, {
    kakaoId: centerSettings.kakao_id,
    instagramId: centerSettings.instagram_id,
    blogUrl: centerSettings.blog_url,
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
        canEditBasicInfo={canEditBasicInfo}
        canShowPhysicalEditButton={canViewPhysicalEditButton(role)}
        canSavePhysicalInitial={canSavePhysicalBaseline(role)}
        canAddBodyRecord={canAddBodyRecord}
        instructorAccount={instructorAccount}
        centerAccount={centerAccount}
        linkedProfileRole={linkedProfileRole}
        runningLeagueHome={runningLeagueHome}
      />
    </div>
  )
}
