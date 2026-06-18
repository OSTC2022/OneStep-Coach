import { updateSession } from '@/lib/supabase/update-session'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }
  return await updateSession(request)
}

export const config = {
  matcher: [
    // HMR·청크·RSC 내부 요청은 proxy 제외 — 코드 저장 후 먹통 방지
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
