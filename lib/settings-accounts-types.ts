import type { AppRole } from '@/lib/roles'
import type { ProfileApprovalStatus, ProfileRole } from '@/lib/types'

/** 설정 화면에서 부여 가능한 권한 */
export type SettingsAssignableRole =
  | 'member'
  | 'adult_member'
  | 'instructor'
  | 'guardian'
  | 'admin'

/** 회원 프로필 연결이 필요한 권한 */
export function requiresMemberLinkRole(role: SettingsAssignableRole): boolean {
  return role === 'member' || role === 'adult_member'
}

export type RegisteredAccount = {
  id: string
  email: string | null
  full_name: string | null
  profileRole: ProfileRole
  appRole: AppRole
  roleLabel: string
  approvalStatus: ProfileApprovalStatus
  approvalLabel: string
  /** 로그인용 실제 주소(내부 이메일 포함). 표시용 email과 다를 수 있음 */
  loginEmail: string | null
  created_at: string
  linkedInstructorName: string | null
  linkedMemberId: string | null
  linkedMemberName: string | null
  /** 연결 회원 종목 — 성인회원(육상/일반) 구분 */
  linkedMemberSport: string | null
  /** 관리자·보호 계정 — 설정에서 권한 변경 불가 */
  isProtected: boolean
  /** 러닝 포털 관리(월별 출석·룰렛) — 강사용 */
  adultRunningPortalManage: boolean
}

/** 설정 > 강사 탭 — 강사 프로필 + 로그인 연결 상태 */
export type InstructorRoleRow = {
  id: string
  name: string
  phone: string | null
  is_active: boolean
  user_id: string | null
  accountEmail: string | null
  accountName: string | null
  accountRoleLabel: string | null
  hasCoachAccess: boolean
}
