/**
 * 스크린샷 OCR fixture 검증 — node scripts/test-screenshot-fixtures.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const FIXTURES = [
  {
    name: 'apple-fitness',
    file: path.join(root, 'scripts', 'fixtures', 'screenshots', 'apple-fitness.png'),
    expect: { distance_km: 5.46, duration: '1:13:25', pace_min: 13, pace_sec: 26 },
  },
  {
    name: 'nike-run-club',
    file: path.join(root, 'scripts', 'fixtures', 'screenshots', 'nike-run-club.png'),
    expect: { distance_km: 9.73, duration: '1:01:28', pace_min: 6, pace_sec: 19 },
  },
]

const CROP_BANDS = [
  { name: 'top-14', topRatio: 0.02, heightRatio: 0.14 },
  { name: 'top-35', topRatio: 0.10, heightRatio: 0.35 },
  { name: 'mid-20-48', topRatio: 0.18, heightRatio: 0.32 },
  { name: 'mid-22-42', topRatio: 0.20, heightRatio: 0.28 },
  { name: 'bottom-58', topRatio: 0.58, heightRatio: 0.28 },
]

async function cropBand(buffer, band, width, height) {
  const top = Math.floor(height * band.topRatio)
  const h = Math.max(1, Math.floor(height * band.heightRatio))
  return sharp(buffer)
    .extract({ left: 0, top, width, height: Math.min(h, height - top) })
    .greyscale()
    .negate()
    .normalize()
    .sharpen()
    .png()
    .toBuffer()
}

async function recognize(worker, buffer) {
  const { data } = await worker.recognize(buffer)
  return data.text ?? ''
}

function scoreText(text, expect) {
  let score = 0
  const n = text.replace(/\s+/g, ' ')
  if (String(expect.distance_km).replace('.', '[.,]') && new RegExp(String(expect.distance_km).replace('.', '[.,]')).test(n)) score += 4
  if (n.includes(expect.duration.replace(/:/g, '\\s*:\\s*')) || n.includes(expect.duration)) score += 3
  if (new RegExp(`${expect.pace_min}\\s*['\`′:]\\s*${expect.pace_sec}`).test(n)) score += 3
  return score
}

async function main() {
  const workerPath = path.join(root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js')
  const worker = await createWorker('kor+eng', 1, { workerPath, logger: () => undefined })

  for (const fixture of FIXTURES) {
    console.log(`\n=== ${fixture.name} ===`)
    const buffer = readFileSync(fixture.file)
    const meta = await sharp(buffer).rotate().metadata()
    const { width = 0, height = 0 } = meta
    console.log(`size: ${width}x${height}`)

    const chunks = []
    let bestScore = 0
    let bestBand = ''

    for (const band of CROP_BANDS) {
      const cropped = await cropBand(buffer, band, width, height)
      const text = await recognize(worker, cropped)
      const score = scoreText(text, fixture.expect)
      console.log(`[${band.name}] score=${score}`)
      if (text.trim()) console.log(text.slice(0, 400).replace(/\n/g, ' | '))
      if (score > bestScore) {
        bestScore = score
        bestBand = band.name
      }
      if (text.trim()) chunks.push(text)
    }

    const fullGrey = await sharp(buffer).rotate().greyscale().negate().normalize().sharpen().png().toBuffer()
    const fullText = await recognize(worker, fullGrey)
    const fullScore = scoreText(fullText, fixture.expect)
    console.log(`[full-invert] score=${fullScore}`)
    if (fullText.trim()) console.log(fullText.slice(0, 500).replace(/\n/g, ' | '))

    console.log(`best band: ${bestBand} score=${bestScore} (need >=7)`)
    if (bestScore < 7 && fullScore < 7) {
      console.error(`FAIL ${fixture.name}`)
      process.exitCode = 1
    }
  }

  await worker.terminate()
  console.log('\nDone')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
