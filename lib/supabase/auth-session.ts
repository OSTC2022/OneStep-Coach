import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'

const INVALID_AUTH_COOKIE_TTL_MS = 60_000

const invalidAuthCookieKeys = new Map<string, number>()

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string }
  if (err.code === 'refresh_token_not_found' || err.code === 'invalid_refresh_token') {
    return true
  }
  const message = err.message?.toLowerCase() ?? ''
  return message.includes('invalid refresh token') || message.includes('refresh token not found')
}

export function listSupabaseAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith('sb-'))
    .map((cookie) => cookie.name)
}

export function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
): string[] {
  const cleared: string[] = []
  for (const name of listSupabaseAuthCookieNames(request)) {
    cleared.push(name)
    request.cookies.delete(name)
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  }
  return cleared
}

export function applySupabaseAuthCookieClears(
  request: NextRequest,
  response: NextResponse,
  shouldClear: boolean,
) {
  if (!shouldClear) return response
  clearSupabaseAuthCookies(request, response)
  return response
}

export function buildSupabaseAuthCookieKeyFromPairs(
  cookies: Array<{ name: string; value: string }>,
): string {
  const authCookies = cookies.filter((cookie) => cookie.name.startsWith('sb-'))
  if (authCookies.length === 0) return ''
  return authCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .sort()
    .join('|')
}

export function buildSupabaseAuthCookieKey(request: NextRequest): string {
  return buildSupabaseAuthCookieKeyFromPairs(request.cookies.getAll())
}

function rememberInvalidAuthCookieKey(cookieKey: string) {
  if (!cookieKey) return
  invalidAuthCookieKeys.set(cookieKey, Date.now() + INVALID_AUTH_COOKIE_TTL_MS)
}

function isKnownInvalidAuthCookieKey(cookieKey: string): boolean {
  if (!cookieKey) return false
  const expiresAt = invalidAuthCookieKeys.get(cookieKey)
  if (!expiresAt) return false
  if (expiresAt <= Date.now()) {
    invalidAuthCookieKeys.delete(cookieKey)
    return false
  }
  return true
}

export function forgetInvalidAuthCookieKey(cookieKey: string) {
  if (!cookieKey) return
  invalidAuthCookieKeys.delete(cookieKey)
}

async function clearStaleAuthSession(supabase: SupabaseClient) {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Stale cookies may already be unusable — best effort only.
  }
}

export type SafeSessionUserResult = {
  user: User | null
  staleSession: boolean
}

/** Expired or revoked refresh tokens are cleared instead of surfacing as server errors. */
export async function getSafeSessionUser(
  supabase: SupabaseClient,
  options?: {
    cookieKey?: string
    skipLookup?: boolean
  },
): Promise<SafeSessionUserResult> {
  const cookieKey = options?.cookieKey ?? ''
  if (options?.skipLookup) {
    return { user: null, staleSession: true }
  }

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        rememberInvalidAuthCookieKey(cookieKey)
        await clearStaleAuthSession(supabase)
        return { user: null, staleSession: true }
      }
      return { user: null, staleSession: false }
    }

    if (data.user && cookieKey) {
      forgetInvalidAuthCookieKey(cookieKey)
    }

    return { user: data.user, staleSession: false }
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      rememberInvalidAuthCookieKey(cookieKey)
      await clearStaleAuthSession(supabase)
      return { user: null, staleSession: true }
    }
    return { user: null, staleSession: false }
  }
}

export function shouldSkipAuthLookup(request: NextRequest): boolean {
  const cookieKey = buildSupabaseAuthCookieKey(request)
  if (!cookieKey) return false
  return isKnownInvalidAuthCookieKey(cookieKey)
}
