type PublicSupabaseEnv = {
  url: string
  anonKey: string
}

type ServiceSupabaseEnv = PublicSupabaseEnv & {
  serviceRoleKey: string
}

function missingKeys(map: Record<string, string | null>): string[] {
  return Object.entries(map)
    .filter(([, value]) => !value)
    .map(([key]) => key)
}

export function getPublicSupabaseEnv(options?: { log?: boolean }): PublicSupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

  if (!url || !anonKey) {
    const missing = missingKeys({
      NEXT_PUBLIC_SUPABASE_URL: url || null,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey || null,
    })
    const message = `[supabase/env] Missing public Supabase env: ${missing.join(', ')}`
    if (options?.log !== false) {
      console.error(message, {
        vercel_env: process.env.VERCEL_ENV ?? null,
        vercel: process.env.VERCEL ?? null,
      })
    }
    throw new Error(message)
  }

  return { url, anonKey }
}

export function getServiceSupabaseEnv(options?: { log?: boolean }): ServiceSupabaseEnv {
  const { url, anonKey } = getPublicSupabaseEnv({ log: options?.log })
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''

  if (!serviceRoleKey) {
    const message = '[supabase/env] Missing SUPABASE_SERVICE_ROLE_KEY'
    if (options?.log !== false) {
      console.error(message, {
        has_url: Boolean(url),
        vercel_env: process.env.VERCEL_ENV ?? null,
      })
    }
    throw new Error(message)
  }

  return { url, anonKey, serviceRoleKey }
}

export function hasPublicSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )
}

export function hasServiceSupabaseEnv(): boolean {
  return hasPublicSupabaseEnv() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}
