import sharp from 'sharp'
import { copyFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/brand-pulse-icon.png')
const output = path.join(root, 'public/brand-pulse-icon.clean.png')
const final = path.join(root, 'public/brand-pulse-icon.png')

/** UI asset — transparent outside squircle */
const BOX = { r: 26, g: 35, b: 26 } // #1a231a
const NEON = { r: 170, g: 255, b: 0 } // #AAFF00

/** Android/iOS 스플래시·홈 아이콘 배경 (매니페스트 background_color와 동일) */
const APP_BG = '#070d18'
const PULSE_GREEN = '#AAFF00'

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function insideRoundRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false

  if (x < left + radius && y < top + radius) {
    const dx = x - (left + radius)
    const dy = y - (top + radius)
    return dx * dx + dy * dy <= radius * radius
  }
  if (x > right - radius && y < top + radius) {
    const dx = x - (right - radius)
    const dy = y - (top + radius)
    return dx * dx + dy * dy <= radius * radius
  }
  if (x < left + radius && y > bottom - radius) {
    const dx = x - (left + radius)
    const dy = y - (bottom - radius)
    return dx * dx + dy * dy <= radius * radius
  }
  if (x > right - radius && y > bottom - radius) {
    const dx = x - (right - radius)
    const dy = y - (bottom - radius)
    return dx * dx + dy * dy <= radius * radius
  }

  return true
}

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({
  resolveWithObject: true,
})

const w = info.width
const h = info.height
const inset = Math.round(w * 0.075)
const radius = Math.round(w * 0.215)
const left = inset
const top = inset
const right = w - inset - 1
const bottom = h - inset - 1

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const l = lum(r, g, b)
    const inBox = insideRoundRect(x, y, left, top, right, bottom, radius)

    if (!inBox || l < 28) {
      data[i + 3] = 0
      continue
    }

    if (g > 90 && g > r && g > b && g - Math.min(r, b) > 35) {
      data[i] = NEON.r
      data[i + 1] = NEON.g
      data[i + 2] = NEON.b
      data[i + 3] = 255
      continue
    }

    data[i] = BOX.r
    data[i + 1] = BOX.g
    data[i + 2] = BOX.b
    data[i + 3] = 255
  }
}

await sharp(data, {
  raw: { width: w, height: h, channels: 4 },
})
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(output)

await unlink(final).catch(() => {})
await rename(output, final)

console.log('Cleaned brand-pulse-icon.png')

const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')

/**
 * 풀블리드 #070d18 + 펄스.
 * Android 기본 스플래시가 아이콘을 흰 칸에 넣어도
 * 안쪽에 또 다른 사각 박스가 보이지 않게 한다.
 */
function buildPulseIconSvg(size, symbolScale) {
  const symbolSize = Math.round(size * symbolScale)
  const offset = (size - symbolSize) / 2
  const stroke = Math.max(1.8, (24 * symbolScale * size) / size / 12 + size * 0.0055)

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${APP_BG}"/>
  <defs>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${Math.max(2, size * 0.012)}" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#glow)" transform="translate(${offset} ${offset})">
    <svg width="${symbolSize}" height="${symbolSize}" viewBox="0 0 24 24">
      <path d="M3 12A9 9 0 0112 3A9 9 0 0121 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12A9 9 0 0012 21A9 9 0 0021 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12H6.25L7.1 6L8.65 12L12 18.5L15.35 9.5L16.9 12H21" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
    </svg>
  </g>
</svg>`)
}

async function renderHomeIcon(size, symbolScale) {
  return sharp(buildPulseIconSvg(size, symbolScale)).png().toBuffer()
}

const homeIcons = [
  { name: 'icon-32.png', size: 32, scale: 0.78 },
  { name: 'icon-180.png', size: 180, scale: 0.68 },
  { name: 'apple-icon.png', size: 180, scale: 0.68 },
  { name: 'icon-192.png', size: 192, scale: 0.68 },
  { name: 'icon-512.png', size: 512, scale: 0.64 },
  // maskable 안전영역(중앙 ~80%) 안에 심볼
  { name: 'icon-512-maskable.png', size: 512, scale: 0.52 },
]

for (const { name, size, scale } of homeIcons) {
  const buffer = await renderHomeIcon(size, scale)
  await sharp(buffer).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))
await sharp(await renderHomeIcon(32, 0.78)).toFile(path.join(root, 'public/favicon.ico'))

console.log('Generated home-screen / PWA icons (splash-safe full-bleed)')
