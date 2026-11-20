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

/** 이벤트 공유 링크로 들어온 next 인지 (일반 대시보드 복귀와 구분) */
export function isEventShareNextPath(nextPath: string | null | undefined): boolean {
  const raw = nextPath?.trim() ?? ''
  if (!raw) return false
  if (raw.includes('eventMatch=')) return true
  if (raw.startsWith('/e/')) return true
  return false
}

export function buildLoginRedirectUrl(pathname: string, search: string) {
  const next = `${pathname}${search}`
  const params = new URLSearchParams()
  params.set('next', next)
  return `/auth/login?${params.toString()}`
}
