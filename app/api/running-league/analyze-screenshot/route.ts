import { createClient } from '@/lib/supabase/server'
import { analyzeRunningScreenshotBuffer } from '@/lib/running-league/analyze-running-screenshot'
import { isOpenAiConfigured } from '@/lib/running-league/openai-config'
import { screenshotFailureUserMessage } from '@/lib/running-league/screenshot-analysis-errors'
import {
  checkOpenAiEnv,
  checkPublicSupabaseEnv,
  getRuntimeDeploymentInfo,
  logEnvCheckFailure,
} from '@/lib/env/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel serverless request body limit ~4.5MB */
const MAX_UPLOAD_BYTES = 4_500_000

const ANALYZE_API_PATH = '/api/running-league/analyze-screenshot'

export async function POST(request: Request) {
  const deployment = getRuntimeDeploymentInfo()
  const supabaseEnv = checkPublicSupabaseEnv()
  const openaiEnv = checkOpenAiEnv()

  console.info('[api/running-league/analyze-screenshot] request start', {
    path: ANALYZE_API_PATH,
    deployment,
    OPENAI_API_KEY_exists: Boolean(process.env.OPENAI_API_KEY),
    NEXT_PUBLIC_SUPABASE_URL_exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY_exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY_exists: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  })

  logEnvCheckFailure('analyze-screenshot/supabase', supabaseEnv)
  if (!openaiEnv.ok) {
    logEnvCheckFailure('analyze-screenshot/openai', openaiEnv)
  }

  const baseDiagnostics = {
    openai_configured: openaiEnv.ok,
    ai_status: 'skipped' as const,
    ocr_status: 'skipped' as const,
    field_count: 0,
    runtime: deployment.vercel ? ('vercel' as const) : ('local' as const),
    vercel_env: deployment.vercel_env,
    ocr_supported: !deployment.vercel,
  }

  try {
    if (!supabaseEnv.ok) {
      return Response.json(
        {
          ok: false,
          error: screenshotFailureUserMessage('missing_supabase'),
          error_code: 'missing_supabase',
          diagnostics: {
            ...baseDiagnostics,
            failure_reason: 'missing_supabase',
          },
        },
        { status: 503 },
      )
    }

    if (!openaiEnv.ok) {
      return Response.json(
        {
          ok: false,
          error: screenshotFailureUserMessage('missing_openai_key'),
          error_code: 'missing_openai_key',
          diagnostics: {
            ...baseDiagnostics,
            openai_configured: false,
            failure_reason: 'missing_openai_key',
          },
        },
        { status: 503 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json(
        {
          ok: false,
          error: screenshotFailureUserMessage('unauthorized'),
          error_code: 'unauthorized',
          diagnostics: baseDiagnostics,
        },
        { status: 401 },
      )
    }

    const formData = await request.formData()
    const image = formData.get('image')

    if (!(image instanceof File)) {
      return Response.json(
        {
          ok: false,
          error: '이미지 파일이 필요합니다.',
          error_code: 'invalid_image',
          diagnostics: baseDiagnostics,
        },
        { status: 400 },
      )
    }

    if (!image.type.startsWith('image/')) {
      return Response.json(
        {
          ok: false,
          error: screenshotFailureUserMessage('invalid_image'),
          error_code: 'invalid_image',
          diagnostics: baseDiagnostics,
        },
        { status: 400 },
      )
    }

    console.info('[api/running-league/analyze-screenshot] file received', {
      file_name: image.name,
      mime_type: image.type,
      file_size: image.size,
      openai_configured: isOpenAiConfigured(),
    })

    if (image.size > MAX_UPLOAD_BYTES) {
      console.error('[api/running-league/analyze-screenshot] file too large', {
        file_size: image.size,
        max_bytes: MAX_UPLOAD_BYTES,
      })
      return Response.json(
        {
          ok: false,
          error: screenshotFailureUserMessage('image_too_large'),
          error_code: 'image_too_large',
          diagnostics: {
            ...baseDiagnostics,
            failure_reason: 'image_too_large',
            failure_detail: `file_size=${image.size}`,
          },
        },
        { status: 413 },
      )
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    console.info('[api/running-league/analyze-screenshot] buffer ready', {
      buffer_length: buffer.length,
      file_name: image.name,
    })

    console.info('[api/running-league/analyze-screenshot] AI analysis starting', {
      OPENAI_API_KEY_exists: Boolean(process.env.OPENAI_API_KEY),
    })

    const result = await analyzeRunningScreenshotBuffer(buffer, image.type, {
      logMeta: true,
      fileName: image.name,
    })

    if (result.ok) {
      console.info('[api/running-league/analyze-screenshot] AI response received', {
        file_name: image.name,
        method: result.extraction.extraction_method,
        distance_km: result.extraction.distance_km,
        duration: result.extraction.duration,
        pace: result.extraction.pace,
        activity_date: result.extraction.activity_date,
        activity_time: result.extraction.activity_time,
        heart_rate: result.extraction.heart_rate,
        calories: result.extraction.calories,
        confidence: result.extraction.confidence,
        field_count: result.diagnostics.field_count,
        ai_status: result.diagnostics.ai_status,
        ocr_status: result.diagnostics.ocr_status,
        failure_reason: result.diagnostics.failure_reason,
        openai_configured: result.diagnostics.openai_configured,
        runtime: result.diagnostics.runtime,
        vercel_env: result.diagnostics.vercel_env,
        ocr_supported: result.diagnostics.ocr_supported,
      })
    }

    if (!result.ok) {
      const errorCode = result.error_code ?? result.diagnostics?.failure_reason ?? 'unknown'
      return Response.json(
        {
          ...result,
          error_code: errorCode,
          error: result.error || screenshotFailureUserMessage(errorCode),
        },
        { status: 500 },
      )
    }

    return Response.json(result)
  } catch (error) {
    console.error('[api/running-league/analyze-screenshot] unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      OPENAI_API_KEY_exists: Boolean(process.env.OPENAI_API_KEY),
    })
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '이미지 분석에 실패했습니다.',
        error_code: 'unknown',
        diagnostics: baseDiagnostics,
      },
      { status: 500 },
    )
  }
}
