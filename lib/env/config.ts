import 'server-only'

/** Vercel Production 고정 URL (NEXT_PUBLIC_SITE_URL 미설정 시 fallback) */
export const PRODUCTION_SITE_URL = 'https://one-step-coach-hlbv.vercel.app'

export const VERCEL_PROJECT_SLUG = 'one-step-coach-hlbv'

export type EnvCheckResult = {
  ok: boolean
  missing: string[]
  present: string[]
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export function checkPublicSupabaseEnv(): EnvCheckResult {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
  const missing: string[] = []
  const present: string[] = []
  for (const key of keys) {
    if (readEnv(key)) present.push(key)
    else missing.push(key)
  }
  return { ok: missing.length === 0, missing, present }
}

export function checkServiceRoleEnv(): EnvCheckResult {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const
  const missing: string[] = []
  const present: string[] = []
  for (const key of keys) {
    if (readEnv(key)) present.push(key)
    else missing.push(key)
  }
  return { ok: missing.length === 0, missing, present }
}

export function checkOpenAiEnv(): EnvCheckResult {
  const keys = ['OPENAI_API_KEY'] as const
  const missing: string[] = []
  const present: string[] = []
  for (const key of keys) {
    if (readEnv(key)) present.push(key)
    else missing.push(key)
  }
  return { ok: missing.length === 0, missing, present }
}

export function logEnvCheckFailure(scope: string, check: EnvCheckResult): void {
  if (check.ok) return
  console.error(`[env/${scope}] missing environment variables`, {
    missing: check.missing,
    present: check.present,
    vercel_env: process.env.VERCEL_ENV ?? null,
    node_env: process.env.NODE_ENV ?? null,
  })
}

export function getRuntimeDeploymentInfo() {
  return {
    vercel: Boolean(process.env.VERCEL),
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_url: process.env.VERCEL_URL ?? null,
    node_env: process.env.NODE_ENV ?? null,
    site_url: readEnv('NEXT_PUBLIC_SITE_URL'),
  }
}
