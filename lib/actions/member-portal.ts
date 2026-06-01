'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth, getMemberForCurrentUser } from './auth'
import {
  getLessonSessionsForMember,
  getNextLessonForMember,
  getSessionTransactionsForMember,
} from './lesson-sessions'
import { getLessons } from './lessons'
import type { Lesson, LessonSession, Member, SessionTransaction } from '@/lib/types'

export type MemberPortalData = {
  member: Member
  nextLesson: Lesson | null
  recentLessons: Lesson[]
  recentSessions: LessonSession[]
  transactions: SessionTransaction[]
}

export async function getMemberPortalData(): Promise<MemberPortalData | null> {
  await requireAuth()
  const member = await getMemberForCurrentUser()
  if (!member) return null

  const [nextLesson, recentLessons, recentSessions, transactions] = await Promise.all([
    getNextLessonForMember(member.id),
    getLessons({ memberId: member.id, limit: 10 }),
    getLessonSessionsForMember(member.id, 10),
    getSessionTransactionsForMember(member.id, 15),
  ])

  return {
    member,
    nextLesson,
    recentLessons,
    recentSessions,
    transactions,
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
