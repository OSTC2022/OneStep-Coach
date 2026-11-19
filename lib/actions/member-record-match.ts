'use server'

import { format, subDays } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import {
  formatFinishTime,
  joinRecordMatchPrizes,
  parseFinishTime,
  splitRecordMatchPrizes,
} from '@/lib/member-record-match'
import {
  formatMarathonDistanceLabel,
  normalizeMarathonDistances,
} from '@/lib/running-league/marathon-schedule'
import type { MarathonDistanceFilter } from '@/lib/running-league/marathon-schedule'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type MarathonPick = {
  id: string
  title: string
  eventDate: string
  location: string
  signedUp: boolean
  signedDistances: MarathonDistanceFilter[]
}

export type RecordMatchEntry = {
  id: string
  memberId: string
  authorName: string
  predictedSeconds: number
  predictedLabel: string
  actualSeconds: number | null
  actualLabel: string | null
  gapSeconds: number | null
  isMine: boolean
}

export type RecordMatchWinner = {
  memberId: string
  memberName: string
  prizeIndex: number
  prize: string
}

export type RecordMatchEvent = {
  id: string
  marathonEventId: string
  title: string
  raceTitle: string
  raceDate: string
  location: string
  distance: MarathonDistanceFilter | null
  distanceLabel: string | null
  prize: string
  prizes: string[]
  note: string
  isPublic: boolean
  winners: RecordMatchWinner[]
  createdByMe: boolean
  canEdit: boolean
  canSelectWinners: boolean
  canWriteActual: boolean
  participantCount: number
  mine: RecordMatchEntry | null
  ranking: RecordMatchEntry[]
  guesses: Array<{
    memberId: string
    name: string
    predictedLabel: string
    actualLabel: string | null
  }>
}

const MISSING_TABLE_HINT =
  '기록 맞추기 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match.sql 을 실행해주세요.'
const MISSING_WINNERS_HINT =
  '당첨자 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match-winners.sql 을 실행해주세요.'
const MISSING_PUBLIC_HINT =
  '공개 이벤트 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match-public.sql 을 실행해주세요.'
const MISSING_TITLE_HINT =
  '제목 칸이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match-title.sql 을 실행해주세요.'

const DISTANCES = new Set<MarathonDistanceFilter>(['5km', '10km', 'half', 'full'])

function isMissingTable(message: string) {
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find')
  )
}

function isMissingWinnersColumn(message: string) {
  return message.includes('winners')
}

function isMissingPublicColumn(message: string) {
  return message.includes('is_public')
}

function isMissingTitleColumn(message: string) {
  return message.includes('title') && !message.includes('center_marathon')
}

function normalizeEventTitle(value: string | null | undefined) {
  return (value ?? '').trim().slice(0, 80)
}

function parseWinnerRows(
  raw: unknown,
  prizes: string[],
  nameByMemberId: Map<string, string>,
): RecordMatchWinner[] {
  if (!Array.isArray(raw)) return []
  const winners: RecordMatchWinner[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const memberId = String((row as { memberId?: unknown }).memberId ?? '').trim()
    const prizeIndex = Number((row as { prizeIndex?: unknown }).prizeIndex)
    if (!memberId || !Number.isInteger(prizeIndex) || prizeIndex < 0) continue
    const prize = prizes[prizeIndex] ?? prizes[0] ?? ''
    if (!prize) continue
    winners.push({
      memberId,
      memberName: nameByMemberId.get(memberId) ?? '회원',
      prizeIndex,
      prize,
    })
  }
  return winners.sort((a, b) => a.prizeIndex - b.prizeIndex)
}

async function db() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidate() {
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
}

function isStaff(role: string) {
  return role === 'admin' || role === 'instructor'
}

function asDistance(value: unknown): MarathonDistanceFilter | null {
  return typeof value === 'string' && DISTANCES.has(value as MarathonDistanceFilter)
    ? (value as MarathonDistanceFilter)
    : null
}

export async function getRecordMatchBoard(): Promise<{
  races: MarathonPick[]
  events: RecordMatchEvent[]
  canCreate: boolean
  canEnter: boolean
  error?: string
}> {
  const profile = await getDashboardProfile()
  if (!profile) {
    return { races: [], events: [], canCreate: false, canEnter: false, error: '로그인이 필요합니다.' }
  }

  const member = await getMemberForCurrentUser()
  const supabase = await db()
  const since = format(subDays(new Date(), 21), 'yyyy-MM-dd')

  const raceResult = await supabase
    .from('center_marathon_events')
    .select('id, title, event_date, location_label, is_hidden')
    .gte('event_date', since)
    .order('event_date', { ascending: true })
    .limit(80)

  if (raceResult.error && isMissingTable(raceResult.error.message)) {
    return {
      races: [],
      events: [],
      canCreate: false,
      canEnter: false,
      error: '대회 일정을 불러오지 못했습니다.',
    }
  }

  const raceRows = (raceResult.data ?? []).filter((row) => !row.is_hidden)
  const signedDistancesByEvent = new Map<string, MarathonDistanceFilter[]>()
  if (member && raceRows.length > 0) {
    const eventIds = raceRows.map((row) => String(row.id))
    let signupResult = await supabase
      .from('center_marathon_event_signups')
      .select('event_id, distances')
      .eq('member_id', member.id)
      .in('event_id', eventIds)
    if (signupResult.error) {
      signupResult = await supabase
        .from('center_marathon_event_signups')
        .select('event_id')
        .eq('member_id', member.id)
        .in('event_id', eventIds)
    }
    for (const row of signupResult.data ?? []) {
      signedDistancesByEvent.set(
        String(row.event_id),
        normalizeMarathonDistances('distances' in row ? row.distances : []),
      )
    }
  }

  const races: MarathonPick[] = raceRows.map((row) => {
    const id = String(row.id)
    return {
      id,
      title: String(row.title ?? '대회'),
      eventDate: String(row.event_date).slice(0, 10),
      location: String(row.location_label ?? ''),
      signedUp: signedDistancesByEvent.has(id),
      signedDistances: signedDistancesByEvent.get(id) ?? [],
    }
  })

  let eventResult = await supabase
    .from('member_record_match_events')
    .select(
      'id, marathon_event_id, title, distance, prize, note, winners, is_public, created_by, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(30)

  if (eventResult.error && isMissingTitleColumn(eventResult.error.message)) {
    eventResult = await supabase
      .from('member_record_match_events')
      .select(
        'id, marathon_event_id, distance, prize, note, winners, is_public, created_by, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(30)
  }

  if (eventResult.error && isMissingPublicColumn(eventResult.error.message)) {
    eventResult = await supabase
      .from('member_record_match_events')
      .select('id, marathon_event_id, title, distance, prize, note, winners, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (eventResult.error && isMissingTitleColumn(eventResult.error.message)) {
      eventResult = await supabase
        .from('member_record_match_events')
        .select('id, marathon_event_id, distance, prize, note, winners, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(30)
    }
  }

  if (eventResult.error && isMissingWinnersColumn(eventResult.error.message)) {
    eventResult = await supabase
      .from('member_record_match_events')
      .select('id, marathon_event_id, distance, prize, note, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
  }

  if (eventResult.error) {
    return {
      races,
      events: [],
      canCreate: isStaff(profile.role),
      canEnter: Boolean(member),
      error: isMissingTable(eventResult.error.message) ? MISSING_TABLE_HINT : eventResult.error.message,
    }
  }

  const eventRows = eventResult.data ?? []
  const eventIds = eventRows.map((row) => String(row.id))
  const entryResult = eventIds.length
    ? await supabase
        .from('member_record_match_entries')
        .select('id, event_id, member_id, author_name, predicted_seconds, actual_seconds')
        .in('event_id', eventIds)
    : { data: [], error: null }

  if (entryResult.error) {
    return {
      races,
      events: [],
      canCreate: isStaff(profile.role),
      canEnter: Boolean(member),
      error: isMissingTable(entryResult.error.message) ? MISSING_TABLE_HINT : entryResult.error.message,
    }
  }

  const raceById = new Map(races.map((race) => [race.id, race]))
  const missingRaceIds = eventRows
    .map((row) => String(row.marathon_event_id))
    .filter((id) => !raceById.has(id))
  if (missingRaceIds.length > 0) {
    const extra = await supabase
      .from('center_marathon_events')
      .select('id, title, event_date, location_label')
      .in('id', missingRaceIds)
    for (const row of extra.data ?? []) {
      raceById.set(String(row.id), {
        id: String(row.id),
        title: String(row.title ?? '대회'),
        eventDate: String(row.event_date).slice(0, 10),
        location: String(row.location_label ?? ''),
        signedUp: false,
        signedDistances: [],
      })
    }
  }

  const entriesByEvent = new Map<string, RecordMatchEntry[]>()
  for (const row of entryResult.data ?? []) {
    const predicted = Number(row.predicted_seconds)
    const actual = row.actual_seconds == null ? null : Number(row.actual_seconds)
    const entry: RecordMatchEntry = {
      id: String(row.id),
      memberId: String(row.member_id),
      authorName: String(row.author_name ?? '회원'),
      predictedSeconds: predicted,
      predictedLabel: formatFinishTime(predicted),
      actualSeconds: actual,
      actualLabel: actual == null ? null : formatFinishTime(actual),
      gapSeconds: actual == null ? null : Math.abs(actual - predicted),
      isMine: member?.id === row.member_id,
    }
    const list = entriesByEvent.get(String(row.event_id)) ?? []
    list.push(entry)
    entriesByEvent.set(String(row.event_id), list)
  }

  const staff = isStaff(profile.role)
  const events: RecordMatchEvent[] = eventRows
    .filter((row) => {
      // 공개 이벤트는 링크 전용 — 회원 포털 목록에는 안 보임 (관리자/강사만 관리용으로 표시)
      const isPublic = Boolean('is_public' in row ? row.is_public : false)
      return staff || !isPublic
    })
    .map((row) => {
      const race = raceById.get(String(row.marathon_event_id))
      const distance = asDistance(row.distance)
      const entries = (entriesByEvent.get(String(row.id)) ?? []).map((entry) => {
        if (staff || entry.isMine) return entry
        return { ...entry, predictedSeconds: 0, predictedLabel: '' }
      })
      const ranking = entries
        .filter((entry) => entry.gapSeconds != null)
        .sort((a, b) => (a.gapSeconds ?? 0) - (b.gapSeconds ?? 0))
      const prizes = splitRecordMatchPrizes(String(row.prize ?? ''))
      const nameByMemberId = new Map(entries.map((entry) => [entry.memberId, entry.authorName]))
      const canManage = profile.role === 'admin' || row.created_by === profile.id
      const raceTitle = race?.title ?? '대회'
      const customTitle = normalizeEventTitle(
        'title' in row ? String(row.title ?? '') : '',
      )
      return {
        id: String(row.id),
        marathonEventId: String(row.marathon_event_id),
        title: customTitle || raceTitle,
        raceTitle,
        raceDate: race?.eventDate ?? '',
        location: race?.location ?? '',
        distance,
        distanceLabel: distance ? formatMarathonDistanceLabel(distance) : null,
        prize: String(row.prize ?? ''),
        prizes,
        note: String(row.note ?? ''),
        isPublic: Boolean('is_public' in row ? row.is_public : false),
        winners: parseWinnerRows(
          'winners' in row ? row.winners : [],
          prizes,
          nameByMemberId,
        ),
        createdByMe: row.created_by === profile.id,
        canEdit: canManage,
        canSelectWinners: canManage,
        canWriteActual: canManage,
        participantCount: entries.length,
        mine: entries.find((entry) => entry.isMine) ?? null,
        ranking,
        guesses: staff
          ? entries.map((entry) => ({
              memberId: entry.memberId,
              name: entry.authorName,
              predictedLabel: entry.predictedLabel,
              actualLabel: entry.actualLabel,
            }))
          : [],
      }
    })

  return {
    races,
    events,
    canCreate: staff,
    canEnter: Boolean(member),
  }
}

function normalizePrizeInput(input: {
  prize?: string
  prizes?: string[]
}): { prize: string } | { error: string } {
  const fromList = Array.isArray(input.prizes)
    ? joinRecordMatchPrizes(input.prizes)
    : ''
  const prize = (fromList || input.prize || '').trim()
  if (!prize) return { error: '상품을 입력해주세요.' }
  if (prize.length > 400) return { error: '상품은 합쳐서 400자까지 입력할 수 있습니다.' }
  const prizes = splitRecordMatchPrizes(prize)
  if (prizes.some((item) => item.length > 80)) {
    return { error: '상품 하나는 80자까지 입력할 수 있습니다.' }
  }
  return { prize: joinRecordMatchPrizes(prizes) }
}

export async function createRecordMatchEvent(input: {
  marathonEventId: string
  title?: string
  distance?: string | null
  prize?: string
  prizes?: string[]
  note?: string
  isPublic?: boolean
}): Promise<{ id?: string; error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile || !isStaff(profile.role)) return { error: '강사 또는 관리자만 이벤트를 만들 수 있습니다.' }

  if (!input.marathonEventId) return { error: '대회를 선택해주세요.' }
  const title = normalizeEventTitle(input.title)
  if (!title) return { error: '제목을 입력해주세요.' }
  const prizeResult = normalizePrizeInput(input)
  if ('error' in prizeResult) return { error: prizeResult.error }

  const distance = asDistance(input.distance)
  const isPublic = Boolean(input.isPublic)
  const supabase = await db()
  const { data, error } = await supabase
    .from('member_record_match_events')
    .insert({
      marathon_event_id: input.marathonEventId,
      title,
      distance,
      prize: prizeResult.prize,
      note: input.note?.trim().slice(0, 300) ?? '',
      is_public: isPublic,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error) {
    if (isMissingTitleColumn(error.message)) return { error: MISSING_TITLE_HINT }
    if (isMissingPublicColumn(error.message)) {
      if (isPublic) return { error: MISSING_PUBLIC_HINT }
      const fallback = await supabase
        .from('member_record_match_events')
        .insert({
          marathon_event_id: input.marathonEventId,
          title,
          distance,
          prize: prizeResult.prize,
          note: input.note?.trim().slice(0, 300) ?? '',
          created_by: profile.id,
        })
        .select('id')
        .single()
      if (fallback.error) {
        if (isMissingTitleColumn(fallback.error.message)) return { error: MISSING_TITLE_HINT }
        return {
          error: isMissingTable(fallback.error.message)
            ? MISSING_TABLE_HINT
            : fallback.error.message,
        }
      }
      revalidate()
      return { id: fallback.data?.id ? String(fallback.data.id) : undefined }
    }
    return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  }
  revalidate()
  return { id: data?.id ? String(data.id) : undefined }
}

export async function updateRecordMatchEvent(input: {
  eventId: string
  title?: string
  distance?: string | null
  prize?: string
  prizes?: string[]
  note?: string
  isPublic?: boolean
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (!input.eventId) return { error: '이벤트를 찾지 못했습니다.' }

  const title = normalizeEventTitle(input.title)
  if (!title) return { error: '제목을 입력해주세요.' }
  const prizeResult = normalizePrizeInput(input)
  if ('error' in prizeResult) return { error: prizeResult.error }

  const supabase = await db()
  const existing = await supabase
    .from('member_record_match_events')
    .select('id, created_by')
    .eq('id', input.eventId)
    .maybeSingle()
  if (existing.error) {
    return { error: isMissingTable(existing.error.message) ? MISSING_TABLE_HINT : existing.error.message }
  }
  if (!existing.data) return { error: '이벤트를 찾지 못했습니다.' }

  const canEdit =
    profile.role === 'admin' || existing.data.created_by === profile.id
  if (!canEdit) return { error: '작성자 또는 관리자만 수정할 수 있습니다.' }

  const payload: Record<string, unknown> = {
    title,
    distance: asDistance(input.distance),
    prize: prizeResult.prize,
    note: input.note?.trim().slice(0, 300) ?? '',
  }
  if (typeof input.isPublic === 'boolean') {
    if (!isStaff(profile.role)) {
      return { error: '공개 설정은 강사 또는 관리자만 변경할 수 있습니다.' }
    }
    payload.is_public = input.isPublic
  }

  const { error } = await supabase
    .from('member_record_match_events')
    .update(payload)
    .eq('id', input.eventId)

  if (error) {
    if (isMissingTitleColumn(error.message)) return { error: MISSING_TITLE_HINT }
    if (isMissingPublicColumn(error.message) && typeof input.isPublic === 'boolean') {
      return { error: MISSING_PUBLIC_HINT }
    }
    return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  }
  revalidate()
  return {}
}

export async function submitRecordMatchEntry(input: {
  eventId: string
  predicted: string
  actual?: string
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  const member = await getMemberForCurrentUser()
  if (!member) return { error: '회원 계정이 연결된 뒤 기록을 맞출 수 있습니다.' }

  const predicted = parseFinishTime(input.predicted)
  if (predicted == null) return { error: '예상 기록은 45:20 또는 1:45:20 형식으로 입력해주세요.' }
  if (input.actual?.trim()) {
    return { error: '실제 기록은 작성자나 관리자만 입력할 수 있습니다.' }
  }

  const supabase = await db()
  const existing = await supabase
    .from('member_record_match_entries')
    .select('actual_seconds')
    .eq('event_id', input.eventId)
    .eq('member_id', member.id)
    .maybeSingle()
  const { error } = await supabase.from('member_record_match_entries').upsert(
    {
      event_id: input.eventId,
      member_id: member.id,
      author_user_id: profile.id,
      author_name: member.name?.trim() || '회원',
      predicted_seconds: predicted,
      actual_seconds: existing.data?.actual_seconds ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,member_id' },
  )

  if (error) {
    return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  }
  revalidate()
  return {}
}

export async function saveRecordMatchActual(input: {
  eventId: string
  memberId: string
  actual: string
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const actualRaw = input.actual.trim()
  const actual = actualRaw ? parseFinishTime(actualRaw) : null
  if (!actualRaw || actual == null) {
    return { error: '실제 기록은 45:20 또는 1:45:20 형식으로 입력해주세요.' }
  }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('created_by')
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventResult.error || !eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }
  const canWrite = profile.role === 'admin' || eventResult.data.created_by === profile.id
  if (!canWrite) return { error: '실제 기록은 작성자나 관리자만 입력할 수 있습니다.' }

  const { data, error } = await supabase
    .from('member_record_match_entries')
    .update({ actual_seconds: actual, updated_at: new Date().toISOString() })
    .eq('event_id', input.eventId)
    .eq('member_id', input.memberId)
    .select('id')
  if (error) return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  if (!data?.length) return { error: '예상 기록을 낸 회원만 실제 기록을 입력할 수 있습니다.' }
  revalidate()
  return {}
}

export async function deleteRecordMatchEvent(eventId: string): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile || !isStaff(profile.role)) return { error: '강사 또는 관리자만 삭제할 수 있습니다.' }

  const supabase = await db()
  const { error } = await supabase.from('member_record_match_events').delete().eq('id', eventId)
  if (error) return { error: error.message }
  revalidate()
  return {}
}

export async function setRecordMatchWinners(input: {
  eventId: string
  winners: Array<{ memberId: string; prizeIndex: number }>
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (!input.eventId) return { error: '이벤트를 찾지 못했습니다.' }

  const supabase = await db()
  const existing = await supabase
    .from('member_record_match_events')
    .select('id, created_by, prize')
    .eq('id', input.eventId)
    .maybeSingle()
  if (existing.error) {
    return {
      error: isMissingTable(existing.error.message)
        ? MISSING_TABLE_HINT
        : existing.error.message,
    }
  }
  if (!existing.data) return { error: '이벤트를 찾지 못했습니다.' }

  const canSelect =
    profile.role === 'admin' || existing.data.created_by === profile.id
  if (!canSelect) return { error: '작성자 또는 관리자만 당첨자를 선정할 수 있습니다.' }

  const prizes = splitRecordMatchPrizes(String(existing.data.prize ?? ''))
  if (prizes.length === 0) return { error: '상품이 없어 당첨자를 선정할 수 없습니다.' }

  const entries = await supabase
    .from('member_record_match_entries')
    .select('member_id')
    .eq('event_id', input.eventId)
  if (entries.error) {
    return {
      error: isMissingTable(entries.error.message)
        ? MISSING_TABLE_HINT
        : entries.error.message,
    }
  }

  const memberIds = new Set(
    (entries.data ?? []).map((row) => String(row.member_id)),
  )
  const cleaned: Array<{ memberId: string; prizeIndex: number }> = []
  const usedPrize = new Set<number>()
  const usedMember = new Set<string>()

  for (const winner of input.winners) {
    const memberId = winner.memberId.trim()
    const prizeIndex = Number(winner.prizeIndex)
    if (!memberId || !memberIds.has(memberId)) {
      return { error: '참여자만 당첨자로 선정할 수 있습니다.' }
    }
    if (!Number.isInteger(prizeIndex) || prizeIndex < 0 || prizeIndex >= prizes.length) {
      return { error: '상품 등수가 올바르지 않습니다.' }
    }
    if (usedPrize.has(prizeIndex)) {
      return { error: '같은 등수에 두 명을 선정할 수 없습니다.' }
    }
    if (usedMember.has(memberId)) {
      return { error: '한 명이 여러 등수를 받을 수 없습니다.' }
    }
    usedPrize.add(prizeIndex)
    usedMember.add(memberId)
    cleaned.push({ memberId, prizeIndex })
  }

  cleaned.sort((a, b) => a.prizeIndex - b.prizeIndex)

  const { error } = await supabase
    .from('member_record_match_events')
    .update({ winners: cleaned })
    .eq('id', input.eventId)

  if (error) {
    if (isMissingWinnersColumn(error.message)) return { error: MISSING_WINNERS_HINT }
    return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  }

  revalidate()
  return {}
}
