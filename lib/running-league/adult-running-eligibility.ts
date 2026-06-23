import type { ProfileRole } from '@/lib/types'

export type AdultRunningMemberRecord = {
  id: string
  auth_user_id?: string | null
  user_id?: string | null
  sport?: string | null
  grade?: string | null
}

/** lib/actions/members.ts listAdultRunningMembersForPicker 와 동일 기준 + 육상 */
export function isAdultRunningSport(sport: string | null | undefined): boolean {
  const value = (sport ?? '').toLowerCase().trim()
  if (!value) return false
  return (
    value.includes('러닝') ||
    value.includes('running') ||
    value.includes('성인') ||
    value.includes('마라톤') ||
    value.includes('10k') ||
    value.includes('5k') ||
    value.includes('육상')
  )
}

/** 선수반·학생부 등 학생 회원 학년 표기 */
export function isStudentAthleteGrade(grade: string | null | undefined): boolean {
  const value = (grade ?? '').trim()
  if (!value) return false
  return /초등|중등|고등|초\d|중\d|고\d|elementary|middle|high/i.test(value)
}

/**
 * 성인 러닝 리그 랭킹 대상 여부
 * - 1순위: 연결 계정 profiles.role === adult_member
 * - 계정이 member/guardian(선수·학부모)이면 제외
 * - 계정 없음: 학생 학년이 아니고 sport가 성인 러닝반인 경우만 포함
 */
export function isAdultRunningLeagueMember(
  member: AdultRunningMemberRecord,
  profileRoleByUserId: ReadonlyMap<string, ProfileRole>,
): boolean {
  const linkedUserId = member.auth_user_id ?? member.user_id
  if (linkedUserId) {
    const role = profileRoleByUserId.get(linkedUserId)
    if (role === 'adult_member') return true
    if (role === 'member' || role === 'guardian') return false
    if (role === 'admin' || role === 'coach') return false
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
