import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { prepareScreenshotForAnalysis } from '@/lib/running-league/screenshot-image-server'

const BUCKET = 'running-mileage-screenshots'

export async function uploadMileageScreenshot(params: {
  memberId: string
  leagueId: string
  file: File
}): Promise<{ url: string | null; error?: string }> {
  try {
    const arrayBuffer = await params.file.arrayBuffer()
    const original = Buffer.from(arrayBuffer)
    const { buffer } = await prepareScreenshotForAnalysis(original, params.file.type || 'image/jpeg')
    const path = `${params.memberId}/${params.leagueId}/${Date.now()}.jpg`
    const supabase = createServiceRoleClient()

    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600',
    })

    if (error) {
      console.warn('[mileage-screenshot-storage] upload failed', error.message)
      return { url: null, error: error.message }
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { url: data.publicUrl }
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : '스크린샷 업로드에 실패했습니다.',
    }
  }
}
