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

  let image: File | null = null

  try {
    if (!supabaseEnv.ok) {
      const responseBody = {
        ok: false,
        error: screenshotFailureUserMessage('missing_supabase'),
        error_code: 'missing_supabase',
        diagnostics: {
          ...baseDiagnostics,
          failure_reason: 'missing_supabase',
        },
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 503 })
    }

    if (!openaiEnv.ok) {
      const responseBody = {
        ok: false,
        error: screenshotFailureUserMessage('missing_openai_key'),
        error_code: 'missing_openai_key',
        diagnostics: {
          ...baseDiagnostics,
          openai_configured: false,
          failure_reason: 'missing_openai_key',
        },
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 503 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const responseBody = {
        ok: false,
        error: screenshotFailureUserMessage('unauthorized'),
        error_code: 'unauthorized',
        diagnostics: baseDiagnostics,
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 401 })
    }

    const formData = await request.formData()
    const imageField = formData.get('image')
    image = imageField instanceof File ? imageField : null

    console.log('image_received', Boolean(image))
    console.log('image_size', image?.size ?? 'no_file')
    console.log('image_type', image?.type ?? 'no_type')

    if (!image) {
      const responseBody = {
        ok: false,
        error: '이미지 파일이 필요합니다.',
        error_code: 'invalid_image',
        diagnostics: baseDiagnostics,
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 400 })
    }

    if (!image.type.startsWith('image/')) {
      const responseBody = {
        ok: false,
        error: screenshotFailureUserMessage('invalid_image'),
        error_code: 'invalid_image',
        diagnostics: baseDiagnostics,
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 400 })
    }

    if (image.size > MAX_UPLOAD_BYTES) {
      const responseBody = {
        ok: false,
        error: screenshotFailureUserMessage('image_too_large'),
        error_code: 'image_too_large',
        diagnostics: {
          ...baseDiagnostics,
          failure_reason: 'image_too_large',
          failure_detail: `file_size=${image.size}`,
        },
      }
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 413 })
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    console.log('ai_processing_start', Date.now())

    const result = await analyzeRunningScreenshotBuffer(buffer, image.type, {
      logMeta: true,
      fileName: image.name,
    })

    if (!result.ok) {
      const errorCode = result.error_code ?? result.diagnostics?.failure_reason ?? 'unknown'
      const responseBody = {
        ...result,
        error_code: errorCode,
        error: result.error || screenshotFailureUserMessage(errorCode),
      }
      console.log('parsed_result', null)
      console.log('final_response', {
        ok: responseBody.ok,
        error: responseBody.error,
        error_code: responseBody.error_code,
      })
      return Response.json(responseBody, { status: 500 })
    }

    console.log('parsed_result', {
      distance_km: result.extraction.distance_km,
      duration: result.extraction.duration,
      pace: result.extraction.pace,
      activity_date: result.extraction.activity_date,
      activity_time: result.extraction.activity_time,
      heart_rate: result.extraction.heart_rate,
      calories: result.extraction.calories,
      analysis_status: result.extraction.analysis_status,
      analysis_success: result.extraction.analysis_success,
      raw_json: result.extraction.raw_json ?? null,
    })

    const responseBody = result
    console.log('final_response', {
      ok: responseBody.ok,
      analysis_status: responseBody.extraction.analysis_status,
      analysis_success: responseBody.extraction.analysis_success,
      distance_km: responseBody.extraction.distance_km,
      duration: responseBody.extraction.duration,
      field_count: responseBody.diagnostics.field_count,
      ai_status: responseBody.diagnostics.ai_status,
    })

    return Response.json(responseBody)
  } catch (error) {
    console.error('ai_error_message', error instanceof Error ? error.message : String(error))
    console.error('ai_error_stack', error instanceof Error ? error.stack : 'no_stack')
    const responseBody = {
      ok: false,
      error: error instanceof Error ? error.message : '이미지 분석에 실패했습니다.',
      error_code: 'unknown',
      diagnostics: baseDiagnostics,
    }
    console.log('final_response', responseBody)
    return Response.json(responseBody, { status: 500 })
  }
}
