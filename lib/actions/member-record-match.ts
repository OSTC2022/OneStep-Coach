'use server'

import { format, subDays } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { isCommentEdited } from '@/lib/comment-edited'
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

export type RecordMatchComment = {
  id: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
  isEdited: boolean
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
}

export type RecordMatchWinner = {
  memberId: string
  memberName: string
  prizeIndex: number
  prize: string
  /** 공개 이벤트 게스트 당첨자 */
  isGuest?: boolean
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
  /** 주최자·강사·관리자: 예상기록 수정/삭제 */
  canManageEntries: boolean
  participantCount: number
  /** 공개 이벤트 당첨 후보(댓글 작성자 이름) */
  guestCandidates: string[]
  comments: RecordMatchComment[]
  mine: RecordMatchEntry | null
  ranking: RecordMatchEntry[]
  guesses: Array<{
    entryId: string
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
const MISSING_COMMENTS_HINT =
  '댓글 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match-public.sql 과 add-member-record-match-comments-edit.sql 을 실행해주세요.'

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
    const guestName = String((row as { guestName?: unknown }).guestName ?? '').trim()
    const prizeIndex = Number((row as { prizeIndex?: unknown }).prizeIndex)
    if (!Number.isInteger(prizeIndex) || prizeIndex < 0) continue
    const prize = prizes[prizeIndex] ?? prizes[0] ?? ''
    if (!prize) continue
    if (guestName) {
      winners.push({
        memberId: '',
        memberName: guestName,
        prizeIndex,
        prize,
        isGuest: true,
      })
      continue
    }
    if (!memberId) continue
    winners.push({
      memberId,
      memberName: nameByMemberId.get(memberId) ?? '회원',
      prizeIndex,
      prize,
    })
  }
  return winners.sort(
    (a, b) => a.prizeIndex - b.prizeIndex || a.memberName.localeCompare(b.memberName, 'ko'),
  )
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

  const commentsByEvent = new Map<string, RecordMatchComment[]>()
  if (eventIds.length > 0) {
    let commentResult = await supabase
      .from('member_record_match_comments')
      .select('id, event_id, author_name, body, author_user_id, created_at, updated_at')
      .in('event_id', eventIds)
      .order('created_at', { ascending: true })
      .limit(800)

    if (commentResult.error && String(commentResult.error.message).includes('author_user_id')) {
      commentResult = await supabase
        .from('member_record_match_comments')
        .select('id, event_id, author_name, body, created_at, updated_at')
        .in('event_id', eventIds)
        .order('created_at', { ascending: true })
        .limit(800)
    }
    if (commentResult.error && String(commentResult.error.message).includes('updated_at')) {
      commentResult = await supabase
        .from('member_record_match_comments')
        .select('id, event_id, author_name, body, created_at')
        .in('event_id', eventIds)
        .order('created_at', { ascending: true })
        .limit(800)
    }

    if (!commentResult.error) {
      for (const row of commentResult.data ?? []) {
        const eventId = String(row.event_id)
        const createdAt = String(row.created_at ?? '')
        const updatedAt = String(
          'updated_at' in row && row.updated_at ? row.updated_at : createdAt,
        )
        const authorUserId =
          'author_user_id' in row && row.author_user_id
            ? String(row.author_user_id)
            : null
        const isMine = Boolean(authorUserId && authorUserId === profile.id)
        const comment: RecordMatchComment = {
          id: String(row.id),
          authorName: String(row.author_name ?? '회원'),
          body: String(row.body ?? ''),
          createdAt,
          updatedAt,
          isEdited: isCommentEdited(createdAt, updatedAt),
          isMine,
          canEdit: isMine || profile.role === 'admin',
          canDelete: isMine || isStaff(profile.role) || profile.role === 'admin',
        }
        const list = commentsByEvent.get(eventId) ?? []
        list.push(comment)
        commentsByEvent.set(eventId, list)
      }
    }
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
      const canManageEntries = staff || row.created_by === profile.id
      const raceTitle = race?.title ?? '대회'
      const customTitle = normalizeEventTitle(
        'title' in row ? String(row.title ?? '') : '',
      )
      const isPublic = Boolean('is_public' in row ? row.is_public : false)
      const comments = isPublic ? [] : (commentsByEvent.get(String(row.id)) ?? [])
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
        isPublic,
        winners: parseWinnerRows(
          'winners' in row ? row.winners : [],
          prizes,
          nameByMemberId,
        ),
        createdByMe: row.created_by === profile.id,
        canEdit: canManage,
        canSelectWinners: profile.role === 'admin',
        // 최종 기록(실제 기록)은 주최자·관리자만
        canWriteActual: canManage,
        canManageEntries,
        participantCount: entries.length,
        guestCandidates: [],
        comments,
        mine: entries.find((entry) => entry.isMine) ?? null,
        ranking,
        guesses: staff
          ? entries.map((entry) => ({
              entryId: entry.id,
              memberId: entry.memberId,
              name: entry.authorName,
              predictedLabel: entry.predictedLabel,
              actualLabel: entry.actualLabel,
            }))
          : [],
      }
    })

  if (profile.role === 'admin') {
    const publicIds = events.filter((event) => event.isPublic).map((event) => event.id)
    if (publicIds.length > 0) {
      const commentAuthors = await supabase
        .from('member_record_match_comments')
        .select('event_id, author_name')
        .in('event_id', publicIds)
        .limit(500)
      if (!commentAuthors.error) {
        const namesByEvent = new Map<string, Set<string>>()
        for (const row of commentAuthors.data ?? []) {
          const eventId = String(row.event_id)
          const name = String(row.author_name ?? '').trim()
          if (!name) continue
          const set = namesByEvent.get(eventId) ?? new Set<string>()
          set.add(name)
          namesByEvent.set(eventId, set)
        }
        for (const event of events) {
          if (!event.isPublic) continue
          event.guestCandidates = [...(namesByEvent.get(event.id) ?? [])].sort((a, b) =>
            a.localeCompare(b, 'ko'),
          )
        }
      }
    }
  }

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

export async function updateRecordMatchPredicted(input: {
  eventId: string
  memberId: string
  predicted: string
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const predicted = parseFinishTime(input.predicted)
  if (predicted == null) {
    return { error: '예상 기록은 45:20 또는 1:45:20 형식으로 입력해주세요.' }
  }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('created_by')
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventResult.error || !eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }

  const canManage =
    isStaff(profile.role) || eventResult.data.created_by === profile.id
  if (!canManage) {
    return { error: '주최자·강사·관리자만 예상 기록을 수정할 수 있습니다.' }
  }

  const { data, error } = await supabase
    .from('member_record_match_entries')
    .update({
      predicted_seconds: predicted,
      updated_at: new Date().toISOString(),
    })
    .eq('event_id', input.eventId)
    .eq('member_id', input.memberId)
    .select('id')
  if (error) return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  if (!data?.length) return { error: '예상 기록을 찾지 못했습니다.' }
  revalidate()
  return {}
}

export async function deleteRecordMatchEntry(input: {
  eventId: string
  memberId: string
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('created_by')
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventResult.error || !eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }

  const canManage =
    isStaff(profile.role) || eventResult.data.created_by === profile.id
  if (!canManage) {
    return { error: '주최자·강사·관리자만 예상 기록을 삭제할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('member_record_match_entries')
    .delete()
    .eq('event_id', input.eventId)
    .eq('member_id', input.memberId)
  if (error) return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  revalidate()
  return {}
}

export async function addRecordMatchComment(input: {
  eventId: string
  body: string
}): Promise<{ error?: string; comment?: RecordMatchComment }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  const body = input.body.trim().slice(0, 500)
  if (!input.eventId) return { error: '이벤트를 찾지 못했습니다.' }
  if (!body) return { error: '댓글을 입력해주세요.' }

  const member = await getMemberForCurrentUser()
  const authorName =
    member?.name?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.split('@')[0] ||
    '회원'

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('id, is_public')
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventResult.error) {
    return {
      error: isMissingTable(eventResult.error.message)
        ? MISSING_TABLE_HINT
        : eventResult.error.message,
    }
  }
  if (!eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }
  if (eventResult.data.is_public) {
    return { error: '공개 이벤트 댓글은 공유 링크에서 작성해주세요.' }
  }

  const { data, error } = await supabase
    .from('member_record_match_comments')
    .insert({
      event_id: input.eventId,
      author_user_id: profile.id,
      author_name: authorName,
      body,
      password_hash: null,
    })
    .select('id, author_name, body, created_at, updated_at')
    .single()

  if (error) {
    return {
      error:
        isMissingTable(error.message) || error.message.includes('member_record_match_comments')
          ? MISSING_COMMENTS_HINT
          : error.message,
    }
  }

  const createdAt = String(data?.created_at ?? new Date().toISOString())
  const updatedAt = String(data?.updated_at ?? createdAt)
  revalidate()
  return {
    comment: {
      id: String(data!.id),
      authorName: String(data!.author_name ?? authorName),
      body: String(data!.body ?? body),
      createdAt,
      updatedAt,
      isEdited: false,
      isMine: true,
      canEdit: true,
      canDelete: true,
    },
  }
}

export async function updateRecordMatchComment(input: {
  commentId: string
  body: string
}): Promise<{ error?: string; comment?: RecordMatchComment }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  const body = input.body.trim().slice(0, 500)
  if (!input.commentId) return { error: '댓글을 찾지 못했습니다.' }
  if (!body) return { error: '댓글을 입력해주세요.' }

  const supabase = await db()
  const existing = await supabase
    .from('member_record_match_comments')
    .select('id, event_id, author_user_id, author_name, created_at')
    .eq('id', input.commentId)
    .maybeSingle()
  if (existing.error) {
    return {
      error: isMissingTable(existing.error.message)
        ? MISSING_COMMENTS_HINT
        : existing.error.message,
    }
  }
  if (!existing.data) return { error: '댓글을 찾지 못했습니다.' }

  const isMine = existing.data.author_user_id === profile.id
  if (!isMine && profile.role !== 'admin') {
    return { error: '본인 댓글만 수정할 수 있습니다.' }
  }

  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('member_record_match_comments')
    .update({ body, updated_at: updatedAt })
    .eq('id', input.commentId)
    .select('id, author_name, body, created_at, updated_at, author_user_id')
    .single()

  if (error) {
    return {
      error: isMissingTable(error.message) ? MISSING_COMMENTS_HINT : error.message,
    }
  }

  const createdAt = String(data?.created_at ?? existing.data.created_at ?? '')
  const nextUpdated = String(data?.updated_at ?? updatedAt)
  revalidate()
  revalidatePath(`/e/${existing.data.event_id}`)
  return {
    comment: {
      id: String(data!.id),
      authorName: String(data!.author_name ?? '회원'),
      body: String(data!.body ?? body),
      createdAt,
      updatedAt: nextUpdated,
      isEdited: true,
      isMine: data!.author_user_id === profile.id,
      canEdit: true,
      canDelete: true,
    },
  }
}

export async function deleteRecordMatchComment(commentId: string): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (!commentId) return { error: '댓글을 찾지 못했습니다.' }

  const supabase = await db()
  const existing = await supabase
    .from('member_record_match_comments')
    .select('id, event_id, author_user_id')
    .eq('id', commentId)
    .maybeSingle()
  if (existing.error) {
    return {
      error: isMissingTable(existing.error.message)
        ? MISSING_COMMENTS_HINT
        : existing.error.message,
    }
  }
  if (!existing.data) return { error: '댓글을 찾지 못했습니다.' }

  const isMine = existing.data.author_user_id === profile.id
  if (!isMine && !isStaff(profile.role)) {
    return { error: '본인 또는 강사·관리자만 삭제할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('member_record_match_comments')
    .delete()
    .eq('id', commentId)
  if (error) return { error: error.message }
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
  if (actualRaw && actual == null) {
    return { error: '최종 기록은 45:20 또는 1:45:20 형식으로 입력해주세요.' }
  }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('created_by')
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventResult.error || !eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }
  // 최종 기록은 주최자(작성자) 또는 관리자만 입력·수정
  const canWrite = profile.role === 'admin' || eventResult.data.created_by === profile.id
  if (!canWrite) return { error: '최종 기록은 주최자 또는 관리자만 입력·수정할 수 있습니다.' }

  const { data, error } = await supabase
    .from('member_record_match_entries')
    .update({
      actual_seconds: actual,
      updated_at: new Date().toISOString(),
    })
    .eq('event_id', input.eventId)
    .eq('member_id', input.memberId)
    .select('id')
  if (error) return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  if (!data?.length) return { error: '예상 기록을 낸 회원만 최종 기록을 넣을 수 있습니다.' }
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
  winners: Array<{ memberId?: string; guestName?: string; prizeIndex: number }>
}): Promise<{ error?: string }> {
  const profile = await getDashboardProfile()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'admin') return { error: '관리자만 당첨자를 선정할 수 있습니다.' }
  if (!input.eventId) return { error: '이벤트를 찾지 못했습니다.' }

  const supabase = await db()
  let existing = await supabase
    .from('member_record_match_events')
    .select('id, created_by, prize, is_public')
    .eq('id', input.eventId)
    .maybeSingle()
  if (existing.error && isMissingPublicColumn(existing.error.message)) {
    existing = await supabase
      .from('member_record_match_events')
      .select('id, created_by, prize')
      .eq('id', input.eventId)
      .maybeSingle()
  }
  if (existing.error) {
    return {
      error: isMissingTable(existing.error.message)
        ? MISSING_TABLE_HINT
        : existing.error.message,
    }
  }
  if (!existing.data) return { error: '이벤트를 찾지 못했습니다.' }

  const prizes = splitRecordMatchPrizes(String(existing.data.prize ?? ''))
  if (prizes.length === 0) return { error: '상품이 없어 당첨자를 선정할 수 없습니다.' }

  const isPublic = Boolean(
    'is_public' in existing.data ? existing.data.is_public : false,
  )

  const cleaned: Array<
    { memberId: string; prizeIndex: number } | { guestName: string; prizeIndex: number }
  > = []
  const usedKey = new Set<string>()

  if (isPublic) {
    const comments = await supabase
      .from('member_record_match_comments')
      .select('author_name')
      .eq('event_id', input.eventId)
      .limit(500)
    if (comments.error) {
      return {
        error: isMissingTable(comments.error.message)
          ? MISSING_TABLE_HINT
          : comments.error.message,
      }
    }
    const guestNames = new Set(
      (comments.data ?? [])
        .map((row) => String(row.author_name ?? '').trim())
        .filter(Boolean),
    )

    for (const winner of input.winners) {
      const guestName = (winner.guestName ?? winner.memberId ?? '').trim()
      const prizeIndex = Number(winner.prizeIndex)
      if (!guestName || !guestNames.has(guestName)) {
        return { error: '댓글을 남긴 사람만 당첨자로 선정할 수 있습니다.' }
      }
      if (!Number.isInteger(prizeIndex) || prizeIndex < 0 || prizeIndex >= prizes.length) {
        return { error: '상품 등수가 올바르지 않습니다.' }
      }
      const key = `g:${guestName}`
      if (usedKey.has(key)) {
        return { error: '한 명이 여러 등수를 받을 수 없습니다.' }
      }
      usedKey.add(key)
      cleaned.push({ guestName, prizeIndex })
    }
  } else {
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

    for (const winner of input.winners) {
      const memberId = (winner.memberId ?? '').trim()
      const prizeIndex = Number(winner.prizeIndex)
      if (!memberId || !memberIds.has(memberId)) {
        return { error: '참여자만 당첨자로 선정할 수 있습니다.' }
      }
      if (!Number.isInteger(prizeIndex) || prizeIndex < 0 || prizeIndex >= prizes.length) {
        return { error: '상품 등수가 올바르지 않습니다.' }
      }
      const key = `m:${memberId}`
      if (usedKey.has(key)) {
        return { error: '한 명이 여러 등수를 받을 수 없습니다.' }
      }
      usedKey.add(key)
      cleaned.push({ memberId, prizeIndex })
    }
  }

  cleaned.sort((a, b) => {
    if (a.prizeIndex !== b.prizeIndex) return a.prizeIndex - b.prizeIndex
    const aKey = 'guestName' in a ? a.guestName : a.memberId
    const bKey = 'guestName' in b ? b.guestName : b.memberId
    return aKey.localeCompare(bKey, 'ko')
  })

  const { error } = await supabase
    .from('member_record_match_events')
    .update({ winners: cleaned })
    .eq('id', input.eventId)

  if (error) {
    if (isMissingWinnersColumn(error.message)) return { error: MISSING_WINNERS_HINT }
    return { error: isMissingTable(error.message) ? MISSING_TABLE_HINT : error.message }
  }

  revalidate()
  revalidatePath(`/e/${input.eventId}`)
  return {}
}
