import 'server-only'

import { getSiteUrl } from '@/lib/site-url'

export function memberBodySharePath(token: string) {
  return `/share/body/${token}`
}

export function buildMemberBodyShareUrl(token: string, siteUrl?: string): string {
  const base = siteUrl ?? getSiteUrl()
  return `${base}${memberBodySharePath(token)}`
}
