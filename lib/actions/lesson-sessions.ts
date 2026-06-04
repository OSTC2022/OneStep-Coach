'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { AttendanceStatus, Lesson, LessonSession, SessionTransaction } from '@/lib/types'
import { requireRole } from './auth'

type CheckInResult = {
  success?: boolean
  lesson_session_id?: string
  member_remaining_sessions?: number
  error?: string
}

export async function checkInLesson(
  lessonId: string,
  status: AttendanceStatus = 'present',
  options?: {
    signatureData?: string
    signatureUrl?: string
    notes?: string
  },
): Promise<{ data?: CheckInResult; error?: string }> {
  await requireRole(['admin', 'instructor'])

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('check_in_lesson', {
    p_lesson_id: lessonId,
    p_status: status,
    p_signature_data: options?.signatureData ?? null,
    p_signature_url: options?.signatureUrl ?? null,
    p_notes: options?.notes ?? null,
  })

  if (error) {
    console.error('checkInLesson RPC error:', error)
    if (error.code === 'PGRST202') {
      return {
        error:
          'check_in_lesson 함수가 없습니다. supabase/add-auth-roles-mvp.sql 을 실행해주세요.',
      }
    }
    return { error: error.message }
  }

  const result = data as CheckInResult
  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')

  return { data: result }
}

export async function getLessonSessionsForMember(
  memberId: string,
  limit = 20,
): Promise<LessonSession[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lesson_sessions')
    .select('*, instructor:instructors(*), lesson:lessons(*)')
    .eq('member_id', memberId)
    .order('session_date', { ascending: false })
    .order('checked_in_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getLessonSessionsForMember:', error)
    return []
  }

  return data as LessonSession[]
}

export async function getSessionTransactionsForMember(
  memberId: string,
  limit = 30,
): Promise<SessionTransaction[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('session_transactions')
    .select('id, member_id, session_package_id, lesson_id, instructor_id, delta, balance_after, reason, note, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getSessionTransactionsForMember:', error)
    return []
  }

  return data as SessionTransaction[]
}

export async function getNextLessonForMember(memberId: string): Promise<Lesson | null> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('lessons')
    .select('*, instructor:instructors(*)')
    .eq('member_id', memberId)
    .gte('lesson_date', today)
    .neq('attendance_status', 'cancelled')
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('getNextLessonForMember:', error)
    return null
  }

  return (data as Lesson | null) ?? null
}
