/** OCR용 최대 너비 (px) */
export const OCR_MAX_WIDTH_PX = 1200

export type OcrPreprocessResult = {
  width: number
  height: number
  originalSize: number
  mimeType: string
  variants: HTMLCanvasElement[]
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했습니다.'))
    }
    img.src = url
  })
}

function scaledSize(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) {
    return { width, height }
  }
  const scale = maxWidth / width
  return {
    width: maxWidth,
    height: Math.round(height * scale),
  }
}

function applyContrastAndGrayscale(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options?: { invert?: boolean; threshold?: number },
) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  let brightnessSum = 0

  for (let i = 0; i < data.length; i += 4) {
    brightnessSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const avgBrightness = brightnessSum / (data.length / 4)
  const darkTheme = avgBrightness < 110
  const shouldInvert = options?.invert ?? darkTheme
  const threshold = options?.threshold ?? 145

  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (shouldInvert) gray = 255 - gray
    // 대비 증가
    gray = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 128))
    const value = gray > threshold ? 255 : 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

function applyDarkModeOcrBoost(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray = 255 - gray
    gray = Math.min(255, Math.max(0, (gray - 128) * 2.2 + 128))
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

type CropRegion = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

/** Garmin·Strava 등 거리(큰 숫자)가 있는 통계 영역 */
const DISTANCE_METRIC_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.36, widthRatio: 0.52, heightRatio: 0.14 },
  { xRatio: 0, yRatio: 0.33, widthRatio: 0.55, heightRatio: 0.22 },
]

/** 통계 그리드 전체 (거리·페이스·총 시간·칼로리) */
const METRICS_GRID_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.32, widthRatio: 1, heightRatio: 0.28 },
  { xRatio: 0, yRatio: 0.46, widthRatio: 0.55, heightRatio: 0.1 },
]

function cropRegionToCanvas(
  img: HTMLImageElement,
  region: CropRegion,
  enhance: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const sx = Math.floor(img.naturalWidth * region.xRatio)
  const sy = Math.floor(img.naturalHeight * region.yRatio)
  const sw = Math.max(1, Math.floor(img.naturalWidth * region.widthRatio))
  const sh = Math.max(1, Math.floor(img.naturalHeight * region.heightRatio))
  const targetWidth = Math.max(420, sw * 3)
  const scale = targetWidth / sw
  const targetHeight = Math.max(80, Math.floor(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('이미지를 처리하지 못했습니다.')
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
  enhance(ctx, targetWidth, targetHeight)
  return canvas
}

function drawToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  enhance?: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('이미지를 처리하지 못했습니다.')
  }
  ctx.drawImage(img, 0, 0, width, height)
  enhance?.(ctx)
  return canvas
}

/**
 * OCR 전 이미지 전처리 — 최대 너비 1200px, 대비·흑백 변형 생성
 */
export async function prepareScreenshotForOcr(file: File): Promise<OcrPreprocessResult> {
  const img = await loadImageFromFile(file)
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, OCR_MAX_WIDTH_PX)

  const grey = drawToCanvas(img, width, height, (ctx) => {
    applyContrastAndGrayscale(ctx, width, height)
  })

  const inverted = drawToCanvas(img, width, height, (ctx) => {
    applyContrastAndGrayscale(ctx, width, height, { invert: true, threshold: 140 })
  })

  const softGrey = drawToCanvas(img, width, height, (ctx) => {
    const imageData = ctx.getImageData(0, 0, width, height)
    const { data } = imageData
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128))
      data[i] = boosted
      data[i + 1] = boosted
      data[i + 2] = boosted
    }
    ctx.putImageData(imageData, 0, 0)
  })

  const distanceCrops = DISTANCE_METRIC_REGIONS.map((region) =>
    cropRegionToCanvas(img, region, applyDarkModeOcrBoost),
  )

  const metricsCrops = METRICS_GRID_REGIONS.map((region) =>
    cropRegionToCanvas(img, region, applyDarkModeOcrBoost),
  )

  const bands: HTMLCanvasElement[] = []
  const bandSpecs = [
    { topRatio: 0.05, heightRatio: 0.35 },
    { topRatio: 0.35, heightRatio: 0.35 },
    { topRatio: 0.65, heightRatio: 0.3 },
  ]

  for (const band of bandSpecs) {
    const top = Math.floor(height * band.topRatio)
    const bandHeight = Math.max(1, Math.floor(height * band.heightRatio))
    const bandCanvas = document.createElement('canvas')
    bandCanvas.width = width
    bandCanvas.height = bandHeight
    const bandCtx = bandCanvas.getContext('2d', { willReadFrequently: true })
    if (!bandCtx) continue
    bandCtx.drawImage(img, 0, top, width, bandHeight, 0, 0, width, bandHeight)
    applyContrastAndGrayscale(bandCtx, width, bandHeight, { invert: true })
    bands.push(bandCanvas)
  }

  return {
    width,
    height,
    originalSize: file.size,
    mimeType: file.type || 'image/jpeg',
    variants: [...distanceCrops, ...metricsCrops, grey, inverted, softGrey, ...bands],
  }
}
