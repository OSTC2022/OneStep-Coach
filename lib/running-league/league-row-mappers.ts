import { normalizeMemberGender } from '@/lib/running-league/ranking-gender'
import { computeTotalScore } from '@/lib/running-league/scoring'
import type {
  RunningLeagueDistanceEvent,
  RunningLeagueGoalType,
  RunningLeagueMileageLog,
  RunningLeagueParticipant,
  RunningLeagueRecord,
  RunningLeagueRecordPhase,
} from '@/lib/types'

/** 포털 랭킹 — members 조인에 성인 러닝 필터용 auth·grade 포함 */
export const PORTAL_PARTICIPANT_SELECT =
  'id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, attendance_score, goal_score, record_score, mileage_score, recovery_score, mileage_km, total_score, record_baseline, record_current, notes, coach_comment, created_at, updated_at, member:members(id, name, sport, phone, gender, ranking_status_message, auth_user_id, user_id, grade)'

export const PARTICIPANT_SELECT =
  'id, league_id, member_id, goal_level, goal_type, personal_goal, goal_achievement_rate, attendance_score, goal_score, record_score, mileage_score, recovery_score, mileage_km, total_score, record_baseline, record_current, notes, coach_comment, created_at, updated_at, member:members(id, name, sport, phone, gender, ranking_status_message)'

export function mapLeagueParticipantRow(row: Record<string, unknown>): RunningLeagueParticipant {
  const memberRaw = row.member
  const member =
    memberRaw && typeof memberRaw === 'object' && !Array.isArray(memberRaw)
      ? {
          id: String((memberRaw as Record<string, unknown>).id),
          name: String((memberRaw as Record<string, unknown>).name ?? ''),
          sport: ((memberRaw as Record<string, unknown>).sport as string | null) ?? null,
          phone: ((memberRaw as Record<string, unknown>).phone as string | null) ?? null,
          gender: normalizeMemberGender((memberRaw as Record<string, unknown>).gender),
          ranking_status_message:
            ((memberRaw as Record<string, unknown>).ranking_status_message as string | null) ??
            null,
        }
      : null

  const attendance_score = Number(row.attendance_score ?? 0)
  const goal_score = Number(row.goal_score ?? 0)
  const record_score = Number(row.record_score ?? 0)
  const mileage_score = Number(row.mileage_score ?? 0)
  const recovery_score = Number(row.recovery_score ?? 0)

  return {
    id: String(row.id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    goal_level: (row.goal_level as string | null) ?? null,
    goal_type: (row.goal_type as RunningLeagueGoalType | null) ?? null,
    personal_goal: (row.personal_goal as string | null) ?? null,
    goal_achievement_rate:
      row.goal_achievement_rate != null ? Number(row.goal_achievement_rate) : null,
    attendance_score,
    goal_score,
    record_score,
    mileage_score,
    recovery_score,
    mileage_km: Number(row.mileage_km ?? 0),
    total_score: computeTotalScore({
      attendance_score,
      goal_score,
      record_score,
      mileage_score,
      recovery_score,
    }),
    record_baseline: (row.record_baseline as string | null) ?? null,
    record_current: (row.record_current as string | null) ?? null,
    notes: String(row.notes ?? ''),
    coach_comment: String(row.coach_comment ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    member,
  }
}

export function mapLeagueMileageLogRow(row: Record<string, unknown>): RunningLeagueMileageLog {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    distance_km: Number(row.distance_km ?? 0),
    logged_at: String(row.logged_at),
    source: row.source as RunningLeagueMileageLog['source'],
    notes: String(row.notes ?? ''),
    duration: (row.duration as string | null) ?? null,
    pace: (row.pace as string | null) ?? null,
    heart_rate: row.heart_rate != null ? Number(row.heart_rate) : null,
    calories: row.calories != null ? Number(row.calories) : null,
    activity_time: (row.activity_time as string | null) ?? null,
    source_app: (row.source_app as string | null) ?? null,
    screenshot_url: (row.screenshot_url as string | null) ?? null,
    image_hash: (row.image_hash as string | null) ?? null,
    extraction_confidence:
      row.extraction_confidence != null ? Number(row.extraction_confidence) : null,
    extraction_raw_json: (row.extraction_raw_json as Record<string, unknown> | null) ?? null,
    verification_status: (row.verification_status as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function mapLeagueRecordRow(row: Record<string, unknown>): RunningLeagueRecord {
  return {
    id: String(row.id),
    participant_id: String(row.participant_id),
    league_id: String(row.league_id),
    member_id: String(row.member_id),
    distance_event: row.distance_event as RunningLeagueDistanceEvent,
    record_phase: row.record_phase as RunningLeagueRecordPhase,
    time_text: (row.time_text as string | null) ?? null,
    time_seconds: row.time_seconds != null ? Number(row.time_seconds) : null,
    measured_at: String(row.measured_at),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}
