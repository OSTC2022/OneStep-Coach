import type { PbLeaderboardDistance } from '@/lib/running-league/pb-leaderboard'

/**
 * PB 랭킹 거리별 데이터 소스 매핑.
 *
 * 스펙 예시(pb_5k_seconds 등)는 members 컬럼이 아니라
 * `running_league_records` + `distance_event` + `record_phase` 조합으로 구현됩니다.
 */
export type PbDistanceSourceSpec = {
  /** 스펙/문서용 가상 컬럼명 */
  specField: string
  /** DB 거리 값 */
  distanceEvent: PbLeaderboardDistance
  /** PB 랭킹에 쓰는 record_phase (현재 최고 기록 스냅샷) */
  rankingRecordPhase: 'other'
  /** 그래프 히스토리에 포함할 phase (측정 이력) */
  historyRecordPhases: ReadonlyArray<
    'month_start' | 'month_end' | 'mid_month' | 'other' | 'pb_history'
  >
  /** 초 단위 정렬 필드 */
  secondsField: 'time_seconds'
}

export const PB_DISTANCE_SOURCES: Record<PbLeaderboardDistance, PbDistanceSourceSpec> = {
  '5km': {
    specField: 'pb_5k_seconds',
    distanceEvent: '5km',
    rankingRecordPhase: 'other',
    historyRecordPhases: ['month_start', 'month_end', 'mid_month', 'other', 'pb_history'],
    secondsField: 'time_seconds',
  },
  '10km': {
    specField: 'pb_10k_seconds',
    distanceEvent: '10km',
    rankingRecordPhase: 'other',
    historyRecordPhases: ['month_start', 'month_end', 'mid_month', 'other', 'pb_history'],
    secondsField: 'time_seconds',
  },
  half: {
    specField: 'pb_half_seconds',
    distanceEvent: 'half',
    rankingRecordPhase: 'other',
    historyRecordPhases: ['month_start', 'month_end', 'mid_month', 'other', 'pb_history'],
    secondsField: 'time_seconds',
  },
  full: {
    specField: 'pb_full_seconds',
    distanceEvent: 'full',
    rankingRecordPhase: 'other',
    historyRecordPhases: ['month_start', 'month_end', 'mid_month', 'other', 'pb_history'],
    secondsField: 'time_seconds',
  },
}

export function getPbDistanceSource(distance: PbLeaderboardDistance): PbDistanceSourceSpec {
  return PB_DISTANCE_SOURCES[distance]
}
