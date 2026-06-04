const INTERNAL_EMAIL_DOMAIN = 'accounts.onestep.local'

function normalizeInputEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? ''
}

/** 회원가입·계정 생성 — 이메일 필수 */
export function parseRequiredEmail(
  email: string | null | undefined,
): { email?: string; error?: string } {
  const trimmed = normalizeInputEmail(email)
  if (!trimmed) {
    return { error: '이메일을 입력해주세요.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: '올바른 이메일 형식을 입력해주세요.' }
  }
  return { email: trimmed }
}

/** 이메일 없이도 Auth 계정 생성 가능하도록 내부 주소 발급 */
export function resolveAuthEmail(
  email: string | null | undefined,
  fullName: string,
): string {
  const trimmed = normalizeInputEmail(email)
  if (trimmed && trimmed.includes('@')) return trimmed

  const slug =
    fullName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '') || 'user'

  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${slug}.${suffix}@${INTERNAL_EMAIL_DOMAIN}`
}

export function isInternalAuthEmail(email: string | null | undefined): boolean {
  return normalizeInputEmail(email).endsWith(`@${INTERNAL_EMAIL_DOMAIN}`)
}

export function formatLoginEmailForDisplay(
  email: string | null | undefined,
): string | null {
  if (!email) return null
  if (isInternalAuthEmail(email)) return null
  return email
}
