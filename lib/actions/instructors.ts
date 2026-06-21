'use server'

import { requireRole } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { revalidatePath } from 'next/cache'
import type { Instructor, InstructorFormData, InstructorReport } from '@/lib/types'
import {
  INSTRUCTOR_CALENDAR_SELECT,
  INSTRUCTOR_LIST_SELECT,
  INSTRUCTOR_PICKER_SELECT,
} from '@/lib/supabase-selects'
import {
  applyInstructorPaySlotOverrides,
  filterLessonsUpToNow,
  summarizeInstructorPay,
  summarizeInstructorPayDetailed,
  type InstructorPayDayGroup,
  type InstructorPaySlotOverrideRecord,
} from '@/lib/instructor-pay'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

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

function mapInstructorError(message: string): string {
  if (
    message.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return (
      '강사 저장 권한이 없습니다. Supabase SQL Editor에서 supabase/fix-instructors-rls.sql 을 실행한 뒤 다시 시도해주세요.'
    )
  }
  if (message.includes('foreign key') || message.includes('violates foreign key')) {
    return '이 강사와 연결된 수업·회원 데이터가 있어 삭제할 수 없습니다. 비활성화를 사용해주세요.'
  }
  return message
}

function getInstructorWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return null
  }
}

export async function getInstructors(options?: {
  isActive?: boolean
  picker?: boolean
  calendar?: boolean
  limit?: number
}): Promise<Instructor[]> {
  const supabase = await createStaffDataClient()
  const select = options?.calendar
    ? INSTRUCTOR_CALENDAR_SELECT
    : options?.picker
      ? INSTRUCTOR_PICKER_SELECT
      : INSTRUCTOR_LIST_SELECT

  let query = supabase
    .from('instructors')
    .select(select)
    .order('name', { ascending: true })

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching instructors:', error)
    return []
  }

  return (data ?? []) as Instructor[]
}

export async function getInstructorsPage(options?: {
  isActive?: boolean
  limit?: number
  offset?: number
}): Promise<{ data: Instructor[]; count: number }> {
  const supabase = await createStaffDataClient()

  let query = supabase
    .from('instructors')
    .select(INSTRUCTOR_LIST_SELECT, { count: 'exact' })
    .order('name', { ascending: true })

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  const limit = options?.limit ?? LIST_PAGE_SIZE
  const offset = options?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching instructors:', error)
    return { data: [], count: 0 }
  }

  return { data: (data ?? []) as Instructor[], count: count ?? 0 }
}

export async function getInstructor(id: string): Promise<Instructor | null> {
  const supabase = await createStaffDataClient()
  
  const { data, error } = await supabase
    .from('instructors')
    .select(INSTRUCTOR_LIST_SELECT)
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
    .select(INSTRUCTOR_LIST_SELECT)
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
      .select(INSTRUCTOR_LIST_SELECT)
      .eq('name', profile.full_name)
      .eq('is_active', true)
      .maybeSingle()

    if (byName) return byName as Instructor
  }

  return null
}

function normalizeInstructorSnsFields(
  formData: Partial<InstructorFormData>,
): Partial<InstructorFormData> {
  const next = { ...formData }
  if (formData.kakao_id !== undefined) {
    next.kakao_id = formData.kakao_id?.trim() || undefined
  }
  if (formData.instagram_id !== undefined) {
    next.instagram_id = formData.instagram_id?.trim() || undefined
  }
  if (formData.blog_url !== undefined) {
    next.blog_url = formData.blog_url?.trim() || undefined
  }
  return next
}

export async function updateMyInstructorSns(formData: {
  kakao_id?: string
  instagram_id?: string
  blog_url?: string
}): Promise<InstructorMutationResult> {
  const instructor = await getInstructorForCurrentUser()
  if (!instructor) {
    return { error: '연결된 강사 프로필을 찾을 수 없습니다.' }
  }

  const supabase = getInstructorWriteClient() ?? (await createClient())
  const updateData: Record<string, unknown> = {}
  if (formData.kakao_id !== undefined) {
    updateData.kakao_id = formData.kakao_id?.trim() || null
  }
  if (formData.instagram_id !== undefined) {
    updateData.instagram_id = formData.instagram_id?.trim() || null
  }
  if (formData.blog_url !== undefined) {
    updateData.blog_url = formData.blog_url?.trim() || null
  }

  const { data, error } = await supabase
    .from('instructors')
    .update(updateData)
    .eq('id', instructor.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating instructor SNS:', error)
    return { error: mapInstructorError(error.message) }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/members')
  return { data: data as Instructor }
}

export async function createInstructor(formData: InstructorFormData): Promise<InstructorMutationResult> {
  await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())

  const payload = {
    name: formData.name,
    phone: formData.phone || null,
    kakao_id: formData.kakao_id?.trim() || null,
    instagram_id: formData.instagram_id?.trim() || null,
    blog_url: formData.blog_url?.trim() || null,
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
      return { error: mapInstructorError(retry.error.message) }
    }

    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/calendar')
    return { data: retry.data as Instructor, warning: CALENDAR_COLOR_MIGRATION_HINT }
  }

  if (error) {
    console.error('Error creating instructor:', error)
    return { error: mapInstructorError(error.message) }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  return { data: data as Instructor }
}

export async function updateInstructor(
  id: string,
  formData: Partial<InstructorFormData>,
): Promise<InstructorMutationResult> {
  await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())
  const payload: Record<string, unknown> = { ...normalizeInstructorSnsFields(formData) }
  if (formData.kakao_id !== undefined) {
    payload.kakao_id = formData.kakao_id?.trim() || null
  }
  if (formData.instagram_id !== undefined) {
    payload.instagram_id = formData.instagram_id?.trim() || null
  }
  if (formData.blog_url !== undefined) {
    payload.blog_url = formData.blog_url?.trim() || null
  }

  const { data, error } = await supabase
    .from('instructors')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error && isMissingCalendarColorColumn(error) && 'calendar_color' in payload) {
    const { calendar_color: _removed, ...fallbackPayload } = payload
    const retry = await supabase
      .from('instructors')
      .update(fallbackPayload)
      .eq('id', id)
      .select()
      .single()

    if (retry.error) {
      console.error('Error updating instructor:', retry.error)
      return { error: mapInstructorError(retry.error.message) }
    }

    revalidatePath('/dashboard/instructors')
    revalidatePath('/dashboard/calendar')
    return { data: retry.data as Instructor, warning: CALENDAR_COLOR_MIGRATION_HINT }
  }

  if (error) {
    console.error('Error updating instructor:', error)
    return { error: mapInstructorError(error.message) }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  return { data: data as Instructor }
}

export async function toggleInstructorStatus(id: string, isActive: boolean): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())
  
  const { error } = await supabase
    .from('instructors')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    console.error('Error toggling instructor status:', error)
    return { error: mapInstructorError(error.message) }
  }

  revalidatePath('/dashboard/instructors')
  return {}
}

export async function deleteInstructor(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())
  
  const { error } = await supabase
    .from('instructors')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting instructor:', error)
    return { error: mapInstructorError(error.message) }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/calendar')
  return {}
}

export type InstructorMonthlyPayDetail = {
  instructor: Instructor
  month: string
  weekdaySlots: number
  weekendSlots: number
  weekdayPay: number
  weekendPay: number
  totalPay: number
  totalLessons: number
  dayGroups: InstructorPayDayGroup[]
}

function getMonthDateRange(month: string) {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthNum = Number(monthText)
  const dateFrom = `${yearText}-${monthText.padStart(2, '0')}-01`
  const lastDay = new Date(year, monthNum, 0).getDate()
  const dateTo = `${yearText}-${monthText.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { dateFrom, dateTo }
}

function isMissingPayOverrideTable(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('instructor_pay_slot_overrides') ||
    message.includes('could not find the table')
  )
}

async function fetchInstructorPaySlotOverrides(
  instructorId: string,
  dateFrom: string,
  dateTo: string,
): Promise<InstructorPaySlotOverrideRecord[]> {
  const supabase = await createStaffDataClient()

  const { data, error } = await supabase
    .from('instructor_pay_slot_overrides')
    .select('slot_key, pay_amount, member_count')
    .eq('instructor_id', instructorId)

  if (error) {
    if (isMissingPayOverrideTable(error)) return []
    console.error('Error fetching instructor pay overrides:', error)
    return []
  }

  return (data ?? [])
    .filter((row) => {
      const lessonDate = row.slot_key.split('|')[0]
      return lessonDate >= dateFrom && lessonDate <= dateTo
    })
    .map((row) => ({
      slotKey: row.slot_key,
      payAmount: Number(row.pay_amount),
      memberCount: row.member_count == null ? null : Number(row.member_count),
    }))
}

export async function saveInstructorPaySlotOverride(
  instructorId: string,
  slotKey: string,
  payAmount: number,
  memberCount?: number,
): Promise<{ error?: string }> {
  const user = await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())

  if (!Number.isFinite(payAmount) || payAmount < 0) {
    return { error: '강사료 금액이 올바르지 않습니다.' }
  }

  const normalizedMemberCount =
    memberCount == null ? null : Math.max(1, Math.floor(memberCount))

  const { error } = await supabase.from('instructor_pay_slot_overrides').upsert(
    {
      instructor_id: instructorId,
      slot_key: slotKey,
      pay_amount: payAmount,
      member_count: normalizedMemberCount,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'instructor_id,slot_key' },
  )

  if (error) {
    if (isMissingPayOverrideTable(error)) {
      return {
        error:
          '강사료 수정 저장을 위해 Supabase SQL Editor에서 supabase/add-instructor-pay-overrides.sql 을 실행해 주세요.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')
  return {}
}

export async function clearInstructorPaySlotOverride(
  instructorId: string,
  slotKey: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = getInstructorWriteClient() ?? (await createClient())

  const { error } = await supabase
    .from('instructor_pay_slot_overrides')
    .delete()
    .eq('instructor_id', instructorId)
    .eq('slot_key', slotKey)

  if (error) {
    if (isMissingPayOverrideTable(error)) {
      return {
        error:
          '강사료 수정 저장을 위해 Supabase SQL Editor에서 supabase/add-instructor-pay-overrides.sql 을 실행해 주세요.',
      }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/instructors')
  revalidatePath('/dashboard/reports')
  return {}
}

export async function getInstructorMonthlyPayDetail(
  instructorId: string,
  month: string,
  options?: { upToNow?: boolean },
): Promise<InstructorMonthlyPayDetail | null> {
  const instructor = await getInstructor(instructorId)
  if (!instructor) return null

  const { dateFrom, dateTo } = getMonthDateRange(month)
  const supabase = await createClient()

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, end_time, attendance_status, lesson_type, title, content, member_id, session_deducted, special_note, event_status, event_type, created_at, member:members(id, name), lesson_sessions(checked_in_at)',
    )
    .eq('instructor_id', instructorId)
    .neq('event_type', 'recurring_master')
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Error fetching instructor monthly pay detail:', error)
    return null
  }

  const payableLessons =
    options?.upToNow === true
      ? filterLessonsUpToNow(lessons ?? [])
      : (lessons ?? [])

  const base = summarizeInstructorPayDetailed(payableLessons, instructor)
  const overrides = await fetchInstructorPaySlotOverrides(
    instructorId,
    dateFrom,
    dateTo,
  )

  const detail = applyInstructorPaySlotOverrides(
    {
      weekdaySlots: base.weekdaySlots,
      weekendSlots: base.weekendSlots,
      weekdayPay: base.weekdayPay,
      weekendPay: base.weekendPay,
      totalPay: base.totalPay,
      dayGroups: base.dayGroups,
    },
    overrides,
  )

  return {
    instructor,
    month,
    weekdaySlots: detail.weekdaySlots,
    weekendSlots: detail.weekendSlots,
    weekdayPay: detail.weekdayPay,
    weekendPay: detail.weekendPay,
    totalPay: detail.totalPay,
    totalLessons: base.totalLessons,
    dayGroups: detail.dayGroups,
  }
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

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, end_time, attendance_status, lesson_type, member_id, session_deducted, special_note, event_status, event_type, created_at, lesson_sessions(checked_in_at)',
    )
    .eq('instructor_id', instructorId)
    .neq('event_type', 'recurring_master')
    .gte('lesson_date', dateFrom)
    .lte('lesson_date', dateTo)

  if (error) {
    console.error('Error fetching instructor lessons:', error)
    return null
  }

  const paySummary = summarizeInstructorPay(lessons ?? [], instructor)
  const groupLessons = paySummary.slots.filter((slot) => slot.memberCount >= 2).length

  return {
    instructor,
    totalLessons: paySummary.totalLessons,
    weekdayLessons: paySummary.weekdaySlots,
    weekendLessons: paySummary.weekendSlots,
    groupLessons,
    totalEarnings: paySummary.totalPay,
    weekdayEarnings: paySummary.weekdayPay,
    weekendEarnings: paySummary.weekendPay,
    paySlots: paySummary.slots,
  }
}
