'use server'

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { splitRecordMatchPrizes } from '@/lib/member-record-match'
import { formatMarathonDistanceLabel } from '@/lib/running-league/marathon-schedule'
import type { MarathonDistanceFilter } from '@/lib/running-league/marathon-schedule'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PublicRecordMatchComment = {
  id: string
  authorName: string
  body: string
  createdAt: string
}

export type PublicRecordMatchEvent = {
  id: string
  raceTitle: string
  raceDate: string
  location: string
  distanceLabel: string | null
  prizes: string[]
  note: string
  isPublic: true
  comments: PublicRecordMatchComment[]
}

const MISSING_HINT =
  '공개 이벤트 테이블이 없습니다. Supabase SQL Editor에서 supabase/add-member-record-match-public.sql 을 실행해주세요.'

function isMissing(message: string) {
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('Could not find') ||
    message.includes('is_public') ||
    message.includes('member_record_match_comments')
  )
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function passwordMatches(password: string, stored: string | null) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 32)
  const prev = Buffer.from(hash, 'hex')
  if (next.length !== prev.length) return false
  return timingSafeEqual(next, prev)
}

function isFourCharPassword(value: string) {
  return /^\S{4}$/.test(value)
}

async function db() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidatePublic(eventId: string) {
  revalidatePath(`/e/${eventId}`)
  revalidatePath('/dashboard/my')
  revalidatePath('/dashboard/running-portal')
}

export async function getPublicRecordMatchEvent(
  eventId: string,
): Promise<{ event?: PublicRecordMatchEvent; error?: string; notPublic?: boolean }> {
  const id = eventId.trim()
  if (!id) return { error: '이벤트를 찾지 못했습니다.' }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('id, marathon_event_id, distance, prize, note, is_public')
    .eq('id', id)
    .maybeSingle()

  if (eventResult.error) {
    return { error: isMissing(eventResult.error.message) ? MISSING_HINT : eventResult.error.message }
  }
  if (!eventResult.data) return { error: '이벤트를 찾지 못했습니다.' }
  if (!eventResult.data.is_public) return { notPublic: true }

  const raceResult = await supabase
    .from('center_marathon_events')
    .select('title, event_date, location_label')
    .eq('id', eventResult.data.marathon_event_id)
    .maybeSingle()

  const commentResult = await supabase
    .from('member_record_match_comments')
    .select('id, author_name, body, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (commentResult.error && isMissing(commentResult.error.message)) {
    return { error: MISSING_HINT }
  }
  if (commentResult.error) return { error: commentResult.error.message }

  const distance = eventResult.data.distance as MarathonDistanceFilter | null

  return {
    event: {
      id,
      raceTitle: String(raceResult.data?.title ?? '대회'),
      raceDate: String(raceResult.data?.event_date ?? '').slice(0, 10),
      location: String(raceResult.data?.location_label ?? ''),
      distanceLabel: distance ? formatMarathonDistanceLabel(distance) : null,
      prizes: splitRecordMatchPrizes(String(eventResult.data.prize ?? '')),
      note: String(eventResult.data.note ?? ''),
      isPublic: true,
      comments: (commentResult.data ?? []).map((row) => ({
        id: String(row.id),
        authorName: String(row.author_name ?? '익명'),
        body: String(row.body ?? ''),
        createdAt: String(row.created_at ?? ''),
      })),
    },
  }
}

export async function addPublicRecordMatchComment(input: {
  eventId: string
  authorName: string
  password: string
  body: string
}): Promise<{ error?: string; comment?: PublicRecordMatchComment }> {
  const eventId = input.eventId.trim()
  const authorName = input.authorName.trim().slice(0, 40)
  const body = input.body.trim().slice(0, 500)
  const password = input.password.trim()

  if (!eventId) return { error: '이벤트를 찾지 못했습니다.' }
  if (!authorName) return { error: '이름을 입력해주세요.' }
  if (!isFourCharPassword(password)) {
    return { error: '비밀번호는 공백 없이 4자로 입력해주세요.' }
  }
  if (!body) return { error: '댓글을 입력해주세요.' }

  const supabase = await db()
  const eventResult = await supabase
    .from('member_record_match_events')
    .select('id, is_public')
    .eq('id', eventId)
    .maybeSingle()

  if (eventResult.error) {
    return { error: isMissing(eventResult.error.message) ? MISSING_HINT : eventResult.error.message }
  }
  if (!eventResult.data?.is_public) return { error: '공개 이벤트가 아닙니다.' }

  const { data, error } = await supabase
    .from('member_record_match_comments')
    .insert({
      event_id: eventId,
      author_name: authorName,
      body,
      password_hash: hashPassword(password),
    })
    .select('id, author_name, body, created_at')
    .single()

  if (error) {
    return { error: isMissing(error.message) ? MISSING_HINT : error.message }
  }
  revalidatePublic(eventId)
  return {
    comment: data
      ? {
          id: String(data.id),
          authorName: String(data.author_name ?? authorName),
          body: String(data.body ?? body),
          createdAt: String(data.created_at ?? new Date().toISOString()),
        }
      : undefined,
  }
}

export async function deletePublicRecordMatchComment(input: {
  eventId: string
  commentId: string
  password?: string
}): Promise<{ error?: string }> {
  const eventId = input.eventId.trim()
  const commentId = input.commentId.trim()
  if (!eventId || !commentId) return { error: '댓글을 찾지 못했습니다.' }

  const supabase = await db()
  const profile = await getDashboardProfile()
  const staff =
    profile?.role === 'admin' || profile?.role === 'instructor'

  const commentResult = await supabase
    .from('member_record_match_comments')
    .select('id, event_id, password_hash')
    .eq('id', commentId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (commentResult.error) {
    return { error: isMissing(commentResult.error.message) ? MISSING_HINT : commentResult.error.message }
  }
  if (!commentResult.data) return { error: '댓글을 찾지 못했습니다.' }

  if (!staff) {
    const password = input.password?.trim() ?? ''
    if (!isFourCharPassword(password)) {
      return { error: '비밀번호는 공백 없이 4자로 입력해주세요.' }
    }
    if (!passwordMatches(password, commentResult.data.password_hash)) {
      return { error: '비밀번호가 맞지 않습니다.' }
    }
  } else if (profile?.role !== 'admin') {
    const eventResult = await supabase
      .from('member_record_match_events')
      .select('created_by')
      .eq('id', eventId)
      .maybeSingle()
    if (eventResult.data?.created_by !== profile?.id) {
      const password = input.password?.trim() ?? ''
      if (!passwordMatches(password, commentResult.data.password_hash)) {
        return { error: '작성자 비밀번호 또는 이벤트 작성자만 삭제할 수 있습니다.' }
      }
    }
  }

  const { error } = await supabase
    .from('member_record_match_comments')
    .delete()
    .eq('id', commentId)
  if (error) return { error: error.message }
  revalidatePublic(eventId)
  return {}
}
