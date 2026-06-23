/** OCR용 최대 너비 (px) — 글자 인식률을 위해 해상도 상향 */
export const OCR_MAX_WIDTH_PX = 1920
/** 빠른 분석용 — 처리 시간 단축 */
export const OCR_FAST_MAX_WIDTH_PX = 1280

export type OcrImageVariant = {
  canvas: HTMLCanvasElement
  /** 낮을수록 먼저 OCR (Strava 흰 글씨 = 1) */
  priority: number
  /** Tesseract PSM (미지정 시 AUTO) */
  psm?: number
  /** 숫자·영문 오버레이 전용 화이트리스트 */
  whitelist?: string
}

export type OcrPreprocessResult = {
  width: number
  height: number
  originalSize: number
  mimeType: string
  variants: OcrImageVariant[]
}

const ENGLISH_OVERLAY_WHITELIST =
  "0123456789.:,/kmKhminutestoesecDISTPaceTimeSTRAVA'l"

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
    gray = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128))
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
    gray = Math.min(255, Math.max(0, (gray - 128) * 2.4 + 128))
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

/** Strava 등 흰 글씨 오버레이 — 밝은 픽셀을 검정 글자로 */
function applyLightTextOcrBoost(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold = 175,
) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const whiteness = Math.min(r, g, b)
    const isBright = lum >= threshold || whiteness >= threshold - 15
    const value = isBright ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

function applyGreenSuppressionBoost(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const greenDominant = g > r + 18 && g > b + 18
    let lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (greenDominant) lum *= 0.55
    const value = lum >= 168 ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
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

const DISTANCE_METRIC_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.36, widthRatio: 0.52, heightRatio: 0.14 },
  { xRatio: 0, yRatio: 0.33, widthRatio: 0.55, heightRatio: 0.22 },
]

const METRICS_GRID_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.32, widthRatio: 1, heightRatio: 0.28 },
  { xRatio: 0, yRatio: 0.46, widthRatio: 0.55, heightRatio: 0.1 },
]

const RECENT_ACTIVITY_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.2, widthRatio: 1, heightRatio: 0.18 },
]

/** Apple Fitness·삼성헬스 등 하단 요약 카드 (거리·시간·bpm) */
const WORKOUT_SUMMARY_BOTTOM_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.58, widthRatio: 1, heightRatio: 0.38 },
  { xRatio: 0, yRatio: 0.68, widthRatio: 1, heightRatio: 0.28 },
  { xRatio: 0, yRatio: 0.64, widthRatio: 0.55, heightRatio: 0.24 },
]

/** Apple Fitness 운동 상세 — 상단 통계 그리드 (거리·시간·페이스) */
const WORKOUT_DETAIL_STATS_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.14, widthRatio: 1, heightRatio: 0.38 },
  { xRatio: 0, yRatio: 0.18, widthRatio: 1, heightRatio: 0.30 },
]

/** Nike·밝은 배경 앱 — 상단 거리·통계 */
const LIGHT_THEME_TOP_REGIONS: CropRegion[] = [
  { xRatio: 0, yRatio: 0.02, widthRatio: 1, heightRatio: 0.14 },
  { xRatio: 0, yRatio: 0.08, widthRatio: 1, heightRatio: 0.36 },
]

/** Strava 사진 오버레이 — 오른쪽 흰 글씨 */
const STRAVA_OVERLAY_REGIONS: CropRegion[] = [
  { xRatio: 0.3, yRatio: 0.08, widthRatio: 0.7, heightRatio: 0.72 },
  { xRatio: 0.42, yRatio: 0.15, widthRatio: 0.58, heightRatio: 0.58 },
  { xRatio: 0.5, yRatio: 0.22, widthRatio: 0.5, heightRatio: 0.48 },
]

function drawCroppedCanvas(
  img: HTMLImageElement,
  region: CropRegion,
  scaleMultiplier: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const sx = Math.floor(img.naturalWidth * region.xRatio)
  const sy = Math.floor(img.naturalHeight * region.yRatio)
  const sw = Math.max(1, Math.floor(img.naturalWidth * region.widthRatio))
  const sh = Math.max(1, Math.floor(img.naturalHeight * region.heightRatio))
  const targetWidth = Math.max(640, Math.floor(sw * scaleMultiplier))
  const scale = targetWidth / sw
  const targetHeight = Math.max(120, Math.floor(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('이미지를 처리하지 못했습니다.')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
  return { canvas, width: targetWidth, height: targetHeight }
}

function buildLightOverlayVariants(
  img: HTMLImageElement,
  region: CropRegion,
): OcrImageVariant[] {
  const variants: OcrImageVariant[] = []
  const { canvas, width, height } = drawCroppedCanvas(img, region, 5)

  const enhanceJobs: Array<{
    enhance: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    psm: number
    whitelist?: string
  }> = [
    { enhance: (ctx, w, h) => applyLightTextOcrBoost(ctx, w, h, 155), psm: 11, whitelist: ENGLISH_OVERLAY_WHITELIST },
    { enhance: (ctx, w, h) => applyLightTextOcrBoost(ctx, w, h, 170), psm: 11, whitelist: ENGLISH_OVERLAY_WHITELIST },
    { enhance: (ctx, w, h) => applyLightTextOcrBoost(ctx, w, h, 185), psm: 6, whitelist: ENGLISH_OVERLAY_WHITELIST },
    { enhance: (ctx, w, h) => applyGreenSuppressionBoost(ctx, w, h), psm: 11, whitelist: ENGLISH_OVERLAY_WHITELIST },
    { enhance: (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: true, threshold: 130 }), psm: 6 },
    { enhance: applyDarkModeOcrBoost, psm: 6 },
  ]

  for (const job of enhanceJobs) {
    const variantCanvas = document.createElement('canvas')
    variantCanvas.width = width
    variantCanvas.height = height
    const ctx = variantCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    ctx.drawImage(canvas, 0, 0)
    job.enhance(ctx, width, height)
    variants.push({
      canvas: variantCanvas,
      priority: 1,
      psm: job.psm,
      whitelist: job.whitelist,
    })
  }

  return variants
}

function buildDarkOverlayVariants(
  img: HTMLImageElement,
  region: CropRegion,
  priority = 2,
): OcrImageVariant[] {
  const { canvas, width, height } = drawCroppedCanvas(img, region, 4)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  applyDarkModeOcrBoost(ctx, width, height)
  return [{ canvas, priority, psm: 6 }]
}

/** Nike 등 흰 배경 — 반전 없이 대비 강화 */
function buildLightThemeVariants(
  img: HTMLImageElement,
  region: CropRegion,
  priority = 1,
): OcrImageVariant[] {
  const variants: OcrImageVariant[] = []
  const { canvas, width, height } = drawCroppedCanvas(img, region, 5)

  const enhanceJobs: Array<{
    enhance: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
    psm: number
  }> = [
    { enhance: (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: false, threshold: 140 }), psm: 6 },
    { enhance: (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: false, threshold: 155 }), psm: 11 },
  ]

  for (const job of enhanceJobs) {
    const variantCanvas = document.createElement('canvas')
    variantCanvas.width = width
    variantCanvas.height = height
    const ctx = variantCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    ctx.drawImage(canvas, 0, 0)
    job.enhance(ctx, width, height)
    variants.push({ canvas: variantCanvas, priority, psm: job.psm })
  }

  return variants
}

function buildTopBandLightVariants(
  img: HTMLImageElement,
  fullWidth: number,
  fullHeight: number,
): OcrImageVariant[] {
  const variants: OcrImageVariant[] = []
  const bands = [
    { topRatio: 0.02, heightRatio: 0.14 },
    { topRatio: 0.08, heightRatio: 0.36 },
  ]

  for (const band of bands) {
    const top = Math.floor(fullHeight * band.topRatio)
    const bandHeight = Math.max(1, Math.floor(fullHeight * band.heightRatio))
    const bandCanvas = document.createElement('canvas')
    bandCanvas.width = fullWidth
    bandCanvas.height = bandHeight
    const ctx = bandCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    ctx.drawImage(img, 0, top, fullWidth, bandHeight, 0, 0, fullWidth, bandHeight)
    applyContrastAndGrayscale(ctx, fullWidth, bandHeight, { invert: false, threshold: 145 })
    variants.push({ canvas: bandCanvas, priority: 1, psm: 6 })
  }

  return variants
}

function drawToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  enhance?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  priority = 3,
  psm?: number,
): OcrImageVariant {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('이미지를 처리하지 못했습니다.')
  }
  ctx.drawImage(img, 0, 0, width, height)
  enhance?.(ctx, width, height)
  return { canvas, priority, psm }
}

/**
 * OCR 전 이미지 전처리 — 고해상도·다중 필터·Strava 흰 글씨 우선
 */
export async function prepareScreenshotForOcr(file: File): Promise<OcrPreprocessResult> {
  const img = await loadImageFromFile(file)
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, OCR_MAX_WIDTH_PX)

  const variants: OcrImageVariant[] = []

  for (const region of STRAVA_OVERLAY_REGIONS) {
    variants.push(...buildLightOverlayVariants(img, region))
  }

  for (const region of DISTANCE_METRIC_REGIONS) {
    variants.push(...buildDarkOverlayVariants(img, region))
  }

  for (const region of RECENT_ACTIVITY_REGIONS) {
    variants.push(...buildDarkOverlayVariants(img, region))
  }

  for (const region of METRICS_GRID_REGIONS) {
    variants.push(...buildDarkOverlayVariants(img, region))
  }

  variants.push(
    drawToCanvas(img, width, height, (ctx, w, h) => applyLightTextOcrBoost(ctx, w, h, 170), 2, 11),
    drawToCanvas(img, width, height, (ctx, w, h) => applyGreenSuppressionBoost(ctx, w, h), 2, 11),
    drawToCanvas(img, width, height, (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h), 3),
    drawToCanvas(img, width, height, (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: true, threshold: 135 }), 3),
    drawToCanvas(img, width, height, (ctx, w, h) => {
      const imageData = ctx.getImageData(0, 0, w, h)
      const { data } = imageData
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.6 + 128))
        data[i] = boosted
        data[i + 1] = boosted
        data[i + 2] = boosted
      }
      ctx.putImageData(imageData, 0, 0)
    }, 3),
  )

  const bandSpecs = [
    { topRatio: 0.05, heightRatio: 0.35, priority: 2 as const },
    { topRatio: 0.3, heightRatio: 0.4, priority: 2 as const },
    { topRatio: 0.55, heightRatio: 0.35, priority: 3 as const },
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
    if (band.topRatio >= 0.25) {
      applyLightTextOcrBoost(bandCtx, width, bandHeight, 175)
    } else {
      applyContrastAndGrayscale(bandCtx, width, bandHeight, { invert: true })
    }
    variants.push({ canvas: bandCanvas, priority: band.priority, psm: 11 })
  }

  variants.sort((a, b) => a.priority - b.priority)

  return {
    width,
    height,
    originalSize: file.size,
    mimeType: file.type || 'image/jpeg',
    variants,
  }
}

export type ScreenshotOcrPipeline = OcrPreprocessResult & {
  supplementVariants: OcrImageVariant[]
}

function estimateImageDarkTheme(img: HTMLImageElement): boolean {
  const sample = 48
  const canvas = document.createElement('canvas')
  canvas.width = sample
  canvas.height = sample
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true

  ctx.drawImage(img, 0, 0, sample, sample)
  const { data } = ctx.getImageData(0, 0, sample, sample)
  let brightness = 0
  for (let i = 0; i < data.length; i += 4) {
    brightness += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return brightness / (data.length / 4) < 110
}

function buildFastOcrVariants(
  img: HTMLImageElement,
  width: number,
  height: number,
  darkTheme: boolean,
): OcrImageVariant[] {
  const variants: OcrImageVariant[] = []

  if (!darkTheme) {
    variants.push(
      ...buildTopBandLightVariants(img, width, height),
      ...buildLightThemeVariants(img, LIGHT_THEME_TOP_REGIONS[0], 1),
      ...buildLightThemeVariants(img, LIGHT_THEME_TOP_REGIONS[1], 1),
      drawToCanvas(
        img,
        width,
        height,
        (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: false, threshold: 145 }),
        1,
        6,
      ),
    )
  }

  variants.push(
    ...buildDarkOverlayVariants(img, WORKOUT_DETAIL_STATS_REGIONS[0], 1),
    ...buildDarkOverlayVariants(img, WORKOUT_DETAIL_STATS_REGIONS[1], 1),
    ...buildDarkOverlayVariants(img, DISTANCE_METRIC_REGIONS[0], 1),
    ...buildDarkOverlayVariants(img, METRICS_GRID_REGIONS[0], 2),
  )

  if (darkTheme) {
    variants.push(
      drawToCanvas(img, width, height, applyDarkModeOcrBoost, 1, 6),
      drawToCanvas(
        img,
        width,
        height,
        (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: true, threshold: 135 }),
        1,
        6,
      ),
    )
  } else {
    variants.push(drawToCanvas(img, width, height, applyDarkModeOcrBoost, 2, 6))
  }

  variants.push(drawToCanvas(img, width, height, (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h), 3))

  variants.sort((a, b) => a.priority - b.priority)
  return variants.slice(0, darkTheme ? 8 : 10)
}

function buildSupplementOcrVariants(
  img: HTMLImageElement,
  width: number,
  height: number,
  darkTheme: boolean,
): OcrImageVariant[] {
  const variants: OcrImageVariant[] = [
    ...buildDarkOverlayVariants(img, WORKOUT_DETAIL_STATS_REGIONS[0], 1),
    ...buildDarkOverlayVariants(img, WORKOUT_DETAIL_STATS_REGIONS[1], 1),
  ]

  if (!darkTheme) {
    variants.push(...buildLightThemeVariants(img, LIGHT_THEME_TOP_REGIONS[1], 1))
  }

  for (const region of WORKOUT_SUMMARY_BOTTOM_REGIONS) {
    variants.push(...buildDarkOverlayVariants(img, region, 2))
  }

  variants.push(
    drawToCanvas(img, width, height, (ctx, w, h) => applyContrastAndGrayscale(ctx, w, h, { invert: true, threshold: 135 }), 2, 6),
    ...buildDarkOverlayVariants(img, RECENT_ACTIVITY_REGIONS[0], 2),
    ...buildDarkOverlayVariants(img, DISTANCE_METRIC_REGIONS[0], 2),
  )

  if (!darkTheme) {
    variants.push(
      drawToCanvas(img, width, height, (ctx, w, h) => applyLightTextOcrBoost(ctx, w, h, 170), 2, 11),
    )
  }

  variants.sort((a, b) => a.priority - b.priority)
  return variants
}

/** 이미지 1회 로드 — 1차·보완 OCR variant 모두 생성 */
export async function prepareScreenshotOcrPipeline(file: File): Promise<ScreenshotOcrPipeline> {
  const img = await loadImageFromFile(file)
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, OCR_FAST_MAX_WIDTH_PX)
  const darkTheme = estimateImageDarkTheme(img)

  return {
    width,
    height,
    originalSize: file.size,
    mimeType: file.type || 'image/jpeg',
    variants: buildFastOcrVariants(img, width, height, darkTheme),
    supplementVariants: buildSupplementOcrVariants(img, width, height, darkTheme),
  }
}

/** @deprecated prepareScreenshotOcrPipeline 사용 */
export async function prepareScreenshotForOcrFast(file: File): Promise<OcrPreprocessResult> {
  const pipeline = await prepareScreenshotOcrPipeline(file)
  return {
    width: pipeline.width,
    height: pipeline.height,
    originalSize: pipeline.originalSize,
    mimeType: pipeline.mimeType,
    variants: pipeline.variants,
  }
}
