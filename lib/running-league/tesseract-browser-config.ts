import type { WorkerOptions } from 'tesseract.js'

const TESSERACT_PUBLIC_BASE = '/tesseract'

/**
 * 배포 환경에서 blob+CDN 워커가 실패하지 않도록 같은 출처(static) 경로 사용.
 * @see scripts/copy-tesseract-assets.mjs
 */
export function getTesseractBrowserOptions(): Partial<WorkerOptions> {
  if (typeof window === 'undefined') {
    return {
      workerBlobURL: false,
    }
  }

  const origin = window.location.origin
  const base = `${origin}${TESSERACT_PUBLIC_BASE}`

  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core/`,
    workerBlobURL: false,
  }
}
