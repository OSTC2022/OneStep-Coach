import {
  adultProgramFromRoleSelect,
  isAdultGeneralSport,
  resolveAdultMemberProgram,
  roleSelectFromAdultProgram,
  type AdultMemberProgram,
} from '@/lib/adult-member-programs'
import type { RegisteredAccount } from '@/lib/settings-accounts-types'
import type { SettingsAssignableRole } from '@/lib/settings-accounts-types'
import { isYouthAthleticsClassSport } from '@/lib/youth-athletics-class'

export type SettingsRoleSelectValue =
  | SettingsAssignableRole
  | 'member_youth_athletics'
  | 'adult_member_athletics'
  | 'adult_member_general'
  | 'on_hold'

export const SETTINGS_ROLE_SELECT_OPTIONS: {
  value: SettingsRoleSelectValue
  label: string
}[] = [
  { value: 'member', label: '회원' },
  { value: 'member_youth_athletics', label: '회원(육상선수반)' },
  { value: 'adult_member_athletics', label: '성인회원(육상)' },
  { value: 'adult_member_general', label: '성인회원(일반)' },
  { value: 'guardian', label: '학부모' },
  { value: 'admin', label: '관리자' },
  { value: 'instructor', label: '강사' },
]

export const SETTINGS_ROLE_SELECT_OPTIONS_WITH_HOLD: {
  value: SettingsRoleSelectValue
  label: string
}[] = [...SETTINGS_ROLE_SELECT_OPTIONS, { value: 'on_hold', label: '보류' }]

export type ParsedSettingsRoleSelect = {
  role: SettingsAssignableRole | null
  adultProgram: AdultMemberProgram | null
  memberProgram: 'youth_athletics' | null
  onHold: boolean
}

export function parseSettingsRoleSelect(
  value: SettingsRoleSelectValue,
): ParsedSettingsRoleSelect {
  if (value === 'on_hold') {
    return { role: null, adultProgram: null, memberProgram: null, onHold: true }
  }
  if (value === 'member_youth_athletics') {
    return {
      role: 'member',
      adultProgram: null,
      memberProgram: 'youth_athletics',
      onHold: false,
    }
  }
  const adultProgram = adultProgramFromRoleSelect(value)
  if (adultProgram) {
    return { role: 'adult_member', adultProgram, memberProgram: null, onHold: false }
  }
  return {
    role: value as SettingsAssignableRole,
    adultProgram: null,
    memberProgram: null,
    onHold: false,
  }
}

export function accountToSettingsRoleSelect(
  account: Pick<RegisteredAccount, 'isProtected' | 'appRole' | 'linkedMemberSport'>,
): SettingsRoleSelectValue | null {
  if (account.isProtected) return null
  if (account.appRole === 'instructor') return 'instructor'
  if (account.appRole === 'guardian') return 'guardian'
  if (account.appRole === 'admin') return 'admin'
  if (account.appRole === 'adult_member') {
    return roleSelectFromAdultProgram(
      resolveAdultMemberProgram(account.linkedMemberSport),
    )
  }
  if (isYouthAthleticsClassSport(account.linkedMemberSport)) {
    return 'member_youth_athletics'
  }
  return 'member'
}

export function settingsRoleHint(value: SettingsRoleSelectValue): string {
  if (value === 'on_hold') {
    return '보류로 보내면 가입 계정 목록에서 빠지고, 로그인 시 「회원가입 대기중」으로 안내됩니다.'
  }
  return '회원: 일반 마이페이지 · 회원(육상선수반): 내 러닝 포털(육상) · 성인회원(육상): 러닝 포털 · 성인회원(일반): 체중 관리 포털 · 학부모: 보호자 · 강사: 캘린더·출석'
}

export function isAdultGeneralLinkedSport(sport?: string | null): boolean {
  return isAdultGeneralSport(sport)
}
