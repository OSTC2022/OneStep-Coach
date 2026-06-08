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
import { getMemberBodyRecords, type MemberBodyRecord } from './member-body-records'
import { toVisibleSnsAccount, type VisibleSnsAccount } from '@/lib/sns-account'
import type { Lesson, LessonSession, Member, SessionTransaction } from '@/lib/types'

export type { VisibleSnsAccount }

export type MemberPortalData = {
  member: Member
  instructorAccount: VisibleSnsAccount | null
  centerAccount: VisibleSnsAccount | null
  nextLesson: Lesson | null
  recentLessons: Lesson[]
  recentSessions: LessonSession[]
  transactions: SessionTransaction[]
  bodyRecords: MemberBodyRecord[]
  bodyTableReady: boolean
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
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
    bodyRecords: bodyData.records,
    bodyTableReady: bodyData.tableReady,
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
