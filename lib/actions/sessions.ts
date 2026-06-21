'use server'

import { requireRole } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createStaffDataClient } from '@/lib/supabase/staff-data-client'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SessionPackage, SessionPackageFormData } from '@/lib/types'
import {
  SESSION_PACKAGE_DETAIL_SELECT,
  SESSION_PACKAGE_LIST_SELECT,
  SESSION_PACKAGE_LIST_SELECT_LEGACY,
} from '@/lib/supabase-selects'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import {
  isMonthlyPlanPackage,
  isPackageUsableForLesson,
} from '@/lib/session-package-utils'
import {
  pickSessionPackageIdForDeduction,
  type SessionPackageDeductionCandidate,
} from '@/lib/session-package-deduction'
import { fetchLastLessonDateByMember } from '@/lib/member-list-sort'

export type SessionPackageListOrderBy = 'created_at' | 'recent_lesson'

function mapSessionPackageError(message: string): string {
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return (
      '수업권 저장 권한이 없습니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY가 있는지 확인하거나, ' +
      'Supabase SQL Editor에서 supabase/fix-session-packages-rls.sql 을 실행해주세요.'
    )
  }
  if (message.includes("Could not find the table 'public.session_packages'")) {
    return 'session_packages 테이블이 없습니다. supabase/fix-session-packages.sql 을 실행해주세요.'
  }
  return message
}

function getSessionWriteClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return null
  }
}

async function sessionWriteClient() {
  return getSessionWriteClient() ?? (await createClient())
}

const SESSION_PACKAGE_TRASH_SETUP_MESSAGE =
  '휴지통 기능을 사용하려면 Supabase SQL Editor에서 supabase/add-session-packages-deleted-at.sql 을 실행해주세요.'

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

export async function isSessionPackageTrashEnabled(): Promise<boolean> {
  try {
    const supabase = await createStaffDataClient()
    const { error } = await supabase.from('session_packages').select('deleted_at').limit(1)
    if (!error) return true
    return !isDeletedAtMissingError(error.message, error.code)
  } catch {
    return false
  }
}

export async function getDeletedSessionPackagesCount(memberId?: string): Promise<number> {
  try {
    const supabase = await createStaffDataClient()
    let query = supabase
      .from('session_packages')
      .select('id', { count: 'exact', head: true })
      .not('deleted_at', 'is', null)

    if (memberId) {
      query = query.eq('member_id', memberId)
    }

    const { count, error } = await query

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

async function fetchSessionPackageRows(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  options: {
    memberId?: string
    isActive?: boolean
    trash?: boolean
    limit?: number
    offset?: number
    orderBy?: 'created_at' | 'deleted_at'
    orderAsc?: boolean
    withCount?: boolean
    select: string
    useTrashFilter: boolean
  },
) {
  let query = supabase
    .from('session_packages')
    .select(options.select, options.withCount ? { count: 'exact' } : undefined)

  if (options.useTrashFilter) {
    query = applyTrashFilter(query, options.trash)
  } else if (options.trash) {
    return { data: null, error: null, count: 0 }
  }

  const orderBy = options.orderBy ?? 'created_at'
  const orderAsc = options.orderAsc ?? false
  query = query.order(orderBy, { ascending: orderAsc })

  if (options.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  if (options.limit != null) {
    const offset = options.offset ?? 0
    query = query.range(offset, offset + options.limit - 1)
  }

  return query
}

async function fetchSessionPackages(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  options?: {
    memberId?: string
    isActive?: boolean
    trash?: boolean
    limit?: number
    offset?: number
    orderBy?: 'created_at' | 'deleted_at'
    orderAsc?: boolean
    withCount?: boolean
  },
) {
  const trashEnabled = await isSessionPackageTrashEnabled()
  const useTrashFilter = trashEnabled

  const primary = await fetchSessionPackageRows(supabase, {
    ...options,
    orderBy: options?.orderBy ?? 'created_at',
    orderAsc: options?.orderAsc ?? false,
    withCount: options?.withCount,
    select: SESSION_PACKAGE_LIST_SELECT,
    useTrashFilter,
  })

  if (!primary.error) {
    return {
      data: (primary.data ?? []).map((row) => withDeletedAtDefault(row as Record<string, unknown>)),
      error: null,
      count: primary.count,
      trashEnabled,
    }
  }

  if (!isDeletedAtMissingError(primary.error.message, primary.error.code)) {
    return { data: null, error: primary.error, count: 0, trashEnabled: false }
  }

  const legacy = await fetchSessionPackageRows(supabase, {
    ...options,
    orderBy: options?.orderBy === 'deleted_at' ? 'created_at' : (options?.orderBy ?? 'created_at'),
    orderAsc: options?.orderAsc ?? false,
    withCount: options?.withCount,
    select: SESSION_PACKAGE_LIST_SELECT_LEGACY,
    useTrashFilter: false,
  })

  return {
    data: (legacy.data ?? []).map((row) => withDeletedAtDefault({ ...row, deleted_at: null })),
    error: legacy.error,
    count: legacy.count,
    trashEnabled: false,
  }
}

export async function getSessionPackages(options?: {
  memberId?: string
  isActive?: boolean
  trash?: boolean
  limit?: number
  offset?: number
  orderBy?: 'created_at' | 'deleted_at'
  orderAsc?: boolean
}): Promise<{ data: SessionPackage[]; count: number; trashEnabled: boolean }> {
  const supabase = await createStaffDataClient()
  const trashEnabled = options?.trash ? await isSessionPackageTrashEnabled() : true

  if (options?.trash && !trashEnabled) {
    return { data: [], count: 0, trashEnabled: false }
  }

  const { data, error, count } = await fetchSessionPackages(supabase, {
    ...options,
    withCount: true,
  })

  if (error) {
    console.error('Error fetching session packages:', error)
    return { data: [], count: 0, trashEnabled }
  }

  return {
    data: (data ?? []) as SessionPackage[],
    count: count ?? data?.length ?? 0,
    trashEnabled,
  }
}

async function countDeductedLessonsForPackage(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  packageId: string,
  memberId: string,
) {
  const { count: linkedCount, error: linkedError } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('session_package_id', packageId)
    .eq('session_deducted', true)

  if (linkedError) {
    throw new Error(linkedError.message)
  }

  let deductedCount = linkedCount ?? 0

  let packageCountQuery = supabase
    .from('session_packages')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)

  const trashEnabled = await isSessionPackageTrashEnabled()
  if (trashEnabled) {
    packageCountQuery = packageCountQuery.is('deleted_at', null)
  }

  const { count: packageCount } = await packageCountQuery

  if ((packageCount ?? 0) <= 1) {
    const { count: orphanCount } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('session_deducted', true)
      .is('session_package_id', null)

    deductedCount += orphanCount ?? 0
  }

  return deductedCount
}

/** 차감·복구 시 현재 잔여 횟수 기준으로 ±1 (수동 수정값 유지) */
export async function adjustSessionPackageRemaining(
  packageId: string,
  delta: number,
  client?: Awaited<ReturnType<typeof createStaffDataClient>>,
): Promise<{ remaining?: number; error?: string }> {
  const supabase = client ?? (await createStaffDataClient())

  const { data: pkg, error: pkgError } = await supabase
    .from('session_packages')
    .select(
      'id, member_id, total_sessions, remaining_sessions, note, expires_at, is_active',
    )
    .eq('id', packageId)
    .single()

  if (pkgError || !pkg) {
    return { error: '수업권을 찾을 수 없습니다.' }
  }

  try {
    if (isMonthlyPlanPackage(pkg.note)) {
      const stillActive = isPackageUsableForLesson({
        is_active: pkg.is_active,
        remaining_sessions: 0,
        note: pkg.note,
        expires_at: pkg.expires_at,
      })

      if (stillActive !== pkg.is_active) {
        const { error: updateError } = await supabase
          .from('session_packages')
          .update({ is_active: stillActive })
          .eq('id', packageId)

        if (updateError) {
          return { error: mapSessionPackageError(updateError.message) }
        }
      }

      return { remaining: 0 }
    }

    let newRemaining = pkg.remaining_sessions + delta
    if (delta > 0) {
      newRemaining = Math.min(pkg.total_sessions, newRemaining)
    }

    const { error: updateError } = await supabase
      .from('session_packages')
      .update({
        remaining_sessions: newRemaining,
        is_active: newRemaining > 0,
      })
      .eq('id', packageId)

    if (updateError) {
      return { error: mapSessionPackageError(updateError.message) }
    }

    const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
      p_member_id: pkg.member_id,
    })
    if (syncError) {
      console.warn('sync_member_remaining_sessions:', syncError.message)
    }

    return { remaining: newRemaining }
  } catch (error) {
    const message = error instanceof Error ? error.message : '잔여 횟수 변경 실패'
    return { error: message }
  }
}

/** 차감된 수업 수 기준으로 잔여 횟수 재계산 (관리자 수동 재계산용) */
export async function reconcileSessionPackageRemaining(
  packageId: string,
  client?: Awaited<ReturnType<typeof createStaffDataClient>>,
): Promise<{ remaining?: number; error?: string }> {
  const supabase = client ?? (await createStaffDataClient())

  const { data: pkg, error: pkgError } = await supabase
    .from('session_packages')
    .select('id, member_id, total_sessions, note, expires_at, is_active')
    .eq('id', packageId)
    .single()

  if (pkgError || !pkg) {
    return { error: '수업권을 찾을 수 없습니다.' }
  }

  try {
    if (isMonthlyPlanPackage(pkg.note)) {
      const stillActive = isPackageUsableForLesson({
        is_active: pkg.is_active,
        remaining_sessions: 0,
        note: pkg.note,
        expires_at: pkg.expires_at,
      })

      const { error: updateError } = await supabase
        .from('session_packages')
        .update({ is_active: stillActive })
        .eq('id', packageId)

      if (updateError) {
        return { error: mapSessionPackageError(updateError.message) }
      }

      return { remaining: 0 }
    }

    const deductedCount = await countDeductedLessonsForPackage(
      supabase,
      packageId,
      pkg.member_id,
    )
    const remaining = Math.max(0, pkg.total_sessions - deductedCount)

    const { error: updateError } = await supabase
      .from('session_packages')
      .update({
        remaining_sessions: remaining,
        is_active: remaining > 0,
      })
      .eq('id', packageId)

    if (updateError) {
      return { error: mapSessionPackageError(updateError.message) }
    }

    const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
      p_member_id: pkg.member_id,
    })
    if (syncError) {
      console.warn('sync_member_remaining_sessions:', syncError.message)
    }

    return { remaining }
  } catch (error) {
    const message = error instanceof Error ? error.message : '잔여 횟수 계산 실패'
    return { error: message }
  }
}

function getCurrentMonthStartKey() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
}

export type RecentSessionPayment = {
  id: string
  total_sessions: number
  price: number | null
  paid_at: string | null
  created_at: string
  payment_method: string | null
  member: { name: string } | null
}

async function fetchSessionRevenueRows(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  options?: { paidFrom?: string; paidTo?: string },
) {
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select('price')
    .not('price', 'is', null)

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  if (options?.paidFrom) {
    query = query.gte('paid_at', options.paidFrom)
  }

  if (options?.paidTo) {
    query = query.lte('paid_at', options.paidTo)
  }

  let { data, error } = await query.limit(1000)

  if (error?.code === '42703' || error?.message?.includes('deleted_at')) {
    let legacy = supabase.from('session_packages').select('price').not('price', 'is', null)
    if (options?.paidFrom) legacy = legacy.gte('paid_at', options.paidFrom)
    if (options?.paidTo) legacy = legacy.lte('paid_at', options.paidTo)
    const retry = await legacy.limit(1000)
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('Error summing session revenue:', error)
    return []
  }

  return data ?? []
}

export async function sumSessionPackageRevenue(options?: {
  paidFrom?: string
  paidTo?: string
}): Promise<number> {
  const supabase = await createStaffDataClient()
  const rows = await fetchSessionRevenueRows(supabase, options)
  return rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0)
}

/** 대시보드·세션/결제 공통 — 이번 달 결제 합계 (휴지통 제외) */
export async function getMonthlySessionRevenue(): Promise<number> {
  return sumSessionPackageRevenue({ paidFrom: getCurrentMonthStartKey() })
}

export async function getRecentSessionPayments(
  limit = 6,
): Promise<RecentSessionPayment[]> {
  const supabase = await createStaffDataClient()
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select(
      'id, total_sessions, price, paid_at, created_at, payment_method, member:members(name)',
    )
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  let { data, error } = await query

  if (error?.code === '42703' || error?.message?.includes('deleted_at')) {
    const legacy = await supabase
      .from('session_packages')
      .select(
        'id, total_sessions, price, paid_at, created_at, payment_method, member:members(name)',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    data = legacy.data
    error = legacy.error
  }

  if (error) {
    console.error('Error fetching recent session payments:', error)
    return []
  }

  return (data ?? []) as RecentSessionPayment[]
}

export async function getSessionPackagesPage(options?: {
  memberId?: string
  limit?: number
  offset?: number
  orderBy?: SessionPackageListOrderBy
}): Promise<{ data: SessionPackage[]; count: number }> {
  const orderBy = options?.orderBy ?? 'created_at'
  const limit = options?.limit ?? LIST_PAGE_SIZE
  const offset = options?.offset ?? 0
  const useRecentLessonSort = orderBy === 'recent_lesson'

  const { data, count } = await getSessionPackages({
    memberId: options?.memberId,
    limit: useRecentLessonSort ? undefined : limit,
    offset: useRecentLessonSort ? undefined : offset,
  })

  if (!useRecentLessonSort || data.length === 0) {
    return { data, count }
  }

  const supabase = await createStaffDataClient()
  const memberIds = [...new Set(data.map((pkg) => pkg.member_id))]
  const lastLessonByMember = await fetchLastLessonDateByMember(supabase, memberIds)

  const sorted = [...data].sort((a, b) => {
    const da = lastLessonByMember.get(a.member_id) ?? ''
    const db = lastLessonByMember.get(b.member_id) ?? ''
    const nameA = a.member?.name ?? ''
    const nameB = b.member?.name ?? ''
    if (!da && !db) return nameA.localeCompare(nameB, 'ko')
    if (!da) return 1
    if (!db) return -1
    const cmp = db.localeCompare(da)
    return cmp !== 0 ? cmp : nameA.localeCompare(nameB, 'ko')
  })

  return {
    data: sorted.slice(offset, offset + limit),
    count: count ?? sorted.length,
  }
}

export async function queryActiveSessionPackageId(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  memberId: string,
): Promise<string | null> {
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select(
      'id, remaining_sessions, note, expires_at, is_active, created_at, paid_at, deleted_at',
    )
    .eq('member_id', memberId)
    .order('created_at', { ascending: true })

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query
  if (error || !data?.length) return null

  return pickSessionPackageIdForDeduction(data as SessionPackageDeductionCandidate[])
}

/** 차감 대상 수업권 — 등록 순(FIFO)으로 선택 */
export async function querySessionPackageIdForDeduction(
  supabase: Awaited<ReturnType<typeof createStaffDataClient>>,
  memberId: string,
): Promise<string | null> {
  return queryActiveSessionPackageId(supabase, memberId)
}

export async function getActivePackageForMember(memberId: string): Promise<SessionPackage | null> {
  const supabase = await createClient()
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select(SESSION_PACKAGE_DETAIL_SELECT)
    .eq('member_id', memberId)
    .order('created_at', { ascending: true })

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching active package:', error)
    return null
  }

  const packageId = pickSessionPackageIdForDeduction(
    (data ?? []) as SessionPackageDeductionCandidate[],
  )
  if (!packageId) return null

  return ((data ?? []).find((pkg) => pkg.id === packageId) as SessionPackage | undefined) ?? null
}

function normalizeOptionalDate(value?: string | null): string | null {
  if (!value?.trim()) return null
  return value.split('T')[0]
}

export async function createSessionPackage(formData: SessionPackageFormData): Promise<{ data?: SessionPackage; error?: string }> {
  await requireRole(['admin'])
  const supabase = await sessionWriteClient()

  const { data, error } = await supabase
    .from('session_packages')
    .insert({
      member_id: formData.member_id,
      total_sessions: formData.total_sessions,
      remaining_sessions: formData.total_sessions,
      price: formData.price || null,
      paid_at: normalizeOptionalDate(formData.paid_at),
      expires_at: normalizeOptionalDate(formData.expires_at),
      payment_method: formData.payment_method || null,
      note: formData.note || null,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session package:', error)
    const message =
      error.code === 'PGRST205'
        ? 'session_packages 테이블이 없습니다. supabase/fix-session-packages.sql 을 실행해주세요.'
        : mapSessionPackageError(error.message)
    return { error: message }
  }

  const pkg = data as SessionPackage

  await supabase.from('session_transactions').insert({
    member_id: formData.member_id,
    session_package_id: pkg.id,
    delta: formData.total_sessions,
    balance_after: formData.total_sessions,
    reason: 'package_purchase',
    note: formData.note ?? null,
  })

  const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
    p_member_id: formData.member_id,
  })
  if (syncError) {
    console.warn('sync_member_remaining_sessions:', syncError.message)
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${formData.member_id}`)
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

export async function getSessionPackage(id: string): Promise<SessionPackage | null> {
  const supabase = await createStaffDataClient()
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select(SESSION_PACKAGE_DETAIL_SELECT)
    .eq('id', id)

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query.single()

  if (error) {
    console.error('Error fetching session package:', error)
    return null
  }

  return data as SessionPackage
}

export async function updateSessionPackage(
  id: string, 
  updates: Partial<SessionPackageFormData & { remaining_sessions?: number; is_active?: boolean }>
): Promise<{ data?: SessionPackage; error?: string }> {
  await requireRole(['admin'])
  const supabase = await sessionWriteClient()

  const payload = { ...updates }
  if ('paid_at' in updates) {
    payload.paid_at = normalizeOptionalDate(updates.paid_at)
  }
  if ('expires_at' in updates) {
    payload.expires_at = normalizeOptionalDate(updates.expires_at)
  }

  const { data, error } = await supabase
    .from('session_packages')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating session package:', error)
    return { error: mapSessionPackageError(error.message) }
  }

  if (data?.member_id) {
    const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
      p_member_id: data.member_id,
    })
    if (syncError) {
      console.warn('sync_member_remaining_sessions:', syncError.message)
    }
  }

  revalidatePath('/dashboard/members')
  if (data?.member_id) {
    revalidatePath(`/dashboard/members/${data.member_id}`)
  }
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

/** 휴지통으로 이동 (소프트 삭제) */
export async function deleteSessionPackage(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])

  if (!(await isSessionPackageTrashEnabled())) {
    return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
  }

  const supabase = await sessionWriteClient()

  const { data: pkg, error: fetchError } = await supabase
    .from('session_packages')
    .select('member_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (fetchError) {
    if (isDeletedAtMissingError(fetchError.message, fetchError.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    return { error: '수업권을 찾을 수 없습니다.' }
  }

  if (!pkg) {
    return { error: '수업권을 찾을 수 없거나 이미 삭제되었습니다.' }
  }

  const { error } = await supabase
    .from('session_packages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    console.error('Error moving session package to trash:', error)
    return { error: mapSessionPackageError(error.message) }
  }

  const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
    p_member_id: pkg.member_id,
  })
  if (syncError) {
    console.warn('sync_member_remaining_sessions:', syncError.message)
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${pkg.member_id}`)
  revalidatePath('/dashboard/sessions')
  return {}
}

/** 휴지통에서 복구 */
export async function restoreSessionPackage(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await sessionWriteClient()

  const { data: pkg, error: fetchError } = await supabase
    .from('session_packages')
    .select('member_id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (fetchError || !pkg) {
    if (isDeletedAtMissingError(fetchError?.message, fetchError?.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    return { error: '수업권을 찾을 수 없습니다.' }
  }

  const { error } = await supabase
    .from('session_packages')
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    console.error('Error restoring session package:', error)
    return { error: mapSessionPackageError(error.message) }
  }

  const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
    p_member_id: pkg.member_id,
  })
  if (syncError) {
    console.warn('sync_member_remaining_sessions:', syncError.message)
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${pkg.member_id}`)
  revalidatePath('/dashboard/sessions')
  return {}
}

/** 휴지통에서 영구 삭제 */
export async function permanentlyDeleteSessionPackage(id: string): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await sessionWriteClient()

  const { data: pkg, error: fetchError } = await supabase
    .from('session_packages')
    .select('member_id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (fetchError || !pkg) {
    if (isDeletedAtMissingError(fetchError?.message, fetchError?.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    return { error: '수업권을 찾을 수 없습니다.' }
  }

  const { error } = await supabase
    .from('session_packages')
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null)

  if (error) {
    if (isDeletedAtMissingError(error.message, error.code)) {
      return { error: SESSION_PACKAGE_TRASH_SETUP_MESSAGE }
    }
    console.error('Error permanently deleting session package:', error)
    if (error.message.includes('foreign key')) {
      return { error: '연결된 수업 기록이 있어 삭제할 수 없습니다.' }
    }
    return { error: mapSessionPackageError(error.message) }
  }

  const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
    p_member_id: pkg.member_id,
  })
  if (syncError) {
    console.warn('sync_member_remaining_sessions:', syncError.message)
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${pkg.member_id}`)
  revalidatePath('/dashboard/sessions')
  return {}
}

export async function deductSession(packageId: string): Promise<{ data?: SessionPackage; error?: string }> {
  const supabase = await createClient()
  
  // First get current remaining sessions
  const { data: pkg } = await supabase
    .from('session_packages')
    .select('remaining_sessions')
    .eq('id', packageId)
    .single()

  if (!pkg || pkg.remaining_sessions <= 0) {
    return { error: '남은 수업 횟수가 없습니다.' }
  }

  const { data, error } = await supabase
    .from('session_packages')
    .update({ 
      remaining_sessions: pkg.remaining_sessions - 1,
      is_active: pkg.remaining_sessions - 1 > 0
    })
    .eq('id', packageId)
    .select()
    .single()

  if (error) {
    console.error('Error deducting session:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

export async function getExpiringPackages(days: number = 7): Promise<SessionPackage[]> {
  const supabase = await createClient()
  const trashEnabled = await isSessionPackageTrashEnabled()

  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + days)

  let query = supabase
    .from('session_packages')
    .select(`${SESSION_PACKAGE_LIST_SELECT}, member:members(id, name, phone)`)
    .eq('is_active', true)
    .lte('expires_at', futureDate.toISOString().split('T')[0])
    .order('expires_at', { ascending: true })
    .limit(50)

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching expiring packages:', error)
    return []
  }

  return data as SessionPackage[]
}

export async function getLowSessionPackages(threshold: number = 3): Promise<SessionPackage[]> {
  const supabase = await createClient()
  const trashEnabled = await isSessionPackageTrashEnabled()

  let query = supabase
    .from('session_packages')
    .select(`${SESSION_PACKAGE_LIST_SELECT}, member:members(id, name, phone)`)
    .eq('is_active', true)
    .lte('remaining_sessions', threshold)
    .gt('remaining_sessions', 0)
    .order('remaining_sessions', { ascending: true })
    .limit(50)

  if (trashEnabled) {
    query = query.is('deleted_at', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching low session packages:', error)
    return []
  }

  return data as SessionPackage[]
}
