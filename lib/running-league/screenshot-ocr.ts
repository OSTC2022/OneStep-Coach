import type { Worker } from 'tesseract.js'

type OcrRegion = {
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
}

const OCR_REGIONS: OcrRegion[] = [
  { xRatio: 0.06, yRatio: 0.22, widthRatio: 0.88, heightRatio: 0.28 },
  { xRatio: 0.06, yRatio: 0.12, widthRatio: 0.88, heightRatio: 0.4 },
]

const TARGET_WIDTH = 420
const MAX_OCR_MS = 2500

let workerPromise: Promise<Worker> | null = null

export function preloadScreenshotOcrWorker(): void {
  void getScreenshotOcrWorker()
}

async function getScreenshotOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: () => undefined,
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: '0123456789.,kmKM ',
      })
      return worker
    })()
  }
  return workerPromise
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('이미지를 처리하지 못했습니다.')
    ctx.drawImage(image, 0, 0)
    return createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function enhanceForOcr(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  let brightnessSum = 0

  for (let i = 0; i < data.length; i += 4) {
    brightnessSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const darkTheme = brightnessSum / (data.length / 4) < 110

  for (let i = 0; i < data.length; i += 4) {
    let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (darkTheme) gray = 255 - gray
    const value = gray > 145 ? 255 : 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

function renderRegion(bitmap: ImageBitmap, region: OcrRegion): HTMLCanvasElement {
  const sx = Math.floor(bitmap.width * region.xRatio)
  const sy = Math.floor(bitmap.height * region.yRatio)
  const sw = Math.max(1, Math.floor(bitmap.width * region.widthRatio))
  const sh = Math.max(1, Math.floor(bitmap.height * region.heightRatio))
  const scale = TARGET_WIDTH / sw
  const targetHeight = Math.max(72, Math.floor(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('이미지를 처리하지 못했습니다.')

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, targetHeight)
  enhanceForOcr(ctx, TARGET_WIDTH, targetHeight)
  return canvas
}

async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getScreenshotOcrWorker()
  const { data } = await worker.recognize(canvas)
  return data.text ?? ''
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('OCR timeout')), ms)
    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

export async function recognizeRunningScreenshotText(
  file: File,
  onPartialText?: (text: string) => string | null,
): Promise<string> {
  const bitmap = await loadImageBitmap(file)

  try {
    const startedAt = Date.now()
    const chunks: string[] = []

    for (const region of OCR_REGIONS) {
      if (Date.now() - startedAt > MAX_OCR_MS) break

      const canvas = renderRegion(bitmap, region)
      const remainingMs = Math.max(400, MAX_OCR_MS - (Date.now() - startedAt))
      const text = await withTimeout(recognizeCanvas(canvas), remainingMs)
      if (!text.trim()) continue

      chunks.push(text)
      const early = onPartialText?.(chunks.join('\n'))
      if (early != null) return chunks.join('\n')
    }

    return chunks.join('\n')
  } finally {
    bitmap.close?.()
  }
}
