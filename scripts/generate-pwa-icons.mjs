import sharp from 'sharp'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')

const BRAND_BG = '#070d18'
const BRAND_GREEN = '#AAFF00'

/** PWA/홈 화면용 — 로고만, 글자·테두리 없음 (OS 스플래시용) */
function buildLogoSvg(size) {
  const stroke = Math.max(2, Math.round(size * 0.028))
  const r = size * 0.38
  const cx = size / 2
  const cy = size / 2

  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND_GREEN}" stroke-width="${stroke}" opacity="0.95"/>
  <path d="M ${cx - r * 0.72} ${cy} H ${cx - r * 0.42} L ${cx - r * 0.24} ${cy - r * 0.34} L ${cx + r * 0.02} ${cy + r * 0.38} L ${cx + r * 0.22} ${cy - r * 0.18} L ${cx + r * 0.72} ${cy}"
    fill="none" stroke="${BRAND_GREEN}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`)
}

async function renderIcon(canvasSize, logoScale = 0.62) {
  const logoSize = Math.round(canvasSize * logoScale)
  const logo = await sharp(buildLogoSvg(logoSize)).png().toBuffer()

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
}

const sizes = [
  { name: 'icon-32.png', size: 32, logoScale: 0.7 },
  { name: 'icon-180.png', size: 180, logoScale: 0.62 },
  { name: 'apple-icon.png', size: 180, logoScale: 0.62 },
  { name: 'icon-192.png', size: 192, logoScale: 0.62 },
  { name: 'icon-512.png', size: 512, logoScale: 0.62 },
]

await mkdir(iconsDir, { recursive: true })

for (const { name, size, logoScale } of sizes) {
  const buffer = await renderIcon(size, logoScale)
  await sharp(buffer).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))

console.log('Generated clean PWA icons (logo only, no text frame)')
