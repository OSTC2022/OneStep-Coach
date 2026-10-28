'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, requireRole } from '@/lib/actions/auth'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'

export type MemberTrainingJournal = {
  id: string
  member_id: string
  training_date: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

const SELECT =
  'id, member_id, training_date, body, created_by, created_at, updated_at'

const MIGRATION_HINT =
  '훈련 일지 테이블이 없습니다. supabase/add-member-training-journals.sql 을 실행해주세요.'

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('member_training_journals') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

function normalizeDate(value: string): string | null {
  const date = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function revalidateJournalPaths(memberId: string) {
  revalidatePath('/dashboard/lesson-status')
  revalidatePath(`/dashboard/members/${memberId}`)
}

export async function listMemberTrainingJournals(memberId: string): Promise<{
  data: MemberTrainingJournal[]
  warning?: string
}> {
  await requireRole(['admin', 'instructor'])
  const id = memberId.trim()
  if (!id) return { data: [] }

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_training_journals')
    .select(SELECT)
    .eq('member_id', id)
    .order('training_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    if (isMissingTableError(error)) {
      return { data: [], warning: MIGRATION_HINT }
    }
    console.error('listMemberTrainingJournals:', error)
    return { data: [] }
  }

  return { data: (data ?? []) as MemberTrainingJournal[] }
}

export async function createMemberTrainingJournal(input: {
  memberId: string
  trainingDate: string
  body: string
}): Promise<{ data?: MemberTrainingJournal; error?: string }> {
  await requireRole(['admin', 'instructor'])
  const user = await getCurrentUser()
  const supabase = await createStaffDataClient()

  const memberId = input.memberId.trim()
  const trainingDate = normalizeDate(input.trainingDate)
  const body = input.body.trim()
  if (!memberId) return { error: '회원을 찾을 수 없습니다.' }
  if (!trainingDate) return { error: '훈련 날짜를 확인해주세요.' }
  if (!body) return { error: '훈련 내용을 입력해주세요.' }

  const { data, error } = await supabase
    .from('member_training_journals')
    .insert({
      member_id: memberId,
      training_date: trainingDate,
      body,
      created_by: user?.id ?? null,
    })
    .select(SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    console.error('createMemberTrainingJournal:', error)
    return { error: error.message }
  }

  revalidateJournalPaths(memberId)
  return { data: data as MemberTrainingJournal }
}

export async function updateMemberTrainingJournal(
  id: string,
  input: { trainingDate: string; body: string },
): Promise<{ data?: MemberTrainingJournal; error?: string }> {
  await requireRole(['admin', 'instructor'])
  const journalId = id.trim()
  if (!journalId) return { error: '일지를 찾을 수 없습니다.' }

  const trainingDate = normalizeDate(input.trainingDate)
  const body = input.body.trim()
  if (!trainingDate) return { error: '훈련 날짜를 확인해주세요.' }
  if (!body) return { error: '훈련 내용을 입력해주세요.' }

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_training_journals')
    .update({
      training_date: trainingDate,
      body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journalId)
    .select(SELECT)
    .single()

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    console.error('updateMemberTrainingJournal:', error)
    return { error: error.message }
  }

  const journal = data as MemberTrainingJournal
  revalidateJournalPaths(journal.member_id)
  return { data: journal }
}

export async function deleteMemberTrainingJournal(
  id: string,
): Promise<{ error?: string }> {
  await requireRole(['admin', 'instructor'])
  const journalId = id.trim()
  if (!journalId) return { error: '일지를 찾을 수 없습니다.' }

  const supabase = await createStaffDataClient()
  const { data: existing, error: fetchError } = await supabase
    .from('member_training_journals')
    .select('member_id')
    .eq('id', journalId)
    .maybeSingle()

  if (fetchError) {
    if (isMissingTableError(fetchError)) {
      return { error: MIGRATION_HINT }
    }
    return { error: fetchError.message }
  }
  if (!existing) return { error: '일지를 찾을 수 없습니다.' }

  const { error } = await supabase
    .from('member_training_journals')
    .delete()
    .eq('id', journalId)

  if (error) {
    if (isMissingTableError(error)) {
      return { error: MIGRATION_HINT }
    }
    console.error('deleteMemberTrainingJournal:', error)
    return { error: error.message }
  }

  revalidateJournalPaths(existing.member_id as string)
  return {}
}
