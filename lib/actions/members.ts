'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Member, MemberFormData } from '@/lib/types'
import { resolveMemberAgeAndBirthDate, normalizePrimaryInstructorId } from '@/lib/member-utils'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import { MEMBER_DETAIL_SELECT, MEMBER_LIST_SELECT } from '@/lib/supabase-selects'

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

async function fetchMembersRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options?: {
    search?: string
    isActive?: boolean
    instructorId?: string
    limit?: number
    offset?: number
    orderBy?: 'name' | 'created_at'
    orderAsc?: boolean
    withCount?: boolean
  },
) {
  const orderBy = options?.orderBy ?? 'name'
  const orderAsc = options?.orderAsc ?? true

  let query = supabase
    .from('members')
    .select(MEMBER_LIST_SELECT, options?.withCount ? { count: 'exact' } : undefined)
    .order(orderBy, { ascending: orderAsc })

  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,phone.ilike.%${options.search}%`)
  }

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  if (options?.instructorId) {
    query = query.eq('primary_instructor_id', options.instructorId)
  }

  const limit = options?.limit
  const offset = options?.offset

  if (limit != null && offset != null) {
    query = query.range(offset, offset + limit - 1)
  } else if (limit != null) {
    query = query.limit(limit)
  }

  let result = await query

  if (result.error?.message.includes("'created_at'")) {
    query = supabase
      .from('members')
      .select(MEMBER_LIST_SELECT, options?.withCount ? { count: 'exact' } : undefined)
      .order('name', { ascending: orderAsc })

    if (options?.search) {
      query = query.or(`name.ilike.%${options.search}%,phone.ilike.%${options.search}%`)
    }
    if (options?.isActive !== undefined) {
      query = query.eq('is_active', options.isActive)
    }
    if (options?.instructorId) {
      query = query.eq('primary_instructor_id', options.instructorId)
    }
    if (limit != null && offset != null) {
      query = query.range(offset, offset + limit - 1)
    } else if (limit != null) {
      query = query.limit(limit)
    }

    result = await query
  }

  return result
}

export async function getMembers(options?: {
  search?: string
  isActive?: boolean
  instructorId?: string
  limit?: number
  offset?: number
  orderBy?: 'name' | 'created_at'
  orderAsc?: boolean
}): Promise<{ data: Member[]; count: number }> {
  const supabase = await createClient()

  const { data: members, error, count } = await fetchMembersRows(supabase, {
    ...options,
    withCount: true,
  })

  if (error) {
    console.error('Error fetching members:', error)
    return { data: [], count: 0 }
  }

  if (!members?.length) {
    return { data: [], count: count ?? 0 }
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
  const supabase = await createClient()

  const { data: member, error } = await supabase
    .from('members')
    .select(MEMBER_DETAIL_SELECT)
    .eq('id', id)
    .single()

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

function calculateBmi(heightCm?: number, weightKg?: number): number | null {
  if (!heightCm || !weightKg) return null
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
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
    return '데이터베이스 권한이 없습니다. Supabase SQL Editor에서 supabase/fix-members-rls.sql을 실행해주세요.'
  }
  return message
}

export async function createMember(formData: MemberFormData): Promise<{ data?: Member; error?: string }> {
  const supabase = await createClient()

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
      bmi: calculateBmi(formData.height_cm, formData.weight_kg),
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
  const supabase = await createClient()
  
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
    updateData.bmi = calculateBmi(height, weight)
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
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('members')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    console.error('Error toggling member status:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/members')
  return {}
}

export async function deleteMember(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting member:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/members')
  return {}
}
