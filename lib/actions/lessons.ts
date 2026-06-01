'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Lesson, LessonFormData, AttendanceStatus } from '@/lib/types'
import { getCurrentUser } from './auth'
import { checkInLesson } from './lesson-sessions'
import {
  LESSON_TITLE_CONTENT_PREFIX,
  resolveLessonTitle,
} from '@/lib/calendar-utils'

const LESSON_SELECT =
  '*, member:members(*), instructor:instructors(*), session_package:session_packages(*)'

type LessonMutationResult = {
  data?: Lesson
  error?: string
  warning?: string
}

const LESSON_TITLE_MIGRATION_HINT =
  '회원 없는 일정 저장을 위해 Supabase SQL Editor에서 supabase/add-lesson-title.sql 을 실행해 주세요.'

function isMissingTitleColumn(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST204' ||
    (message.includes('title') && message.includes('schema cache'))
  )
}

function isMemberIdRequiredError(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === '23502' ||
    message.includes('member_id') && message.includes('not-null')
  )
}

function normalizeLessonRecord(lesson: Lesson): Lesson {
  const title = resolveLessonTitle(lesson)
  if (title && !lesson.title) {
    return { ...lesson, title }
  }
  return lesson
}

function buildLessonIdentityFields(memberId: string | null, title: string | null) {
  return {
    member_id: memberId,
    title: title?.trim() || null,
  }
}

function buildInsertPayload(
  formData: LessonFormData,
  memberId: string | null,
  title: string | null,
  lessonNo: number | null,
  userId: string | null,
  options?: { useTitleFallback?: boolean },
) {
  const identity = buildLessonIdentityFields(memberId, title)
  const payload: Record<string, unknown> = {
    member_id: identity.member_id,
    instructor_id: formData.instructor_id || null,
    session_package_id: formData.session_package_id || null,
    lesson_date: formData.lesson_date,
    start_time: formData.start_time || null,
    end_time: formData.end_time || null,
    lesson_type: formData.lesson_type || '개인레슨',
    content: formData.content || null,
    special_note: formData.special_note || null,
    attendance_status: formData.attendance_status || 'present',
    session_deducted: false,
    lesson_no: lessonNo,
    created_by: userId,
  }

  if (options?.useTitleFallback) {
    if (title) {
      payload.content = `${LESSON_TITLE_CONTENT_PREFIX}${title}`
    }
  } else if (identity.title) {
    payload.title = identity.title
  }

  return payload
}

function logSupabaseError(context: string, error: { message?: string; code?: string; details?: string }) {
  console.error(`${context}:`, error.message ?? error.code ?? 'Unknown error', {
    code: error.code,
    details: error.details,
  })
}

export async function getLessons(options?: {
  memberId?: string
  instructorId?: string
  date?: string
  dateFrom?: string
  dateTo?: string
  status?: AttendanceStatus
  limit?: number
}): Promise<Lesson[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .order('lesson_date', { ascending: false })
    .order('start_time', { ascending: false })

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (options?.instructorId) {
    query = query.eq('instructor_id', options.instructorId)
  }

  if (options?.date) {
    query = query.eq('lesson_date', options.date)
  }

  if (options?.dateFrom) {
    query = query.gte('lesson_date', options.dateFrom)
  }

  if (options?.dateTo) {
    query = query.lte('lesson_date', options.dateTo)
  }

  if (options?.status) {
    query = query.eq('attendance_status', options.status)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    logSupabaseError('Error fetching lessons', error)
    return []
  }

  return (data as Lesson[]).map(normalizeLessonRecord)
}

export async function getLessonsForMonth(year: number, month: number): Promise<Lesson[]> {
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return getLessons({ dateFrom, dateTo })
}

export async function getLessonsForRange(
  dateFrom: string,
  dateTo: string,
): Promise<Lesson[]> {
  return getLessons({ dateFrom, dateTo })
}

export async function getTodayLessons(): Promise<Lesson[]> {
  const today = new Date().toISOString().split('T')[0]
  return getLessons({ date: today })
}

export async function createLesson(formData: LessonFormData): Promise<LessonMutationResult> {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const memberId = formData.member_id?.trim() || null
  const title = formData.title?.trim() || null

  if (!memberId && !title) {
    return { error: '이름을 입력해주세요.' }
  }

  let lessonNo: number | null = null
  if (memberId) {
    const { data: lastLesson } = await supabase
      .from('lessons')
      .select('lesson_no')
      .eq('member_id', memberId)
      .order('lesson_no', { ascending: false })
      .limit(1)
      .single()

    lessonNo = (lastLesson?.lesson_no || 0) + 1
  }

  const payload = buildInsertPayload(
    formData,
    memberId,
    title,
    lessonNo,
    user?.id || null,
  )

  let warning: string | undefined
  let { data, error } = await supabase
    .from('lessons')
    .insert(payload)
    .select('*, member:members(*), instructor:instructors(*)')
    .single()

  if (error && isMissingTitleColumn(error) && !memberId && title) {
    const fallbackPayload = buildInsertPayload(
      formData,
      memberId,
      title,
      lessonNo,
      user?.id || null,
      { useTitleFallback: true },
    )
    const retry = await supabase
      .from('lessons')
      .insert(fallbackPayload)
      .select('*, member:members(*), instructor:instructors(*)')
      .single()

    data = retry.data
    error = retry.error
    warning = LESSON_TITLE_MIGRATION_HINT
  }

  if (error) {
    console.error('Error creating lesson:', error)
    if (isMemberIdRequiredError(error) && !memberId) {
      return { error: LESSON_TITLE_MIGRATION_HINT }
    }
    const message =
      error.code === 'PGRST205'
        ? 'lessons 테이블이 없습니다. supabase/fix-lessons.sql 을 실행해주세요.'
        : isMissingTitleColumn(error)
          ? LESSON_TITLE_MIGRATION_HINT
          : error.message
    return { error: message }
  }

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  return { data: normalizeLessonRecord(data as Lesson), warning }
}

export async function updateLesson(id: string, updates: Partial<LessonFormData>): Promise<LessonMutationResult> {
  const supabase = await createClient()

  const payload: Record<string, unknown> = { ...updates }
  let titleForFallback: string | null = null

  if ('member_id' in updates || 'title' in updates) {
    const memberId = updates.member_id?.trim() || null
    const title = updates.title?.trim() || null
    if (!memberId && !title) {
      return { error: '이름을 입력해주세요.' }
    }
    payload.member_id = memberId
    titleForFallback = title
    payload.title = title
  }

  let warning: string | undefined
  let { data, error } = await supabase
    .from('lessons')
    .update(payload)
    .eq('id', id)
    .select('*, member:members(*), instructor:instructors(*)')
    .single()

  if (error && isMissingTitleColumn(error) && titleForFallback) {
    const { title: _removed, ...fallbackPayload } = payload
    fallbackPayload.content = `${LESSON_TITLE_CONTENT_PREFIX}${titleForFallback}`

    const retry = await supabase
      .from('lessons')
      .update(fallbackPayload)
      .eq('id', id)
      .select('*, member:members(*), instructor:instructors(*)')
      .single()

    data = retry.data
    error = retry.error
    warning = LESSON_TITLE_MIGRATION_HINT
  }

  if (error) {
    console.error('Error updating lesson:', error)
    if (isMemberIdRequiredError(error) && !payload.member_id) {
      return { error: LESSON_TITLE_MIGRATION_HINT }
    }
    return {
      error: isMissingTitleColumn(error) ? LESSON_TITLE_MIGRATION_HINT : error.message,
    }
  }

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  return { data: normalizeLessonRecord(data as Lesson), warning }
}

export async function markAttendance(
  lessonId: string, 
  status: AttendanceStatus,
  signatureData?: string
): Promise<{ data?: Lesson; error?: string }> {
  const checkIn = await checkInLesson(lessonId, status, {
    signatureData,
  })

  if (checkIn.error) {
    return { error: checkIn.error }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('*, member:members(*), instructor:instructors(*)')
    .eq('id', lessonId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: normalizeLessonRecord(data as Lesson) }
}

export async function deleteLesson(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting lesson:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/lessons')
  revalidatePath('/dashboard/attendance')
  revalidatePath('/dashboard/calendar')
  return {}
}
