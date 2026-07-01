import { INSTRUCTOR_CALENDAR_COLORS } from '@/lib/instructor-colors'
import type { RunningLeagueParticipant } from '@/lib/types'

export const RANKING_STATUS_MESSAGE_MAX_LENGTH = 15

export const RANKING_STATUS_MESSAGE_COLORS = [
  { id: 'default', hex: '#A1A1AA', label: '기본' },
  ...INSTRUCTOR_CALENDAR_COLORS,
] as const

export const DEFAULT_RANKING_STATUS_MESSAGE_COLOR = RANKING_STATUS_MESSAGE_COLORS[0].hex

export type RankingStatusDisplay = {
  message: string
  color: string
}

export function isRankingStatusMessageColor(value: string | null | undefined): boolean {
  if (!value) return false
  return RANKING_STATUS_MESSAGE_COLORS.some((entry) => entry.hex === value)
}

export function normalizeRankingStatusMessageColor(value: string | null | undefined): string {
  if (value && isRankingStatusMessageColor(value)) {
    return value
  }
  return DEFAULT_RANKING_STATUS_MESSAGE_COLOR
}

export function normalizeRankingStatusMessage(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  return trimmed.slice(0, RANKING_STATUS_MESSAGE_MAX_LENGTH)
}

export function buildRankingStatusByMemberId(
  participants: ReadonlyArray<RunningLeagueParticipant>,
): Map<string, RankingStatusDisplay> {
  const map = new Map<string, RankingStatusDisplay>()
  for (const participant of participants) {
    const message = normalizeRankingStatusMessage(participant.member?.ranking_status_message)
    if (!message) continue
    map.set(participant.member_id, {
      message,
      color: normalizeRankingStatusMessageColor(
        participant.member?.ranking_status_message_color,
      ),
    })
  }
  return map
}

/** @deprecated use buildRankingStatusByMemberId */
export function buildRankingStatusMessageByMemberId(
  participants: ReadonlyArray<RunningLeagueParticipant>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const [memberId, status] of buildRankingStatusByMemberId(participants)) {
    map.set(memberId, status.message)
  }
  return map
}
