/**
 * TEMPORARY DEBUG — remove this file after verifying OPENAI_API_KEY on Vercel.
 *
 * Usage (Production):
 * 1. Vercel → Settings → Environment Variables → add `ENABLE_OPENAI_ENV_DEBUG=true` (Production)
 * 2. Redeploy
 * 3. Log in as admin, then GET /api/admin/debug/openai-env
 * 4. Remove the env var and delete this route + `lib/running-analysis/openai-env-debug.ts`
 *
 * Never logs or returns the actual API key — only hasOpenAIKey and keyLength.
 */
import { NextResponse } from 'next/server'
import { requireBackupAdminApi } from '@/lib/member-backup/require-backup-admin'
import { getOpenAiEnvDebugPayload } from '@/lib/running-analysis/openai-env-debug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // TEMPORARY DEBUG — disable by unsetting ENABLE_OPENAI_ENV_DEBUG or deleting this route
  if (process.env.ENABLE_OPENAI_ENV_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const isAdmin = await requireBackupAdminApi()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = getOpenAiEnvDebugPayload()

  console.info('[TEMP DEBUG openai-env]', {
    hasOpenAIKey: payload.hasOpenAIKey,
    keyLength: payload.keyLength,
    vercelEnv: payload.vercelEnv,
    nodeEnv: payload.nodeEnv,
  })

  return NextResponse.json({
    hasOpenAIKey: payload.hasOpenAIKey,
    keyLength: payload.keyLength,
    vercelEnv: payload.vercelEnv,
    nodeEnv: payload.nodeEnv,
    visionModel: payload.visionModel,
  })
}
