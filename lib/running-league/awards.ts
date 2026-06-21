import { AWARD_CATEGORIES } from '@/lib/running-league-content'
import { formatRecordDeltaLabel } from '@/lib/running-league/records'
import {
  formatScoreDisplay,
  parseRunningTimeToSeconds,
  type RunningLeagueRankRow,
} from '@/lib/running-league/scoring'
import type {
  RunningLeagueAward,
  RunningLeagueDailyRecovery,
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'

export const MULTIPLE_AWARDS_POLICY =
  '한 회원이 여러 상을 받을 수 있습니다. MVP와 최다 향상상 등 성격이 다른 부문은 중복 수상을 허용합니다.'

export type RunningLeagueAwardKey =
  | 'mvp'
  | 'best_record'
  | 'most_improved'
  | 'attendance'
  | 'pace_master'
  | 'first_finish'
  | 'recovery'
  | 'challenge'
  | 'mood_maker'

export interface RunningLeagueAwardDefinition {
  key: RunningLeagueAwardKey
  name: string
  criteria: string
  autoRecommend: boolean
  manualOnly: boolean
}

export const RUNNING_LEAGUE_AWARD_DEFINITIONS: RunningLeagueAwardDefinition[] = [
  {
    key: 'mvp',
    name: '이달의 러너 MVP',
    criteria: AWARD_CATEGORIES[0]?.criteria ?? '총점 1위',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'best_record',
    name: '최고 기록상',
    criteria: '1km / 3km / 5km / 10km 중 선택 종목 최고 기록',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'most_improved',
    name: '최다 향상상',
    criteria: AWARD_CATEGORIES[2]?.criteria ?? '월초 대비 기록 향상 폭 최대',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'attendance',
    name: '성실 출석상',
    criteria: AWARD_CATEGORIES[3]?.criteria ?? '출석 점수 최고',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'pace_master',
    name: '페이스 장인상',
    criteria: AWARD_CATEGORIES[4]?.criteria ?? '목표 페이스 오차 최소',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'first_finish',
    name: '첫 완주상',
    criteria: AWARD_CATEGORIES[5]?.criteria ?? '처음으로 5km/10km 완주',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'recovery',
    name: '회복관리상',
    criteria: AWARD_CATEGORIES[6]?.criteria ?? '회복관리·스트레칭 우수',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'challenge',
    name: '도전상',
    criteria: AWARD_CATEGORIES[7]?.criteria ?? '입문자 중 가장 적극적 참여',
    autoRecommend: true,
    manualOnly: false,
  },
  {
    key: 'mood_maker',
    name: '분위기 메이커상',
    criteria: AWARD_CATEGORIES[8]?.criteria ?? '팀워크·응원·참여도 우수',
    autoRecommend: false,
    manualOnly: true,
  },
]

export interface RunningLeagueAwardRecommendation {
  award_key: RunningLeagueAwardKey
  award: string
  criteria: string
  memberId: string
  memberName: string
  participantId: string
  reason: string
}

export interface RunningLeagueAwardSlot extends RunningLeagueAwardRecommendation {
  id?: string
  is_recommended: boolean
  is_confirmed: boolean
  manual_only: boolean
}

export interface RecommendAwardsInput {
  leaderboard: RunningLeagueRankRow[]
  participants: RunningLeagueParticipant[]
  records: RunningLeagueRecord[]
  dailyRecoveries?: RunningLeagueDailyRecovery[]
  /** 다른 리그에서 5km/10km 완주 이력이 있는 회원 */
  priorFinishMemberIds?: Set<string>
}

function topBy<T>(rows: T[], pick: (row: T) => number): T | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => pick(b) - pick(a))[0] ?? null
}

function isBeginnerLevel(goalLevel: string | null | undefined): boolean {
  if (!goalLevel) return false
  const value = goalLevel.trim().toLowerCase()
  return value === '입문' || value === '입문자' || value === 'beginner'
}

function isPaceGoalParticipant(participant: RunningLeagueParticipant): boolean {
  if (participant.goal_type === 'record_improvement' || participant.goal_type === 'race_prep') {
    return true
  }
  const goal = participant.personal_goal?.toLowerCase() ?? ''
  return goal.includes('페이스') || goal.includes('pace') || goal.includes('분/km') || goal.includes('분/k')
}

function bestRecordCandidate(
  participants: RunningLeagueParticipant[],
  records: RunningLeagueRecord[],
): {
  participant: RunningLeagueParticipant
  distance: RunningLeagueDistanceEvent
  timeText: string
  seconds: number
} | null {
  const ranked = records
    .filter((row) => row.record_phase === 'month_end' && row.time_text?.trim())
    .map((row) => {
      const seconds = parseRunningTimeToSeconds(row.time_text)
      const participant = participants.find((item) => item.id === row.participant_id)
      if (seconds == null || !participant) return null
      return {
        participant,
        distance: row.distance_event,
        timeText: row.time_text!.trim(),
        seconds,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.seconds - b.seconds)

  return ranked[0] ?? null
}

function mostImprovedCandidate(rows: RunningLeagueRankRow[]): {
  row: RunningLeagueRankRow
  deltaSeconds: number
} | null {
  const ranked = rows
    .map((row) => {
      const baseSec = parseRunningTimeToSeconds(row.recordBaseline)
      const endSec = parseRunningTimeToSeconds(row.recordCurrent)
      if (baseSec == null || endSec == null) return null
      const deltaSeconds = baseSec - endSec
      if (deltaSeconds <= 0) return null
      return { row, deltaSeconds }
    })
    .filter((item): item is { row: RunningLeagueRankRow; deltaSeconds: number } => item != null)
    .sort((a, b) => b.deltaSeconds - a.deltaSeconds)

  return ranked[0] ?? null
}

function recoveryCompositeScore(
  participant: RunningLeagueParticipant,
  dailyRecoveries: RunningLeagueDailyRecovery[],
): number {
  const entries = dailyRecoveries.filter((row) => row.participant_id === participant.id)
  const stretchRate =
    entries.length > 0
      ? entries.filter((row) => row.stretching === 'done').length / entries.length
      : 0
  return participant.recovery_score * 0.7 + stretchRate * 100 * 0.3
}

function firstFinishCandidate(
  participants: RunningLeagueParticipant[],
  records: RunningLeagueRecord[],
  priorFinishMemberIds: Set<string> = new Set(),
): RunningLeagueParticipant | null {
  const finishers = participants.filter((participant) => {
    if (priorFinishMemberIds.has(participant.member_id)) return false

    const hasFinishRecord = records.some(
      (row) =>
        row.participant_id === participant.id &&
        row.record_phase === 'month_end' &&
        (row.distance_event === '5km' || row.distance_event === '10km'),
    )
    if (!hasFinishRecord) return false
    return (
      participant.goal_type === 'finish' ||
      isBeginnerLevel(participant.goal_level) ||
      /5km|10km/.test(participant.personal_goal ?? '')
    )
  })

  return topBy(finishers, (row) => row.goal_achievement_rate ?? row.total_score) ?? null
}

function challengeCandidate(
  leaderboard: RunningLeagueRankRow[],
  participants: RunningLeagueParticipant[],
): RunningLeagueRankRow | null {
  const beginnerIds = new Set(
    participants.filter((row) => isBeginnerLevel(row.goal_level)).map((row) => row.id),
  )
  const beginnerRows = leaderboard.filter((row) => beginnerIds.has(row.participantId))
  return topBy(beginnerRows, (row) => row.totalScore)
}

function paceMasterCandidate(
  participants: RunningLeagueParticipant[],
): RunningLeagueParticipant | null {
  const eligible = participants.filter(
    (row) => isPaceGoalParticipant(row) && (row.goal_achievement_rate ?? 0) > 0,
  )
  return topBy(eligible, (row) => row.goal_achievement_rate ?? 0)
}

function recommendation(
  input: RecommendAwardsInput,
  key: RunningLeagueAwardKey,
  award: string,
  criteria: string,
  participant: RunningLeagueParticipant | null,
  row: RunningLeagueRankRow | null,
  reason: string,
): RunningLeagueAwardRecommendation | null {
  const target = participant
    ? {
        memberId: participant.member_id,
        memberName: participant.member?.name ?? '회원',
        participantId: participant.id,
      }
    : row
      ? {
          memberId: row.memberId,
          memberName: row.memberName,
          participantId: row.participantId,
        }
      : null

  if (!target) return null

  return {
    award_key: key,
    award,
    criteria,
    memberId: target.memberId,
    memberName: target.memberName,
    participantId: target.participantId,
    reason,
  }
}

export function recommendRunningLeagueAwards(
  input: RecommendAwardsInput,
): RunningLeagueAwardRecommendation[] {
  const { leaderboard, participants, records, dailyRecoveries = [] } = input
  if (leaderboard.length === 0) return []

  const recommendations: RunningLeagueAwardRecommendation[] = []

  const mvp = leaderboard.find((row) => row.rank === 1) ?? leaderboard[0]
  const mvpRec = recommendation(
    input,
    'mvp',
    '이달의 러너 MVP',
    RUNNING_LEAGUE_AWARD_DEFINITIONS[0].criteria,
    null,
    mvp,
    `총점 ${formatScoreDisplay(mvp.totalScore)}점`,
  )
  if (mvpRec) recommendations.push(mvpRec)

  const bestRecord = bestRecordCandidate(participants, records)
  if (bestRecord) {
    const rec = recommendation(
      input,
      'best_record',
      '최고 기록상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[1].criteria,
      bestRecord.participant,
      null,
      `${bestRecord.distance} ${bestRecord.timeText} (월말 최고 기록)`,
    )
    if (rec) recommendations.push(rec)
  }

  const mostImproved = mostImprovedCandidate(leaderboard)
  if (mostImproved) {
    const rec = recommendation(
      input,
      'most_improved',
      '최다 향상상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[2].criteria,
      null,
      mostImproved.row,
      formatRecordDeltaLabel(mostImproved.deltaSeconds),
    )
    if (rec) recommendations.push(rec)
  }

  const attendance = topBy(leaderboard, (row) => row.scores.attendance_score)
  if (attendance) {
    const rec = recommendation(
      input,
      'attendance',
      '성실 출석상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[3].criteria,
      null,
      attendance,
      `출석 점수 ${attendance.scores.attendance_score}점`,
    )
    if (rec) recommendations.push(rec)
  }

  const paceMaster = paceMasterCandidate(participants)
  if (paceMaster) {
    const rec = recommendation(
      input,
      'pace_master',
      '페이스 장인상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[4].criteria,
      paceMaster,
      null,
      `목표 달성률 ${paceMaster.goal_achievement_rate ?? 0}% · ${paceMaster.personal_goal ?? '목표 페이스 유지'}`,
    )
    if (rec) recommendations.push(rec)
  }

  const firstFinish = firstFinishCandidate(
    participants,
    records,
    input.priorFinishMemberIds ?? new Set(),
  )
  if (firstFinish) {
    const finishRecord = records.find(
      (row) =>
        row.participant_id === firstFinish.id &&
        row.record_phase === 'month_end' &&
        (row.distance_event === '5km' || row.distance_event === '10km'),
    )
    const rec = recommendation(
      input,
      'first_finish',
      '첫 완주상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[5].criteria,
      firstFinish,
      null,
      finishRecord
        ? `${finishRecord.distance_event} 완주 기록 ${finishRecord.time_text}`
        : firstFinish.personal_goal || '5km/10km 완주 달성',
    )
    if (rec) recommendations.push(rec)
  }

  const recoveryWinner = topBy(participants, (row) =>
    recoveryCompositeScore(row, dailyRecoveries),
  )
  if (recoveryWinner && recoveryWinner.recovery_score > 0) {
    const entries = dailyRecoveries.filter((row) => row.participant_id === recoveryWinner.id)
    const stretchCount = entries.filter((row) => row.stretching === 'done').length
    const rec = recommendation(
      input,
      'recovery',
      '회복관리상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[6].criteria,
      recoveryWinner,
      null,
      `회복관리 ${recoveryWinner.recovery_score}점 · 스트레칭 ${stretchCount}/${entries.length || 0}회`,
    )
    if (rec) recommendations.push(rec)
  }

  const challenge = challengeCandidate(leaderboard, participants)
  if (challenge) {
    const rec = recommendation(
      input,
      'challenge',
      '도전상',
      RUNNING_LEAGUE_AWARD_DEFINITIONS[7].criteria,
      null,
      challenge,
      `입문자 참여 · 총점 ${formatScoreDisplay(challenge.totalScore)}점`,
    )
    if (rec) recommendations.push(rec)
  }

  return recommendations
}

export function buildAwardSlots(
  recommendations: RunningLeagueAwardRecommendation[],
  savedAwards: RunningLeagueAward[],
): RunningLeagueAwardSlot[] {
  const savedByKey = new Map(savedAwards.map((row) => [row.award_key, row]))
  const recommendedByKey = new Map(recommendations.map((row) => [row.award_key, row]))

  return RUNNING_LEAGUE_AWARD_DEFINITIONS.map((definition) => {
    const saved = savedByKey.get(definition.key)
    const recommended = recommendedByKey.get(definition.key)

    if (saved) {
      return {
        id: saved.id,
        award_key: definition.key,
        award: saved.award_name,
        criteria: saved.criteria || definition.criteria,
        memberId: saved.member_id,
        memberName: '',
        participantId: saved.participant_id,
        reason: saved.reason,
        is_recommended: saved.is_recommended,
        is_confirmed: saved.is_confirmed,
        manual_only: definition.manualOnly,
      }
    }

    if (recommended) {
      return {
        award_key: definition.key,
        award: recommended.award,
        criteria: recommended.criteria,
        memberId: recommended.memberId,
        memberName: recommended.memberName,
        participantId: recommended.participantId,
        reason: recommended.reason,
        is_recommended: true,
        is_confirmed: false,
        manual_only: definition.manualOnly,
      }
    }

    return {
      award_key: definition.key,
      award: definition.name,
      criteria: definition.criteria,
      memberId: '',
      memberName: '',
      participantId: '',
      reason: definition.manualOnly ? '코치가 직접 선정해주세요.' : '추천할 데이터가 없습니다.',
      is_recommended: false,
      is_confirmed: false,
      manual_only: definition.manualOnly,
    }
  })
}

export function enrichAwardSlotsWithMemberNames(
  slots: RunningLeagueAwardSlot[],
  participants: RunningLeagueParticipant[],
): RunningLeagueAwardSlot[] {
  const nameByMemberId = new Map(
    participants.map((row) => [row.member_id, row.member?.name ?? '회원']),
  )
  return slots.map((slot) => ({
    ...slot,
    memberName: nameByMemberId.get(slot.memberId) ?? slot.memberName,
  }))
}

/** @deprecated use recommendRunningLeagueAwards */
export function recommendAwards(rows: RunningLeagueRankRow[]): Array<{
  award: string
  criteria: string
  memberId: string
  memberName: string
  reason: string
}> {
  return recommendRunningLeagueAwards({
    leaderboard: rows,
    participants: [],
    records: [],
  }).map((row) => ({
    award: row.award,
    criteria: row.criteria,
    memberId: row.memberId,
    memberName: row.memberName,
    reason: row.reason,
  }))
}
