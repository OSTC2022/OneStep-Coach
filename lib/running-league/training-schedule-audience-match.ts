import type { TrainingScheduleAudience } from '@/lib/training-schedule-audience'
import { isYouthAthleticsClassSport } from '@/lib/youth-athletics-class'

function isCoachOrInstructorSport(sport: string | null | undefined): boolean {
  const value = (sport ?? '').toLowerCase()
  return (
    value.includes('강사') ||
    value.includes('instructor') ||
    value.includes('코치') ||
    value.includes('coach')
  )
}

/** 스케줄 반(성인/육상)에 맞는 회원만 명단·참여 허용 */
export function memberMatchesTrainingScheduleAudience(
  sport: string | null | undefined,
  audience: TrainingScheduleAudience,
): boolean {
  if (isCoachOrInstructorSport(sport)) return true
  if (audience === 'youth_athletics') {
    return isYouthAthleticsClassSport(sport)
  }
  return !isYouthAthleticsClassSport(sport)
}
