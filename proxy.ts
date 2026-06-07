import { updateSession } from '@/lib/supabase/update-session'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // HMR·청크·RSC 내부 요청은 proxy 제외 — 코드 저장 후 먹통 방지
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
