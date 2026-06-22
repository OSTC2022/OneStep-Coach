import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export const PACKAGE_PRESETS = [
  { sessions: 8, label: '8회' },
  { sessions: 10, label: '10회' },
  { sessions: 20, label: '20회' },
  { sessions: 30, label: '30회' },
  { sessions: 50, label: '50회' },
] as const

/** 월 정액 — 횟수 제한 없음, 기간만 적용 */
export const MONTHLY_PLAN_PRESETS = [
  { months: 1, label: '1개월' },
  { months: 3, label: '3개월' },
  { months: 6, label: '6개월' },
] as const

export const MONTHLY_RECURRING_PLAN_LABEL = '매월'
export const MONTHLY_RECURRING_NOTE = '월정액 매월'

export type MonthlyPlanMonths = (typeof MONTHLY_PLAN_PRESETS)[number]['months']

/** 8회 카드 기준 88만원 → 회당 11만원 (부가세 10% 포함) */
const CARD_PRICE_PER_SESSION = 110_000
const VAT_RATE = 0.1

export function isDiscountedPayment(paymentMethod: string): boolean {
  return (
    paymentMethod === 'cash' ||
    paymentMethod === '현금' ||
    paymentMethod === 'transfer' ||
    paymentMethod === '계좌이체'
  )
}

/** 부가세 포함 금액 → 현금·계좌이체용 (부가세 제외) */
export function excludeVat(priceWithVat: number): number {
  return Math.round(priceWithVat / (1 + VAT_RATE))
}

/** 부가세 제외 금액 → 카드용 (부가세 포함) */
export function includeVat(priceWithoutVat: number): number {
  return Math.round(priceWithoutVat * (1 + VAT_RATE))
}

/** 결제 방식 변경 시 금액을 부가세 기준으로 맞춤 */
export function adjustPriceForPaymentMethod(
  price: number,
  fromMethod: string,
  toMethod: string,
): number {
  if (price <= 0 || isDiscountedPayment(fromMethod) === isDiscountedPayment(toMethod)) {
    return price
  }
  return isDiscountedPayment(toMethod) ? excludeVat(price) : includeVat(price)
}

/** 회차·결제 방식별 기본 금액 (8회 카드 88만원 기준 비례) */
export function getPresetPrice(
  sessions: number,
  paymentMethod: string,
): number | null {
  if (!Number.isFinite(sessions) || sessions <= 0) return null
  const cardTotal = Math.round(sessions * CARD_PRICE_PER_SESSION)
  return isDiscountedPayment(paymentMethod) ? excludeVat(cardTotal) : cardTotal
}

export function calculatePackageExpiryDate(sessions: number): string {
  const months =
    sessions <= 8 ? 3 : sessions <= 10 ? 3 : sessions <= 20 ? 4 : sessions <= 30 ? 5 : 6
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}

export function getMonthlyPlanPreset(months: number) {
  return MONTHLY_PLAN_PRESETS.find((preset) => preset.months === months) ?? null
}

export function formatMonthlyPlanNote(months: number) {
  return `월정액 ${months}개월`
}

export function mergeMonthlyPlanNote(currentNote: string, months: number) {
  const label = formatMonthlyPlanNote(months)
  const parts = stripMonthlyPlanNoteParts(currentNote)
  return [...parts, label].join(' · ')
}

export function clearMonthlyPlanNote(currentNote: string) {
  return stripMonthlyPlanNoteParts(currentNote).join(' · ')
}

export function formatMonthlyRecurringPlanNote() {
  return MONTHLY_RECURRING_NOTE
}

export function mergeMonthlyRecurringPlanNote(currentNote: string) {
  const label = formatMonthlyRecurringPlanNote()
  const parts = stripMonthlyPlanNoteParts(currentNote)
  return [...parts, label].join(' · ')
}

export function isMonthlyRecurringPlan(note?: string | null): boolean {
  if (!note) return false
  return note
    .split('·')
    .map((part) => part.trim())
    .includes(MONTHLY_RECURRING_NOTE)
}

function stripMonthlyPlanNoteParts(currentNote: string) {
  return currentNote
    .split('·')
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/^월정액\s*\d+개월$/.test(part) &&
        part !== MONTHLY_RECURRING_NOTE,
    )
}

export function calculateMonthlyPlanExpiryDate(
  paidAt: string,
  months: number,
): string {
  const base = paidAt || new Date().toISOString().split('T')[0]
  return addMonthsToDate(base, months)
}

export function addMonthsToDate(dateStr: string, months: number): string {
  const date = new Date(`${dateStr.split('T')[0]}T12:00:00`)
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}

/** 해당 월 1일 (YYYY-MM-01) */
export function toMonthStartDate(dateStr?: string | null): string {
  const base = dateStr?.split('T')[0] || new Date().toISOString().split('T')[0]
  const [year, month] = base.split('-')
  if (!year || !month) return base
  return `${year}-${month}-01`
}

/** 매월 정액 기본 결제일 — 당월 1일 */
export function getDefaultMonthlyRecurringPaidAt(): string {
  return toMonthStartDate()
}

/** 매월 정액 만료일 — 결제일 기준 1개월 */
export function calculateMonthlyRecurringExpiryDate(paidAt: string): string {
  return calculateMonthlyPlanExpiryDate(paidAt, 1)
}

export function parseMonthlyPlanMonthsFromNote(note?: string | null): number | null {
  if (!note) return null
  const match = note.match(/월정액\s*(\d+)개월/)
  return match ? Number(match[1]) : null
}

/** 월정액 수업권 — 회차와 무관하게 수업 등록 가능 */
export function isMonthlyPlanPackage(note?: string | null): boolean {
  return (
    parseMonthlyPlanMonthsFromNote(note) != null || isMonthlyRecurringPlan(note)
  )
}

/** @deprecated isMonthlyPlanPackage 와 동일 */
export function isMonthlyUnlimitedSessions(note?: string | null): boolean {
  return isMonthlyPlanPackage(note)
}

/** 횟수 제한 없음 표시 (UI용) */
export const UNLIMITED_SESSIONS_DISPLAY = '-'

export function formatMonthlyPlanSuffix(note?: string | null): string {
  if (isMonthlyRecurringPlan(note)) return `(${MONTHLY_RECURRING_PLAN_LABEL})`
  const months = parseMonthlyPlanMonthsFromNote(note)
  return months != null ? `(${months}개월)` : ''
}

export function formatPackagePlanLabel(
  totalSessions: number,
  note?: string | null,
  options?: {
    duplicateCount?: number
    cumulativeTotalSessions?: number
  },
): string {
  if (isMonthlyRecurringPlan(note)) {
    return MONTHLY_RECURRING_NOTE
  }
  const months = parseMonthlyPlanMonthsFromNote(note)
  if (months != null) {
    return `월정액 ${months}개월`
  }
  const base = `${totalSessions}회`
  if (
    options?.duplicateCount != null &&
    options.duplicateCount > 1 &&
    options.cumulativeTotalSessions != null
  ) {
    return `${base} · 누적 ${options.cumulativeTotalSessions}회`
  }
  return base
}

/** 회원권 만료 여부 (기간·비활성·잔여 소진) */
export function isSessionPackageExpired(pkg: {
  is_active: boolean
  remaining_sessions: number
  note?: string | null
  expires_at?: string | null
}): boolean {
  if (!pkg.is_active) return true
  if (pkg.expires_at) {
    const today = new Date().toISOString().split('T')[0]
    if (pkg.expires_at.split('T')[0] < today) return true
  }
  if (!isMonthlyPlanPackage(pkg.note) && pkg.remaining_sessions <= 0) return true
  return false
}

/** 회차권 잔여 — 잔여 / 최근 구매 회차 / 누적 등록 회차 (plain text) */
export function formatGroupedPackageUsageDisplay(
  remainingSessions: number,
  latestPurchaseTotalSessions: number,
  cumulativeTotalSessions: number,
  note?: string | null,
  expiresAt?: string | null,
): string {
  if (isMonthlyPlanPackage(note)) {
    return formatPackageRemainingDisplay(remainingSessions, note, expiresAt)
  }
  return `${remainingSessions}회 / ${latestPurchaseTotalSessions}회 / ${cumulativeTotalSessions}회`
}

export function formatPackageSessionsDisplay(
  totalSessions: number,
  note?: string | null,
): string {
  if (isMonthlyRecurringPlan(note)) {
    return `${UNLIMITED_SESSIONS_DISPLAY} (${MONTHLY_RECURRING_PLAN_LABEL})`
  }
  const months = parseMonthlyPlanMonthsFromNote(note)
  if (months != null) {
    return `${UNLIMITED_SESSIONS_DISPLAY} (${months}개월)`
  }
  return `${totalSessions}회`
}

export function formatPackageRemainingDisplay(
  remainingSessions: number,
  note?: string | null,
  expiresAt?: string | null,
  paidAt?: string | null,
): string {
  if (isMonthlyPlanPackage(note)) {
    return formatMonthlyPlanRemainingPeriod(
      resolveMonthlyPackageExpiryDate(note, expiresAt, paidAt),
    )
  }
  return `${remainingSessions}회`
}

function resolveMonthlyPackageExpiryDate(
  note?: string | null,
  expiresAt?: string | null,
  paidAt?: string | null,
): string | null {
  if (expiresAt) return expiresAt.split('T')[0]
  if (!paidAt) return null
  const months = parseMonthlyPlanMonthsFromNote(note)
  if (months != null) return calculateMonthlyPlanExpiryDate(paidAt, months)
  if (isMonthlyRecurringPlan(note)) return calculateMonthlyRecurringExpiryDate(paidAt)
  return null
}

/** 잔여 0 미만일 때 초과 횟수 (예: -2 → 2) */
export function getSessionPackageOverageCount(remainingSessions: number): number {
  return remainingSessions < 0 ? Math.abs(remainingSessions) : 0
}

export function isSessionPackageOverage(
  remainingSessions: number,
  note?: string | null,
): boolean {
  return !isMonthlyPlanPackage(note) && remainingSessions < 0
}

export function formatSessionOverageAlert(
  overage: number,
  options?: { noPackage?: boolean },
): string {
  if (options?.noPackage) {
    return `등록된 수업권이 없습니다. 수업권 ${overage}회 초과하였습니다.`
  }
  return `수업권 ${overage}회 초과하였습니다.`
}

export function getPackageRemainingColorClass(
  remainingSessions: number,
  note?: string | null,
  isActive = true,
): string {
  if (isMonthlyPlanPackage(note)) {
    return isActive ? 'text-primary' : 'text-destructive'
  }
  if (remainingSessions < 0) return 'text-destructive font-bold'
  if (!isActive || remainingSessions <= 0) return 'text-destructive'
  if (remainingSessions <= 3) return 'text-warning'
  return 'text-primary'
}

export function isPackageUsableForLesson(pkg: {
  is_active: boolean
  remaining_sessions: number
  note?: string | null
  expires_at?: string | null
}): boolean {
  if (!pkg.is_active) return false
  if (pkg.expires_at) {
    const today = new Date().toISOString().split('T')[0]
    if (pkg.expires_at.split('T')[0] < today) return false
  }
  if (isMonthlyPlanPackage(pkg.note)) return true
  return pkg.remaining_sessions > 0
}

export function shouldDeductSessionOnLesson(note?: string | null): boolean {
  return !isMonthlyPlanPackage(note)
}

export function formatPackageTallyTotalDisplay(
  packages: Array<{ total_sessions: number; note?: string | null }>,
): string {
  const regular = packages.filter((pkg) => !isMonthlyPlanPackage(pkg.note))
  if (regular.length === 0 && packages.some((pkg) => isMonthlyPlanPackage(pkg.note))) {
    return UNLIMITED_SESSIONS_DISPLAY
  }
  const total = regular.reduce((sum, pkg) => sum + pkg.total_sessions, 0)
  return String(total)
}

export function formatPackageTallyRemainingDisplay(
  packages: Array<{ remaining_sessions: number; note?: string | null }>,
): string {
  const regular = packages.filter((pkg) => !isMonthlyPlanPackage(pkg.note))
  if (regular.length === 0 && packages.some((pkg) => isMonthlyPlanPackage(pkg.note))) {
    return UNLIMITED_SESSIONS_DISPLAY
  }
  const remaining = regular.reduce((sum, pkg) => sum + pkg.remaining_sessions, 0)
  return String(remaining)
}

export function getDaysUntilExpiry(
  expiresAt: string | null | undefined,
  today = new Date(),
): number | null {
  if (!expiresAt) return null
  const expiryDate = expiresAt.split('T')[0]
  const todayDate = today.toISOString().split('T')[0]
  return differenceInCalendarDays(parseISO(expiryDate), parseISO(todayDate))
}

export function formatMonthlyPlanRemainingPeriod(
  expiresAt: string | null | undefined,
): string {
  const days = getDaysUntilExpiry(expiresAt)
  if (days == null) return '기간 미지정'
  if (days < 0) return '만료됨'
  if (days === 0) return '오늘 만료'
  if (days === 1) return '1일 남음'
  return `${days}일 남음`
}

export function formatPackageExpiryDateLabel(
  expiresAt: string | null | undefined,
): string {
  if (!expiresAt) return '미지정'
  return format(parseISO(expiresAt.split('T')[0]), 'yyyy.M.d (EEE)', { locale: ko })
}
