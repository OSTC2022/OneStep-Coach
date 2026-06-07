import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getInstructorMemberPayOverrideKey,
  getInstructorSlotPayKey,
} from '@/lib/instructor-pay'
import {
  getTrialLessonPayAmount,
  isTrialLessonPayAmount,
  isTrialLessonType,
} from '@/lib/trial-lesson-pay'

type TrialLessonPaySyncRow = {
  id: string
  instructor_id: string | null
  lesson_date: string
  start_time: string | null
  lesson_type: string
  attendance_status?: string | null
}

function isMissingPayOverrideTable(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('instructor_pay_slot_overrides') ||
    lower.includes('could not find the table')
  )
}

/** 체험레슨 유형에 맞게 회원(수업)별 강사료 override 동기화 */
export async function syncTrialLessonPayOverride(
  supabase: SupabaseClient,
  lesson: TrialLessonPaySyncRow,
  userId?: string | null,
) {
  if (!lesson.instructor_id) return

  const slotKey = getInstructorSlotPayKey(
    lesson.lesson_date,
    lesson.start_time,
    lesson.instructor_id,
  )
  const memberKey = getInstructorMemberPayOverrideKey(slotKey, lesson.id)

  if (
    isTrialLessonType(lesson.lesson_type) &&
    lesson.attendance_status !== 'cancelled'
  ) {
    const { error } = await supabase.from('instructor_pay_slot_overrides').upsert(
      {
        instructor_id: lesson.instructor_id,
        slot_key: memberKey,
        pay_amount: getTrialLessonPayAmount(lesson.lesson_date),
        member_count: null,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'instructor_id,slot_key' },
    )

    if (error && !isMissingPayOverrideTable(error.message)) {
      console.warn('syncTrialLessonPayOverride upsert:', error.message)
    }
    return
  }

  const { data: existing, error: lookupError } = await supabase
    .from('instructor_pay_slot_overrides')
    .select('pay_amount')
    .eq('instructor_id', lesson.instructor_id)
    .eq('slot_key', memberKey)
    .maybeSingle()

  if (lookupError) {
    if (!isMissingPayOverrideTable(lookupError.message)) {
      console.warn('syncTrialLessonPayOverride lookup:', lookupError.message)
    }
    return
  }

  if (!existing || !isTrialLessonPayAmount(Number(existing.pay_amount))) return

  const { error } = await supabase
    .from('instructor_pay_slot_overrides')
    .delete()
    .eq('instructor_id', lesson.instructor_id)
    .eq('slot_key', memberKey)

  if (error && !isMissingPayOverrideTable(error.message)) {
    console.warn('syncTrialLessonPayOverride delete:', error.message)
  }
}
