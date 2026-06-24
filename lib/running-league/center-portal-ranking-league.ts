import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type {
  RunningLeague,
  RunningLeagueStatus,
  RunningLeagueTargetGroup,
} from '@/lib/types'

/** 센터 메인 랭킹 전용 리그 식별자 (이벤트 시즌 리그와 분리) */
export const CENTER_PORTAL_RANKING_LEAGUE_MARKER = '__center_portal_ranking__'

export const CENTER_PORTAL_RANKING_LEAGUE_TITLE = 'ONE STEP RUNNING RANKING'

const LEAGUE_SELECT =
  'id, title, description, starts_at, ends_at, status, audience, target_group, board_post_id, created_by, created_at, updated_at'

function mapLeagueRow(row: Record<string, unknown>): RunningLeague {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    starts_at: String(row.starts_at),
    ends_at: String(row.ends_at),
    status: row.status as RunningLeagueStatus,
    audience: (row.audience as RunningLeague['audience']) ?? 'adult',
    target_group: (row.target_group as RunningLeagueTargetGroup) ?? 'all',
    board_post_id: (row.board_post_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function isMissingTableError(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

async function rankingLeagueClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}

export function isCenterPortalRankingLeague(
  league: Pick<RunningLeague, 'description' | 'title'>,
): boolean {
  return (
    league.description.includes(CENTER_PORTAL_RANKING_LEAGUE_MARKER) ||
    league.title === CENTER_PORTAL_RANKING_LEAGUE_TITLE
  )
}

function findPortalRankingLeagueRow(
  rows: Record<string, unknown>[] | null | undefined,
): Record<string, unknown> | null {
  if (!rows?.length) return null
  return (
    rows.find((row) =>
      isCenterPortalRankingLeague({
        title: String(row.title ?? ''),
        description: String(row.description ?? ''),
      }),
    ) ?? null
  )
}

/** 메인 화면 랭킹용 리그 — 없으면 자동 생성합니다. */
export async function ensureCenterPortalRankingLeague(): Promise<RunningLeague | null> {
  const client = await rankingLeagueClient()

  const { data: activeRows, error: activeError } = await client
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (activeError) {
    if (isMissingTableError(activeError)) return null
    throw activeError
  }

  const existingActive = findPortalRankingLeagueRow(activeRows as Record<string, unknown>[] | null)
  if (existingActive) {
    return mapLeagueRow(existingActive)
  }

  const { data: anyRows, error: anyError } = await client
    .from('running_leagues')
    .select(LEAGUE_SELECT)
    .order('created_at', { ascending: true })

  if (anyError) {
    if (isMissingTableError(anyError)) return null
    throw anyError
  }

  const existingAny = findPortalRankingLeagueRow(anyRows as Record<string, unknown>[] | null)
  if (existingAny) {
    const league = mapLeagueRow(existingAny)
    if (league.status !== 'active') {
      await client
        .from('running_leagues')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', league.id)
      return { ...league, status: 'active' }
    }
    return league
  }

  const year = new Date().getFullYear()
  const { data: inserted, error: insertError } = await client
    .from('running_leagues')
    .insert({
      title: CENTER_PORTAL_RANKING_LEAGUE_TITLE,
      description: `${CENTER_PORTAL_RANKING_LEAGUE_MARKER} 센터 메인 랭킹 (이벤트 시즌과 별도)`,
      starts_at: `${year}-01-01`,
      ends_at: '2099-12-31',
      status: 'active',
    })
    .select(LEAGUE_SELECT)
    .single()

  if (insertError) {
    if (isMissingTableError(insertError)) return null
    const { data: retryRows } = await client
      .from('running_leagues')
      .select(LEAGUE_SELECT)
      .order('created_at', { ascending: true })
    const retry = findPortalRankingLeagueRow(retryRows as Record<string, unknown>[] | null)
    if (retry) return mapLeagueRow(retry)
    throw insertError
  }

  return mapLeagueRow(inserted as Record<string, unknown>)
}
