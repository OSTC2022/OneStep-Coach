'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth, getMemberForCurrentUser } from './auth'
import {
  getLessonSessionsForMember,
  getNextLessonForMember,
  getSessionTransactionsForMember,
} from './lesson-sessions'
import { getLessons } from './lessons'
import { getCenterSettings } from './center-settings'
import { getMemberBodyRecords } from './member-body-records'
import {
  buildMemberPortalSummary,
  type MemberPortalSummary,
} from '@/lib/member-portal-summary'
import {
  buildCenterContactView,
  buildCoachContactView,
  type MemberCenterContactView,
  type MemberCoachContactView,
} from '@/lib/center-contact'
import { toVisibleSnsAccount, type VisibleSnsAccount } from '@/lib/sns-account'
import type { Lesson, LessonSession, Member, SessionTransaction } from '@/lib/types'

export type {
  VisibleSnsAccount,
  MemberPortalSummary,
  MemberCenterContactView,
  MemberCoachContactView,
}

export type MemberPortalData = {
  member: Member
  instructorAccount: VisibleSnsAccount | null
  centerAccount: VisibleSnsAccount | null
  centerContact: MemberCenterContactView
  coachContact: MemberCoachContactView
  nextLesson: Lesson | null
  recentLessons: Lesson[]
  recentSessions: LessonSession[]
  transactions: SessionTransaction[]
  bodyRecords: MemberBodyRecord[]
  bodyTableReady: boolean
  summary: MemberPortalSummary
}

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

export async function getMemberPortalData(): Promise<MemberPortalData | null> {
  await requireAuth()
  const member = await getMemberForCurrentUser()
  if (!member) return null

  const [nextLesson, recentLessons, recentSessions, transactions, centerSettings, bodyData] =
    await Promise.all([
      getNextLessonForMember(member.id),
      getLessons({ memberId: member.id, limit: 10, upToNow: true }),
      getLessonSessionsForMember(member.id, 10),
      getSessionTransactionsForMember(member.id, 15),
      getCenterSettings(),
      getMemberBodyRecords(member.id, {
        weight_kg: member.weight_kg,
        height_cm: member.height_cm,
        registered_at: member.registered_at,
      }),
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
  }
}

export async function getMemberRemainingSessions(memberId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('members')
    .select('remaining_sessions')
    .eq('id', memberId)
    .single()

  if (data?.remaining_sessions != null) return data.remaining_sessions

  const { data: packages } = await supabase
    .from('session_packages')
    .select('remaining_sessions')
    .eq('member_id', memberId)
    .eq('is_active', true)

  return (packages ?? []).reduce(
    (sum, pkg) => sum + (pkg.remaining_sessions ?? 0),
    0,
  )
}
