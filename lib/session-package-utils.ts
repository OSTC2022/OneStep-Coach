export const PACKAGE_PRESETS = [
  { sessions: 8, label: '8회' },
  { sessions: 10, label: '10회' },
  { sessions: 20, label: '20회' },
  { sessions: 30, label: '30회' },
  { sessions: 50, label: '50회' },
] as const

export function isDiscountedPayment(paymentMethod: string): boolean {
  return (
    paymentMethod === 'cash' ||
    paymentMethod === '현금' ||
    paymentMethod === 'transfer' ||
    paymentMethod === '계좌이체'
  )
}

/** 8회 기준: 카드 등 88만원, 현금·계좌이체 80만원 */
export function getPresetPrice(
  sessions: number,
  paymentMethod: string,
): number | null {
  if (sessions !== 8) return null
  return isDiscountedPayment(paymentMethod) ? 800_000 : 880_000
}

export function calculatePackageExpiryDate(sessions: number): string {
  const months =
    sessions <= 8 ? 3 : sessions <= 10 ? 3 : sessions <= 20 ? 4 : sessions <= 30 ? 5 : 6
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}
