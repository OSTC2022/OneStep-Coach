import sharp from 'sharp'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')
const brandUiPath = path.join(root, 'public/brand-pulse-icon.png')

const APP_BG = '#070d18'
const PULSE_GREEN = '#AAFF00'
const BOX_INNER = '#1a231a'
const BOX_OUTER = '#101410'

/** UI용 — 투명 밖 + 스쿼클 (인앱 BrandPulseAppIcon) */
function buildUiSquircleSvg(size) {
  const radius = Math.round(size * 0.22)
  const inset = Math.round(size * 0.08)
  const inner = size - inset * 2
  const symbol = Math.round(inner * 0.72)
  const symbolOffset = inset + Math.round((inner - symbol) / 2)
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${BOX_INNER}"/>
      <stop offset="100%" stop-color="${BOX_OUTER}"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${Math.max(1.2, size * 0.008)}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${radius}" fill="url(#bg)"/>
  <g filter="url(#glow)" transform="translate(${symbolOffset} ${symbolOffset})">
    <svg width="${symbol}" height="${symbol}" viewBox="0 0 24 24">
      <path d="M3 12A9 9 0 0112 3A9 9 0 0121 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12A9 9 0 0012 21A9 9 0 0021 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12H6.25L7.1 6L8.65 12L12 18.5L15.35 9.5L16.9 12H21" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
    </svg>
  </g>
</svg>`)
}

/** 홈 화면 아이콘 — 다크 캔버스 위 스쿼클 (예전 앱 아이콘 느낌) */
function buildHomeIconSvg(size, logoScale) {
  const logoSize = Math.round(size * logoScale)
  const left = Math.round((size - logoSize) / 2)
  const top = left + Math.max(1, Math.round(size * 0.02))
  const radius = Math.round(logoSize * 0.22)
  const symbol = Math.round(logoSize * 0.58)
  const symbolOffset = Math.round((logoSize - symbol) / 2)

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${APP_BG}"/>
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${BOX_INNER}"/>
      <stop offset="100%" stop-color="${BOX_OUTER}"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${Math.max(1.5, size * 0.01)}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g transform="translate(${left} ${top})">
    <rect width="${logoSize}" height="${logoSize}" rx="${radius}" fill="url(#bg)"/>
    <g filter="url(#glow)" transform="translate(${symbolOffset} ${symbolOffset})">
      <svg width="${symbol}" height="${symbol}" viewBox="0 0 24 24">
        <path d="M3 12A9 9 0 0112 3A9 9 0 0121 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
        <path d="M3 12A9 9 0 0012 21A9 9 0 0021 12" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
        <path d="M3 12H6.25L7.1 6L8.65 12L12 18.5L15.35 9.5L16.9 12H21" fill="none" stroke="${PULSE_GREEN}" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter"/>
      </svg>
    </g>
  </g>
</svg>`)
}

async function renderHomeIcon(size, scale) {
  return sharp(buildHomeIconSvg(size, scale)).png().toBuffer()
}

await sharp(buildUiSquircleSvg(1024))
  .png()
  .toFile(brandUiPath)

console.log('Wrote brand-pulse-icon.png (UI squircle)')

const homeIcons = [
  { name: 'icon-32.png', size: 32, scale: 0.88 },
  { name: 'icon-180.png', size: 180, scale: 0.86 },
  { name: 'apple-icon.png', size: 180, scale: 0.86 },
  { name: 'icon-192.png', size: 192, scale: 0.86 },
  { name: 'icon-512.png', size: 512, scale: 0.86 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.72 },
]

for (const { name, size, scale } of homeIcons) {
  await sharp(await renderHomeIcon(size, scale)).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))
await sharp(await renderHomeIcon(32, 0.88)).toFile(path.join(root, 'public/favicon.ico'))

console.log('Generated home-screen / PWA icons (restored squircle app icon)')
