export const REMEMBER_ME_COOKIE = 'onestep-remember-me'
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export const REMEMBER_ME_STORAGE_KEY = 'onestep-remember-me'
export const LOGIN_IDENTIFIER_STORAGE_KEY = 'onestep-login-identifier'

export function isRememberMeEnabled(value: string | undefined | null): boolean {
  return value === '1'
}

export function getRememberMeFromCookieList(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): boolean {
  const remember = cookies.find((cookie) => cookie.name === REMEMBER_ME_COOKIE)
  return isRememberMeEnabled(remember?.value)
}

export function applyRememberMeToSupabaseCookieOptions<
  T extends { maxAge?: number; expires?: Date },
>(name: string, options: T, rememberMe: boolean): T {
  if (!rememberMe || !name.startsWith('sb-')) return options
  return {
    ...options,
    maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
    expires: undefined,
  }
}
