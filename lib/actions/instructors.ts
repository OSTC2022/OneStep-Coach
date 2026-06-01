'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Instructor, InstructorFormData, InstructorReport } from '@/lib/types'

type InstructorMutationResult = {
  data?: Instructor
  error?: string
  warning?: string
}

function isMissingCalendarColorColumn(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST204' ||
    message.includes('calendar_color') ||
    message.includes('schema cache')
  )
}

const CALENDAR_COLOR_MIGRATION_HINT =
  '캘린더 색상 저장을 위해 Supabase SQL Editor에서 supabase/add-instructor-calendar-color.sql 을 실행해 주세요.'

export async function getInstructors(options?: {
  isActive?: boolean
}): Promise<Instructor[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('instructors')
    .select('*')
    .order('name', { ascending: true })

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching instructors:', error)
    return []
  }

  return data as Instructor[]
}

export async function getInstructor(id: string): Promise<Instructor | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('instructors')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching instructor:', error)
    return null
  }

  return data as Instructor
}

/** 로그인 사용자와 연결된 강사 프로필 (user_id → 이름 매칭) */
export async function getInstructorForCurrentUser(): Promise<Instructor | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data: byUserId } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('is_active', true)
    .maybeSingle()

  if (byUserId) return byUserId as Instructor

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', authUser.id)
    .single()

  if (profile?.role === 'instructor' && profile.full_name) {
    const { data: byName } = await supabase
      .from('instructors')
      .select('*')
      .eq('name', profile.full_name)
      .eq('is_active', true)
      .maybeSingle()

    if (byName) return byName as Instructor
  }

  return null
}

export async function createInstructor(formData: InstructorFormData): Promise<InstructorMutationResult> {
  const supabase = await createClient()

  const payload = {
    name: formData.name,
    phone: formData.phone || null,
    speciality: formData.speciality || [],
    hourly_rate_weekday: formData.hourly_rate_weekday || 30000,
    hourly_rate_weekend: formData.hourly_rate_weekend || 40000,
    extra_member_rate: formData.extra_member_rate || 10000,
    calendar_color: formData.calendar_color || null,
    user_id: formData.user_id || null,
    is_active: true,
  }

  const { data, error } = await supabase
    .from('instructors')
    .insert(payload)
    .select()
    .single()

  if (error && isMissingCalendarColorColumn(error)) {
    const { calendar_color: _removed, ...fallbackPayload } = payload
    const retry = await supabase
      .from('instructors')
      .insert(fallbackPayload)
      .select()
      .single()

    if (retry.error) {
      console.error('Error creating instructor:', retry.error)
      return { error: retry.error.message }
    }

    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/calendar')
    return { data: retry.data as Instructor, warning: CALENDAR_COLOR_MIGRATION_HINT }
  }

  if (error) {
    console.error('Error creating instructor:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  return { data: data as Instructor }
}

export async function updateInstructor(
  id: string,
  formData: Partial<InstructorFormData>,
): Promise<InstructorMutationResult> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('instructors')
    .update(formData)
    .eq('id', id)
    .select()
    .single()

  if (error && isMissingCalendarColorColumn(error) && 'calendar_color' in formData) {
    const { calendar_color: _removed, ...fallbackPayload } = formData
    const retry = await supabase
      .from('instructors')
      .update(fallbackPayload)
      .eq('id', id)
      .select()
      .single()

    if (retry.error) {
      console.error('Error updating instructor:', retry.error)
      return { error: retry.error.message }
    }

    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/calendar')
    return { data: retry.data as Instructor, warning: CALENDAR_COLOR_MIGRATION_HINT }
  }

  if (error) {
    console.error('Error updating instructor:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  return { data: data as Instructor }
}

export async function toggleInstructorStatus(id: string, isActive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('instructors')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    console.error('Error toggling instructor status:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  return {}
}

export async function deleteInstructor(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('instructors')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting instructor:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  return {}
}

export async function getInstructorReport(
  instructorId: string,
  dateFrom: string,
  dateTo: string
): Promise<InstructorReport | null> {
  const supabase = await createClient()
  
  // Get instructor
  const instructor = await getInstructor(instructorId)
  if (!instructor) return null

  // Get lessons for the period
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('instructor_id', instructorId)
    .eq('attendance_status', 'present')
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)

  if (error) {
    console.error('Error fetching instructor lessons:', error)
    return null
  }

  // Calculate stats
  let weekdayLessons = 0
  let weekendLessons = 0
  let groupLessons = 0

  lessons?.forEach(lesson => {
    const date = new Date(lesson.lesson_date)
    const dayOfWeek = date.getDay()
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendLessons++
    } else {
      weekdayLessons++
    }

    if (lesson.lesson_type === '그룹레슨') {
      groupLessons++
    }
  })

  const totalEarnings = 
    weekdayLessons * instructor.hourly_rate_weekday +
    weekendLessons * instructor.hourly_rate_weekend

  return {
    instructor,
    totalLessons: lessons?.length || 0,
    weekdayLessons,
    weekendLessons,
    groupLessons,
    totalEarnings,
  }
}
