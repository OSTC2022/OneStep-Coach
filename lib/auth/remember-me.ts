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

export function applyRememberMeToSupabaseCookieOptions<
  T extends { maxAge?: number; expires?: Date },
>(name: string, options: T, rememberMe: boolean): T {
  if (!name.startsWith('sb-')) return options
  if (!rememberMe) {
    // 세션 쿠키: 브라우저/앱을 완전히 닫으면 만료
    const { maxAge: _maxAge, expires: _expires, ...rest } = options as T & {
      maxAge?: number
      expires?: Date
    }
    return rest as T
  }
  return {
    ...options,
    maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
    expires: undefined,
  }
}

export const SUPABASE_AUTH_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
}
