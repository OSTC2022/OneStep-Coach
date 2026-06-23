'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import {
  revalidateLessonAttendanceViews,
  revalidateLessonAttendanceWithCalendar,
  revalidateSessionDeductionPaths,
} from '@/lib/dashboard-revalidate'
import { syncTrialLessonPayOverride } from '@/lib/trial-lesson-pay-sync'
import type { AttendanceStatus, Lesson, LessonSession, SessionTransaction } from '@/lib/types'
import { getLessonCalendarDisplayParts, resolveLessonTitle } from '@/lib/calendar-utils'
import { countsTowardSessionNumber, getTodayDateKey } from '@/lib/lesson-record-utils'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import {
  adjustSessionPackageRemaining,
  querySessionPackageIdForDeduction,
} from '@/lib/actions/sessions'
import {
  getSessionPackageOverageCount,
  isMonthlyUnlimitedSessions,
} from '@/lib/session-package-utils'
import { isAthleticsClubLessonType } from '@/lib/lesson-types'
import {
  mergeGroupAttendanceNote,
  parseGroupAttendanceCheckedInAt,
  stripGroupAttendanceNote,
} from '@/lib/group-lesson-attendance'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canRoleSetAttendanceStatus } from '@/lib/roles'
import { requireRole } from './auth'

type CheckInResult = {
  success?: boolean
  lesson_session_id?: string
  lesson_id?: string
  member_remaining_sessions?: number
  session_package_remaining?: number
  session_overage?: number
  no_session_package?: boolean
  error?: string
}

async function resolveLessonIdForAttendanceWrite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string,
): Promise<{ lessonId: string; error?: string }> {
  const { resolvePersistedLessonIdForWrite } = await import(
    '@/lib/actions/materialize-virtual-lesson'
  )
  const resolved = await resolvePersistedLessonIdForWrite(supabase, lessonId)
  if (resolved.error) return { lessonId, error: resolved.error }
  return { lessonId: resolved.lessonId }
}

function attendanceWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return null
  }
}

function isMissingTableError(message?: string) {
  return Boolean(
    message?.includes('Could not find the table') ||
      message?.includes('lesson_sessions') ||
      message?.includes('session_transactions') ||
      message?.includes('signatures'),
  )
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
  const user = await requireRole(['admin', 'instructor'])

  if (!canRoleSetAttendanceStatus(user.role, status)) {
    return { error: '이 출석 상태를 변경할 권한이 없습니다.' }
  }

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const { data: lessonRow, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, session_package_id, lesson_date, session_deducted, attendance_status, title, content',
    )
    .eq('id', lessonId)
    .single()

  if (lessonError || !lessonRow) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  const memberId = await ensureLessonMemberLinked(supabase, lessonRow)
  if (!memberId) {
    return { error: '회원이 연결되지 않은 수업입니다. 회원 검색에서 선택해 등록해주세요.' }
  }

  const lesson = { ...lessonRow, member_id: memberId }
  const sessionPackageId = await resolveSessionPackageId(supabase, lesson)

  const now = new Date().toISOString()
  const sessionUpdate = {
    status,
    checked_in_at: now,
    checked_in_by: user.id,
    ...(options?.notes ? { notes: options.notes } : {}),
    ...(options?.signatureData ? { signature_data: options.signatureData } : {}),
    ...(options?.signatureUrl ? { signature_url: options.signatureUrl } : {}),
    updated_at: now,
  }

  let sessionId: string | undefined

  const { data: existingSession, error: existingError } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (!existingError) {
    if (existingSession?.id) {
      sessionId = existingSession.id
      const { error } = await supabase
        .from('lesson_sessions')
        .update(sessionUpdate)
        .eq('id', existingSession.id)
      if (error && !isMissingTableError(error.message)) {
        console.warn('lesson_sessions update:', error.message)
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('lesson_sessions')
        .insert({
          lesson_id: lessonId,
          member_id: lesson.member_id,
          instructor_id: lesson.instructor_id,
          session_package_id: sessionPackageId,
          session_date: lesson.lesson_date,
          ...sessionUpdate,
        })
        .select('id')
        .single()

      if (error) {
        if (!isMissingTableError(error.message)) {
          console.warn('lesson_sessions insert:', error.message)
        }
      } else {
        sessionId = inserted.id
      }
    }
  }

  let memberRemaining: number | undefined

  if (status === 'present' && sessionPackageId) {
    if (!lesson.session_deducted) {
      const deduct = await tryDeductLessonSessionOnce(supabase, {
        lessonId,
        memberId: lesson.member_id,
        sessionPackageId,
        userId: user.id,
        reason: 'lesson_check_in',
        lessonSessionId: sessionId,
      })

      if (deduct.error) {
        return { error: deduct.error }
      }

      memberRemaining = deduct.memberRemaining
    }

    const lessonUpdatePayload: Record<string, unknown> = {
      attendance_status: status,
      session_deducted: true,
    }
    if (sessionPackageId) {
      lessonUpdatePayload.session_package_id = sessionPackageId
    }

    const { error: lessonUpdateError } = await supabase
      .from('lessons')
      .update(lessonUpdatePayload)
      .eq('id', lessonId)

    if (lessonUpdateError) {
      if (
        lessonUpdateError.message.includes('row-level security') ||
        lessonUpdateError.message.includes('permission denied')
      ) {
        return {
          error:
            '출석 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/fix-check-in-lesson.sql 을 실행해주세요.',
        }
      }
      return { error: lessonUpdateError.message }
    }
  } else {
    const { error: lessonUpdateError } = await supabase
      .from('lessons')
      .update({ attendance_status: status })
      .eq('id', lessonId)

    if (lessonUpdateError) {
      if (
        lessonUpdateError.message.includes('row-level security') ||
        lessonUpdateError.message.includes('permission denied')
      ) {
        return {
          error:
            '출석 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/fix-check-in-lesson.sql 을 실행해주세요.',
        }
      }
      return { error: lessonUpdateError.message }
    }
  }

  if (status === 'present' && sessionPackageId) {
    revalidateSessionDeductionPaths(lesson.member_id)
  } else {
    revalidateLessonAttendanceWithCalendar()
  }

  return {
    data: {
      success: true,
      lesson_session_id: sessionId,
      member_remaining_sessions: memberRemaining,
    },
  }
}

/** 출석/취소만 변경 (세션 차감 없음) — 수업현황용 */
export async function updateLessonAttendanceStatus(
  lessonId: string,
  status: AttendanceStatus,
): Promise<{ data?: CheckInResult; error?: string }> {
  const user = await requireRole(['admin', 'instructor'])

  if (!canRoleSetAttendanceStatus(user.role, status)) {
    return { error: '이 출석 상태를 변경할 권한이 없습니다.' }
  }

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const resolved = await resolveLessonIdForAttendanceWrite(supabase, lessonId)
  if (resolved.error) {
    return { error: resolved.error }
  }
  const persistedLessonId = resolved.lessonId

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, session_package_id, lesson_date, session_deducted, attendance_status',
    )
    .eq('id', persistedLessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (!lesson.member_id) {
    return { error: '회원이 연결되지 않은 수업입니다.' }
  }

  const sessionPackageId = await resolveSessionPackageId(supabase, lesson)

  const now = new Date().toISOString()
  const sessionUpdate = {
    status,
    checked_in_at: now,
    checked_in_by: user.id,
    updated_at: now,
  }

  let sessionId: string | undefined

  const { data: existingSession, error: existingError } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', persistedLessonId)
    .maybeSingle()

  if (!existingError) {
    if (existingSession?.id) {
      sessionId = existingSession.id
      const { error } = await supabase
        .from('lesson_sessions')
        .update(sessionUpdate)
        .eq('id', existingSession.id)
      if (error && !isMissingTableError(error.message)) {
        console.warn('lesson_sessions update:', error.message)
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('lesson_sessions')
        .insert({
          lesson_id: persistedLessonId,
          member_id: lesson.member_id,
          instructor_id: lesson.instructor_id,
          session_package_id: sessionPackageId,
          session_date: lesson.lesson_date,
          ...sessionUpdate,
        })
        .select('id')
        .single()

      if (error) {
        if (!isMissingTableError(error.message)) {
          console.warn('lesson_sessions insert:', error.message)
        }
      } else {
        sessionId = inserted.id
      }
    }
  }

  const lessonUpdatePayload: Record<string, unknown> = {
    attendance_status: status,
  }
  if (sessionPackageId) {
    lessonUpdatePayload.session_package_id = sessionPackageId
  }

  const { error: lessonUpdateError } = await supabase
    .from('lessons')
    .update(lessonUpdatePayload)
    .eq('id', persistedLessonId)

  if (lessonUpdateError) {
    if (
      lessonUpdateError.message.includes('row-level security') ||
      lessonUpdateError.message.includes('permission denied')
    ) {
      return {
        error:
          '출석 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/fix-check-in-lesson.sql 을 실행해주세요.',
      }
    }
    return { error: lessonUpdateError.message }
  }

  revalidateLessonAttendanceWithCalendar()
  revalidatePath('/dashboard/members')
  if (lesson.member_id) {
    revalidatePath(`/dashboard/members/${lesson.member_id}`)
  }

  return {
    data: {
      success: true,
      lesson_session_id: sessionId,
      lesson_id: persistedLessonId !== lessonId ? persistedLessonId : undefined,
    },
  }
}

/** 출석 체크만 취소 (종료·서명 전) — 출석 버튼 재탭용 */
export async function clearLessonAttendanceCheck(
  lessonId: string,
): Promise<{ data?: CheckInResult; error?: string }> {
  const user = await requireRole(['admin', 'instructor'])

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const resolved = await resolveLessonIdForAttendanceWrite(supabase, lessonId)
  if (resolved.error) {
    return { error: resolved.error }
  }
  const persistedLessonId = resolved.lessonId

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, session_package_id, lesson_date, session_deducted, end_time',
    )
    .eq('id', persistedLessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (!lesson.member_id) {
    return { error: '회원이 연결되지 않은 수업입니다.' }
  }

  if (lesson.session_deducted && lesson.end_time) {
    return {
      error: '종료된 수업은 출석만 취소할 수 없습니다. 종료 취소를 이용해주세요.',
    }
  }

  const { data: existingSession } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', persistedLessonId)
    .maybeSingle()

  const { error: sessionDeleteError } = await supabase
    .from('lesson_sessions')
    .delete()
    .eq('lesson_id', persistedLessonId)

  if (sessionDeleteError && !isMissingTableError(sessionDeleteError.message)) {
    return { error: sessionDeleteError.message }
  }

  let memberRemaining: number | undefined
  const lessonUpdatePayload: Record<string, unknown> = {
    attendance_status: 'present',
  }

  if (lesson.session_deducted && !lesson.end_time) {
    lessonUpdatePayload.session_deducted = false

    const sessionPackageId =
      lesson.session_package_id ??
      (await resolveSessionPackageId(supabase, lesson))

    if (sessionPackageId) {
      const reconcile = await adjustSessionPackageRemaining(sessionPackageId, 1)
      if (reconcile.error) {
        return { error: reconcile.error }
      }

      const { error: txError } = await supabase.from('session_transactions').insert({
        member_id: lesson.member_id,
        session_package_id: sessionPackageId,
        lesson_session_id: existingSession?.id ?? null,
        delta: 1,
        balance_after: reconcile.remaining ?? null,
        reason: 'lesson_check_in_cancel',
        created_by: user.id,
      })

      if (txError && !isMissingTableError(txError.message)) {
        console.warn('session_transactions insert:', txError.message)
      }

      const { data: member } = await supabase
        .from('members')
        .select('remaining_sessions')
        .eq('id', lesson.member_id)
        .single()
      memberRemaining = member?.remaining_sessions ?? undefined
    }
  }

  const { error: lessonUpdateError } = await supabase
    .from('lessons')
    .update(lessonUpdatePayload)
    .eq('id', persistedLessonId)

  if (lessonUpdateError) {
    return { error: lessonUpdateError.message }
  }

  if (lesson.session_deducted && !lesson.end_time) {
    revalidateSessionDeductionPaths(lesson.member_id)
  } else {
    revalidateLessonAttendanceWithCalendar()
    revalidatePath('/dashboard/members')
    if (lesson.member_id) {
      revalidatePath(`/dashboard/members/${lesson.member_id}`)
    }
  }

  return {
    data: {
      success: true,
      member_remaining_sessions: memberRemaining,
      lesson_id: persistedLessonId !== lessonId ? persistedLessonId : undefined,
    },
  }
}

function normalizeEndTime(value: string) {
  const trimmed = value.trim()
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed
  return null
}

function isEndAfterStart(startTime: string | null, endTime: string) {
  if (!startTime) return true
  const [sh, sm] = startTime.slice(0, 5).split(':').map(Number)
  const [eh, em] = endTime.slice(0, 5).split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return true
  return eh * 60 + em > sh * 60 + sm
}

async function lookupMemberIdByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('members')
    .select('id')
    .eq('name', trimmed)
    .limit(2)

  if (error || !data || data.length !== 1) return null
  return data[0].id
}

async function ensureLessonMemberLinked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lesson: {
    id: string
    member_id: string | null
    title?: string | null
    content?: string | null
  },
): Promise<string | null> {
  if (lesson.member_id) return lesson.member_id

  const label = resolveLessonTitle(lesson)
  if (!label) return null

  const memberId = await lookupMemberIdByName(
    supabase,
    extractMemberNameFromCalendarLabel(label),
  )
  if (!memberId) return null

  const { error } = await supabase
    .from('lessons')
    .update({ member_id: memberId })
    .eq('id', lesson.id)

  if (error) {
    console.warn('ensureLessonMemberLinked:', error.message)
    return null
  }

  return memberId
}

async function resolveSessionPackageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lesson: {
    member_id: string
  },
) {
  return querySessionPackageIdForDeduction(supabase, lesson.member_id)
}

async function tryDeductLessonSessionOnce(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    lessonId: string
    memberId: string
    sessionPackageId: string
    userId: string
    reason: 'lesson_check_in' | 'lesson_complete'
    lessonSessionId?: string
  },
): Promise<{
  deducted: boolean
  newRemaining?: number
  memberRemaining?: number
  sessionOverage?: number
  noSessionPackage?: boolean
  error?: string
}> {
  const {
    lessonId,
    memberId,
    sessionPackageId,
    userId,
    reason,
    lessonSessionId,
  } = params

  const { data: pkg, error: pkgError } = await supabase
    .from('session_packages')
    .select('remaining_sessions, note, expires_at, is_active')
    .eq('id', sessionPackageId)
    .single()

  if (pkgError || !pkg) {
    return { deducted: false, error: '수업권을 찾을 수 없습니다.' }
  }

  const unlimited = isMonthlyUnlimitedSessions(pkg.note)

  const claimPayload: Record<string, unknown> = {
    session_deducted: true,
    session_package_id: sessionPackageId,
  }

  const { data: claimed, error: claimError } = await supabase
    .from('lessons')
    .update(claimPayload)
    .eq('id', lessonId)
    .eq('session_deducted', false)
    .select('id')
    .maybeSingle()

  if (claimError) {
    return { deducted: false, error: claimError.message }
  }

  if (!claimed) {
    return { deducted: false }
  }

  if (unlimited) {
    const { data: member } = await supabase
      .from('members')
      .select('remaining_sessions')
      .eq('id', memberId)
      .single()

    return {
      deducted: true,
      newRemaining: pkg.remaining_sessions,
      memberRemaining: member?.remaining_sessions ?? undefined,
    }
  }

  const reconcile = await adjustSessionPackageRemaining(sessionPackageId, -1)

  if (reconcile.error || reconcile.remaining == null) {
    await supabase.from('lessons').update({ session_deducted: false }).eq('id', lessonId)
    return { deducted: false, error: reconcile.error ?? '잔여 횟수 계산에 실패했습니다.' }
  }

  const { error: txError } = await supabase.from('session_transactions').insert({
    member_id: memberId,
    session_package_id: sessionPackageId,
    lesson_session_id: lessonSessionId ?? null,
    delta: -1,
    balance_after: reconcile.remaining,
    reason,
    created_by: userId,
  })

  if (txError && !isMissingTableError(txError.message)) {
    console.warn('session_transactions insert:', txError.message)
  }

  if (lessonSessionId) {
    await supabase
      .from('lesson_sessions')
      .update({ session_deducted: true })
      .eq('id', lessonSessionId)
  }

  const { data: member } = await supabase
    .from('members')
    .select('remaining_sessions')
    .eq('id', memberId)
    .single()

  return {
    deducted: true,
    newRemaining: reconcile.remaining,
    memberRemaining: member?.remaining_sessions ?? undefined,
    sessionOverage: getSessionPackageOverageCount(reconcile.remaining),
  }
}

/** 수업 종료 — 서명 + 종료 시간 저장 + 세션 1회 차감 */
export async function completeLessonWithSignature(
  lessonId: string,
  signatureData: string,
  endTime: string,
): Promise<{
  data?: {
    id: string
    end_time: string
    session_deducted: boolean
    attendance_status: AttendanceStatus
    signature_id: string | null
    member_remaining_sessions?: number
    session_package_remaining?: number
    session_overage?: number
    no_session_package?: boolean
  }
  error?: string
}> {
  const user = await requireRole(['admin', 'instructor'])

  if (!signatureData?.startsWith('data:image')) {
    return { error: '서명이 필요합니다.' }
  }

  const normalizedEndTime = normalizeEndTime(endTime)
  if (!normalizedEndTime) {
    return { error: '종료 시간 형식이 올바르지 않습니다.' }
  }

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const resolved = await resolveLessonIdForAttendanceWrite(supabase, lessonId)
  if (resolved.error) {
    return { error: resolved.error }
  }
  const persistedLessonId = resolved.lessonId

  const { data: lessonRow, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, session_package_id, lesson_date, session_deducted, attendance_status, end_time, lesson_no, title, content',
    )
    .eq('id', persistedLessonId)
    .single()

  if (lessonError || !lessonRow) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  const memberId = await ensureLessonMemberLinked(supabase, lessonRow)
  if (!memberId) {
    return { error: '회원이 연결되지 않은 수업입니다. 회원 검색에서 선택해 등록해주세요.' }
  }

  const lesson = { ...lessonRow, member_id: memberId }

  if (lesson.session_deducted && lesson.end_time) {
    return { error: '이미 종료 처리된 수업입니다.' }
  }

  if (lesson.attendance_status === 'cancelled') {
    return { error: '취소된 수업은 종료할 수 없습니다.' }
  }

  if (!isEndAfterStart(lesson.start_time ?? null, normalizedEndTime)) {
    return { error: '종료 시간은 시작 시간 이후여야 합니다.' }
  }

  const now = new Date().toISOString()
  let signatureId: string | null = null

  const { data: signature, error: signatureError } = await supabase
    .from('signatures')
    .insert({
      member_id: lesson.member_id,
      lesson_id: persistedLessonId,
      signature_data: signatureData,
      signed_at: now,
    })
    .select('id')
    .single()

  if (signatureError) {
    if (isMissingTableError(signatureError.message)) {
      console.warn('signatures table missing — storing signature in lesson_sessions only')
    } else if (
      signatureError.message.includes('row-level security') ||
      signatureError.message.includes('permission denied')
    ) {
      return {
        error:
          '서명 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/add-signatures.sql 을 실행해주세요.',
      }
    } else if (signatureError.message.includes('signature_id')) {
      console.warn('lessons.signature_id unavailable — skipping signature_id link')
    } else {
      return { error: signatureError.message }
    }
  } else {
    signatureId = signature.id
  }

  let sessionId: string | undefined
  const { data: existingSession } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', persistedLessonId)
    .maybeSingle()

  const sessionPackageId = await resolveSessionPackageId(supabase, lesson)
  const sessionPayload = {
    status: 'present' as AttendanceStatus,
    checked_in_at: now,
    checked_in_by: user.id,
    signature_data: signatureData,
    updated_at: now,
  }

  if (existingSession?.id) {
    sessionId = existingSession.id
    await supabase
      .from('lesson_sessions')
      .update(sessionPayload)
      .eq('id', existingSession.id)
  } else {
    const { data: inserted } = await supabase
      .from('lesson_sessions')
      .insert({
        lesson_id: persistedLessonId,
        member_id: lesson.member_id,
        instructor_id: lesson.instructor_id,
        session_package_id: sessionPackageId,
        session_date: lesson.lesson_date,
        ...sessionPayload,
      })
      .select('id')
      .single()
    sessionId = inserted?.id
  }

  let memberRemaining: number | undefined
  let sessionPackageRemaining: number | undefined
  let sessionOverage: number | undefined
  let noSessionPackage = false
  let sessionDeducted = lesson.session_deducted

  if (!lesson.session_deducted) {
    if (!sessionPackageId) {
      sessionDeducted = true
      sessionOverage = 1
      noSessionPackage = true
    } else {
      const deduct = await tryDeductLessonSessionOnce(supabase, {
        lessonId: persistedLessonId,
        memberId: lesson.member_id,
        sessionPackageId,
        userId: user.id,
        reason: 'lesson_complete',
        lessonSessionId: sessionId,
      })

      if (deduct.error) {
        return { error: deduct.error }
      }

      memberRemaining = deduct.memberRemaining
      sessionPackageRemaining = deduct.newRemaining
      sessionOverage = deduct.sessionOverage
      sessionDeducted = true
    }
  }

  const attendanceStatus: AttendanceStatus = 'present'

  const lessonUpdate: Record<string, unknown> = {
    end_time: normalizedEndTime,
    session_deducted: sessionDeducted,
    attendance_status: attendanceStatus,
  }

  if (signatureId) {
    lessonUpdate.signature_id = signatureId
  }

  if (sessionPackageId) {
    lessonUpdate.session_package_id = sessionPackageId
  }

  if (sessionDeducted && !lesson.lesson_no) {
    const { data: lastLesson } = await supabase
      .from('lessons')
      .select('lesson_no')
      .eq('member_id', lesson.member_id)
      .not('lesson_no', 'is', null)
      .order('lesson_no', { ascending: false })
      .limit(1)
      .maybeSingle()

    lessonUpdate.lesson_no = (lastLesson?.lesson_no || 0) + 1
  }

  const { data: updatedLesson, error: lessonUpdateError } = await supabase
    .from('lessons')
    .update(lessonUpdate)
    .eq('id', persistedLessonId)
    .select('id, end_time, session_deducted, attendance_status, signature_id')
    .single()

  if (lessonUpdateError) {
    if (
      lessonUpdateError.message.includes('row-level security') ||
      lessonUpdateError.message.includes('permission denied')
    ) {
      return {
        error:
          '수업 종료 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
      }
    }
    return { error: lessonUpdateError.message }
  }

  revalidateSessionDeductionPaths(lesson.member_id)

  return {
    data: {
      ...(updatedLesson as {
        id: string
        end_time: string
        session_deducted: boolean
        attendance_status: AttendanceStatus
        signature_id: string | null
      }),
      member_remaining_sessions: memberRemaining,
      session_package_remaining: sessionPackageRemaining,
      session_overage: sessionOverage,
      no_session_package: noSessionPackage || undefined,
    },
  }
}

/** 종료 시간 수정 (관리자) */
export async function updateLessonEndTime(
  lessonId: string,
  endTime: string,
): Promise<{
  data?: { id: string; end_time: string }
  error?: string
}> {
  await requireRole(['admin'])

  const normalizedEndTime = normalizeEndTime(endTime)
  if (!normalizedEndTime) {
    return { error: '종료 시간 형식이 올바르지 않습니다.' }
  }

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, start_time, end_time, session_deducted')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (!lesson.end_time || !lesson.session_deducted) {
    return { error: '종료 처리된 수업만 시간을 수정할 수 있습니다.' }
  }

  if (!isEndAfterStart(lesson.start_time ?? null, normalizedEndTime)) {
    return { error: '종료 시간은 시작 시간 이후여야 합니다.' }
  }

  const { data, error } = await supabase
    .from('lessons')
    .update({ end_time: normalizedEndTime })
    .eq('id', lessonId)
    .select('id, end_time')
    .single()

  if (error) {
    if (
      error.message.includes('row-level security') ||
      error.message.includes('permission denied')
    ) {
      return {
        error:
          '종료 시간 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
      }
    }
    return { error: error.message }
  }

  revalidateLessonAttendanceViews()

  return { data: data as { id: string; end_time: string } }
}

/** 수업 종료 취소 — 종료 시간·서명 제거 + 세션 차감 복구 */
export async function cancelLessonCompletion(lessonId: string): Promise<{
  data?: {
    id: string
    end_time: null
    session_deducted: boolean
    attendance_status: AttendanceStatus
    signature_id: null
    member_remaining_sessions?: number
  }
  error?: string
}> {
  const user = await requireRole(['admin', 'instructor'])

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, session_package_id, lesson_date, session_deducted, attendance_status, end_time, signature_id',
    )
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (!lesson.member_id) {
    return { error: '회원이 연결되지 않은 수업입니다.' }
  }

  if (!lesson.session_deducted || !lesson.end_time) {
    return { error: '종료 처리된 수업이 아닙니다.' }
  }

  const { data: existingSession } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', lessonId)
    .maybeSingle()

  let memberRemaining: number | undefined
  const sessionPackageId =
    lesson.session_package_id ??
    (await resolveSessionPackageId(supabase, lesson))

  if (existingSession?.id) {
    await supabase
      .from('lesson_sessions')
      .update({
        session_deducted: false,
        signature_data: null,
        signature_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingSession.id)
  }

  if (lesson.signature_id) {
    const { error: signatureDeleteError } = await supabase
      .from('signatures')
      .delete()
      .eq('id', lesson.signature_id)

    if (
      signatureDeleteError &&
      !isMissingTableError(signatureDeleteError.message)
    ) {
      console.warn('signatures delete:', signatureDeleteError.message)
    }
  }

  const { data: updatedLesson, error: lessonUpdateError } = await supabase
    .from('lessons')
    .update({
      end_time: null,
      session_deducted: false,
      signature_id: null,
    })
    .eq('id', lessonId)
    .select('id, end_time, session_deducted, attendance_status, signature_id')
    .single()

  if (lessonUpdateError) {
    if (
      lessonUpdateError.message.includes('row-level security') ||
      lessonUpdateError.message.includes('permission denied')
    ) {
      return {
        error:
          '수업 종료 취소 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
      }
    }
    return { error: lessonUpdateError.message }
  }

  if (sessionPackageId) {
    const reconcile = await adjustSessionPackageRemaining(sessionPackageId, 1)
    if (reconcile.error) {
      return { error: reconcile.error }
    }

    const { error: txError } = await supabase.from('session_transactions').insert({
      member_id: lesson.member_id,
      session_package_id: sessionPackageId,
      lesson_session_id: existingSession?.id ?? null,
      delta: 1,
      balance_after: reconcile.remaining ?? null,
      reason: 'lesson_complete_cancel',
      created_by: user.id,
    })

    if (txError && !isMissingTableError(txError.message)) {
      console.warn('session_transactions insert:', txError.message)
    }

    const { data: member } = await supabase
      .from('members')
      .select('remaining_sessions')
      .eq('id', lesson.member_id)
      .single()
    memberRemaining = member?.remaining_sessions ?? undefined
  }

  revalidateSessionDeductionPaths(lesson.member_id)

  return {
    data: {
      ...(updatedLesson as {
        id: string
        end_time: null
        session_deducted: boolean
        attendance_status: AttendanceStatus
        signature_id: null
      }),
      member_remaining_sessions: memberRemaining,
    },
  }
}

export type AthleticsClubAttendanceAction = 'present' | 'cancelled' | 'unset'

/** 육상부 등 회원 미연결 그룹 수업 — 출석/취소 (세션·회원 연동 없음) */
export async function updateAthleticsClubAttendanceStatus(
  lessonId: string,
  action: AthleticsClubAttendanceAction,
): Promise<{
  data?: {
    id: string
    lesson_type: string
    attendance_status: AttendanceStatus
    special_note: string | null
    checked_in_at?: string
    lesson_id?: string
  }
  error?: string
}> {
  const user = await requireRole(['admin', 'instructor'])

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const resolved = await resolveLessonIdForAttendanceWrite(supabase, lessonId)
  if (resolved.error) {
    return { error: resolved.error }
  }
  const persistedLessonId = resolved.lessonId

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, lesson_date, start_time, lesson_type, attendance_status, special_note',
    )
    .eq('id', persistedLessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (lesson.member_id) {
    return { error: '회원이 연결된 수업입니다.' }
  }

  if (!isAthleticsClubLessonType(lesson.lesson_type)) {
    return { error: '육상부 수업만 이 방식으로 출석 처리할 수 있습니다.' }
  }

  const now = new Date().toISOString()
  let attendanceStatus: AttendanceStatus = 'present'
  let specialNote: string | null = lesson.special_note
  let checkedInAt: string | undefined

  if (action === 'present') {
    checkedInAt = now
    specialNote = mergeGroupAttendanceNote(lesson.special_note, now)
  } else if (action === 'cancelled') {
    attendanceStatus = 'cancelled'
    specialNote = stripGroupAttendanceNote(lesson.special_note)
  } else {
    specialNote = stripGroupAttendanceNote(lesson.special_note)
  }

  const { data, error } = await supabase
    .from('lessons')
    .update({
      attendance_status: attendanceStatus,
      special_note: specialNote,
      lesson_type: lesson.lesson_type,
    })
    .eq('id', persistedLessonId)
    .select(
      'id, lesson_type, attendance_status, special_note, instructor_id, lesson_date, start_time',
    )
    .single()

  if (error) {
    if (
      error.message.includes('row-level security') ||
      error.message.includes('permission denied')
    ) {
      return {
        error:
          '저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
      }
    }
    return { error: error.message }
  }

  revalidateLessonAttendanceWithCalendar()
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')

  return {
    data: {
      ...(data as {
        id: string
        lesson_type: string
        attendance_status: AttendanceStatus
        special_note: string | null
      }),
      checked_in_at: checkedInAt ?? parseGroupAttendanceCheckedInAt(data?.special_note) ?? undefined,
      lesson_id: persistedLessonId !== lessonId ? persistedLessonId : undefined,
    },
  }
}

export type GuestLessonAction = 'trial' | 'cancelled' | 'unset'

/** 회원 미연결(캘린더 이름만 등록) 수업 — 출석 / 취소 */
export async function markGuestLessonStatus(
  lessonId: string,
  action: GuestLessonAction,
): Promise<{
  data?: { id: string; lesson_type: string; attendance_status: AttendanceStatus }
  error?: string
}> {
  const user = await requireRole(['admin', 'instructor'])

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createClient())

  const resolved = await resolveLessonIdForAttendanceWrite(supabase, lessonId)
  if (resolved.error) {
    return { error: resolved.error }
  }
  const persistedLessonId = resolved.lessonId

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, member_id, instructor_id, lesson_date, start_time, lesson_type, attendance_status',
    )
    .eq('id', persistedLessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (lesson.member_id) {
    return { error: '회원이 연결된 수업입니다.' }
  }

  if (isAthleticsClubLessonType(lesson.lesson_type)) {
    const athleticsAction: AthleticsClubAttendanceAction =
      action === 'trial'
        ? 'present'
        : action === 'cancelled'
          ? 'cancelled'
          : 'unset'
    const athleticsResult = await updateAthleticsClubAttendanceStatus(
      persistedLessonId,
      athleticsAction,
    )
    if (athleticsResult.error) return athleticsResult
    if (!athleticsResult.data) return {}
    return {
      data: {
        id: athleticsResult.data.id,
        lesson_type: athleticsResult.data.lesson_type,
        attendance_status: athleticsResult.data.attendance_status,
        lesson_id: athleticsResult.data.lesson_id,
      },
    }
  }

  const updates =
    action === 'trial'
      ? { lesson_type: '체험레슨', attendance_status: 'present' as AttendanceStatus }
      : action === 'cancelled'
        ? { lesson_type: '개인레슨', attendance_status: 'cancelled' as AttendanceStatus }
        : { lesson_type: '개인레슨', attendance_status: 'present' as AttendanceStatus }

  const { data, error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', persistedLessonId)
    .select(
      'id, lesson_type, attendance_status, instructor_id, lesson_date, start_time',
    )
    .single()

  if (error) {
    if (
      error.message.includes('row-level security') ||
      error.message.includes('permission denied')
    ) {
      return {
        error:
          '저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인해주세요.',
      }
    }
    return { error: error.message }
  }

  await syncTrialLessonPayOverride(supabase, data, user.id)

  revalidateLessonAttendanceWithCalendar()
  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')

  return {
    data: {
      ...(data as { id: string; lesson_type: string; attendance_status: AttendanceStatus }),
      lesson_id: persistedLessonId !== lessonId ? persistedLessonId : undefined,
    },
  }
}

export async function getLessonSessionsForMember(
  memberId: string,
  limit = 20,
): Promise<LessonSession[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lesson_sessions')
    .select('*')
    .eq('member_id', memberId)
    .order('session_date', { ascending: false })
    .order('checked_in_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (!isMissingTableError(error.message)) {
      console.error('getLessonSessionsForMember:', error.message)
    }
    return []
  }

  return (data ?? []) as LessonSession[]
}

export async function getSessionTransactionsForMember(
  memberId: string,
  limit = 30,
): Promise<SessionTransaction[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('session_transactions')
    .select(
      'id, member_id, session_package_id, lesson_session_id, delta, balance_after, reason, note, created_by, created_at',
    )
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (!isMissingTableError(error.message)) {
      console.error('getSessionTransactionsForMember:', error.message)
    }
    return []
  }

  return (data ?? []) as SessionTransaction[]
}

export type PastLessonSignatureRow = {
  id: string
  lessonDate: string
  startTime: string | null
  endTime: string | null
  lessonNo: number | null
  memberLabel: string
  instructorName: string | null
  attendanceStatus: AttendanceStatus
  isCompleted: boolean
  hasSignature: boolean
  signatureData: string | null
  signatureSignedAt: string | null
}

function resolveLessonSignatureState(lesson: {
  signature_id?: string | null
  signature?: { signature_data?: string | null; signed_at?: string | null } | null
  lesson_sessions?:
    | Array<{ signature_data?: string | null }>
    | { signature_data?: string | null }
    | null
}) {
  const sessionRows = Array.isArray(lesson.lesson_sessions)
    ? lesson.lesson_sessions
    : lesson.lesson_sessions
      ? [lesson.lesson_sessions]
      : []
  const sessionSig = sessionRows.find((row) => row.signature_data)?.signature_data ?? null
  const signatureData = lesson.signature?.signature_data ?? sessionSig ?? null
  const hasSignature = Boolean(lesson.signature_id || signatureData)

  return {
    hasSignature,
    signatureData,
    signatureSignedAt: lesson.signature?.signed_at ?? null,
  }
}

function isSignatureJoinError(message?: string) {
  const text = message?.toLowerCase() ?? ''
  return (
    text.includes('signatures') ||
    text.includes('could not find') ||
    text.includes('lesson_sessions')
  )
}

function compareLessonsChronologically(
  a: Pick<PastLessonSignatureRow, 'lessonDate' | 'startTime'>,
  b: Pick<PastLessonSignatureRow, 'lessonDate' | 'startTime'>,
) {
  const dateCmp = a.lessonDate.localeCompare(b.lessonDate)
  if (dateCmp !== 0) return dateCmp
  return (a.startTime ?? '').localeCompare(b.startTime ?? '')
}

function assignChronologicalLessonNumbers(
  rows: PastLessonSignatureRow[],
): PastLessonSignatureRow[] {
  const sorted = [...rows].sort(compareLessonsChronologically)

  let counter = 0
  const numberById = new Map<string, number>()

  for (const row of sorted) {
    const counts = countsTowardSessionNumber({
      session_deducted: row.isCompleted,
      attendance_status: row.attendanceStatus,
    })
    if (!counts) continue
    counter += 1
    numberById.set(row.id, counter)
  }

  return sorted.map((row) => ({
    ...row,
    lessonNo: numberById.get(row.id) ?? null,
  }))
}

function mapLessonToSignatureRow(
  lesson: Record<string, unknown>,
): PastLessonSignatureRow {
  const display = getLessonCalendarDisplayParts(
    lesson as Parameters<typeof getLessonCalendarDisplayParts>[0],
  )
  const memberLabel = display.meta
    ? `${display.name}(${display.meta})`
    : display.name
  const signatureState = resolveLessonSignatureState(
    lesson as Parameters<typeof resolveLessonSignatureState>[0],
  )
  const lessonId = String(lesson.id)

  return {
    id: lessonId,
    lessonDate: String(lesson.lesson_date),
    startTime: (lesson.start_time as string | null) ?? null,
    endTime: (lesson.end_time as string | null) ?? null,
    lessonNo: (lesson.lesson_no as number | null) ?? null,
    memberLabel,
    instructorName:
      (lesson.instructor as { name?: string } | null)?.name ?? null,
    attendanceStatus: lesson.attendance_status as AttendanceStatus,
    isCompleted: Boolean(lesson.session_deducted && lesson.end_time),
    hasSignature: signatureState.hasSignature,
    signatureData: signatureState.signatureData,
    signatureSignedAt: signatureState.signatureSignedAt,
  }
}

async function resolveMemberIdFromLabel(
  supabase: SupabaseClient,
  memberLabel: string,
): Promise<string | null> {
  const name = memberLabel.split('(')[0]?.trim()
  if (!name) return null

  const { data } = await supabase
    .from('members')
    .select('id')
    .eq('name', name)
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

async function fetchMemberLessonsForSignature(
  supabase: SupabaseClient,
  memberId: string,
  limit: number,
) {
  const lessonSelectBase = `
    id,
    lesson_date,
    start_time,
    end_time,
    lesson_no,
    attendance_status,
    session_deducted,
    signature_id,
    title,
    content,
    created_at,
    member:members(id, name, sport, age, birth_date),
    instructor:instructors(id, name),
    lesson_sessions(signature_data)
  `
  const lessonSelectWithSignature = `${lessonSelectBase},
    signature:signatures(id, signature_data, signed_at)`

  const todayKey = getTodayDateKey()

  let lessonsResult = await supabase
    .from('lessons')
    .select(lessonSelectWithSignature)
    .eq('member_id', memberId)
    .lte('lesson_date', todayKey)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (isSignatureJoinError(lessonsResult.error?.message)) {
    lessonsResult = await supabase
      .from('lessons')
      .select(lessonSelectBase)
      .eq('member_id', memberId)
      .lte('lesson_date', todayKey)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false, nullsFirst: false })
      .limit(limit)
  }

  if (lessonsResult.error) {
    console.error('fetchMemberLessonsForSignature:', lessonsResult.error)
    return []
  }

  const rows = (lessonsResult.data ?? []).map((lesson) =>
    mapLessonToSignatureRow(lesson as Record<string, unknown>),
  )

  return assignChronologicalLessonNumbers(rows)
}

export async function searchPastLessonsForSignature(
  options?: {
    daysBack?: number
    memberId?: string
    memberLabel?: string
    limit?: number
    /** 회원 지정 시 오늘·예정 수업 포함 전체 기록 */
    allLessons?: boolean
  },
): Promise<PastLessonSignatureRow[]> {
  const user = await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  let resolvedMemberId = options?.memberId ?? null
  if (!resolvedMemberId && options?.memberLabel) {
    resolvedMemberId = await resolveMemberIdFromLabel(supabase, options.memberLabel)
  }

  const memberScoped = Boolean(resolvedMemberId)
  const allMemberLessons = memberScoped && options?.allLessons !== false
  const limit = memberScoped
    ? Math.min(Math.max(options?.limit ?? 200, 5), 500)
    : Math.min(Math.max(options?.limit ?? 300, 10), 300)

  if (allMemberLessons && resolvedMemberId) {
    return fetchMemberLessonsForSignature(supabase, resolvedMemberId, limit)
  }

  const daysBack = Math.min(Math.max(options?.daysBack ?? 90, 7), 365)
  const today = new Date().toISOString().split('T')[0]
  const dateTo = new Date()
  dateTo.setDate(dateTo.getDate() - 1)
  const dateFrom = new Date(dateTo)
  dateFrom.setDate(dateFrom.getDate() - (daysBack - 1))
  const dateFromKey = dateFrom.toISOString().split('T')[0]

  const lessonSelectBase = `
    id,
    lesson_date,
    start_time,
    end_time,
    lesson_no,
    attendance_status,
    session_deducted,
    signature_id,
    title,
    content,
    member:members(id, name, sport, age, birth_date),
    instructor:instructors(id, name),
    lesson_sessions(signature_data)
  `
  const lessonSelectWithSignature = `${lessonSelectBase},
    signature:signatures(id, signature_data, signed_at)`

  let query = supabase
    .from('lessons')
    .select(lessonSelectWithSignature)
    .not('member_id', 'is', null)
    .neq('attendance_status', 'cancelled')
    .gte('lesson_date', dateFromKey)
    .lt('lesson_date', today)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (user.role === 'instructor' && !memberScoped) {
    const { data: instructor } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!instructor?.id) return []
    query = query.eq('instructor_id', instructor.id)
  }

  let { data, error } = await query

  if (isSignatureJoinError(error?.message)) {
    let fallbackQuery = supabase
      .from('lessons')
      .select(lessonSelectBase)
      .not('member_id', 'is', null)
      .neq('attendance_status', 'cancelled')
      .gte('lesson_date', dateFromKey)
      .lt('lesson_date', today)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (options?.memberId) {
      fallbackQuery = fallbackQuery.eq('member_id', options.memberId)
    }
    if (user.role === 'instructor' && !memberScoped) {
      const { data: instructor } = await supabase
        .from('instructors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!instructor?.id) return []
      fallbackQuery = fallbackQuery.eq('instructor_id', instructor.id)
    }

    const retry = await fallbackQuery
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('searchPastLessonsForSignature:', error)
    return []
  }

  const rows = (data ?? []).map((lesson) =>
    mapLessonToSignatureRow(lesson as Record<string, unknown>),
  )

  if (options?.memberId) {
    return assignChronologicalLessonNumbers(rows)
  }

  return rows
}

async function fetchLessonForSignatureMutation(
  supabase: SupabaseClient,
  lessonId: string,
) {
  const baseSelect = `
    id,
    member_id,
    instructor_id,
    session_package_id,
    lesson_date,
    session_deducted,
    attendance_status,
    end_time,
    start_time,
    signature_id
  `
  const selectWithJoins = `${baseSelect},
    signature:signatures(id, signature_data),
    lesson_sessions(signature_data)`

  let result = await supabase
    .from('lessons')
    .select(selectWithJoins)
    .eq('id', lessonId)
    .single()

  if (isSignatureJoinError(result.error?.message)) {
    result = await supabase
      .from('lessons')
      .select(baseSelect)
      .eq('id', lessonId)
      .single()
  }

  return result
}

type LessonSignatureMutationRow = {
  id: string
  member_id: string
  instructor_id: string | null
  session_package_id: string | null
  lesson_date: string
  session_deducted: boolean
  attendance_status: AttendanceStatus
  end_time: string | null
  start_time: string | null
  signature_id: string | null
}

async function saveLessonSignatureOnly(
  supabase: SupabaseClient,
  userId: string,
  lesson: LessonSignatureMutationRow,
  signatureData: string,
): Promise<{ signatureId: string | null; error?: string }> {
  const now = new Date().toISOString()
  let signatureId: string | null = lesson.signature_id

  if (lesson.signature_id) {
    const { error: updateSignatureError } = await supabase
      .from('signatures')
      .update({
        signature_data: signatureData,
        signed_at: now,
      })
      .eq('id', lesson.signature_id)

    if (updateSignatureError) {
      if (
        updateSignatureError.message.includes('row-level security') ||
        updateSignatureError.message.includes('permission denied')
      ) {
        return {
          error:
            '서명 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/add-signatures.sql 을 실행해주세요.',
        }
      }
      if (!isMissingTableError(updateSignatureError.message)) {
        return { error: updateSignatureError.message }
      }
      signatureId = null
    }
  } else {
    const { data: signature, error: signatureError } = await supabase
      .from('signatures')
      .insert({
        member_id: lesson.member_id,
        lesson_id: lesson.id,
        signature_data: signatureData,
        signed_at: now,
      })
      .select('id')
      .single()

    if (signatureError) {
      if (
        signatureError.message.includes('row-level security') ||
        signatureError.message.includes('permission denied')
      ) {
        return {
          error:
            '서명 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 확인하거나 supabase/add-signatures.sql 을 실행해주세요.',
        }
      }
      if (!isMissingTableError(signatureError.message)) {
        return { error: signatureError.message }
      }
    } else {
      signatureId = signature.id
    }
  }

  const { data: existingSession } = await supabase
    .from('lesson_sessions')
    .select('id')
    .eq('lesson_id', lesson.id)
    .maybeSingle()

  if (existingSession?.id) {
    const { error: sessionError } = await supabase
      .from('lesson_sessions')
      .update({
        signature_data: signatureData,
        updated_at: now,
        checked_in_by: userId,
      })
      .eq('id', existingSession.id)

    if (sessionError && !isMissingTableError(sessionError.message)) {
      return { error: sessionError.message }
    }
  } else {
    const { error: sessionError } = await supabase.from('lesson_sessions').insert({
      lesson_id: lesson.id,
      member_id: lesson.member_id,
      instructor_id: lesson.instructor_id,
      session_package_id: lesson.session_package_id,
      session_date: lesson.lesson_date,
      status: lesson.attendance_status,
      checked_in_at: now,
      checked_in_by: userId,
      signature_data: signatureData,
      updated_at: now,
    })

    if (sessionError && !isMissingTableError(sessionError.message)) {
      return { error: sessionError.message }
    }
  }

  if (signatureId && signatureId !== lesson.signature_id) {
    const { error: linkError } = await supabase
      .from('lessons')
      .update({ signature_id: signatureId })
      .eq('id', lesson.id)

    if (linkError) {
      return { error: linkError.message }
    }
  }

  return { signatureId }
}

function buildPastLessonSignatureResult(lesson: LessonSignatureMutationRow) {
  return {
    id: lesson.id,
    signature_id: lesson.signature_id,
    end_time: lesson.end_time,
    session_deducted: lesson.session_deducted,
    attendance_status: lesson.attendance_status,
  }
}

/** 지난 수업 — 서명 저장·수정 (종료 시간은 변경하지 않음) */
export async function addSignatureToPastLesson(
  lessonId: string,
  signatureData: string,
): Promise<{
  data?: {
    id: string
    signature_id: string | null
    end_time: string | null
    session_deducted: boolean
    attendance_status: AttendanceStatus
    session_overage?: number
    no_session_package?: boolean
  }
  error?: string
}> {
  const user = await requireRole(['admin', 'instructor'])

  if (!signatureData?.startsWith('data:image')) {
    return { error: '서명이 필요합니다.' }
  }

  const admin = attendanceWriteClient()
  const supabase = admin ?? (await createStaffDataClient())

  const { data: lesson, error: lessonError } = await fetchLessonForSignatureMutation(
    supabase,
    lessonId,
  )

  if (lessonError || !lesson) {
    console.error('addSignatureToPastLesson fetch:', lessonError)
    return { error: '수업을 찾을 수 없습니다.' }
  }

  if (!lesson.member_id) {
    return { error: '회원이 연결되지 않은 수업입니다.' }
  }

  if (lesson.attendance_status === 'cancelled') {
    return { error: '취소된 수업에는 서명할 수 없습니다.' }
  }

  const today = new Date().toISOString().split('T')[0]
  if (lesson.lesson_date > today) {
    return { error: '예정된 수업은 수업현황에서 처리해주세요.' }
  }

  const lessonRow = lesson as LessonSignatureMutationRow
  const preservedEndTime = lessonRow.end_time

  if (lessonRow.end_time) {
    const saveResult = await saveLessonSignatureOnly(
      supabase,
      user.id,
      lessonRow,
      signatureData,
    )

    if (saveResult.error) {
      return { error: saveResult.error }
    }

    revalidateLessonAttendanceViews()

    return {
      data: {
        ...buildPastLessonSignatureResult(lessonRow),
        signature_id: saveResult.signatureId ?? lessonRow.signature_id,
        end_time: preservedEndTime,
      },
    }
  }

  const fallbackEnd =
    lessonRow.start_time?.slice(0, 5) ?? '12:00'
  const completeResult = await addSignatureToPastLessonViaComplete(
    lessonId,
    signatureData,
    fallbackEnd,
  )

  if (completeResult.error || !completeResult.data) {
    return completeResult
  }

  return {
    data: {
      ...completeResult.data,
      end_time: completeResult.data.end_time ?? preservedEndTime,
    },
  }
}

async function addSignatureToPastLessonViaComplete(
  lessonId: string,
  signatureData: string,
  endTime: string,
) {
  const result = await completeLessonWithSignature(lessonId, signatureData, endTime)
  if (result.error) {
    return { error: result.error }
  }
  return {
    data: result.data
      ? {
          id: result.data.id,
          signature_id: result.data.signature_id,
          end_time: result.data.end_time,
          session_deducted: result.data.session_deducted,
          attendance_status: result.data.attendance_status,
          session_overage: result.data.session_overage,
          no_session_package: result.data.no_session_package,
        }
      : undefined,
  }
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
