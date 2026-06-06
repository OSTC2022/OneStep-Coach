'use server'

import { requireRole } from '@/lib/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Member, MemberFormData } from '@/lib/types'
import {
  calculateMemberBmi,
  normalizePrimaryInstructorId,
  resolveMemberAgeAndBirthDate,
} from '@/lib/member-utils'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import {
  MEMBER_DETAIL_SELECT,
  MEMBER_LIST_SELECT,
  MEMBER_LIST_SELECT_LEGACY,
} from '@/lib/supabase-selects'

type InstructorSummary = { id: string; name: string }

async function fetchInstructorLookup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instructorIds: string[],
): Promise<Map<string, InstructorSummary>> {
  if (instructorIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('instructors')
    .select('id, name')
    .in('id', instructorIds)

  if (error || !data) return new Map()

  return new Map(data.map((instructor) => [instructor.id, instructor]))
}

function attachPrimaryInstructors<T extends { primary_instructor_id?: string | null }>(
  members: T[],
  lookup: Map<string, InstructorSummary>,
) {
  return members.map((member) => ({
    ...member,
    primary_instructor: member.primary_instructor_id
      ? lookup.get(member.primary_instructor_id) ?? null
      : null,
  }))
}

function isDeletedAtMissingError(message?: string, code?: string) {
  return code === '42703' || Boolean(message?.includes('deleted_at'))
}

function withDeletedAtDefault<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    deleted_at: (row.deleted_at as string | null | undefined) ?? null,
  }
}

function applyTrashFilter<T extends { is: (col: string, val: null) => T; not: (col: string, op: string, val: null) => T }>(
  query: T,
  trash?: boolean,
): T {
  if (trash) {
    return query.not('deleted_at', 'is', null)
  }
  return query.is('deleted_at', null)
}

function buildMembersQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: {
    search?: string
    isActive?: boolean
    instructorId?: string
    trash?: boolean
    limit?: number
    offset?: number
    orderBy: string
    orderAsc: boolean
    withCount?: boolean
    select: string
    useTrashFilter: boolean
  },
) {
  let query = supabase
    .from('members')
    .select(options.select, options.withCount ? { count: 'exact' } : undefined)

  if (options.useTrashFilter) {
    query = applyTrashFilter(query, options.trash)
  } else if (options.trash) {
    return null
  }

  query = query.order(options.orderBy, { ascending: options.orderAsc })

  if (options.search) {
    query = query.or(`name.ilike.%${options.search}%,phone.ilike.%${options.search}%`)
  }
  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }
  if (options.instructorId) {
    query = query.eq('primary_instructor_id', options.instructorId)
  }
  if (options.limit != null && options.offset != null) {
    query = query.range(options.offset, options.offset + options.limit - 1)
  } else if (options.limit != null) {
    query = query.limit(options.limit)
  }

  return query
}

async function fetchMembersRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options?: {
    search?: string
    isActive?: boolean
    instructorId?: string
    trash?: boolean
    limit?: number
    offset?: number
    orderBy?: 'name' | 'created_at' | 'deleted_at'
    orderAsc?: boolean
    withCount?: boolean
  },
) {
  const orderBy = options?.orderBy ?? 'name'
  const orderAsc = options?.orderAsc ?? true
  const limit = options?.limit
  const offset = options?.offset

  const baseOpts = {
    search: options?.search,
    isActive: options?.isActive,
    instructorId: options?.instructorId,
    trash: options?.trash,
    limit,
    offset,
    orderBy,
    orderAsc,
    withCount: options?.withCount,
  }

  const primaryQuery = buildMembersQuery(supabase, {
    ...baseOpts,
    select: MEMBER_LIST_SELECT,
    useTrashFilter: true,
  })

  if (!primaryQuery) {
    return { data: [], error: null, count: 0 }
  }

  let result = await primaryQuery

  if (result.error && isDeletedAtMissingError(result.error.message, result.error.code)) {
    const legacyOrderBy = orderBy === 'deleted_at' ? 'name' : orderBy
    let legacyQuery = buildMembersQuery(supabase, {
      ...baseOpts,
      orderBy: legacyOrderBy,
      select: MEMBER_LIST_SELECT_LEGACY,
      useTrashFilter: false,
    })

    if (!legacyQuery) {
      return { data: [], error: null, count: 0 }
    }

    result = await legacyQuery

    if (result.error?.message.includes("'created_at'")) {
      legacyQuery = buildMembersQuery(supabase, {
        ...baseOpts,
        orderBy: 'name',
        select: MEMBER_LIST_SELECT_LEGACY,
        useTrashFilter: false,
      })
      if (legacyQuery) {
        result = await legacyQuery
      }
    }

    if (result.data) {
      result = { ...result, data: result.data.map(withDeletedAtDefault) }
    }
  } else if (result.error?.message.includes("'created_at'")) {
    const legacyQuery = buildMembersQuery(supabase, {
      ...baseOpts,
      orderBy: 'name',
      select: MEMBER_LIST_SELECT_LEGACY,
      useTrashFilter: false,
    })
    if (legacyQuery) {
      result = await legacyQuery
      if (result.data) {
        result = { ...result, data: result.data.map(withDeletedAtDefault) }
      }
    }
  }

  return result
}

export async function getMembers(options?: {
  search?: string
  isActive?: boolean
  instructorId?: string
  trash?: boolean
  limit?: number
  offset?: number
  orderBy?: 'name' | 'created_at' | 'deleted_at'
  orderAsc?: boolean
}): Promise<{ data: Member[]; count: number; trashEnabled: boolean }> {
  const supabase = await createStaffDataClient()
  const trashEnabled = options?.trash ? await isMemberTrashEnabled() : true

  if (options?.trash && !trashEnabled) {
    return { data: [], count: 0, trashEnabled: false }
  }

  const { data: members, error, count } = await fetchMembersRows(supabase, {
    ...options,
    withCount: true,
  })

  if (error) {
    console.error('Error fetching members:', error)
    return { data: [], count: 0, trashEnabled }
  }

  if (!members?.length) {
    return { data: [], count: count ?? 0, trashEnabled }
  }

  const instructorIds = [
    ...new Set(
      members
        .map((member) => member.primary_instructor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const lookup = await fetchInstructorLookup(supabase, instructorIds)

  return {
    data: attachPrimaryInstructors(members, lookup) as Member[],
    count: count ?? members.length,
    trashEnabled,
  }
}

export async function searchMembersForPicker(search: string) {
  const q = search.trim()
  if (!q) return []
  const { data } = await getMembers({
    search: q,
    isActive: true,
    limit: LIST_PAGE_SIZE,
  })
  return data.map((m) => ({
    id: m.id,
    name: m.name,
    sport: m.sport,
    age: m.age,
    birth_date: m.birth_date,
  }))
}

export async function getMember(id: string): Promise<Member | null> {
  const supabase = await createStaffDataClient()

  let { data: member, error } = await supabase
    .from('members')
    .select(MEMBER_DETAIL_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error && isDeletedAtMissingError(error.message, error.code)) {
    const fallback = await supabase
      .from('members')
      .select(MEMBER_LIST_SELECT_LEGACY)
      .eq('id', id)
      .single()
    member = fallback.data ? withDeletedAtDefault(fallback.data) : null
    error = fallback.error
  }

  if (error || !member) {
    console.error('Error fetching member:', error)
    return null
  }

  if (!member.primary_instructor_id) {
    return { ...member, primary_instructor: null } as Member
  }

  const lookup = await fetchInstructorLookup(supabase, [member.primary_instructor_id])
  return attachPrimaryInstructors([member], lookup)[0] as Member
}

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function mapMemberError(message: string): string {
  if (message.includes("Could not find the table 'public.members'")) {
    return '회원 테이블이 없습니다. Supabase SQL Editor에서 supabase/members.sql 파일을 실행해주세요.'
  }
  const missingColumnMatch = message.match(
    /Could not find the '([^']+)' column of 'members'/,
  )
  if (missingColumnMatch) {
    return `members 테이블에 '${missingColumnMatch[1]}' 컬럼이 없습니다. Supabase SQL Editor에서 supabase/add-members-columns.sql 전체를 실행한 뒤 다시 시도해주세요.`
  }
  if (message.includes('foreign key constraint')) {
    return '담당 강사 정보가 올바르지 않습니다. 강사 선택을 해제하고 다시 시도해주세요.'
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return (
      '데이터베이스 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY가 있는지 확인하거나, ' +
      'Supabase SQL Editor에서 supabase/fix-members-rls.sql을 실행해주세요.'
    )
  }
  return message
}

function getMemberWriteClient() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

async function memberWriteClient() {
  return getMemberWriteClient() ?? (await createClient())
}

export async function createMember(formData: MemberFormData): Promise<{ data?: Member; error?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()

  const name = formData.name?.trim()
  if (!name) {
    return { error: '이름을 입력해주세요.' }
  }

  const { birth_date, age } = resolveMemberAgeAndBirthDate(formData.birth_date)

  const { data, error } = await supabase
    .from('members')
    .insert({
      name,
      birth_date,
      age,
      grade: normalizeOptionalString(formData.grade),
      phone: normalizeOptionalString(formData.phone),
      parent_phone: normalizeOptionalString(formData.parent_phone),
      sport: normalizeOptionalString(formData.sport),
      height_cm: formData.height_cm ?? null,
      weight_kg: formData.weight_kg ?? null,
      bmi: calculateMemberBmi(formData.height_cm, formData.weight_kg),
      goal: normalizeOptionalString(formData.goal),
      injury_history: normalizeOptionalString(formData.injury_history),
      memo: normalizeOptionalString(formData.memo),
      primary_instructor_id: normalizePrimaryInstructorId(formData.primary_instructor_id),
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating member:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  return { data: data as Member }
}

export async function updateMember(id: string, formData: Partial<MemberFormData>): Promise<{ data?: Member; error?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()
  
  const updateData: Record<string, unknown> = {}
  
  if (formData.name !== undefined) updateData.name = formData.name
  if (formData.birth_date !== undefined) {
    const resolved = resolveMemberAgeAndBirthDate(formData.birth_date)
    updateData.birth_date = resolved.birth_date
    updateData.age = resolved.age
  }
  if (formData.grade !== undefined) updateData.grade = formData.grade || null
  if (formData.phone !== undefined) updateData.phone = formData.phone || null
  if (formData.parent_phone !== undefined) updateData.parent_phone = formData.parent_phone || null
  if (formData.sport !== undefined) updateData.sport = formData.sport || null
  if (formData.height_cm !== undefined) updateData.height_cm = formData.height_cm || null
  if (formData.weight_kg !== undefined) updateData.weight_kg = formData.weight_kg || null
  if (formData.height_cm !== undefined || formData.weight_kg !== undefined) {
    const height = formData.height_cm ?? undefined
    const weight = formData.weight_kg ?? undefined
    updateData.bmi = calculateMemberBmi(height, weight)
  }
  if (formData.goal !== undefined) updateData.goal = formData.goal || null
  if (formData.injury_history !== undefined) updateData.injury_history = formData.injury_history || null
  if (formData.memo !== undefined) updateData.memo = formData.memo || null
  if (formData.primary_instructor_id !== undefined) {
    updateData.primary_instructor_id = normalizePrimaryInstructorId(formData.primary_instructor_id)
  }

  const { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating member:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${id}`)
  return { data: data as Member }
}

export async function toggleMemberStatus(id: string, isActive: boolean): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()
  
  const { error } = await supabase
    .from('members')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    console.error('Error toggling member status:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  return {}
}

const MEMBER_TRASH_SETUP_MESSAGE =
  '휴지통 기능을 사용하려면 Supabase SQL Editor에서 supabase/add-members-deleted-at.sql 을 실행해주세요.'

export async function isMemberTrashEnabled(): Promise<boolean> {
  try {
    const supabase = await createStaffDataClient()
    const { error } = await supabase.from('members').select('deleted_at').limit(1)
    if (!error) return true
    return !isDeletedAtMissingError(error.message, error.code)
  } catch {
    return false
  }
}

export async function getDeletedMembersCount(): Promise<number> {
  try {
    const supabase = await createStaffDataClient()
    const { count, error } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .not('deleted_at', 'is', null)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/** 휴지통으로 이동 (소프트 삭제) */
export async function deleteMember(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])

  if (!(await isMemberTrashEnabled())) {
    return { error: MEMBER_TRASH_SETUP_MESSAGE }
  }

  const supabase = await memberWriteClient()

  const { data, error } = await supabase
    .from('members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: MEMBER_TRASH_SETUP_MESSAGE }
    }
    console.error('Error moving member to trash:', error)
    return { error: mapMemberError(error.message) }
  }

  if (!data) {
    return { error: '회원을 찾을 수 없거나 이미 삭제되었습니다.' }
  }

  revalidatePath('/dashboard/members')
  return {}
}

/** 휴지통에서 복구 */
export async function restoreMember(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()

  const { error } = await supabase
    .from('members')
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: MEMBER_TRASH_SETUP_MESSAGE }
    }
    console.error('Error restoring member:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  return {}
}

/** 휴지통에서 영구 삭제 */
export async function permanentlyDeleteMember(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null)

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: MEMBER_TRASH_SETUP_MESSAGE }
    }
    console.error('Error permanently deleting member:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  return {}
}
