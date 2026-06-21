import { createClient } from '@/lib/supabase/server'
import { analyzeRunningScreenshotBuffer } from '@/lib/running-league/analyze-running-screenshot'
import { isOpenAiConfigured } from '@/lib/running-league/openai-config'
import { countExtractedFields } from '@/lib/running-league/screenshot-extraction'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image')

    if (!(image instanceof File)) {
      return Response.json({ ok: false, error: '이미지 파일이 필요합니다.' }, { status: 400 })
    }

    if (!image.type.startsWith('image/')) {
      return Response.json({ ok: false, error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 })
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    console.info('[api/running-league/analyze-screenshot] upload received', {
      file_name: image.name,
      mime_type: image.type,
      file_size: image.size,
      last_modified: image.lastModified,
      buffer_length: buffer.length,
      openai_configured: isOpenAiConfigured(),
    })

    const result = await analyzeRunningScreenshotBuffer(buffer, image.type, {
      logMeta: true,
      fileName: image.name,
    })

    if (result.ok) {
      console.info('[api/running-league/analyze-screenshot] extraction', {
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
        field_count: countExtractedFields(result.extraction),
      })
    }

    if (!result.ok) {
      return Response.json(result, { status: 500 })
    }

    return Response.json(result)
  } catch (error) {
    console.error('[api/running-league/analyze-screenshot]', error)
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '이미지 분석에 실패했습니다.',
      },
      { status: 500 },
    )
  }
}
