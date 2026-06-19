import type { Member } from '@/lib/types'
import { INSTRUCTOR_CALENDAR_COLORS } from '@/lib/instructor-colors'

export const MEMBER_SPORT_OPTIONS = [
  '야구',
  '축구',
  '육상',
  '농구',
  '테니스',
  '골프',
  '수영',
  '헬스',
] as const

export const SPORT_OTHER = '기타'
export const AUTO_INSTRUCTOR_ID = 'auto'

export function parseMemberSport(sport?: string | null): {
  preset: string
  other: string
} {
  if (!sport) return { preset: '', other: '' }
  if (sport === SPORT_OTHER) return { preset: SPORT_OTHER, other: '' }
  if ((MEMBER_SPORT_OPTIONS as readonly string[]).includes(sport)) {
    return { preset: sport, other: '' }
  }
  return { preset: SPORT_OTHER, other: sport }
}

export function resolveMemberSport(preset: string, other: string): string {
  if (!preset) return ''
  if (preset === SPORT_OTHER) return other.trim() || SPORT_OTHER
  return preset
}

export function normalizePrimaryInstructorId(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === AUTO_INSTRUCTOR_ID) return null
  return trimmed
}

/** 키·몸무게 값을 소수 1자리로 반올림 (저장·계산용) */
export function roundBodyMetric(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 10) / 10
}

/** 키·몸무게 표시·입력용 (소수 1자리, 예: 65.1) */
export function formatBodyMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return (Math.round(value * 10) / 10).toFixed(1)
}

/** 입력 필드 blur 시 소수 1자리로 정리 */
export function normalizeBodyMetricInput(value: string): string {
  if (!value.trim()) return ''
  const rounded = roundBodyMetric(value)
  return rounded != null ? formatBodyMetric(rounded) : value
}

/** 키(cm)·몸무게(kg)로 BMI 계산 (소수 1자리) */
export function calculateMemberBmi(
  heightCm?: number | null,
  weightKg?: number | null,
): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null
  return Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
}

/** DB bmi 없을 때 키·몸무게로 보완 */
export function resolveMemberBmi(member: {
  bmi?: number | null
  height_cm?: number | null
  weight_kg?: number | null
}): number | null {
  if (member.bmi != null && member.bmi > 0) return member.bmi
  return calculateMemberBmi(member.height_cm, member.weight_kg)
}

export function formatPrimaryInstructorName(
  instructor?: { name: string } | null,
): string {
  return instructor?.name ?? '자율배정'
}

const TWO_DIGIT_YEAR_PIVOT = 30

/** 2자리 연도 → 4자리 (00-30→2000년대, 31-99→1900년대) */
export function expandTwoDigitYear(twoDigitYear: number): number {
  if (twoDigitYear <= TWO_DIGIT_YEAR_PIVOT) return 2000 + twoDigitYear
  return 1900 + twoDigitYear
}

/** 4자리 연도 → 2자리 문자열 */
export function toTwoDigitYear(fullYear: number): string {
  return String(fullYear % 100).padStart(2, '0')
}

export function parseBirthDateParts(birthDate?: string | null): {
  year: string
  month: string
  day: string
} {
  if (!birthDate) return { year: '', month: '', day: '' }
  const [y, m, d] = birthDate.split('-')
  if (!y || !m || !d) return { year: '', month: '', day: '' }
  const fullYear = parseInt(y, 10)
  if (Number.isNaN(fullYear)) return { year: '', month: '', day: '' }
  return {
    year: toTwoDigitYear(fullYear),
    month: m.padStart(2, '0'),
    day: d.padStart(2, '0'),
  }
}

/** 년(2자리)·월·일 → YYYY-MM-DD (유효하지 않으면 빈 문자열) */
export function buildBirthDateFromParts(
  year: string,
  month: string,
  day: string,
): string {
  const yy = year.trim()
  const mm = month.trim()
  const dd = day.trim()
  if (!yy || !mm || !dd) return ''

  const twoDigitYear = parseInt(yy, 10)
  const monthNum = parseInt(mm, 10)
  const dayNum = parseInt(dd, 10)
  if (
    Number.isNaN(twoDigitYear) ||
    Number.isNaN(monthNum) ||
    Number.isNaN(dayNum) ||
    yy.length !== 2 ||
    mm.length !== 2 ||
    dd.length !== 2 ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return ''
  }

  const fullYear = expandTwoDigitYear(twoDigitYear)
  const iso = `${fullYear}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() + 1 !== monthNum ||
    date.getDate() !== dayNum
  ) {
    return ''
  }
  return iso
}

/** 표시용: YY/MM/DD */
export function formatBirthDateDisplay(birthDate?: string | null): string {
  const { year, month, day } = parseBirthDateParts(birthDate)
  if (!year || !month || !day) return '-'
  return `${year}/${month}/${day}`
}

/** yymmdd(또는 YY/MM/DD) → YYYY-MM-DD — 6자리·각 부분 2자리일 때만 변환 */
export function parseBirthDateSlash(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const slashParts = trimmed.split('/')
  if (slashParts.length === 3) {
    return buildBirthDateFromParts(slashParts[0], slashParts[1], slashParts[2])
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 6) return ''

  return buildBirthDateFromParts(
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 6),
  )
}

/** ISO 날짜 → yymmdd 입력값 */
export function toBirthDateSlashValue(birthDate?: string | null): string {
  const { year, month, day } = parseBirthDateParts(birthDate)
  if (!year && !month && !day) return ''
  if (!year || !month || !day) return ''
  return `${year}${month}${day}`
}

/** 입력 중 숫자만 받아 yymmdd (최대 6자리, 슬래시·0 자동 삽입 없음) */
export function formatBirthDateSlashInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}

/** 생년월일(YYYY-MM-DD)로 만 나이 계산 */
export function calculateAgeFromBirthDate(birthDate: string): number | null {
  if (!birthDate) return null

  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

/** 출생 연도 기준 세는 나이 (학년·나이 표기용, 예: 초6 → 13세) */
export function calculateKoreanAgeFromBirthDate(birthDate: string): number | null {
  if (!birthDate) return null

  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null

  const birthYear = birth.getFullYear()
  if (birthYear < 1900) return null

  const koreanAge = new Date().getFullYear() - birthYear + 1
  return koreanAge >= 1 ? koreanAge : null
}

/** 회원 나이 표시 (저장된 age 우선, 없으면 생년월일 계산) */
export function getMemberAge(member: Pick<Member, 'age' | 'birth_date'>): number | null {
  if (member.age != null && member.age >= 0) {
    return member.age
  }
  if (member.birth_date) {
    return calculateAgeFromBirthDate(member.birth_date)
  }
  return null
}

/** 회원 목록·상세 연락처 — 선수 없으면 보호자, 둘 다 있으면 함께 표기 */
export function formatMemberContactDisplay(
  member: Pick<Member, 'phone' | 'parent_phone'>,
): string {
  const phone = member.phone?.trim()
  const parentPhone = member.parent_phone?.trim()

  if (phone && parentPhone) {
    return `${phone} · 보호자 ${parentPhone}`
  }
  if (phone) return phone
  if (parentPhone) return `보호자 ${parentPhone}`
  return '-'
}

/** 목록용 짧은 연락처 — 보호자 번호는 툴팁으로만 표시 */
export function formatMemberContactDisplayCompact(
  member: Pick<Member, 'phone' | 'parent_phone'>,
): string {
  const phone = member.phone?.trim()
  const parentPhone = member.parent_phone?.trim()

  if (phone && parentPhone) return `${phone} (+보호자)`
  if (phone) return phone
  if (parentPhone) return `보호자 ${parentPhone}`
  return '-'
}

export function suggestAgeFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate?.trim()) return null
  return calculateAgeFromBirthDate(birthDate)
}

export function formatMemberAge(member: Pick<Member, 'age' | 'birth_date'>): string {
  if (member.birth_date) {
    const koreanAge = calculateKoreanAgeFromBirthDate(member.birth_date)
    const manAge = calculateAgeFromBirthDate(member.birth_date)
    if (koreanAge != null && manAge != null) {
      return `${koreanAge}세 (만${manAge}세)`
    }
  }

  const age = getMemberAge(member)
  return age != null ? `${age}세` : '-'
}

/** 캘린더용 나이+종목 (예: 39축구) */
export function formatMemberCalendarMeta(
  member: Pick<Member, 'age' | 'birth_date' | 'sport'> | null | undefined,
): string {
  if (!member) return ''
  const age = getMemberAge(member)
  const sport = member.sport?.trim()
  if (age != null && sport) return `${age}${sport}`
  if (age != null) return `${age}`
  if (sport) return sport
  return ''
}

/** 캘린더 블록 — 이름 / 나이종목 분리 표시 */
export function getMemberCalendarDisplayParts(
  member: Pick<Member, 'name' | 'age' | 'birth_date' | 'sport'> | null | undefined,
): { name: string; meta: string } {
  if (!member?.name) return { name: '회원', meta: '' }
  return {
    name: member.name,
    meta: formatMemberCalendarMeta(member),
  }
}

/** @deprecated use getMemberCalendarDisplayParts */
export function getMemberCalendarCrowdedParts(
  member: Pick<Member, 'name' | 'age' | 'birth_date' | 'sport'> | null | undefined,
): string[] {
  const { name, meta } = getMemberCalendarDisplayParts(member)
  return meta ? [name, meta] : [name]
}

/** 캘린더 라벨에서 회원 이름만 추출 (예: 조강윤(초6골프) → 조강윤) */
export function extractMemberNameFromCalendarLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ''
  const paren = trimmed.indexOf('(')
  if (paren > 0) return trimmed.slice(0, paren).trim()
  return trimmed
}

/** 캘린더 등에서 이름/나이종목 표시 (예: 이교직(39축구)) */
export function formatMemberCalendarLabel(
  member: Pick<Member, 'name' | 'age' | 'birth_date' | 'sport'> | null | undefined,
): string {
  if (!member?.name) return '회원'
  const meta = formatMemberCalendarMeta(member)
  return meta ? `${member.name}(${meta})` : member.name
}

/** 종목별 회원 특성 색상 (캘린더 검색 하이라이트 등) */
export const MEMBER_SPORT_COLORS: Record<string, string> = {
  야구: '#38BDF8',
  축구: '#10B981',
  육상: '#FB923C',
  농구: '#F59E0B',
  테니스: '#FB7185',
  골프: '#818CF8',
  수영: '#A78BFA',
  헬스: '#22D3EE',
  기타: '#84CC16',
}

export function getMemberCharacteristicColor(
  member: Pick<Member, 'id' | 'sport'>,
): string {
  const sport = member.sport?.trim()
  if (sport && MEMBER_SPORT_COLORS[sport]) {
    return MEMBER_SPORT_COLORS[sport]
  }

  let hash = 0
  for (let i = 0; i < member.id.length; i++) {
    hash = (hash + member.id.charCodeAt(i) * (i + 1)) % INSTRUCTOR_CALENDAR_COLORS.length
  }
  return INSTRUCTOR_CALENDAR_COLORS[hash]?.hex ?? INSTRUCTOR_CALENDAR_COLORS[0].hex
}

export function formatMemberAgeFromBirthDate(birthDate?: string): string {
  if (!birthDate) return '-'
  const koreanAge = calculateKoreanAgeFromBirthDate(birthDate)
  const manAge = calculateAgeFromBirthDate(birthDate)
  if (koreanAge != null && manAge != null) {
    return `${koreanAge}세 (만${manAge}세)`
  }
  return '-'
}

export function resolveMemberAgeAndBirthDate(
  birthDate?: string | null,
  manualAge?: number | null,
): {
  birth_date: string | null
  age: number | null
} {
  const birth_date = birthDate?.trim() || null
  const parsedManual =
    manualAge != null && manualAge >= 0 && manualAge <= 120
      ? Math.round(manualAge)
      : null
  const age =
    parsedManual != null
      ? parsedManual
      : birth_date
        ? calculateAgeFromBirthDate(birth_date)
        : null
  return { birth_date, age }
}
