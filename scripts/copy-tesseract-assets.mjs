/**
 * Tesseract.js 워커·WASM을 public/ 에 복사 — Vercel 등 배포 환경에서 CDN/blob 워커 실패 방지
 * 실행: node scripts/copy-tesseract-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'tesseract')
const coreDir = path.join(outDir, 'core')

const workerSrc = path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js')
const corePkg = path.join(root, 'node_modules', 'tesseract.js-core')

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('[copy-tesseract-assets] missing:', src)
    return false
  }
  fs.copyFileSync(src, dest)
  return true
}

fs.mkdirSync(coreDir, { recursive: true })

if (!copyIfExists(workerSrc, path.join(outDir, 'worker.min.js'))) {
  console.error('[copy-tesseract-assets] tesseract.js worker not found — run npm install')
  process.exit(1)
}

let coreCount = 0
for (const name of fs.readdirSync(corePkg)) {
  if (!name.startsWith('tesseract-core')) continue
  if (!name.endsWith('.js') && !name.endsWith('.wasm')) continue
  copyIfExists(path.join(corePkg, name), path.join(coreDir, name))
  coreCount += 1
}

if (coreCount === 0) {
  console.error('[copy-tesseract-assets] no tesseract-core files copied')
  process.exit(1)
}

console.log('[copy-tesseract-assets] OK', {
  worker: 'public/tesseract/worker.min.js',
  core_files: coreCount,
})
