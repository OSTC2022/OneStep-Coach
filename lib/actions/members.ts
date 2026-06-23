'use server'

import { getMemberForCurrentUser, requireRole } from '@/lib/actions/auth'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { canEditMemberBasicInfo, profileRoleToAppRole } from '@/lib/roles'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, unstable_noStore as noStore } from 'next/cache'
import type { Member, MemberFormData } from '@/lib/types'
import { addMemberBodyRecord } from '@/lib/actions/member-body-records'
import {
  calculateMemberBmi,
  normalizePrimaryInstructorId,
  resolveMemberAgeAndBirthDate,
  roundBodyMetric,
} from '@/lib/member-utils'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import {
  fetchLastLessonDateByMember,
  sortFieldUsesMemorySort,
  sortMembersForList,
  type MemberListOrderBy,
} from '@/lib/member-list-sort'
import {
  MEMBER_DETAIL_SELECT,
  MEMBER_LIST_SELECT,
  MEMBER_LIST_SELECT_LEGACY,
  MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL,
  MEMBER_LIST_SELECT_NO_SCHOOL,
} from '@/lib/supabase-selects'

type InstructorSummary = {
  id: string
  name: string
  kakao_id?: string | null
  instagram_id?: string | null
  blog_url?: string | null
}

async function fetchInstructorLookup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  instructorIds: string[],
): Promise<Map<string, InstructorSummary>> {
  if (instructorIds.length === 0) return new Map()

  let { data, error } = await supabase
    .from('instructors')
    .select('id, name, kakao_id, instagram_id, blog_url')
    .in('id', instructorIds)

  if (error) {
    const fallback = await supabase
      .from('instructors')
      .select('id, name')
      .in('id', instructorIds)
    data = fallback.data
    error = fallback.error
  }

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

function isSchoolMissingError(message?: string, code?: string) {
  return code === '42703' && Boolean(message?.includes('school'))
}

function isSnsColumnMissingError(message?: string, code?: string) {
  return (
    code === '42703' &&
    Boolean(message?.includes('kakao_id') || message?.includes('instagram_id'))
  )
}

function isSchemaColumnMissingError(message?: string, code?: string) {
  return (
    isDeletedAtMissingError(message, code) ||
    isSchoolMissingError(message, code) ||
    isSnsColumnMissingError(message, code)
  )
}

function withDeletedAtDefault<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    deleted_at: (row.deleted_at as string | null | undefined) ?? null,
  }
}

function withSchoolDefault<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    school: (row.school as string | null | undefined) ?? null,
  }
}

function withSnsDefaults<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    kakao_id: (row.kakao_id as string | null | undefined) ?? null,
    instagram_id: (row.instagram_id as string | null | undefined) ?? null,
  }
}

function withMemberRowDefaults<T extends Record<string, unknown>>(row: T) {
  return withSnsDefaults(withSchoolDefault(withDeletedAtDefault(row)))
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
    const q = options.search.trim()
    query = query.or(
      `name.ilike.%${q}%,phone.ilike.%${q}%,parent_phone.ilike.%${q}%,sport.ilike.%${q}%`,
    )
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
    orderBy?: MemberListOrderBy
    orderAsc?: boolean
    withCount?: boolean
  },
) {
  const orderBy = options?.orderBy ?? 'recent_lesson'
  const orderAsc = options?.orderAsc ?? false
  const limit = options?.limit
  const offset = options?.offset
  const useMemorySort = sortFieldUsesMemorySort(orderBy)

  const dbOrderBy: string =
    orderBy === 'recent_lesson' || orderBy === 'instructor' || orderBy === 'age'
      ? 'name'
      : orderBy

  const baseOpts = {
    search: options?.search,
    isActive: options?.isActive,
    instructorId: options?.instructorId,
    trash: options?.trash,
    limit: useMemorySort ? undefined : limit,
    offset: useMemorySort ? undefined : offset,
    orderBy: dbOrderBy,
    orderAsc: useMemorySort ? true : orderAsc,
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

  if (result.error && isSchemaColumnMissingError(result.error.message, result.error.code)) {
    const legacyOrderBy = orderBy === 'deleted_at' ? 'name' : orderBy
    const legacySelect =
      isSchoolMissingError(result.error.message, result.error.code) ||
      isSnsColumnMissingError(result.error.message, result.error.code)
        ? MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL
        : MEMBER_LIST_SELECT_LEGACY
    let legacyQuery = buildMembersQuery(supabase, {
      ...baseOpts,
      orderBy: legacyOrderBy,
      select: legacySelect,
      useTrashFilter: false,
    })

    if (!legacyQuery) {
      return { data: [], error: null, count: 0 }
    }

    result = await legacyQuery

    if (result.error && isSchoolMissingError(result.error.message, result.error.code)) {
      legacyQuery = buildMembersQuery(supabase, {
        ...baseOpts,
        orderBy: legacyOrderBy,
        select: MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL,
        useTrashFilter: false,
      })
      if (legacyQuery) {
        result = await legacyQuery
      }
    }

    if (result.error?.message.includes("'created_at'")) {
      legacyQuery = buildMembersQuery(supabase, {
        ...baseOpts,
        orderBy: 'name',
        select: MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL,
        useTrashFilter: false,
      })
      if (legacyQuery) {
        result = await legacyQuery
      }
    }

    if (result.data) {
      result = { ...result, data: result.data.map(withMemberRowDefaults) }
    }
  } else if (result.error?.message.includes("'created_at'")) {
    const legacyQuery = buildMembersQuery(supabase, {
      ...baseOpts,
      orderBy: 'name',
      select: MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL,
      useTrashFilter: false,
    })
    if (legacyQuery) {
      result = await legacyQuery
      if (result.data) {
        result = { ...result, data: result.data.map(withMemberRowDefaults) }
      }
    }
  } else if (result.error && isSchoolMissingError(result.error.message, result.error.code)) {
    const legacyQuery = buildMembersQuery(supabase, {
      ...baseOpts,
      select: MEMBER_LIST_SELECT_NO_SCHOOL,
      useTrashFilter: true,
    })
    if (legacyQuery) {
      result = await legacyQuery
      if (result.data) {
        result = { ...result, data: result.data.map(withMemberRowDefaults) }
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
  orderBy?: MemberListOrderBy
  orderAsc?: boolean
}): Promise<{ data: Member[]; count: number; trashEnabled: boolean }> {
  const supabase = await createStaffDataClient()
  const trashEnabled = options?.trash ? await isMemberTrashEnabled() : true
  const orderBy = options?.orderBy ?? 'recent_lesson'
  const orderAsc =
    options?.orderAsc ?? (orderBy === 'recent_lesson' ? false : true)

  if (options?.trash && !trashEnabled) {
    return { data: [], count: 0, trashEnabled: false }
  }

  const { data: members, error, count } = await fetchMembersRows(supabase, {
    ...options,
    orderBy,
    orderAsc,
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

  let data = attachPrimaryInstructors(members, lookup) as Member[]

  const needsMemorySort = sortFieldUsesMemorySort(orderBy)
  if (needsMemorySort) {
    const lastLessonByMember =
      orderBy === 'recent_lesson'
        ? await fetchLastLessonDateByMember(
            supabase,
            data.map((member) => member.id),
          )
        : new Map<string, string>()
    data = await sortMembersForList(data, orderBy, orderAsc, lastLessonByMember)
    const offset = options?.offset ?? 0
    const limit = options?.limit
    if (limit != null) {
      data = data.slice(offset, offset + limit)
    }
  }

  return {
    data,
    count: count ?? members.length,
    trashEnabled,
  }
}

export type MemberPickerOption = {
  id: string
  name: string
  sport?: string | null
  age?: number | null
  birth_date?: string | null
}

function mapMembersToPickerOptions(
  members: Array<{
    id: string
    name: string
    sport?: string | null
    age?: number | null
    birth_date?: string | null
  }>,
): MemberPickerOption[] {
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    sport: m.sport,
    age: m.age,
    birth_date: m.birth_date,
  }))
}

const pickerSearchCache = new Map<string, MemberPickerOption[]>()
const pickerSearchInflight = new Map<string, Promise<MemberPickerOption[]>>()

/** 빠른 등록 등 — 활성 회원 목록 선로드 */
export async function listMembersForPicker(limit = 80): Promise<MemberPickerOption[]> {
  const { data } = await getMembers({
    isActive: true,
    limit,
    orderBy: 'name',
    orderAsc: true,
  })
  return mapMembersToPickerOptions(data)
}

/** 성인 러닝반 회원 우선 — sport에 러닝/성인 포함, 없으면 전체 활성 회원 */
export async function listAdultRunningMembersForPicker(limit = 200): Promise<MemberPickerOption[]> {
  const { data } = await getMembers({
    isActive: true,
    limit: 500,
    orderBy: 'name',
    orderAsc: true,
  })

  const running = data.filter((member) => {
    const sport = (member.sport ?? '').toLowerCase()
    return (
      sport.includes('러닝') ||
      sport.includes('running') ||
      sport.includes('성인') ||
      sport.includes('마라톤') ||
      sport.includes('10k') ||
      sport.includes('5k')
    )
  })

  const source = running.length > 0 ? running : data
  return mapMembersToPickerOptions(source.slice(0, limit))
}

export async function searchMembersForPicker(search: string) {
  const q = search.trim()
  if (!q) return []
  const { data } = await getMembers({
    search: q,
    isActive: true,
    limit: LIST_PAGE_SIZE,
  })
  return mapMembersToPickerOptions(data)
}

/** 클라이언트 검색 — 동일 쿼리 재요청·캐시 재사용 */
export async function searchMembersForPickerCached(
  search: string,
): Promise<MemberPickerOption[]> {
  const q = search.trim()
  if (!q) return []

  const cached = pickerSearchCache.get(q)
  if (cached) return cached

  const inflight = pickerSearchInflight.get(q)
  if (inflight) return inflight

  const promise = searchMembersForPicker(q)
    .then((rows) => {
      pickerSearchCache.set(q, rows)
      pickerSearchInflight.delete(q)
      return rows
    })
    .catch((error) => {
      pickerSearchInflight.delete(q)
      throw error
    })

  pickerSearchInflight.set(q, promise)
  return promise
}

export async function getMember(id: string): Promise<Member | null> {
  noStore()
  const supabase = await createStaffDataClient()

  const selectAttempts = [
    { select: MEMBER_DETAIL_SELECT, filterDeleted: true },
    { select: MEMBER_LIST_SELECT_LEGACY, filterDeleted: false },
    { select: MEMBER_LIST_SELECT_LEGACY_NO_SCHOOL, filterDeleted: false },
  ]

  let member: Record<string, unknown> | null = null
  let error: { message?: string; code?: string } | null = null

  for (const attempt of selectAttempts) {
    let query = supabase.from('members').select(attempt.select).eq('id', id)
    if (attempt.filterDeleted) {
      query = query.is('deleted_at', null)
    }
    const result = await query.single()
    if (!result.error && result.data) {
      member = result.data
      error = null
      break
    }
    error = result.error
    if (!isSchemaColumnMissingError(error?.message, error?.code)) {
      break
    }
  }

  if (error || !member) {
    console.error('Error fetching member:', error)
    return null
  }

  member = withMemberRowDefaults(member)

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
    return createServiceRoleClient()
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

  const { birth_date, age } = resolveMemberAgeAndBirthDate(
    formData.birth_date,
    formData.age,
  )

  const { data, error } = await supabase
    .from('members')
    .insert({
      name,
      birth_date,
      age,
      grade: normalizeOptionalString(formData.grade),
      school: normalizeOptionalString(formData.school),
      phone: normalizeOptionalString(formData.phone),
      parent_phone: normalizeOptionalString(formData.parent_phone),
      sport: normalizeOptionalString(formData.sport),
      gender: formData.gender ?? null,
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

export async function updateMember(id: string, formData: Partial<MemberFormData>): Promise<{ data?: Member; error?: string; warning?: string }> {
  await requireRole(['admin'])
  const supabase = await memberWriteClient()
  
  const updateData: Record<string, unknown> = {}
  
  if (formData.name !== undefined) updateData.name = formData.name
  if (formData.birth_date !== undefined || formData.age !== undefined) {
    if (formData.birth_date !== undefined) {
      const resolved = resolveMemberAgeAndBirthDate(
        formData.birth_date,
        formData.age,
      )
      updateData.birth_date = resolved.birth_date
      updateData.age = resolved.age
    } else if (formData.age !== undefined) {
      updateData.age =
        formData.age != null && formData.age >= 0 && formData.age <= 120
          ? Math.round(formData.age)
          : null
    }
  }
  if (formData.grade !== undefined) updateData.grade = normalizeOptionalString(formData.grade)
  if (formData.school !== undefined) updateData.school = normalizeOptionalString(formData.school)
  if (formData.phone !== undefined) updateData.phone = formData.phone || null
  if (formData.parent_phone !== undefined) updateData.parent_phone = formData.parent_phone || null
  if (formData.sport !== undefined) updateData.sport = formData.sport || null
  if (formData.gender !== undefined) updateData.gender = formData.gender ?? null
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

  let { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  let warning: string | undefined
  if (error && isSchoolMissingError(error.message, error.code) && 'school' in updateData) {
    const { school: _school, ...withoutSchool } = updateData
    const retry = await supabase
      .from('members')
      .update(withoutSchool)
      .eq('id', id)
      .select()
      .single()
    data = retry.data
    error = retry.error
    if (!error) warning = SCHOOL_MIGRATION_HINT
  }

  if (error) {
    console.error('Error updating member:', error)
    return { error: mapMemberError(error.message) }
  }

  if (formData.weight_kg !== undefined && formData.weight_kg) {
    await addMemberBodyRecord(id, formData.weight_kg, {
      heightCm: formData.height_cm,
    })
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${id}`)
  revalidatePath(`/dashboard/members/${id}/edit`)
  revalidatePath('/dashboard/my')
  return {
    data: withMemberRowDefaults(data as Record<string, unknown>) as Member,
    warning,
  }
}

export type MemberBasicInfoFormData = {
  birth_date?: string
  age?: number
  grade?: string
  school?: string
}

async function assertCanEditMemberBasicInfo(memberId: string): Promise<{ error?: string }> {
  const user = await getDashboardProfile()
  if (!user) return { error: '로그인이 필요합니다.' }

  const role = profileRoleToAppRole(user.role)
  if (canEditMemberBasicInfo(role)) return {}

  return { error: '권한이 없습니다.' }
}

const SCHOOL_MIGRATION_HINT =
  '학교/소속팀 저장을 위해 Supabase SQL Editor에서 supabase/add-member-school.sql 을 실행해주세요.'

const SNS_MIGRATION_HINT =
  '카카오톡·인스타그램 저장을 위해 Supabase SQL Editor에서 supabase/add-sns-accounts.sql 을 실행해주세요.'

export async function updateMemberBasicInfo(
  memberId: string,
  formData: MemberBasicInfoFormData,
): Promise<{ data?: Member; error?: string; warning?: string }> {
  const access = await assertCanEditMemberBasicInfo(memberId)
  if (access.error) return { error: access.error }

  const supabase = await memberWriteClient()
  const updateData: Record<string, unknown> = {}

  if (formData.birth_date !== undefined || formData.age !== undefined) {
    const resolved = resolveMemberAgeAndBirthDate(
      formData.birth_date,
      formData.age,
    )
    updateData.birth_date = resolved.birth_date
    updateData.age = resolved.age
  }
  if (formData.grade !== undefined) {
    updateData.grade = normalizeOptionalString(formData.grade)
  }
  if (formData.school !== undefined) {
    updateData.school = normalizeOptionalString(formData.school)
  }

  let { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single()

  let warning: string | undefined
  if (error && isSchoolMissingError(error.message, error.code) && 'school' in updateData) {
    const { school: _school, ...withoutSchool } = updateData
    const retry = await supabase
      .from('members')
      .update(withoutSchool)
      .eq('id', memberId)
      .select()
      .single()
    data = retry.data
    error = retry.error
    if (!error) warning = SCHOOL_MIGRATION_HINT
  }

  if (error) {
    console.error('Error updating member basic info:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/edit`)
  revalidatePath('/dashboard/my')
  return { data: withMemberRowDefaults(data as Record<string, unknown>) as Member, warning }
}

export type MemberContactFormData = {
  phone?: string
  parent_phone?: string
  kakao_id?: string
  instagram_id?: string
}

export async function updateMemberContactInfo(
  memberId: string,
  formData: MemberContactFormData,
): Promise<{ data?: Member; error?: string; warning?: string }> {
  const access = await assertCanEditMemberBasicInfo(memberId)
  if (access.error) return { error: access.error }

  const supabase = await memberWriteClient()
  const updateData: Record<string, unknown> = {}

  if (formData.phone !== undefined) {
    updateData.phone = normalizeOptionalString(formData.phone)
  }
  if (formData.parent_phone !== undefined) {
    updateData.parent_phone = normalizeOptionalString(formData.parent_phone)
  }
  if (formData.kakao_id !== undefined) {
    updateData.kakao_id = normalizeOptionalString(formData.kakao_id)
  }
  if (formData.instagram_id !== undefined) {
    updateData.instagram_id = normalizeOptionalString(formData.instagram_id)
  }

  let { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single()

  let warning: string | undefined
  const hadSnsFields = 'kakao_id' in updateData || 'instagram_id' in updateData
  if (error && isSnsColumnMissingError(error.message, error.code) && hadSnsFields) {
    const { kakao_id: _k, instagram_id: _i, ...withoutSns } = updateData
    const retry = await supabase
      .from('members')
      .update(withoutSns)
      .eq('id', memberId)
      .select()
      .single()
    data = retry.data
    error = retry.error
    if (!error) warning = SNS_MIGRATION_HINT
  }

  if (error) {
    console.error('Error updating member contact info:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath('/dashboard/my')
  return { data: withMemberRowDefaults(data as Record<string, unknown>) as Member, warning }
}

export type MemberPhysicalInfoFormData = {
  height_cm?: number | string
  weight_kg?: number | string
}

function parseOptionalBodyMetric(
  value: number | string | undefined,
): number | null {
  if (value === undefined || value === '') return null
  return roundBodyMetric(value)
}

export async function updateMemberPhysicalInfo(
  memberId: string,
  formData: MemberPhysicalInfoFormData,
): Promise<{ data?: Member; error?: string }> {
  await requireRole(['admin'])

  const heightCm = parseOptionalBodyMetric(formData.height_cm)
  const weightKg = parseOptionalBodyMetric(formData.weight_kg)

  const supabase = await memberWriteClient()
  const updateData: Record<string, unknown> = {
    height_cm: heightCm,
    weight_kg: weightKg,
    bmi: calculateMemberBmi(heightCm, weightKg),
  }

  const { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single()

  if (error) {
    console.error('Error updating member physical info:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/my')
  return { data: withMemberRowDefaults(data as Record<string, unknown>) as Member }
}

const BODY_BASELINE_MIGRATION_HINT =
  '초기 설정 날짜 저장을 위해 Supabase SQL Editor에서 supabase/add-member-body-baseline-date.sql 을 실행해 주세요.'

function isMissingBodyBaselineDateColumn(message: string | undefined) {
  if (!message) return false
  return message.toLowerCase().includes('body_baseline_recorded_at')
}

/** 신체정보 초기 설정 날짜·키·몸무게 (관리자만) */
export async function updateMemberBodyBaseline(
  memberId: string,
  formData: {
    recorded_at: string
    height_cm?: number | string
    weight_kg?: number | string
  },
): Promise<{ data?: Member; error?: string; migrationHint?: string }> {
  await requireRole(['admin'])

  if (!formData.recorded_at) {
    return { error: '초기 설정 날짜를 선택해주세요.' }
  }

  const heightCm = parseOptionalBodyMetric(formData.height_cm)
  const weightKg = parseOptionalBodyMetric(formData.weight_kg)
  if (heightCm == null || heightCm <= 0) {
    return { error: '현재 키를 입력해주세요.' }
  }
  if (weightKg == null || weightKg <= 0) {
    return { error: '몸무게를 입력해주세요.' }
  }

  const supabase = await memberWriteClient()
  const updateData: Record<string, unknown> = {
    body_baseline_recorded_at: formData.recorded_at,
    height_cm: heightCm,
    weight_kg: weightKg,
    bmi: calculateMemberBmi(heightCm, weightKg),
  }

  let { data, error } = await supabase
    .from('members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single()

  if (error && isMissingBodyBaselineDateColumn(error.message)) {
    const { body_baseline_recorded_at: _removed, ...fallbackUpdate } = updateData
    const retry = await supabase
      .from('members')
      .update(fallbackUpdate)
      .eq('id', memberId)
      .select()
      .single()
    data = retry.data
    error = retry.error
    if (!error) {
      revalidatePath('/dashboard/members')
      revalidatePath(`/dashboard/members/${memberId}`)
      revalidatePath(`/dashboard/members/${memberId}/body`)
      revalidatePath('/dashboard/my')
      return {
        data: withMemberRowDefaults(data as Record<string, unknown>) as Member,
        migrationHint: BODY_BASELINE_MIGRATION_HINT,
      }
    }
  }

  if (error) {
    console.error('Error updating member body baseline:', error)
    return { error: mapMemberError(error.message) }
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath(`/dashboard/members/${memberId}/body`)
  revalidatePath('/dashboard/my')
  return { data: withMemberRowDefaults(data as Record<string, unknown>) as Member }
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
