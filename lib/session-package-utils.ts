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

function stripMonthlyPlanNoteParts(currentNote: string) {
  return currentNote
    .split('·')
    .map((part) => part.trim())
    .filter((part) => part && !/^월정액\s*\d+개월$/.test(part))
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

export function parseMonthlyPlanMonthsFromNote(note?: string | null): number | null {
  if (!note) return null
  const match = note.match(/월정액\s*(\d+)개월/)
  return match ? Number(match[1]) : null
}

/** 월정액 수업권 — 회차와 무관하게 수업 등록 가능 */
export function isMonthlyPlanPackage(note?: string | null): boolean {
  return parseMonthlyPlanMonthsFromNote(note) != null
}

/** @deprecated isMonthlyPlanPackage 와 동일 */
export function isMonthlyUnlimitedSessions(note?: string | null): boolean {
  return isMonthlyPlanPackage(note)
}

/** 횟수 제한 없음 표시 (UI용) */
export const UNLIMITED_SESSIONS_DISPLAY = '-'

export function formatMonthlyPlanSuffix(note?: string | null): string {
  const months = parseMonthlyPlanMonthsFromNote(note)
  return months != null ? `(${months}개월)` : ''
}

export function formatPackagePlanLabel(
  totalSessions: number,
  note?: string | null,
): string {
  const months = parseMonthlyPlanMonthsFromNote(note)
  if (months != null) {
    return `월정액 ${months}개월`
  }
  return `${totalSessions}회권`
}

export function formatPackageSessionsDisplay(
  totalSessions: number,
  note?: string | null,
): string {
  const months = parseMonthlyPlanMonthsFromNote(note)
  if (months != null) {
    return `${UNLIMITED_SESSIONS_DISPLAY} (${months}개월)`
  }
  return `${totalSessions}회`
}

export function formatPackageRemainingDisplay(
  remainingSessions: number,
  note?: string | null,
): string {
  if (isMonthlyPlanPackage(note)) {
    return UNLIMITED_SESSIONS_DISPLAY
  }
  return `${remainingSessions}회`
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
