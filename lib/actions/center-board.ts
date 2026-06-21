'use server'

import { requireRole } from '@/lib/actions/auth'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  CenterBoardAudience,
  CenterBoardEventSubtype,
  CenterBoardKind,
  CenterBoardPost,
} from '@/lib/types'

const BOARD_SELECT =
  'id, kind, audience, title, body, link_url, event_starts_at, event_ends_at, event_subtype, challenge_goal_km, is_published, pinned, created_by, created_at, updated_at'

function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalDate(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function boardAudienceForRole(
  role: string | null | undefined,
): CenterBoardAudience {
  return role === 'adult_member' ? 'adult' : 'general'
}

function mapRow(row: Record<string, unknown>): CenterBoardPost {
  return {
    id: String(row.id),
    kind: row.kind as CenterBoardKind,
    audience: (row.audience as CenterBoardAudience) ?? 'general',
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    link_url: (row.link_url as string | null) ?? null,
    event_starts_at: (row.event_starts_at as string | null) ?? null,
    event_ends_at: (row.event_ends_at as string | null) ?? null,
    event_subtype: (row.event_subtype as CenterBoardEventSubtype) ?? null,
    challenge_goal_km:
      row.challenge_goal_km != null ? Number(row.challenge_goal_km) : null,
    is_published: Boolean(row.is_published),
    pinned: Boolean(row.pinned),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

async function boardClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

function revalidateBoardPaths(audience: CenterBoardAudience) {
  if (audience === 'adult') {
    revalidatePath('/dashboard/settings/adult-center-board')
  } else {
    revalidatePath('/dashboard/settings/center-board')
  }
}

export async function getPublishedCenterBoardPosts(
  kind: CenterBoardKind,
): Promise<CenterBoardPost[]> {
  const profile = await getDashboardProfile()
  if (!profile) return []

  const audience = boardAudienceForRole(profile.role)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('center_board_posts')
    .select(BOARD_SELECT)
    .eq('kind', kind)
    .eq('audience', audience)
    .eq('is_published', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[center-board] getPublishedCenterBoardPosts', error.message)
    return []
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function getCenterBoardPostsForAdmin(
  kind?: CenterBoardKind,
  audience: CenterBoardAudience = 'general',
): Promise<CenterBoardPost[]> {
  await requireRole(['admin'])
  const supabase = await boardClient()

  let query = supabase
    .from('center_board_posts')
    .select(BOARD_SELECT)
    .eq('audience', audience)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) {
    console.error('[center-board] getCenterBoardPostsForAdmin', error.message)
    return []
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function createCenterBoardPost(input: {
  kind: CenterBoardKind
  audience?: CenterBoardAudience
  title: string
  body?: string
  link_url?: string | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  event_subtype?: CenterBoardEventSubtype
  challenge_goal_km?: number | null
  is_published?: boolean
  pinned?: boolean
}): Promise<{ data?: CenterBoardPost; error?: string }> {
  const user = await requireRole(['admin'])
  const supabase = await boardClient()
  const title = input.title.trim()
  if (!title) return { error: '제목을 입력해주세요.' }

  const audience = input.audience ?? 'general'
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('center_board_posts')
    .insert({
      kind: input.kind,
      audience,
      title,
      body: input.body?.trim() ?? '',
      link_url: normalizeOptionalString(input.link_url),
      event_starts_at:
        input.kind === 'event'
          ? normalizeOptionalDate(input.event_starts_at)
          : null,
      event_ends_at:
        input.kind === 'event'
          ? normalizeOptionalDate(input.event_ends_at)
          : null,
      event_subtype:
        input.kind === 'event' ? input.event_subtype ?? null : null,
      challenge_goal_km:
        input.kind === 'event' && input.event_subtype === 'mileage_challenge'
          ? input.challenge_goal_km ?? null
          : null,
      is_published: input.is_published ?? true,
      pinned: input.pinned ?? false,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select(BOARD_SELECT)
    .single()

  if (error) return { error: error.message }

  revalidateBoardPaths(audience)
  return { data: mapRow(data as Record<string, unknown>) }
}

export async function updateCenterBoardPost(
  id: string,
  input: {
    title?: string
    body?: string
    link_url?: string | null
    event_starts_at?: string | null
    event_ends_at?: string | null
    event_subtype?: CenterBoardEventSubtype
    challenge_goal_km?: number | null
    is_published?: boolean
    pinned?: boolean
  },
): Promise<{ data?: CenterBoardPost; error?: string }> {
  await requireRole(['admin'])
  const supabase = await boardClient()

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { error: '제목을 입력해주세요.' }
    update.title = title
  }
  if (input.body !== undefined) update.body = input.body.trim()
  if (input.link_url !== undefined) {
    update.link_url = normalizeOptionalString(input.link_url)
  }
  if (input.event_starts_at !== undefined) {
    update.event_starts_at = normalizeOptionalDate(input.event_starts_at)
  }
  if (input.event_ends_at !== undefined) {
    update.event_ends_at = normalizeOptionalDate(input.event_ends_at)
  }
  if (input.event_subtype !== undefined) update.event_subtype = input.event_subtype
  if (input.challenge_goal_km !== undefined) {
    update.challenge_goal_km = input.challenge_goal_km
  }
  if (input.is_published !== undefined) update.is_published = input.is_published
  if (input.pinned !== undefined) update.pinned = input.pinned

  const { data, error } = await supabase
    .from('center_board_posts')
    .update(update)
    .eq('id', id)
    .select(BOARD_SELECT)
    .single()

  if (error) return { error: error.message }

  const mapped = mapRow(data as Record<string, unknown>)
  revalidateBoardPaths(mapped.audience)
  return { data: mapped }
}

export async function deleteCenterBoardPost(
  id: string,
): Promise<{ error?: string }> {
  await requireRole(['admin'])
  const supabase = await boardClient()

  const { data: existing } = await supabase
    .from('center_board_posts')
    .select('audience')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('center_board_posts').delete().eq('id', id)
  if (error) return { error: error.message }

  const audience = (existing?.audience as CenterBoardAudience) ?? 'general'
  revalidateBoardPaths(audience)
  return {}
}
