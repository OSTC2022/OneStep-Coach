'use server'

import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { calculateMemberBmi } from '@/lib/member-utils'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createAdminClient } from '@/lib/supabase/admin'

export type MemberBodyRecord = {
  id: string
  member_id: string
  recorded_at: string
  weight_kg: number
  height_cm: number | null
  note: string | null
  created_at: string
}

function isMissingBodyRecordsTable(message: string | undefined, code?: string) {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    code === 'PGRST205' ||
    lower.includes('member_body_records') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  )
}

function normalizeRecord(row: {
  id: string
  member_id: string
  recorded_at: string
  weight_kg: number | string
  height_cm?: number | string | null
  note?: string | null
  created_at: string
}): MemberBodyRecord {
  return {
    id: row.id,
    member_id: row.member_id,
    recorded_at: row.recorded_at,
    weight_kg: Number(row.weight_kg),
    height_cm: row.height_cm != null ? Number(row.height_cm) : null,
    note: row.note ?? null,
    created_at: row.created_at,
  }
}

function bootstrapFromMember(member: {
  id: string
  weight_kg: number | null
  height_cm?: number | null
  registered_at: string
}): MemberBodyRecord[] {
  if (!member.weight_kg || member.weight_kg <= 0) return []
  return [
    {
      id: `bootstrap-${member.id}`,
      member_id: member.id,
      recorded_at: member.registered_at.split('T')[0],
      weight_kg: Number(member.weight_kg),
      height_cm: member.height_cm != null ? Number(member.height_cm) : null,
      note: null,
      created_at: member.registered_at,
    },
  ]
}

export async function getMemberBodyRecords(
  memberId: string,
  fallback?: {
    weight_kg: number | null
    height_cm?: number | null
    registered_at: string
  },
): Promise<{ records: MemberBodyRecord[]; tableReady: boolean }> {
  await requireRole(['admin', 'instructor'])

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_body_records')
    .select('id, member_id, recorded_at, weight_kg, height_cm, note, created_at')
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(120)

  if (error && isMissingBodyRecordsTable(error.message, error.code)) {
    return {
      records: fallback ? bootstrapFromMember({ id: memberId, ...fallback }) : [],
      tableReady: false,
    }
  }

  if (error) {
    console.error('getMemberBodyRecords:', error)
    return {
      records: fallback ? bootstrapFromMember({ id: memberId, ...fallback }) : [],
      tableReady: true,
    }
  }

  const records = (data ?? []).map(normalizeRecord)
  if (records.length === 0 && fallback?.weight_kg) {
    return {
      records: bootstrapFromMember({ id: memberId, ...fallback }),
      tableReady: true,
    }
  }

  return { records, tableReady: true }
}

async function memberBodyWriteClient() {
  try {
    return createAdminClient()
  } catch {
    return await createStaffDataClient()
  }
}

export async function addMemberBodyRecord(
  memberId: string,
  weightKg: number,
  options?: { recordedAt?: string; heightCm?: number | null },
): Promise<{ record?: MemberBodyRecord; error?: string; migrationHint?: string }> {
  await requireRole(['admin', 'instructor'])

  const weight = Number(weightKg)
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
    return { error: '체중을 올바르게 입력해주세요.' }
  }

  const recordedAt = options?.recordedAt ?? format(new Date(), 'yyyy-MM-dd')
  const supabase = await memberBodyWriteClient()

  const { data: existingToday } = await supabase
    .from('member_body_records')
    .select('id')
    .eq('member_id', memberId)
    .eq('recorded_at', recordedAt)
    .maybeSingle()

  let saved: MemberBodyRecord | undefined

  if (existingToday?.id) {
    const { data, error } = await supabase
      .from('member_body_records')
      .update({
        weight_kg: weight,
        height_cm: options?.heightCm ?? null,
      })
      .eq('id', existingToday.id)
      .select('id, member_id, recorded_at, weight_kg, height_cm, note, created_at')
      .single()

    if (error) {
      if (isMissingBodyRecordsTable(error.message, error.code)) {
        return {
          error: '신체 기록 테이블이 없습니다.',
          migrationHint: 'supabase/add-member-body-records.sql',
        }
      }
      return { error: error.message }
    }
    saved = normalizeRecord(data)
  } else {
    const { data, error } = await supabase
      .from('member_body_records')
      .insert({
        member_id: memberId,
        recorded_at: recordedAt,
        weight_kg: weight,
        height_cm: options?.heightCm ?? null,
      })
      .select('id, member_id, recorded_at, weight_kg, height_cm, note, created_at')
      .single()

    if (error) {
      if (isMissingBodyRecordsTable(error.message, error.code)) {
        return {
          error: '신체 기록 테이블이 없습니다.',
          migrationHint: 'supabase/add-member-body-records.sql',
        }
      }
      return { error: error.message }
    }
    saved = normalizeRecord(data)
  }

  const heightForBmi = options?.heightCm ?? saved.height_cm
  const bmi = calculateMemberBmi(heightForBmi, weight)

  await supabase
    .from('members')
    .update({
      weight_kg: weight,
      ...(heightForBmi ? { height_cm: heightForBmi } : {}),
      ...(bmi != null ? { bmi } : {}),
    })
    .eq('id', memberId)

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/lesson-status')

  return { record: saved }
}

/** 수업현황 선수 타일 — 해당 수업일 기준 체중 기록 */
export async function recordLessonStatusWeight(
  memberId: string,
  lessonDate: string,
  weightKg: number,
): Promise<{ error?: string; migrationHint?: string }> {
  const result = await addMemberBodyRecord(memberId, weightKg, {
    recordedAt: lessonDate,
  })
  if (result.error) {
    return { error: result.error, migrationHint: result.migrationHint }
  }
  return {}
}

/** 수업현황 — 체중 비우기/0 입력 시 해당 수업일 기록 삭제 */
export async function clearLessonStatusWeight(
  memberId: string,
  lessonDate: string,
): Promise<{ deleted?: boolean; error?: string; migrationHint?: string }> {
  await requireRole(['admin', 'instructor'])

  const supabase = await memberBodyWriteClient()
  const { data: existing, error: lookupError } = await supabase
    .from('member_body_records')
    .select('id')
    .eq('member_id', memberId)
    .eq('recorded_at', lessonDate)
    .maybeSingle()

  if (lookupError) {
    if (isMissingBodyRecordsTable(lookupError.message, lookupError.code)) {
      return {
        error: '신체 기록 테이블이 없습니다.',
        migrationHint: 'supabase/add-member-body-records.sql',
      }
    }
    return { error: lookupError.message }
  }

  if (!existing?.id) {
    return { deleted: false }
  }

  const { error } = await supabase
    .from('member_body_records')
    .delete()
    .eq('id', existing.id)
    .eq('member_id', memberId)

  if (error) {
    if (isMissingBodyRecordsTable(error.message, error.code)) {
      return {
        error: '신체 기록 테이블이 없습니다.',
        migrationHint: 'supabase/add-member-body-records.sql',
      }
    }
    return { error: error.message }
  }

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/lesson-status')

  return { deleted: true }
}

function bodyWeightKey(memberId: string, date: string) {
  return `${memberId}:${date}`
}

export async function getMemberBodyWeightsForLessons(
  entries: { memberId: string; date: string }[],
): Promise<Record<string, number>> {
  await requireRole(['admin', 'instructor'])
  const uniqueMemberIds = [...new Set(entries.map((entry) => entry.memberId))]
  const uniqueDates = [...new Set(entries.map((entry) => entry.date))]
  if (uniqueMemberIds.length === 0 || uniqueDates.length === 0) return {}

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_body_records')
    .select('member_id, recorded_at, weight_kg')
    .in('member_id', uniqueMemberIds)
    .in('recorded_at', uniqueDates)

  if (error) {
    if (!isMissingBodyRecordsTable(error.message, error.code)) {
      console.error('getMemberBodyWeightsForLessons:', error)
    }
    return {}
  }

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[bodyWeightKey(row.member_id, row.recorded_at)] = Number(row.weight_kg)
  }
  return map
}

export async function getMemberBodyWeightsForDate(
  memberIds: string[],
  date: string,
): Promise<Record<string, number>> {
  await requireRole(['admin', 'instructor'])
  if (memberIds.length === 0) return {}

  const supabase = await createStaffDataClient()
  const { data, error } = await supabase
    .from('member_body_records')
    .select('member_id, weight_kg')
    .in('member_id', memberIds)
    .eq('recorded_at', date)

  if (error) {
    if (!isMissingBodyRecordsTable(error.message, error.code)) {
      console.error('getMemberBodyWeightsForDate:', error)
    }
    return {}
  }

  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    map[row.member_id] = Number(row.weight_kg)
  }
  return map
}

export async function deleteMemberBodyRecord(
  recordId: string,
  memberId: string,
): Promise<{ error?: string }> {
  await requireRole(['admin', 'instructor'])
  if (recordId.startsWith('bootstrap-')) {
    return { error: '삭제할 수 없는 기본 기록입니다.' }
  }

  const supabase = await memberBodyWriteClient()
  const { error } = await supabase
    .from('member_body_records')
    .delete()
    .eq('id', recordId)
    .eq('member_id', memberId)

  if (error) {
    if (isMissingBodyRecordsTable(error.message, error.code)) {
      return { error: '신체 기록 테이블이 없습니다.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/lesson-status')

  return {}
}
