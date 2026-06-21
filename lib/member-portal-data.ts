import { getCenterSettings } from '@/lib/actions/center-settings'
import { getMemberBodyRecords } from '@/lib/actions/member-body-records'
import {
  getLessonSessionsForMember,
  getNextLessonForMember,
  getSessionTransactionsForMember,
} from '@/lib/actions/lesson-sessions'
import { getLessons } from '@/lib/actions/lessons'
import { getSessionPackages } from '@/lib/actions/sessions'
import {
  buildCenterContactView,
  buildCoachContactView,
} from '@/lib/center-contact'
import { buildMemberPortalSessionStatus } from '@/lib/member-portal-session-status'
import { buildMemberPortalSummary } from '@/lib/member-portal-summary'
import type { MemberPortalData } from '@/lib/member-portal-types'
import { toVisibleSnsAccount } from '@/lib/sns-account'
import type { Lesson, LessonSession, Member } from '@/lib/types'

function resolveRecentAttendanceDate(
  recentSessions: LessonSession[],
  recentLessons: Lesson[],
): string | null {
  return (
    recentSessions[0]?.session_date ??
    recentLessons.find((lesson) => lesson.attendance_status === 'present')
      ?.lesson_date ??
    recentLessons[0]?.lesson_date ??
    null
  )
}

export async function loadMemberPortalData(member: Member): Promise<MemberPortalData> {
  const [
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
    centerSettings,
    bodyData,
    packagesResult,
  ] = await Promise.all([
    getNextLessonForMember(member.id),
    getLessons({ memberId: member.id, limit: 10, upToNow: true }),
    getLessonSessionsForMember(member.id, 10),
    getSessionTransactionsForMember(member.id, 15),
    getCenterSettings(),
    getMemberBodyRecords(member.id, {
      weight_kg: member.weight_kg,
      height_cm: member.height_cm,
      registered_at: member.registered_at,
      body_baseline_recorded_at: member.body_baseline_recorded_at,
    }),
    getSessionPackages({ memberId: member.id }),
  ])

  const instructor = member.primary_instructor
  const centerContact = buildCenterContactView(centerSettings)
  const coachContact = buildCoachContactView(
    instructor?.name ?? '자율배정',
    instructor?.phone,
    centerContact.showInstructorContact,
  )

  return {
    member,
    instructorAccount: instructor
      ? toVisibleSnsAccount(instructor.name, {
          kakaoId: instructor.kakao_id,
          instagramId: instructor.instagram_id,
          blogUrl: instructor.blog_url,
        })
      : null,
    centerAccount: toVisibleSnsAccount(centerSettings.name, {
      kakaoId: centerSettings.kakao_id,
      instagramId: centerSettings.instagram_id,
      blogUrl: centerSettings.blog_url,
    }),
    centerContact,
    coachContact,
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
    bodyRecords: bodyData.records,
    bodyTableReady: bodyData.tableReady,
    summary: buildMemberPortalSummary(
      bodyData.records,
      resolveRecentAttendanceDate(recentSessions, recentLessons),
    ),
    sessionStatus: buildMemberPortalSessionStatus(member, packagesResult.data),
  }
}
