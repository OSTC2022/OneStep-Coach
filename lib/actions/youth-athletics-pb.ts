'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getMemberForCurrentUser } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  formatYouthAthleticsResultValue,
  getYouthAthleticsEventKind,
  isYouthAthleticsEventKey,
  parseYouthAthleticsResult,
  type YouthAthleticsEventKey,
  type YouthAthleticsResultKind,
} from '@/lib/youth-athletics-events'

export type YouthAthleticsPbRecord = {
  id: string
  member_id: string
  event_key: YouthAthleticsEventKey
  result_text: string
  result_value: number
  result_kind: YouthAthleticsResultKind
  measured_at: string
  note: string | null
  created_at: string
}

export type YouthAthleticsPbBundle = {
  tableReady: boolean
  primaryEvent1: YouthAthleticsEventKey | null
  primaryEvent2: YouthAthleticsEventKey | null
  records: YouthAthleticsPbRecord[]
  bestByEvent: Partial<Record<YouthAthleticsEventKey, YouthAthleticsPbRecord>>
}

function emptyBundle(tableReady = true): YouthAthleticsPbBundle {
  return {
    tableReady,
    primaryEvent1: null,
    primaryEvent2: null,
    records: [],
    bestByEvent: {},
  }
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('youth_athletics_athlete_profiles') ||
    message.includes('youth_athletics_pb_records')
  )
}

function normalizeEventKey(value: unknown): YouthAthleticsEventKey | null {
  const key = typeof value === 'string' ? value.trim() : ''
  return isYouthAthleticsEventKey(key) ? key : null
}

function mapRecord(row: Record<string, unknown>): YouthAthleticsPbRecord | null {
  const eventKey = normalizeEventKey(row.event_key)
  if (!eventKey) return null
  const resultValue = Number(row.result_value)
  if (!Number.isFinite(resultValue)) return null
  const resultKind: YouthAthleticsResultKind =
    row.result_kind === 'mark' ? 'mark' : 'time'
  const resultText =
    typeof row.result_text === 'string' && row.result_text.trim()
      ? row.result_text.trim()
      : formatYouthAthleticsResultValue(resultValue, resultKind)
  const measuredAt =
    typeof row.measured_at === 'string' ? row.measured_at.slice(0, 10) : ''
  if (!measuredAt) return null
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    event_key: eventKey,
    result_text: resultText,
    result_value: resultValue,
    result_kind: resultKind,
    measured_at: measuredAt,
    note: typeof row.note === 'string' ? row.note : null,
    created_at:
      typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
  }
}

function pickBest(
  records: YouthAthleticsPbRecord[],
): Partial<Record<YouthAthleticsEventKey, YouthAthleticsPbRecord>> {
  const best: Partial<Record<YouthAthleticsEventKey, YouthAthleticsPbRecord>> = {}
  for (const record of records) {
    const current = best[record.event_key]
    if (!current) {
      best[record.event_key] = record
      continue
    }
    // time: lower is better, mark: higher is better
    const better =
      record.result_kind === 'mark'
        ? record.result_value > current.result_value
        : record.result_value < current.result_value
    if (better) best[record.event_key] = record
  }
  return best
}

async function resolveMemberId(explicitMemberId?: string | null): Promise<string | null> {
  if (explicitMemberId?.trim()) return explicitMemberId.trim()
  const member = await getMemberForCurrentUser()
  return member?.id ?? null
}

export async function getYouthAthleticsPbBundle(
  memberId?: string | null,
): Promise<YouthAthleticsPbBundle> {
  const resolvedMemberId = await resolveMemberId(memberId)
  if (!resolvedMemberId) return emptyBundle()

  const supabase = await createClient()

  const [profileResult, recordsResult] = await Promise.all([
    supabase
      .from('youth_athletics_athlete_profiles')
      .select('primary_event_1, primary_event_2')
      .eq('member_id', resolvedMemberId)
      .maybeSingle(),
    supabase
      .from('youth_athletics_pb_records')
      .select(
        'id, member_id, event_key, result_text, result_value, result_kind, measured_at, note, created_at',
      )
      .eq('member_id', resolvedMemberId)
      .order('measured_at', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (
    isMissingTableError(profileResult.error) ||
    isMissingTableError(recordsResult.error)
  ) {
    return emptyBundle(false)
  }

  const records = (recordsResult.data ?? [])
    .map((row) => mapRecord(row as Record<string, unknown>))
    .filter((row): row is YouthAthleticsPbRecord => row != null)

  return {
    tableReady: true,
    primaryEvent1: normalizeEventKey(profileResult.data?.primary_event_1),
    primaryEvent2: normalizeEventKey(profileResult.data?.primary_event_2),
    records,
    bestByEvent: pickBest(records),
  }
}

export async function saveYouthAthleticsPrimaryEvents(input: {
  event1: string | null
  event2: string | null
  memberId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const memberId = await resolveMemberId(input.memberId)
  if (!memberId) return { ok: false, error: '회원 정보를 찾을 수 없습니다.' }

  const event1 = input.event1?.trim() || null
  const event2 = input.event2?.trim() || null

  if (event1 && !isYouthAthleticsEventKey(event1)) {
    return { ok: false, error: '주 종목 1을 확인해주세요.' }
  }
  if (event2 && !isYouthAthleticsEventKey(event2)) {
    return { ok: false, error: '주 종목 2를 확인해주세요.' }
  }
  if (event1 && event2 && event1 === event2) {
    return { ok: false, error: '주 종목 2개는 서로 다르게 선택해주세요.' }
  }

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch {
    supabase = await createClient()
  }

  const { error } = await supabase.from('youth_athletics_athlete_profiles').upsert(
    {
      member_id: memberId,
      primary_event_1: event1,
      primary_event_2: event2,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id' },
  )

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error:
          'PB 테이블이 없습니다. supabase/add-youth-athletics-pb-records.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/dashboard/my')
  return { ok: true }
}

export async function addYouthAthleticsPbRecord(input: {
  eventKey: string
  resultText: string
  measuredAt?: string | null
  note?: string | null
  memberId?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const memberId = await resolveMemberId(input.memberId)
  if (!memberId) return { ok: false, error: '회원 정보를 찾을 수 없습니다.' }

  const eventKey = input.eventKey.trim()
  if (!isYouthAthleticsEventKey(eventKey)) {
    return { ok: false, error: '종목을 선택해주세요.' }
  }

  const kind = getYouthAthleticsEventKind(eventKey)
  const parsed = parseYouthAthleticsResult(input.resultText, kind)
  if (!parsed) {
    return {
      ok: false,
      error:
        kind === 'mark'
          ? '기록은 m 단위로 입력해주세요. 예: 6.45'
          : '기록 형식을 확인해주세요. 예: 11.45, 18:30, 1:32:10',
    }
  }

  const measuredAt = (input.measuredAt?.trim() || new Date().toISOString().slice(0, 10)).slice(
    0,
    10,
  )

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch {
    supabase = await createClient()
  }

  const { error } = await supabase.from('youth_athletics_pb_records').insert({
    member_id: memberId,
    event_key: eventKey,
    result_text: parsed.text,
    result_value: parsed.value,
    result_kind: kind,
    measured_at: measuredAt,
    note: input.note?.trim() || null,
    created_by: user.id,
  })

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: false,
        error:
          'PB 테이블이 없습니다. supabase/add-youth-athletics-pb-records.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/dashboard/my')
  return { ok: true }
}

export async function deleteYouthAthleticsPbRecord(
  recordId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const id = recordId.trim()
  if (!id) return { ok: false, error: '기록을 찾을 수 없습니다.' }

  let supabase
  try {
    supabase = createServiceRoleClient()
  } catch {
    supabase = await createClient()
  }

  const { data: existing, error: fetchError } = await supabase
    .from('youth_athletics_pb_records')
    .select('id, member_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    if (isMissingTableError(fetchError)) {
      return {
        ok: false,
        error:
          'PB 테이블이 없습니다. supabase/add-youth-athletics-pb-records.sql 을 실행해주세요.',
      }
    }
    return { ok: false, error: fetchError.message }
  }
  if (!existing) return { ok: false, error: '기록을 찾을 수 없습니다.' }

  const ownMember = await getMemberForCurrentUser()
  const isOwner = ownMember?.id === existing.member_id
  if (!isOwner && user.role !== 'admin' && user.role !== 'instructor') {
    return { ok: false, error: '본인 기록만 삭제할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('youth_athletics_pb_records')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard/my')
  return { ok: true }
}
