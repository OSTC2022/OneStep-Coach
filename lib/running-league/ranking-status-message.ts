import type { RunningLeagueParticipant } from '@/lib/types'

export const RANKING_STATUS_MESSAGE_MAX_LENGTH = 15

export function normalizeRankingStatusMessage(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  return trimmed.slice(0, RANKING_STATUS_MESSAGE_MAX_LENGTH)
}

export function buildRankingStatusMessageByMemberId(
  participants: ReadonlyArray<RunningLeagueParticipant>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const participant of participants) {
    const message = normalizeRankingStatusMessage(participant.member?.ranking_status_message)
    if (message) {
      map.set(participant.member_id, message)
    }
  }
  return map
}
