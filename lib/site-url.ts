import 'server-only'

import { PRODUCTION_SITE_URL } from '@/lib/env/config'

/** Public site URL for auth redirects (invite, email confirm). */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (process.env.VERCEL_ENV === 'production') {
    return PRODUCTION_SITE_URL
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return 'http://localhost:3000'
}

/** 초대 메일 (hash 토큰) */
export function getInviteEmailRedirectUrl(siteUrl?: string): string {
  const base = siteUrl ?? getSiteUrl()
  const next = encodeURIComponent('/auth/set-password')
  return `${base}/auth/callback/hash?next=${next}`
}

/** 비밀번호 재설정 — hash 토큰 callback (generateLink·복구 메일 공통) */
export function getRecoveryEmailRedirectUrl(siteUrl?: string): string {
  const base = siteUrl ?? getSiteUrl()
  const next = encodeURIComponent('/auth/set-password')
  return `${base}/auth/callback/hash?next=${next}`
}
