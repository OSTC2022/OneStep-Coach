import sharp from 'sharp'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')
const brandUiPath = path.join(root, 'public/brand-pulse-icon.png')
const svgPath = path.join(root, 'public/brand-pulse.svg')
const APP_BG = '#070d18'

// 1) UI 아이콘 — SVG 고밀도 렌더 (글로우 포함 OK)
await sharp(svgPath, { density: 512 })
  .resize(1024, 1024, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9 })
  .toFile(brandUiPath)
console.log('Wrote brand-pulse-icon.png')

const master = await sharp(brandUiPath).png().toBuffer()

async function renderHomeIcon(size, scale) {
  const logoSize = Math.round(size * scale)
  const logo = await sharp(master)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
  const left = Math.round((size - logoSize) / 2)
  return sharp({
    create: { width: size, height: size, channels: 3, background: APP_BG },
  })
    .composite([{ input: logo, left, top: left }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

const homeIcons = [
  { name: 'icon-32.png', size: 32, scale: 0.9 },
  { name: 'icon-180.png', size: 180, scale: 0.88 },
  { name: 'apple-icon.png', size: 180, scale: 0.88 },
  { name: 'icon-192.png', size: 192, scale: 0.88 },
  { name: 'icon-512.png', size: 512, scale: 0.88 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.72 },
]

for (const { name, size, scale } of homeIcons) {
  await sharp(await renderHomeIcon(size, scale)).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))
await sharp(await renderHomeIcon(32, 0.9)).toFile(path.join(root, 'public/favicon.ico'))

console.log('Generated crisp icons from high-res master')
