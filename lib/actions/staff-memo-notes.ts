'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'

export type StaffMemoNote = {
  id: string
  member_id: string | null
  member_name: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

const SELECT =
  'id, member_id, member_name, body, created_by, created_at, updated_at'

const MIGRATION_HINT =
  '알림장 테이블이 없습니다. supabase/add-staff-memo-notes.sql 을 실행해주세요.'

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('staff_memo_notes') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

function revalidateMemoPaths() {
  revalidatePath('/dashboard/lesson-status')
  revalidatePath('/dashboard/calendar')
}

export async function listStaffMemoNotes(): Promise<{
  data: StaffMemoNote[]
  warning?: string
}> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const { data, error } = await supabase
    .from('staff_memo_notes')
    .select(SELECT)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    if (isMissingTableError(error)) {
      return { data: [], warning: MIGRATION_HINT }
    }
    console.error('listStaffMemoNotes:', error)
    return { data: [] }
  }

  return { data: (data ?? []) as StaffMemoNote[] }
}

export async function createStaffMemoNote(input: {
  memberId?: string | null
  memberName: string
  body: string
}): Promise<{ data?: StaffMemoNote; error?: string; warning?: string }> {
  await requireRole(['admin', 'instructor'])
  const user = await getCurrentUser()
  const supabase = await createStaffDataClient()

  const memberName = input.memberName.trim()
  const body = input.body.trim()
  if (!memberName) return { error: '이름을 입력해주세요.' }
  if (!body) return { error: '메모 내용을 입력해주세요.' }

  const { data, error } = await supabase
    .from('staff_memo_notes')
    .insert({
      member_id: input.memberId?.trim() || null,
      member_name: memberName,
      body,
      created_by: user?.id ?? null,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    return { error: error.message }
  }

  revalidateMemoPaths()
  return { data: data as StaffMemoNote }
}

export async function updateStaffMemoNote(
  id: string,
  input: {
    memberId?: string | null
    memberName: string
    body: string
  },
): Promise<{ data?: StaffMemoNote; error?: string }> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const memberName = input.memberName.trim()
  const body = input.body.trim()
  if (!memberName) return { error: '이름을 입력해주세요.' }
  if (!body) return { error: '메모 내용을 입력해주세요.' }

  const { data, error } = await supabase
    .from('staff_memo_notes')
    .update({
      member_id: input.memberId?.trim() || null,
      member_name: memberName,
      body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    return { error: error.message }
  }

  revalidateMemoPaths()
  return { data: data as StaffMemoNote }
}

export async function deleteStaffMemoNote(
  id: string,
): Promise<{ error?: string }> {
  await requireRole(['admin', 'instructor'])
  const supabase = await createStaffDataClient()

  const { error } = await supabase.from('staff_memo_notes').delete().eq('id', id)

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    return { error: error.message }
  }

  revalidateMemoPaths()
  return {}
}
