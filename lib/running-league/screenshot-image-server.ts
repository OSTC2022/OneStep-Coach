import 'server-only'

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { RunningScreenshotImageMeta } from '@/lib/running-league/screenshot-extraction'

/** 분석용 최소 너비 — OCR·Vision 품질 유지 */
export const SCREENSHOT_MIN_WIDTH = 1200
export const SCREENSHOT_MAX_EDGE = 2400

export function hashScreenshotBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function prepareScreenshotForAnalysis(
  buffer: Buffer,
  mimeType: string,
): Promise<{
  buffer: Buffer
  meta: RunningScreenshotImageMeta
}> {
  const original = sharp(buffer, { failOn: 'none' })
  const originalMeta = await original.metadata()
  const originalWidth = originalMeta.width ?? 0

  let targetWidth = originalWidth
  if (targetWidth > SCREENSHOT_MAX_EDGE) {
    targetWidth = SCREENSHOT_MAX_EDGE
  }
  if (targetWidth < SCREENSHOT_MIN_WIDTH) {
    targetWidth = SCREENSHOT_MIN_WIDTH
  }

  const resized = original.rotate().resize({
    width: targetWidth,
    height: SCREENSHOT_MAX_EDGE,
    fit: 'inside',
    withoutEnlargement: false,
  })

  const output = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  const resizedMeta = await sharp(output).metadata()

  return {
    buffer: output,
    meta: {
      original_size: buffer.length,
      mime_type: mimeType || 'application/octet-stream',
      width: originalMeta.width ?? 0,
      height: originalMeta.height ?? 0,
      resized_width: resizedMeta.width ?? 0,
      resized_height: resizedMeta.height ?? 0,
    },
  }
}

export async function extractScreenshotRegions(buffer: Buffer): Promise<Buffer[]> {
  const image = sharp(buffer)
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) return [buffer]

  const regions = [
    { left: 0, top: Math.floor(height * 0.18), width, height: Math.floor(height * 0.32) },
    { left: 0, top: Math.floor(height * 0.45), width, height: Math.floor(height * 0.22) },
    { left: 0, top: 0, width, height: Math.floor(height * 0.55) },
  ]

  const outputs: Buffer[] = []
  for (const region of regions) {
    outputs.push(
      await sharp(buffer)
        .extract({
          left: region.left,
          top: Math.max(0, region.top),
          width: Math.max(1, Math.min(region.width, width)),
          height: Math.max(1, Math.min(region.height, height - region.top)),
        })
        .jpeg({ quality: 85 })
        .toBuffer(),
    )
  }

  return outputs
}
