const MAX_EDGE_PX = 1600
const JPEG_QUALITY = 0.85
/** 원본이 이보다 크면 압축 시도 */
const COMPRESS_IF_BYTES = 1.5 * 1024 * 1024

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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지 압축에 실패했습니다.'))
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })
}

function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) {
    return { width, height }
  }
  const scale = maxEdge / longest
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

/**
 * 업로드 전 클라이언트 압축 — Vercel 4.5MB 본문 제한·서버리스 안정성.
 * 긴 변 1600px 이하, 필요 시 JPEG 0.85.
 */
export async function prepareScreenshotForUpload(file: File): Promise<File> {
  console.info('[prepare-screenshot-upload] file selected', {
    file_name: file.name,
    mime_type: file.type,
    file_size: file.size,
  })

  if (!file.type.startsWith('image/')) {
    return file
  }

  const needsCompression = file.size > COMPRESS_IF_BYTES
  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch (error) {
    console.warn('[prepare-screenshot-upload] skip compression — decode failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return file
  }

  const needsResize = Math.max(img.naturalWidth, img.naturalHeight) > MAX_EDGE_PX
  if (!needsCompression && !needsResize) {
    console.info('[prepare-screenshot-upload] skip compression — within limits', {
      width: img.naturalWidth,
      height: img.naturalHeight,
      file_size: file.size,
    })
    return file
  }

  const { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, MAX_EDGE_PX)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return file
  }
  ctx.drawImage(img, 0, 0, width, height)

  const outputType = file.type === 'image/png' && !needsCompression ? 'image/png' : 'image/jpeg'
  const quality = outputType === 'image/jpeg' ? JPEG_QUALITY : undefined
  const blob = await canvasToBlob(canvas, outputType, quality ?? JPEG_QUALITY)

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'screenshot'
  const ext = outputType === 'image/jpeg' ? 'jpg' : 'png'
  const compressed = new File([blob], `${baseName}.${ext}`, {
    type: outputType,
    lastModified: Date.now(),
  })

  console.log('[prepare-screenshot-upload] compressed', {
    original_size: file.size,
    compressed_size: compressed.size,
    original_width: img.naturalWidth,
    original_height: img.naturalHeight,
    output_width: width,
    output_height: height,
    mime_type: compressed.type,
  })

  return compressed
}
