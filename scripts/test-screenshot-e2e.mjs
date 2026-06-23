/**
 * 스크린샷 OCR + 파싱 E2E — node scripts/test-screenshot-e2e.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const FIXTURES = [
  {
    name: 'apple-fitness',
    file: path.join(root, 'scripts', 'fixtures', 'screenshots', 'apple-fitness.png'),
    expect: { distance_km: 5.46, duration: '1:13:25' },
  },
  {
    name: 'nike-run-club',
    file: path.join(root, 'scripts', 'fixtures', 'screenshots', 'nike-run-club.png'),
    expect: { distance_km: 9.73, duration: '1:01:28' },
  },
]

const CROP_JOBS = [
  { name: 'light-top-14', topRatio: 0.02, heightRatio: 0.14, invert: false },
  { name: 'light-top-36', topRatio: 0.08, heightRatio: 0.36, invert: false },
  { name: 'dark-mid-38', topRatio: 0.14, heightRatio: 0.38, invert: true },
  { name: 'dark-mid-30', topRatio: 0.18, heightRatio: 0.30, invert: true },
  { name: 'full-light', topRatio: 0, heightRatio: 1, invert: false },
  { name: 'full-dark', topRatio: 0, heightRatio: 1, invert: true },
]

async function crop(buffer, width, height, job) {
  const top = Math.floor(height * job.topRatio)
  const h = Math.max(1, Math.floor(height * job.heightRatio))
  let img = sharp(buffer).extract({ left: 0, top, width, height: Math.min(h, height - top) })
  img = img.greyscale().normalize().sharpen()
  if (job.invert) img = img.negate()
  return img.png().toBuffer()
}

function parseExtraction(text) {
  const script = path.join(root, 'scripts', 'parse-screenshot-text.ts')
  const result = spawnSync('npx', ['--yes', 'tsx', script], {
    cwd: root,
    encoding: 'utf8',
    input: text,
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  })
  const lines = (result.stdout || '').trim().split('\n')
  const jsonLine = lines[lines.length - 1]
  if (result.status !== 0 || !jsonLine) {
    throw new Error(result.stderr || result.stdout || 'parse failed')
  }
  return JSON.parse(jsonLine)
}

async function main() {
  const workerPath = path.join(root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')
  const worker = await createWorker('kor+eng', 1, { workerPath, logger: () => undefined })

  let failed = 0

  for (const fixture of FIXTURES) {
    console.log(`\n=== ${fixture.name} ===`)
    const buffer = readFileSync(fixture.file)
    const meta = await sharp(buffer).rotate().metadata()
    const { width = 0, height = 0 } = meta

    const chunks = []
    for (const job of CROP_JOBS) {
      const cropped = await crop(buffer, width, height, job)
      const { data } = await worker.recognize(cropped)
      if (data.text?.trim()) chunks.push(data.text)
    }

    const combined = [...new Set(chunks.join('\n').split('\n').map((l) => l.trim()).filter((l) => l.length >= 2))].join('\n')
    const extraction = parseExtraction(combined)
    console.log('extracted:', extraction)
    console.log('ocr sample:', combined.slice(0, 350).replace(/\n/g, ' | '))

    const distanceOk = extraction.distance_km === fixture.expect.distance_km
    const durationOk = extraction.duration === fixture.expect.duration
    if (!distanceOk || !durationOk) {
      console.error(`FAIL ${fixture.name}`, { distanceOk, durationOk, expect: fixture.expect })
      failed++
    } else {
      console.log(`OK ${fixture.name}`)
    }
  }

  await worker.terminate()
  if (failed > 0) process.exit(1)
  console.log('\nAll E2E tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
