import { createServerClient, type SupabaseClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import {
  applySupabaseAuthCookieClears,
  buildSupabaseAuthCookieKey,
  getSafeSessionUser,
  shouldSkipAuthLookup,
} from '@/lib/supabase/auth-session'
import { NextResponse, type NextRequest } from 'next/server'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import {
  getEffectiveApprovalStatus,
  isProfileAccessAllowed,
} from '@/lib/profile-approval'
import {
  canAccessPath,
  getDefaultDashboardPath,
  profileRoleToAppRole,
  type AppRole,
} from '@/lib/roles'
import type { ProfileApprovalStatus } from '@/lib/types'
import { getPublicSupabaseEnv, hasPublicSupabaseEnv } from '@/lib/supabase/env'
import {
  applyRememberMeToSupabaseCookieOptions,
  getRememberMeFromCookieList,
} from '@/lib/auth/remember-me'

const AUTH_STATUS_PATHS = ['/auth/pending', '/auth/rejected'] as const
const AUTH_CACHE_TTL_MS = process.env.NODE_ENV === 'development' ? 5000 : 3000

let sessionAuthCache: {
  cookieKey: string
  user: User | null
  staleSession: boolean
  expiresAt: number
} | null = null

function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

function devCookieKey(request: NextRequest) {
  return buildSupabaseAuthCookieKey(request)
}

async function getSessionUser(
  supabase: SupabaseClient,
  request: NextRequest,
): Promise<{ user: User | null; staleSession: boolean }> {
  const cookieKey = devCookieKey(request)
  const now = Date.now()
  if (!cookieKey) {
    return { user: null, staleSession: false }
  }
  if (
    sessionAuthCache &&
    sessionAuthCache.cookieKey === cookieKey &&
    sessionAuthCache.expiresAt > now
  ) {
    return {
      user: sessionAuthCache.user,
      staleSession: sessionAuthCache.staleSession,
    }
  }

  const skipLookup = shouldSkipAuthLookup(request)
  const { user, staleSession } = await getSafeSessionUser(supabase, {
    cookieKey,
    skipLookup,
  })
  sessionAuthCache = {
    cookieKey,
    user,
    staleSession,
    expiresAt: now + AUTH_CACHE_TTL_MS,
  }
  return { user, staleSession }
}

function resolveRoleFromMetadata(
  email: string | null | undefined,
  user: User,
): AppRole | null {
  if (isProtectedAdminAccount(email)) return 'admin'
  const metadataRole = user.user_metadata?.role as string | undefined
  if (!metadataRole) return null
  return profileRoleToAppRole(metadataRole)
}

/** JWT 메타데이터에 승인·역할이 있으면 DB 조회 없이 대시보드 통과 (로컬 dev와 동일) */
function shouldUseMetadataDashboardFastPath(
  request: NextRequest,
  user: User,
  fastApproval: ProfileApprovalStatus | null,
): boolean {
  if (!fastApproval || !isProfileAccessAllowed(fastApproval, user.email)) {
    return false
  }
  if (!request.nextUrl.pathname.startsWith('/dashboard')) return false

  const role = resolveRoleFromMetadata(user.email, user)
  if (!role) return false

  return canAccessPath(role, request.nextUrl.pathname)
}

function shouldUseDevDashboardFastPath(
  request: NextRequest,
  user: User,
  fastApproval: ProfileApprovalStatus | null,
) {
  if (!isDevEnvironment() || !fastApproval) return false
  if (!request.nextUrl.pathname.startsWith('/dashboard')) return false
  return isProfileAccessAllowed(fastApproval, user.email)
}

function isRscPrefetch(request: NextRequest) {
  return (
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    request.headers.get('Purpose') === 'prefetch'
  )
}

function isAuthStatusPath(pathname: string) {
  return AUTH_STATUS_PATHS.some((p) => pathname.startsWith(p))
}

function resolveApprovalFast(
  userEmail: string | null | undefined,
  metadataStatus?: ProfileApprovalStatus | string | null,
): ProfileApprovalStatus | null {
  if (isProtectedAdminAccount(userEmail)) return 'approved'
  if (
    metadataStatus === 'approved' ||
    metadataStatus === 'rejected' ||
    metadataStatus === 'pending'
  ) {
    return metadataStatus
  }
  return null
}

async function getProfileApprovalStatus(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  userEmail: string | null | undefined,
  metadataStatus?: ProfileApprovalStatus | string | null,
): Promise<ProfileApprovalStatus> {
  const fast = resolveApprovalFast(userEmail, metadataStatus)
  if (fast) return fast

  const { data: profile } = await supabase
    .from('profiles')
    .select('approval_status, email')
    .eq('id', userId)
    .maybeSingle()

  return getEffectiveApprovalStatus(
    userEmail ?? profile?.email,
    profile?.approval_status as ProfileApprovalStatus | null | undefined,
    metadataStatus as ProfileApprovalStatus | undefined,
  )
}

function resolveSessionRole(
  email: string | null | undefined,
  profileRole: string | null | undefined,
  legacyRole?: string | null,
) {
  if (isProtectedAdminAccount(email)) return 'admin' as const
  if (profileRole) return profileRoleToAppRole(profileRole)
  return profileRoleToAppRole(legacyRole ?? 'member')
}

async function resolveUserSessionRole(
  supabase: ReturnType<typeof createServerClient>,
  user: User,
): Promise<AppRole> {
  const metadataRole = resolveRoleFromMetadata(user.email, user)
  if (metadataRole) return metadataRole

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .maybeSingle()

  let legacyRole: string | null = null
  if (!profile?.role) {
    const { data: legacy } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    legacyRole = legacy?.role ?? null
  }

  return resolveSessionRole(
    user.email ?? profile?.email,
    profile?.role ?? null,
    legacyRole,
  )
}

function missingSupabaseEnvResponse() {
  return new NextResponse(
    [
      'Supabase environment variables are not configured.',
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'in Vercel → Project → Settings → Environment Variables, then redeploy.',
    ].join(' '),
    {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    },
  )
}

function finalizeProxyResponse(
  request: NextRequest,
  response: NextResponse,
  staleSession: boolean,
) {
  return applySupabaseAuthCookieClears(request, response, staleSession)
}

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/_next')) {
    return NextResponse.next({ request })
  }

  if (!hasPublicSupabaseEnv()) {
    console.error('[proxy] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY', {
      vercel_env: process.env.VERCEL_ENV ?? null,
    })
    return missingSupabaseEnvResponse()
  }

  const { url: supabaseUrl, anonKey: supabaseAnonKey } = getPublicSupabaseEnv({ log: true })

  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          const rememberMe = getRememberMeFromCookieList(request.cookies.getAll())
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              applyRememberMeToSupabaseCookieOptions(name, options ?? {}, rememberMe),
            ),
          )
        },
      },
    })

    const { user, staleSession } = await getSessionUser(supabase, request)

    if (request.nextUrl.pathname === '/' && !user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return finalizeProxyResponse(
        request,
        NextResponse.redirect(url),
        staleSession || shouldSkipAuthLookup(request),
      )
    }

    if (
      request.nextUrl.pathname.startsWith('/dashboard') &&
      !user
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return finalizeProxyResponse(
        request,
        NextResponse.redirect(url),
        staleSession || shouldSkipAuthLookup(request),
      )
    }

    if (
      request.nextUrl.pathname === '/auth/set-password' &&
      !user
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return finalizeProxyResponse(
        request,
        NextResponse.redirect(url),
        staleSession || shouldSkipAuthLookup(request),
      )
    }

    if (user) {
      const metadataStatus = user.user_metadata?.approval_status as
        | ProfileApprovalStatus
        | undefined
      const fastApproval = resolveApprovalFast(user.email, metadataStatus)

      if (
        shouldUseMetadataDashboardFastPath(request, user, fastApproval) ||
        shouldUseDevDashboardFastPath(request, user, fastApproval) ||
        (fastApproval &&
          isRscPrefetch(request) &&
          request.nextUrl.pathname.startsWith('/dashboard') &&
          isProfileAccessAllowed(fastApproval, user.email))
      ) {
        return finalizeProxyResponse(request, supabaseResponse, staleSession)
      }

      const approvalStatus = await getProfileApprovalStatus(
        supabase,
        user.id,
        user.email,
        metadataStatus,
      )

      if (
        !isProfileAccessAllowed(approvalStatus, user.email) &&
        (request.nextUrl.pathname.startsWith('/dashboard') ||
          request.nextUrl.pathname.startsWith('/auth/login'))
      ) {
        const url = request.nextUrl.clone()
        url.pathname =
          approvalStatus === 'rejected' ? '/auth/rejected' : '/auth/pending'
        return finalizeProxyResponse(
          request,
          NextResponse.redirect(url),
          staleSession,
        )
      }

      if (
        isAuthStatusPath(request.nextUrl.pathname) &&
        isProfileAccessAllowed(approvalStatus, user.email)
      ) {
        const role = await resolveUserSessionRole(supabase, user)
        const url = request.nextUrl.clone()
        url.pathname = getDefaultDashboardPath(role)
        return finalizeProxyResponse(
          request,
          NextResponse.redirect(url),
          staleSession,
        )
      }
    }

    if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
      const role = await resolveUserSessionRole(supabase, user)

      if (!canAccessPath(role, request.nextUrl.pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = getDefaultDashboardPath(role)
        return finalizeProxyResponse(
          request,
          NextResponse.redirect(url),
          staleSession,
        )
      }
    }

    if (
      request.nextUrl.pathname.startsWith('/auth/login') &&
      user
    ) {
      const role = await resolveUserSessionRole(supabase, user)
      const url = request.nextUrl.clone()
      url.pathname = getDefaultDashboardPath(role)
      return finalizeProxyResponse(
        request,
        NextResponse.redirect(url),
        staleSession,
      )
    }

    return finalizeProxyResponse(request, supabaseResponse, staleSession)
  } catch (error) {
    console.error('[proxy] updateSession failed:', error)
    return supabaseResponse
  }
}
