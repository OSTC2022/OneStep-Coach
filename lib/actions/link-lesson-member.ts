'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { updateLesson } from '@/lib/actions/lessons'
import { scheduleGoogleLessonDeletes } from '@/lib/google-calendar/push-scheduler'
import {
  LESSON_TITLE_CONTENT_PREFIX,
  resolveLessonTitle,
} from '@/lib/calendar-utils'
import { parseVirtualLessonId } from '@/lib/calendar-recurrence/types'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { Lesson } from '@/lib/types'

type LinkLessonMemberResult = {
  data?: Lesson
  deletedIds?: string[]
  error?: string
  warning?: string
}

async function lessonWriteClient() {
  return createServiceRoleClient()
}

async function resolveLinkTargetLessonId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  lessonId: string,
  memberName: string,
): Promise<{ targetId: string; useVirtualUpdate: boolean }> {
  const virtual = parseVirtualLessonId(lessonId)
  if (!virtual) {
    return { targetId: lessonId, useVirtualUpdate: false }
  }

  const { data: master } = await supabase
    .from('lessons')
    .select('id, start_time, instructor_id, title, content')
    .eq('id', virtual.masterId)
    .maybeSingle()

  const startKey = (master?.start_time ?? '').slice(0, 5)
  const instructorId = master?.instructor_id ?? null

  const { data: slotRows } = await supabase
    .from('lessons')
    .select(
      'id, member_id, title, content, instructor_id, start_time, event_type, session_deducted',
    )
    .eq('lesson_date', virtual.occurrenceDate)
    .neq('event_type', 'recurring_master')

  const stored = (slotRows ?? []).find((row) => {
    if ((row.start_time ?? '').slice(0, 5) !== startKey) return false
    if ((row.instructor_id ?? '') !== (instructorId ?? '')) return false
    if (row.session_deducted) return false
    if (!row.member_id) {
      const label = resolveLessonTitle(row)
      return extractMemberNameFromCalendarLabel(label ?? '') === memberName
    }
    return false
  })

  if (stored?.id) {
    return { targetId: stored.id, useVirtualUpdate: false }
  }

  return { targetId: lessonId, useVirtualUpdate: true }
}

async function purgeDuplicateSlotLessonsAfterLink(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    keepId: string
    lessonDate: string
    startTime: string | null
    instructorId: string | null
    memberId: string
    memberName: string
  },
): Promise<string[]> {
  const startKey = (params.startTime ?? '').slice(0, 5)
  const instructorKey = params.instructorId ?? ''

  const { data: rows, error } = await supabase
    .from('lessons')
    .select(
      'id, member_id, title, content, instructor_id, start_time, event_type, session_deducted',
    )
    .eq('lesson_date', params.lessonDate)
    .neq('event_type', 'recurring_master')

  if (error || !rows?.length) return []

  const deleteIds: string[] = []
  for (const row of rows) {
    if (row.id === params.keepId) continue
    if ((row.start_time ?? '').slice(0, 5) !== startKey) continue
    if ((row.instructor_id ?? '') !== instructorKey) continue
    if (row.session_deducted) continue

    const sameMember = row.member_id === params.memberId
    const sameGuestName =
      !row.member_id &&
      extractMemberNameFromCalendarLabel(resolveLessonTitle(row) ?? '') ===
        params.memberName

    if (sameMember || sameGuestName) {
      deleteIds.push(row.id)
    }
  }

  if (deleteIds.length === 0) return []

  const { error: deleteError } = await supabase
    .from('lessons')
    .delete()
    .in('id', deleteIds)

  if (deleteError) {
    console.error('[linkLessonToMember] purge duplicates', deleteError.message)
    return []
  }

  scheduleGoogleLessonDeletes(deleteIds)
  return deleteIds
}

function buildMemberLinkUpdates(
  lessonType: string | null | undefined,
  content: string | null | undefined,
) {
  const updates: {
    member_id: string
    title: string
    lesson_type?: string
    content?: string | null
  } = {
    member_id: '',
    title: '',
  }

  if (lessonType === '체험레슨') {
    updates.lesson_type = '개인레슨'
  }

  if (content?.startsWith(LESSON_TITLE_CONTENT_PREFIX)) {
    updates.content = null
  }

  return updates
}

/** 수업현황 — 기존 일정 행에 회원을 연결(덮어쓰기). 같은 슬롯 중복 행은 제거 */
export async function linkLessonToMember(
  lessonId: string,
  memberId: string,
  context?: { lessonType?: string | null; content?: string | null },
): Promise<LinkLessonMemberResult> {
  await requireRole(['admin', 'instructor'])

  const trimmedMemberId = memberId.trim()
  if (!trimmedMemberId) {
    return { error: '연결할 회원을 선택해주세요.' }
  }

  const supabase = await lessonWriteClient()
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, name')
    .eq('id', trimmedMemberId)
    .maybeSingle()

  if (memberError || !member) {
    return { error: '회원을 찾을 수 없습니다.' }
  }

  const { targetId, useVirtualUpdate } = await resolveLinkTargetLessonId(
    supabase,
    lessonId,
    member.name,
  )

  let existingType: string | null = null
  let existingContent: string | null = null

  if (!useVirtualUpdate) {
    const { data: existing } = await supabase
      .from('lessons')
      .select('lesson_type, content')
      .eq('id', targetId)
      .maybeSingle()
    existingType = existing?.lesson_type ?? null
    existingContent = existing?.content ?? null
  } else {
    existingType = context?.lessonType ?? null
    existingContent = context?.content ?? null
  }

  const linkUpdates = buildMemberLinkUpdates(existingType, existingContent)
  linkUpdates.member_id = trimmedMemberId

  const result = await updateLesson(
    useVirtualUpdate ? lessonId : targetId,
    linkUpdates,
  )

  if (result.error || !result.data) {
    return { error: result.error ?? '회원 연결에 실패했습니다.' }
  }

  const deletedIds = await purgeDuplicateSlotLessonsAfterLink(supabase, {
    keepId: result.data.id,
    lessonDate: result.data.lesson_date,
    startTime: result.data.start_time,
    instructorId: result.data.instructor_id,
    memberId: trimmedMemberId,
    memberName: member.name,
  })

  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/members')

  return {
    data: result.data,
    deletedIds,
    warning: result.warning,
  }
}
