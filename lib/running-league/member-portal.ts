import { differenceInCalendarDays, parseISO } from 'date-fns'
import { WEEKLY_PLAN } from '@/lib/running-league-content'
import {
  analyzeRecordChange,
  formatRecordDeltaLabel,
  resolveRecordPair,
  type RecordChangeAnalysis,
} from '@/lib/running-league/records'
import { formatScoreDisplay } from '@/lib/running-league/scoring'
import type {
  RunningLeague,
  RunningLeagueDailyRecovery,
  RunningLeagueDistanceEvent,
  RunningLeagueParticipant,
  RunningLeagueRecord,
} from '@/lib/types'

export interface MemberWeeklyMission {
  weekLabel: string
  title: string
  mission: string
  coachNote: string
  weekIndex: number
}

export interface MemberGrowthSnapshot {
  totalScore: number
  rank: number | null
  totalParticipants: number
  goalAchievementRate: number | null
  attendanceCount: number
  mileageKm: number
  recordAnalysis: RecordChangeAnalysis | null
  recordDistance: RunningLeagueDistanceEvent | null
  recoveryCheckCount: number
  recoveryStretchCount: number
}

export function getLeagueWeekIndex(startsAt: string, now = new Date()): number {
  try {
    const start = parseISO(startsAt)
    const days = Math.max(0, differenceInCalendarDays(now, start))
    if (days < 7) return 0
    if (days < 14) return 1
    if (days < 21) return 2
    return 3
  } catch {
    return 0
  }
}

export function getMemberWeeklyMission(league: RunningLeague, now = new Date()): MemberWeeklyMission {
  const weekIndex = getLeagueWeekIndex(league.starts_at, now)
  const week = WEEKLY_PLAN[weekIndex] ?? WEEKLY_PLAN[0]
  return {
    weekLabel: week.week,
    title: week.title,
    mission: week.mission,
    coachNote: week.coachNote,
    weekIndex,
  }
}

export function inferPrimaryRecordDistance(
  participant: RunningLeagueParticipant,
  records: RunningLeagueRecord[],
): RunningLeagueDistanceEvent {
  const events = records
    .filter((row) => row.participant_id === participant.id)
    .map((row) => row.distance_event)
  if (events.length > 0) return events[0]
  const fromBaseline = participant.record_baseline?.match(/^(1km|3km|5km|10km)/i)?.[0]
  if (fromBaseline) return fromBaseline as RunningLeagueDistanceEvent
  return '5km'
}

export function buildMemberRecordAnalysis(
  participant: RunningLeagueParticipant,
  records: RunningLeagueRecord[],
): { distance: RunningLeagueDistanceEvent; analysis: RecordChangeAnalysis } | null {
  const distance = inferPrimaryRecordDistance(participant, records)
  const pair = resolveRecordPair({
    participantId: participant.id,
    records,
    distance,
    fallbackBaseline: participant.record_baseline,
    fallbackCurrent: participant.record_current,
  })

  if (!pair.monthStart.trim() && !pair.monthEnd.trim()) return null

  return {
    distance,
    analysis: analyzeRecordChange(pair.monthStart, pair.monthEnd, distance),
  }
}

export function summarizeRecoveryForMember(
  dailyRecoveries: RunningLeagueDailyRecovery[],
  participantId: string,
): { checkCount: number; stretchCount: number; summary: string } {
  const entries = dailyRecoveries.filter((row) => row.participant_id === participantId)
  const stretchCount = entries.filter((row) => row.stretching === 'done').length
  const checkCount = entries.length

  if (checkCount === 0) {
    return { checkCount, stretchCount, summary: '아직 회복관리 기록이 없습니다.' }
  }

  return {
    checkCount,
    stretchCount,
    summary: `회복 체크 ${checkCount}회 · 스트레칭 ${stretchCount}회 완료`,
  }
}

export function suggestNextGoal(
  participant: RunningLeagueParticipant,
  recordAnalysis: RecordChangeAnalysis | null,
  distance: RunningLeagueDistanceEvent | null,
): string {
  const goal = participant.personal_goal?.trim()
  if (recordAnalysis?.status === 'improved' && distance === '5km' && recordAnalysis.monthEndText) {
    const parts = recordAnalysis.monthEndText.split(':').map(Number)
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const endSec = parts[0] * 60 + parts[1]
      const targetSec = Math.max(0, endSec - 75)
      const targetMin = Math.floor(targetSec / 60)
      const targetRem = targetSec % 60
      return `5km ${targetMin}분 ${String(targetRem).padStart(2, '0')}초대 진입`
    }
  }
  if (goal) return goal.replace(/완주|달성/g, '유지').concat(' 이어가기')
  if (participant.goal_type === 'finish') return '5km 완주 페이스 안정화'
  if (participant.goal_type === 'record_improvement') return '선택 종목 기록 30초 단축'
  return '주 2회 출석과 회복 루틴 유지'
}

export function buildMemberReportNarrative(input: {
  memberName: string
  leagueTitle: string
  personalGoal: string | null
  recordAnalysis: RecordChangeAnalysis | null
  recordDistance: RunningLeagueDistanceEvent | null
  attendanceCount: number
  mileageKm: number
  goalAchievementRate: number | null
  recoverySummary: string
  coachComment: string
  nextGoal: string
}): string {
  const name = input.memberName || '회원'
  const parts: string[] = []

  if (
    input.recordAnalysis?.status === 'improved' &&
    input.recordDistance &&
    input.recordAnalysis.monthStartText &&
    input.recordAnalysis.monthEndText
  ) {
    parts.push(
      `이번 달 ${name}님은 ${input.recordDistance} 기록이 ${input.recordAnalysis.monthStartText}에서 ${input.recordAnalysis.monthEndText}로 향상되었습니다(${input.recordAnalysis.deltaLabel ?? formatRecordDeltaLabel(input.recordAnalysis.deltaSeconds ?? 0)}).`,
    )
  } else if (input.recordAnalysis?.monthEndText && input.recordDistance) {
    parts.push(
      `이번 달 ${name}님은 ${input.recordDistance} 월말 기록 ${input.recordAnalysis.monthEndText}를 기록했습니다.`,
    )
  } else {
    parts.push(`이번 달 ${name}님은 ${input.leagueTitle}에 꾸준히 참여하며 러닝 루틴을 쌓아가고 있습니다.`)
  }

  if (input.attendanceCount > 0) {
    parts.push(`출석은 ${input.attendanceCount}회로 루틴을 ${input.attendanceCount >= 6 ? '안정적으로' : '차근차근'} 유지했습니다.`)
  }

  if (input.mileageKm > 0) {
    parts.push(`누적 거리는 ${input.mileageKm}km입니다.`)
  }

  if (input.goalAchievementRate != null && input.personalGoal) {
    parts.push(
      `개인 목표「${input.personalGoal}」달성률은 ${input.goalAchievementRate}%입니다.`,
    )
  }

  parts.push(`${input.recoverySummary}.`)

  if (input.coachComment.trim()) {
    parts.push(input.coachComment.trim())
  } else {
    parts.push('무리하지 않고 회복과 페이스 조절을 함께 챙긴 점이 좋았습니다.')
  }

  parts.push(`다음 달에는 ${input.nextGoal}을 목표로 훈련을 이어가면 좋겠습니다.`)

  return parts.join(' ')
}

export function buildMemberGrowthSnapshot(input: {
  participant: RunningLeagueParticipant
  records: RunningLeagueRecord[]
  dailyRecoveries: RunningLeagueDailyRecovery[]
  rank: number | null
  totalParticipants: number
  attendanceCount: number
  totalScore: number
}): MemberGrowthSnapshot {
  const record = buildMemberRecordAnalysis(input.participant, input.records)
  const recovery = summarizeRecoveryForMember(input.dailyRecoveries, input.participant.id)

  return {
    totalScore: input.totalScore,
    rank: input.rank,
    totalParticipants: input.totalParticipants,
    goalAchievementRate: input.participant.goal_achievement_rate,
    attendanceCount: input.attendanceCount,
    mileageKm: input.participant.mileage_km,
    recordAnalysis: record?.analysis ?? null,
    recordDistance: record?.distance ?? null,
    recoveryCheckCount: recovery.checkCount,
    recoveryStretchCount: recovery.stretchCount,
  }
}

export function formatMemberRankLabel(rank: number | null, total: number): string {
  if (rank == null || total <= 0) return '순위 집계 중'
  return `${rank}위 / ${total}명`
}

export function formatMemberProgressStatus(
  rank: number | null,
  total: number,
): { label: string; value: string; hint: string } {
  if (total <= 1) {
    return {
      label: '내 진행 상태',
      value: '참여 중',
      hint: '개인 성장 중심으로 확인해주세요',
    }
  }
  return {
    label: '내 위치',
    value: formatMemberRankLabel(rank, total),
    hint: '꾸준히 참여할수록 점수가 쌓입니다',
  }
}

export function formatMemberScoreDetail(score: number): {
  label: string
  value: string
  hint: string
} {
  const display = formatScoreDisplay(score)
  const hint =
    score < 25
      ? '아직 챌린지 초반이에요 · 출석·목표·마일리지·회복관리가 반영됩니다'
      : score < 60
        ? '꾸준히 참여하며 점수가 쌓이고 있어요'
        : '잘 하고 있어요 · 회복과 페이스 조절을 이어가세요'

  return {
    label: '현재 진행 점수',
    value: `${display}점 / 100점`,
    hint,
  }
}

export function formatMemberScoreLabel(score: number): string {
  return `${formatScoreDisplay(score)}점`
}
