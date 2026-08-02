/** 자동 로그인 유지 기간 (쿠키) — 태블릿 장기 사용 */
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 90

export const REMEMBER_ME_COOKIE = 'onestep-remember-me'
export const REMEMBER_ME_STORAGE_KEY = 'onestep-remember-me'
export const LOGIN_IDENTIFIER_STORAGE_KEY = 'onestep-login-identifier'

export function isRememberMeEnabled(value: string | undefined | null): boolean {
  return value === '1'
}

/** 명시적으로 끈 경우만 false — 쿠키가 없으면 로그인 유지로 간주 */
export function shouldPersistAuthSession(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): boolean {
  const remember = cookies.find((cookie) => cookie.name === REMEMBER_ME_COOKIE)
  if (!remember) return true
  return remember.value !== '0'
}

export function getRememberMeFromCookieList(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): boolean {
  return shouldPersistAuthSession(cookies)
}

type CookieOptionBag = {
  maxAge?: number
  expires?: Date
  path?: string
  sameSite?: 'lax' | 'strict' | 'none' | boolean
  secure?: boolean
  httpOnly?: boolean
  domain?: string
}

/**
 * Supabase sb-* 쿠키에 자동로그인 기간을 강제합니다.
 * refresh 시 Supabase가 짧은 expires를 넣어도 90일로 다시 맞춥니다.
 */
export function applyRememberMeToSupabaseCookieOptions<T extends CookieOptionBag>(
  name: string,
  options: T,
  rememberMe: boolean,
): T {
  if (!name.startsWith('sb-')) return options

  if (!rememberMe) {
    // 세션 쿠키: 브라우저/앱을 완전히 닫으면 만료
    const next = { ...options } as T & CookieOptionBag
    delete next.maxAge
    delete next.expires
    return next as T
  }

  const next = { ...options } as T & CookieOptionBag
  next.maxAge = REMEMBER_ME_MAX_AGE_SECONDS
  // 짧은 expires가 남아 있으면 브라우저가 maxAge보다 expires를 우선할 수 있음
  delete next.expires
  if (!next.path) next.path = '/'
  if (!next.sameSite) next.sameSite = 'lax'
  return next as T
}

export const SUPABASE_AUTH_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
}
