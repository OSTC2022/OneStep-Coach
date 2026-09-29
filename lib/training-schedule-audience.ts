export const TRAINING_SCHEDULE_AUDIENCES = [
  'adult_running',
  'youth_athletics',
] as const

export type TrainingScheduleAudience = (typeof TRAINING_SCHEDULE_AUDIENCES)[number]

export const DEFAULT_TRAINING_SCHEDULE_AUDIENCE: TrainingScheduleAudience =
  'adult_running'

export type TrainingScheduleTableConfig = {
  audience: TrainingScheduleAudience
  daysTable: string
  signupsTable: string
  snapshotsTable: string
  locationsTable: string
  dayIdPrefix: string
  missingSql: string
  settingsPath: string
}

const ADULT_CONFIG: TrainingScheduleTableConfig = {
  audience: 'adult_running',
  daysTable: 'center_running_training_schedule_days',
  signupsTable: 'center_running_training_schedule_signups',
  snapshotsTable: 'center_running_training_schedule_week_snapshots',
  locationsTable: 'center_running_training_schedule_location_presets',
  dayIdPrefix: 'center-weekday',
  missingSql: 'add-center-running-training-schedule.sql',
  settingsPath: '/dashboard/settings/running-schedule',
}

const YOUTH_CONFIG: TrainingScheduleTableConfig = {
  audience: 'youth_athletics',
  daysTable: 'center_youth_athletics_training_schedule_days',
  signupsTable: 'center_youth_athletics_training_schedule_signups',
  snapshotsTable: 'center_youth_athletics_training_schedule_week_snapshots',
  locationsTable: 'center_youth_athletics_training_schedule_location_presets',
  dayIdPrefix: 'youth-weekday',
  missingSql: 'add-youth-athletics-training-schedule.sql',
  settingsPath: '/dashboard/settings/youth-athletics-schedule',
}

export function trainingScheduleConfig(
  audience: TrainingScheduleAudience | null | undefined = DEFAULT_TRAINING_SCHEDULE_AUDIENCE,
): TrainingScheduleTableConfig {
  return audience === 'youth_athletics' ? YOUTH_CONFIG : ADULT_CONFIG
}

export function trainingScheduleDayId(
  audience: TrainingScheduleAudience,
  weekday: number,
  scheduleDate?: string | null,
): string {
  const prefix = trainingScheduleConfig(audience).dayIdPrefix
  const date = scheduleDate?.slice(0, 10)
  if (date) return `${prefix}-${weekday}@${date}`
  return `${prefix}-${weekday}`
}

export function parseTrainingScheduleDayId(id: string): {
  audience: TrainingScheduleAudience
  weekday: number
  scheduleDate: string | null
} | null {
  const dated = /^(center-weekday|youth-weekday)-(\d)@(\d{4}-\d{2}-\d{2})$/.exec(id)
  if (dated) {
    const weekday = Number(dated[2])
    if (weekday < 0 || weekday > 6) return null
    return {
      audience: dated[1] === 'youth-weekday' ? 'youth_athletics' : 'adult_running',
      weekday,
      scheduleDate: dated[3],
    }
  }
  const plain = /^(center-weekday|youth-weekday)-(\d)$/.exec(id)
  if (!plain) return null
  const weekday = Number(plain[2])
  if (weekday < 0 || weekday > 6) return null
  return {
    audience: plain[1] === 'youth-weekday' ? 'youth_athletics' : 'adult_running',
    weekday,
    scheduleDate: null,
  }
}
