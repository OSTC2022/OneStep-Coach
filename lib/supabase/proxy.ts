import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  canAccessPath,
  getDefaultDashboardPath,
  profileRoleToAppRole,
} from '@/lib/roles'

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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
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

    // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
    const {
      data: { user },
    } = await supabase.auth.getUser()

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

    if (
      request.nextUrl.pathname.startsWith('/auth/login') &&
      user
    ) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const role = profileRoleToAppRole(profile?.role ?? 'member')
      const url = request.nextUrl.clone()
      url.pathname = getDefaultDashboardPath(role)
      return NextResponse.redirect(url)
    }

    if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      let role = profileRoleToAppRole(profile?.role ?? null)

      if (!profile?.role) {
        const { data: legacy } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        role = profileRoleToAppRole(legacy?.role ?? 'member')
      }

      if (!canAccessPath(role, request.nextUrl.pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/unauthorized'
        return NextResponse.redirect(url)
      }
    }

    return supabaseResponse
  } catch (error) {
    console.error('[middleware] updateSession failed:', error)
    return supabaseResponse
  }
}
