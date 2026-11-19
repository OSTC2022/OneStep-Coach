/** 로그인 후 복귀용 — 같은 사이트 내부 경로만 허용 */
export function getSafeNextPath(
  value: string | null | undefined,
  fallback = '/dashboard',
): string {
  const raw = value?.trim() ?? ''
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//')) return fallback
  if (raw.includes('://')) return fallback
  if (raw.startsWith('/auth/login')) return fallback
  if (!raw.startsWith('/dashboard') && !raw.startsWith('/carb-calculator')) {
    return fallback
  }
  return raw
}

export function buildLoginRedirectUrl(pathname: string, search: string) {
  const next = `${pathname}${search}`
  const params = new URLSearchParams()
  params.set('next', next)
  return `/auth/login?${params.toString()}`
}
