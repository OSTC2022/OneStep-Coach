import type { ProfileRole } from '@/lib/types'
import {
  isAdultGeneralSport,
  isAdultRunningSport,
} from '@/lib/adult-member-programs'

export type AdultRunningMemberRecord = {
  id: string
  auth_user_id?: string | null
  user_id?: string | null
  sport?: string | null
  grade?: string | null
}

export { isAdultRunningSport }

/** 선수반·학생부 등 학생 회원 학년 표기 */
export function isStudentAthleteGrade(grade: string | null | undefined): boolean {
  const value = (grade ?? '').trim()
  if (!value) return false
  return /초등|중등|고등|초\d|중\d|고\d|elementary|middle|high/i.test(value)
}

/**
 * 성인 러닝 리그 랭킹 대상 여부
 * - adult_member 이어도 성인회원(일반)은 제외
 * - 계정이 member/guardian(선수·학부모)이면 제외
 * - 계정 없음: 학생 학년이 아니고 sport가 성인 러닝반인 경우만 포함
 */
export function isAdultRunningLeagueMember(
  member: AdultRunningMemberRecord,
  profileRoleByUserId: ReadonlyMap<string, ProfileRole>,
): boolean {
  if (isAdultGeneralSport(member.sport)) return false

  const linkedUserId = member.auth_user_id ?? member.user_id
  if (linkedUserId) {
    const role = profileRoleByUserId.get(linkedUserId)
    if (role === 'adult_member') {
      // sport 미지정 성인회원은 기존처럼 러닝으로 취급
      return !isAdultGeneralSport(member.sport)
    }
    if (role === 'member' || role === 'guardian') return false
    if (role === 'admin' || role === 'coach') {
      return isAdultRunningSport(member.sport)
    }
  }

  if (isStudentAthleteGrade(member.grade)) return false
  return isAdultRunningSport(member.sport)
}

export function filterParticipantsForAdultRunningLeague<
  T extends { member_id: string },
>(participants: T[], allowedMemberIds: ReadonlySet<string>): T[] {
  return participants.filter((row) => allowedMemberIds.has(row.member_id))
}

export function filterRecordsForAdultParticipants<
  T extends { participant_id: string },
>(records: T[], allowedParticipantIds: ReadonlySet<string>): T[] {
  return records.filter((row) => allowedParticipantIds.has(row.participant_id))
}
