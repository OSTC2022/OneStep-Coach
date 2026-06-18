/** 숫자만 추출 (최대 11자리) */
export function extractPhoneDigits(value: string, maxLength = 11): string {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

/** 입력 중 한국 휴대폰 번호 자동 하이픈 (010-4444-5555) */
export function formatKoreanPhoneInput(value: string): string {
  const digits = extractPhoneDigits(value)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

/** 저장·검증용 — 하이픈 포함 형식으로 통일 */
export function normalizeKoreanPhoneDisplay(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return formatKoreanPhoneInput(trimmed)
}
