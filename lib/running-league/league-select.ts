export const LEAGUE_SELECT_BASE =
  'id, title, description, starts_at, ends_at, status, audience, target_group, board_post_id, created_by, created_at, updated_at'

export const LEAGUE_SELECT_WITH_BEAT_RIVAL = `${LEAGUE_SELECT_BASE}, beat_rival_member_id`

let beatRivalColumnReady: boolean | null = null

export function runningLeaguesSelectColumns(): string {
  return beatRivalColumnReady === false ? LEAGUE_SELECT_BASE : LEAGUE_SELECT_WITH_BEAT_RIVAL
}

export function isMissingBeatRivalColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('beat_rival_member_id')
}

type LeagueQueryError = { code?: string; message?: string } | null

export async function runRunningLeagueSelectQuery<T>(
  run: (select: string) => PromiseLike<{ data: T; error: LeagueQueryError }>,
): Promise<{ data: T; error: LeagueQueryError }> {
  const select = runningLeaguesSelectColumns()
  let result = await run(select)

  if (isMissingBeatRivalColumnError(result.error)) {
    beatRivalColumnReady = false
    if (select !== LEAGUE_SELECT_BASE) {
      result = await run(LEAGUE_SELECT_BASE)
    }
    return result
  }

  if (!result.error && select.includes('beat_rival_member_id')) {
    beatRivalColumnReady = true
  }

  return result
}
