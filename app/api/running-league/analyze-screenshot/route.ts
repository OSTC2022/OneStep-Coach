import { createClient } from '@/lib/supabase/server'
import { analyzeRunningScreenshotBuffer } from '@/lib/running-league/analyze-running-screenshot'
import {
  buildScreenshotApiErrorBody,
  httpStatusForScreenshotError,
  screenshotApiErrorMessage,
  toScreenshotApiErrorCode,
} from '@/lib/running-league/screenshot-analysis-errors'
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
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'missing_supabase',
        diagnostics: {
          ...baseDiagnostics,
          failure_reason: 'missing_supabase',
        },
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: httpStatusForScreenshotError('missing_supabase') })
    }

    if (!openaiEnv.ok) {
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'missing_openai_key',
        diagnostics: {
          ...baseDiagnostics,
          openai_configured: false,
          failure_reason: 'missing_openai_key',
        },
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: httpStatusForScreenshotError('missing_openai_key') })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'unauthorized',
        diagnostics: baseDiagnostics,
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: httpStatusForScreenshotError('unauthorized') })
    }

    const formData = await request.formData()
    const imageField = formData.get('image')
    image = imageField instanceof File ? imageField : null

    console.log('image_received', Boolean(image))
    console.log('image_size', image?.size ?? 'no_file')
    console.log('image_type', image?.type ?? 'no_type')

    if (!image) {
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'invalid_image',
        message: '이미지 파일이 필요합니다.',
        diagnostics: baseDiagnostics,
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: 400 })
    }

    if (!image.type.startsWith('image/')) {
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'invalid_image',
        diagnostics: baseDiagnostics,
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: httpStatusForScreenshotError('invalid_image') })
    }

    if (image.size > MAX_UPLOAD_BYTES) {
      const responseBody = buildScreenshotApiErrorBody({
        reason: 'image_too_large',
        diagnostics: {
          ...baseDiagnostics,
          failure_reason: 'image_too_large',
          failure_detail: `file_size=${image.size}`,
        },
      })
      console.log('final_response', responseBody)
      return Response.json(responseBody, { status: httpStatusForScreenshotError('image_too_large') })
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    console.log('ai_processing_start', Date.now())

    const result = await analyzeRunningScreenshotBuffer(buffer, image.type, {
      logMeta: true,
      fileName: image.name,
    })

    if (!result.ok) {
      const responseBody = {
        ...result,
        success: false as const,
        errorCode: result.errorCode ?? toScreenshotApiErrorCode(result.error_code),
        message: result.message ?? result.error,
        manualInputRequired: result.manualInputRequired ?? true,
      }
      console.log('parsed_result', null)
      console.log('final_response', {
        success: responseBody.success,
        errorCode: responseBody.errorCode,
        message: responseBody.message,
        manualInputRequired: responseBody.manualInputRequired,
      })
      const httpStatus = httpStatusForScreenshotError(result.error_code ?? 'unknown')
      return Response.json(responseBody, { status: httpStatus })
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

    const responseBody = {
      ...result,
      success: true as const,
    }
    console.log('final_response', {
      success: responseBody.success,
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
    const responseBody = buildScreenshotApiErrorBody({
      reason: 'unknown',
      message: error instanceof Error ? error.message : screenshotApiErrorMessage('UNKNOWN_ERROR'),
      diagnostics: baseDiagnostics,
    })
    console.log('final_response', responseBody)
    return Response.json(responseBody, { status: 500 })
  }
}
