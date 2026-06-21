import 'server-only'

import sharp from 'sharp'

export async function buildOcrImageVariants(buffer: Buffer): Promise<Buffer[]> {
  const rotated = await sharp(buffer, { failOn: 'none' }).rotate().toBuffer()
  const meta = await sharp(rotated).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0

  const resized =
    width > 1200 || height > 1200
      ? await sharp(rotated)
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .toBuffer()
      : rotated

  const resizedMeta = await sharp(resized).metadata()
  const rWidth = resizedMeta.width ?? width
  const rHeight = resizedMeta.height ?? height

  const grey = await sharp(resized).greyscale().normalize().sharpen().toBuffer()
  const inverted = await sharp(resized).greyscale().negate().normalize().sharpen().linear(1.2, 0).toBuffer()
  const highContrast = await sharp(resized)
    .greyscale()
    .linear(1.8, -80)
    .threshold(155)
    .toBuffer()

  const variants: Buffer[] = [resized, grey, inverted, highContrast]

  if (rWidth && rHeight) {
    const bands = [
      { topRatio: 0.2, heightRatio: 0.38 },
      { topRatio: 0.42, heightRatio: 0.28 },
      { topRatio: 0.68, heightRatio: 0.14 },
    ]

    for (const band of bands) {
      const top = Math.floor(rHeight * band.topRatio)
      const bandHeight = Math.max(1, Math.floor(rHeight * band.heightRatio))
      variants.push(
        await sharp(resized)
          .extract({
            left: 0,
            top,
            width: rWidth,
            height: Math.min(bandHeight, rHeight - top),
          })
          .greyscale()
          .negate()
          .normalize()
          .sharpen()
          .toBuffer(),
      )
    }
  }

  return variants
}
