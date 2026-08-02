'use server'

import { format } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/actions/auth'
import { getRunningPortalMemberForCurrentUser } from '@/lib/actions/staff-running-portal-member'
import {
  formatMarathonDayLabel,
  formatMarathonEventDateLabel,
  isMarathonScheduleAllKey,
  isVisibleMarathonEvent,
  isMarathonEventUpcomingOrToday,
  marathonMonthDateRange,
  marathonWeekdayLabel,
  normalizeMarathonCustomLabels,
  normalizeMarathonDate,
  normalizeMarathonMonthKey,
  resolveMarathonRegistrationHref,
  isMarathonRegistrationOpenActive,
  type MarathonCustomLabel,
  type MarathonEventInput,
  type MarathonEventSignup,
  type MarathonEventView,
} from '@/lib/running-league/marathon-schedule'
import {
  filterMarathonCatalog,
  listMarathonCatalogYear,
  type MarathonCatalogItem,
} from '@/lib/running-league/marathon-catalog-2026'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const EVENT_SELECT =
  'id, title, event_date, location_label, registration_url, notes, is_hidden, region, is_featured, registration_open, registration_end_date, custom_labels, catalog_key, created_at, updated_at'

const EVENT_SELECT_LEGACY =
  'id, title, event_date, location_label, registration_url, notes, is_hidden, created_at, updated_at'

export type CenterMarathonScheduleBundle = {
  monthKey: string
  events: MarathonEventView[]
  tableReady: boolean
}

type MarathonEventRow = {
  id: string
  title: string
  event_date: string
  location_label: string | null
  registration_url: string | null
  notes: string | null
  is_hidden: boolean
  region?: string | null
  is_featured?: boolean | null
  registration_open?: boolean | null
  registration_end_date?: string | null
  custom_labels?: unknown
  catalog_key?: string | null
}

type MarathonSignupRow = {
  id: string
  event_id: string
  member_id: string
  created_at: string
  member: { name: string } | { name: string }[] | null
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('schema cache')
  )
}

function marathonMigrationErrorMessage(kind: 'table' | 'column'): string {
  if (kind === 'column') {
    return '마라톤 일정 컬럼이 없습니다. Supabase SQL Editor에서 supabase/add-center-marathon-schedule.sql 을 다시 실행해주세요.'
  }
  return '마라톤 일정 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-center-marathon-schedule.sql 을 실행해주세요.'
}

async function scheduleClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function memberNameFromJoin(
  member: MarathonSignupRow['member'],
): string {
  if (!member) return '회원'
  if (Array.isArray(member)) return member[0]?.name?.trim() || '회원'
  return member.name?.trim() || '회원'
}

function mapEventView(
  row: MarathonEventRow,
  signups: MarathonEventSignup[],
  viewerMemberId: string | null,
): MarathonEventView {
  const eventDate = normalizeMarathonDate(row.event_date) ?? row.event_date
  const { day_label, days_until } = formatMarathonDayLabel(eventDate)
  const registrationUrl = row.registration_url?.trim() || null

  return {
    id: row.id,
    title: row.title?.trim() || '',
    event_date: eventDate,
    event_date_label: formatMarathonEventDateLabel(eventDate),
    weekday_label: marathonWeekdayLabel(eventDate),
    day_label,
    days_until,
    location_label: row.location_label?.trim() || '',
    registration_url: registrationUrl,
    registration_href: resolveMarathonRegistrationHref(registrationUrl),
    notes: row.notes?.trim() || '',
    is_hidden: Boolean(row.is_hidden),
    region: row.region?.trim() || '',
    is_featured: Boolean(row.is_featured),
    registration_open: Boolean(row.registration_open),
    registration_end_date: normalizeMarathonDate(row.registration_end_date),
    registration_open_active: isMarathonRegistrationOpenActive({
      registration_open: row.registration_open,
      event_date: eventDate,
      registration_end_date: row.registration_end_date,
    }),
    custom_labels: normalizeMarathonCustomLabels(row.custom_labels),
    catalog_key: row.catalog_key?.trim() || null,
    signup_count: signups.length,
    signups,
    is_signed_up: viewerMemberId
      ? signups.some((signup) => signup.member_id === viewerMemberId)
      : false,
  }
}

function revalidateMarathonPaths() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
  revalidatePath('/dashboard/settings/marathon-schedule')
  revalidatePath('/dashboard/settings/adult-running-portal')
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('does not exist') ||
    message.includes('could not find the') ||
    message.includes('column')
  )
}

async function fetchCenterMarathonSchedule(
  monthKeyInput: string | null | undefined,
  viewerMemberId: string | null,
  options?: { includeHidden?: boolean; includePast?: boolean },
): Promise<CenterMarathonScheduleBundle> {
  const monthKey = normalizeMarathonMonthKey(monthKeyInput)
  const includeAll = isMarathonScheduleAllKey(monthKey)
  const includeHidden = options?.includeHidden === true
  const includePast = options?.includePast === true
  const todayKey = format(new Date(), 'yyyy-MM-dd')

  const empty: CenterMarathonScheduleBundle = {
    monthKey,
    events: [],
    tableReady: true,
  }

  try {
    const supabase = await scheduleClient()

    async function queryEvents(select: string) {
      let eventQuery = supabase
        .from('center_marathon_events')
        .select(select)
        .order('event_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (!includeAll) {
        const { start, end } = marathonMonthDateRange(monthKey)
        eventQuery = eventQuery.gte('event_date', start).lte('event_date', end)
      }

      if (!includePast) {
        eventQuery = eventQuery.gte('event_date', todayKey)
      }

      if (!includeHidden) {
        eventQuery = eventQuery.eq('is_hidden', false)
      }

      return eventQuery
    }

    let { data: eventRows, error: eventError } = await queryEvents(EVENT_SELECT)

    if (eventError && !isMissingTableError(eventError) && isMissingColumnError(eventError)) {
      ;({ data: eventRows, error: eventError } = await queryEvents(EVENT_SELECT_LEGACY))
    }

    if (isMissingTableError(eventError)) {
      return { ...empty, tableReady: false }
    }
    if (eventError) {
      console.error('fetchCenterMarathonSchedule.events', eventError)
      return empty
    }

    const rows = (eventRows ?? []) as unknown as MarathonEventRow[]
    if (rows.length === 0) return empty

    const eventIds = rows.map((row) => row.id)
    const { data: signupRows, error: signupError } = await supabase
      .from('center_marathon_event_signups')
      .select('id, event_id, member_id, created_at, member:members(name)')
      .in('event_id', eventIds)
      .order('created_at', { ascending: true })

    if (signupError && !isMissingTableError(signupError)) {
      console.error('fetchCenterMarathonSchedule.signups', signupError)
    }

    const signupsByEvent = new Map<string, MarathonEventSignup[]>()
    for (const signup of (signupRows ?? []) as MarathonSignupRow[]) {
      const list = signupsByEvent.get(signup.event_id) ?? []
      list.push({
        member_id: signup.member_id,
        member_name: memberNameFromJoin(signup.member),
        signed_at: signup.created_at,
      })
      signupsByEvent.set(signup.event_id, list)
    }

    const events = rows
      .map((row) => mapEventView(row, signupsByEvent.get(row.id) ?? [], viewerMemberId))
      .filter((event) => includeHidden || isVisibleMarathonEvent(event))
      .filter((event) => includePast || isMarathonEventUpcomingOrToday(event.event_date, todayKey))

    return { monthKey, events, tableReady: true }
  } catch (error) {
    console.error('fetchCenterMarathonSchedule', error)
    return empty
  }
}

export async function getCenterMarathonScheduleForMember(
  monthKey?: string | null,
): Promise<CenterMarathonScheduleBundle> {
  const member = await getRunningPortalMemberForCurrentUser()
  return fetchCenterMarathonSchedule(monthKey, member?.id ?? null)
}

export async function getCenterMarathonScheduleForAdmin(
  monthKey?: string | null,
): Promise<CenterMarathonScheduleBundle> {
  await requireRole(['admin'])
  // 관리 화면에서는 지난 대회도 수정·삭제할 수 있게 유지
  return fetchCenterMarathonSchedule(monthKey, null, {
    includeHidden: true,
    includePast: true,
  })
}

export async function getCenterMarathonScheduleAdminPreview(
  monthKey?: string | null,
): Promise<CenterMarathonScheduleBundle> {
  await requireRole(['admin'])
  return fetchCenterMarathonSchedule(monthKey, null)
}

export async function saveMarathonEvent(
  input: MarathonEventInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireRole(['admin'])

  const title = input.title.trim()
  const eventDate = normalizeMarathonDate(input.event_date)
  if (!title) return { ok: false, error: '대회명을 입력해주세요.' }
  if (!eventDate) return { ok: false, error: '대회 날짜를 선택해주세요.' }

  const registrationUrl = input.registration_url.trim() || null
  if (registrationUrl && !resolveMarathonRegistrationHref(registrationUrl)) {
    return { ok: false, error: '참가신청 URL 형식을 확인해주세요.' }
  }

  const customLabels = normalizeMarathonCustomLabels(input.custom_labels)
  const catalogKey = input.catalog_key?.trim() || null
  const registrationEndDate = normalizeMarathonDate(input.registration_end_date)

  const payload = {
    title,
    event_date: eventDate,
    location_label: input.location_label.trim(),
    registration_url: registrationUrl,
    notes: input.notes.trim(),
    is_hidden: Boolean(input.is_hidden),
    region: input.region.trim(),
    is_featured: Boolean(input.is_featured),
    registration_open: Boolean(input.registration_open),
    registration_end_date: registrationEndDate,
    custom_labels: customLabels,
    catalog_key: catalogKey,
    updated_at: new Date().toISOString(),
  }

  try {
    const supabase = await scheduleClient()
    const existingId = input.id?.trim() || null

    if (existingId) {
      const { error } = await supabase
        .from('center_marathon_events')
        .update(payload)
        .eq('id', existingId)

      if (isMissingTableError(error)) {
        return {
          ok: false,
          error: marathonMigrationErrorMessage('table'),
        }
      }
      if (error && isMissingColumnError(error)) {
        return {
          ok: false,
          error: marathonMigrationErrorMessage('column'),
        }
      }
      if (error) {
        console.error('saveMarathonEvent.update', error)
        return { ok: false, error: error.message || '저장에 실패했습니다.' }
      }
      revalidateMarathonPaths()
      return { ok: true, id: existingId }
    }

    const { data, error } = await supabase
      .from('center_marathon_events')
      .insert(payload)
      .select('id')
      .single()

    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: marathonMigrationErrorMessage('table'),
      }
    }
    if (error && isMissingColumnError(error)) {
      return {
        ok: false,
        error: marathonMigrationErrorMessage('column'),
      }
    }
    if (error || !data) {
      console.error('saveMarathonEvent.insert', error)
      if (error?.code === '23505') {
        return { ok: false, error: '이미 일정에 추가된 추천 대회입니다.' }
      }
      return { ok: false, error: error?.message || '저장에 실패했습니다.' }
    }

    revalidateMarathonPaths()
    return { ok: true, id: String(data.id) }
  } catch (error) {
    console.error('saveMarathonEvent', error)
    return { ok: false, error: '저장에 실패했습니다.' }
  }
}

export async function listMarathonRecommendations(options?: {
  region?: string
  monthKey?: string | null
  featuredOnly?: boolean
  registrationOpenOnly?: boolean
  year?: number
}): Promise<{
  items: MarathonCatalogItem[]
  addedKeys: string[]
}> {
  await requireRole(['admin'])
  const year = options?.year ?? new Date().getFullYear()
  const items = filterMarathonCatalog(listMarathonCatalogYear(year), {
    region: options?.region,
    monthKey: options?.monthKey,
    featuredOnly: options?.featuredOnly,
    registrationOpenOnly: options?.registrationOpenOnly,
  })

  const addedKeys: string[] = []
  try {
    const supabase = await scheduleClient()
    const keys = items.map((item) => item.key)
    if (keys.length > 0) {
      const { data, error } = await supabase
        .from('center_marathon_events')
        .select('catalog_key')
        .in('catalog_key', keys)
      if (!error && data) {
        for (const row of data as Array<{ catalog_key: string | null }>) {
          const key = row.catalog_key?.trim()
          if (key) addedKeys.push(key)
        }
      }
    }
  } catch {
    // ignore — 추천 목록은 카탈로그만으로도 표시
  }

  return { items, addedKeys }
}

export async function addMarathonEventFromCatalog(
  catalogKey: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const key = catalogKey.trim()
  const item = listMarathonCatalogYear().find((entry) => entry.key === key)
  if (!item) return { ok: false, error: '추천 대회를 찾을 수 없습니다.' }

  return saveMarathonEvent({
    id: null,
    title: item.title,
    event_date: item.event_date,
    location_label: item.location_label,
    registration_url: item.registration_url,
    notes: item.notes,
    is_hidden: false,
    region: item.region,
    is_featured: item.is_featured,
    registration_open: item.registration_open,
    registration_end_date: item.registration_end_date ?? '',
    custom_labels: [] as MarathonCustomLabel[],
    catalog_key: item.key,
  })
}

/** 추천 카탈로그에서 추가된 대회를 catalog_key 기준으로 제거 */
export async function removeMarathonEventFromCatalog(
  catalogKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const key = catalogKey.trim()
  if (!key) return { ok: false, error: '추천 대회를 찾을 수 없습니다.' }

  try {
    const supabase = await scheduleClient()
    const { data, error: findError } = await supabase
      .from('center_marathon_events')
      .select('id')
      .eq('catalog_key', key)

    if (isMissingTableError(findError)) {
      return { ok: false, error: marathonMigrationErrorMessage('table') }
    }
    if (findError) {
      console.error('removeMarathonEventFromCatalog.find', findError)
      return { ok: false, error: findError.message || '대회를 찾지 못했습니다.' }
    }

    const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
    if (ids.length === 0) {
      return { ok: false, error: '일정에 추가된 대회가 없습니다.' }
    }

    const { error } = await supabase.from('center_marathon_events').delete().in('id', ids)

    if (error) {
      console.error('removeMarathonEventFromCatalog.delete', error)
      return { ok: false, error: error.message || '취소에 실패했습니다.' }
    }

    revalidateMarathonPaths()
    return { ok: true }
  } catch (error) {
    console.error('removeMarathonEventFromCatalog', error)
    return { ok: false, error: '취소에 실패했습니다.' }
  }
}

export async function deleteMarathonEvent(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(['admin'])
  const id = eventId.trim()
  if (!id) return { ok: false, error: '대회를 찾을 수 없습니다.' }

  try {
    const supabase = await scheduleClient()
    const { error } = await supabase.from('center_marathon_events').delete().eq('id', id)

    if (isMissingTableError(error)) {
      return {
        ok: false,
        error: marathonMigrationErrorMessage('table'),
      }
    }
    if (error) {
      console.error('deleteMarathonEvent', error)
      return { ok: false, error: error.message || '삭제에 실패했습니다.' }
    }

    revalidateMarathonPaths()
    return { ok: true }
  } catch (error) {
    console.error('deleteMarathonEvent', error)
    return { ok: false, error: '삭제에 실패했습니다.' }
  }
}

export async function toggleMarathonEventSignup(
  eventId: string,
): Promise<
  | { ok: true; signedUp: boolean; signupCount: number }
  | { ok: false; error: string }
> {
  const member = await getRunningPortalMemberForCurrentUser()
  if (!member) return { ok: false, error: '로그인이 필요합니다.' }

  const id = eventId.trim()
  if (!id) return { ok: false, error: '대회를 찾을 수 없습니다.' }

  try {
    const supabase = await scheduleClient()
    const { data: eventRow, error: eventError } = await supabase
      .from('center_marathon_events')
      .select('id, title, is_hidden')
      .eq('id', id)
      .maybeSingle()

    if (isMissingTableError(eventError)) {
      return { ok: false, error: '마라톤 일정 기능이 준비되지 않았습니다.' }
    }
    if (eventError || !eventRow) {
      return { ok: false, error: '대회를 찾을 수 없습니다.' }
    }
    if (eventRow.is_hidden || !String(eventRow.title ?? '').trim()) {
      return { ok: false, error: '참여할 수 없는 일정입니다.' }
    }

    const { data: existing, error: existingError } = await supabase
      .from('center_marathon_event_signups')
      .select('id')
      .eq('event_id', id)
      .eq('member_id', member.id)
      .maybeSingle()

    if (existingError && !isMissingTableError(existingError)) {
      console.error('toggleMarathonEventSignup.existing', existingError)
      return { ok: false, error: '참여 상태를 확인하지 못했습니다.' }
    }

    if (existing) {
      const { error: deleteError } = await supabase
        .from('center_marathon_event_signups')
        .delete()
        .eq('id', existing.id)

      if (deleteError) {
        console.error('toggleMarathonEventSignup.delete', deleteError)
        return { ok: false, error: '참여 취소에 실패했습니다.' }
      }
    } else {
      const { error: insertError } = await supabase
        .from('center_marathon_event_signups')
        .insert({
          event_id: id,
          member_id: member.id,
        })

      if (insertError) {
        console.error('toggleMarathonEventSignup.insert', insertError)
        return { ok: false, error: '참여 신청에 실패했습니다.' }
      }
    }

    const { count, error: countError } = await supabase
      .from('center_marathon_event_signups')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)

    if (countError) {
      console.error('toggleMarathonEventSignup.count', countError)
    }

    revalidateMarathonPaths()
    return {
      ok: true,
      signedUp: !existing,
      signupCount: count ?? 0,
    }
  } catch (error) {
    console.error('toggleMarathonEventSignup', error)
    return { ok: false, error: '참여 처리에 실패했습니다.' }
  }
}
