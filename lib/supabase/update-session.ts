import { createServerClient, type SupabaseClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isProtectedAdminAccount } from '@/lib/protected-admin'
import {
  getEffectiveApprovalStatus,
  isProfileAccessAllowed,
} from '@/lib/profile-approval'
import { getDefaultDashboardPath, profileRoleToAppRole } from '@/lib/roles'
import type { ProfileApprovalStatus } from '@/lib/types'

const AUTH_STATUS_PATHS = ['/auth/pending', '/auth/rejected'] as const
const DEV_AUTH_CACHE_TTL_MS = 5000

let devAuthCache: {
  cookieKey: string
  user: User | null
  expiresAt: number
} | null = null

function isDevEnvironment() {
  return process.env.NODE_ENV === 'development'
}

function devCookieKey(request: NextRequest) {
  const authCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith('sb-'))
  if (authCookies.length === 0) return ''
  return authCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .sort()
    .join('|')
}

async function getSessionUser(
  supabase: SupabaseClient,
  request: NextRequest,
): Promise<User | null> {
  if (!isDevEnvironment()) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  }

  const cookieKey = devCookieKey(request)
  const now = Date.now()
  if (
    devAuthCache &&
    devAuthCache.cookieKey === cookieKey &&
    devAuthCache.expiresAt > now
  ) {
    return devAuthCache.user
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  devAuthCache = {
    cookieKey,
    user,
    expiresAt: now + DEV_AUTH_CACHE_TTL_MS,
  }
  return user
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

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/_next')) {
    return NextResponse.next({ request })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[proxy] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
    return missingSupabaseEnvResponse()
  }

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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    })

    const user = await getSessionUser(supabase, request)

    if (
      request.nextUrl.pathname.startsWith('/dashboard') &&
      !user
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    if (
      request.nextUrl.pathname === '/auth/set-password' &&
      !user
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    if (user) {
      const metadataStatus = user.user_metadata?.approval_status as
        | ProfileApprovalStatus
        | undefined
      const fastApproval = resolveApprovalFast(user.email, metadataStatus)

      if (
        shouldUseDevDashboardFastPath(request, user, fastApproval) ||
        (fastApproval &&
          isRscPrefetch(request) &&
          request.nextUrl.pathname.startsWith('/dashboard') &&
          isProfileAccessAllowed(fastApproval, user.email))
      ) {
        return supabaseResponse
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
        return NextResponse.redirect(url)
      }

      if (
        isAuthStatusPath(request.nextUrl.pathname) &&
        isProfileAccessAllowed(approvalStatus, user.email)
      ) {
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

        const role = resolveSessionRole(
          user.email ?? profile?.email,
          profile?.role ?? null,
          legacyRole,
        )
        const url = request.nextUrl.clone()
        url.pathname = getDefaultDashboardPath(role)
        return NextResponse.redirect(url)
      }
    }

    if (
      request.nextUrl.pathname.startsWith('/auth/login') &&
      user
    ) {
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

      const role = resolveSessionRole(
        user.email ?? profile?.email,
        profile?.role ?? null,
        legacyRole,
      )
      const url = request.nextUrl.clone()
      url.pathname = getDefaultDashboardPath(role)
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    console.error('[proxy] updateSession failed:', error)
    return supabaseResponse
  }
}
