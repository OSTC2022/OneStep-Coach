/**
 * 홈/PWA 아이콘 생성.
 * 원본은 public/brand-pulse-icon.png (하트비트 원스텝 심볼) 고정.
 * SVG density 재렌더는 쓰지 않는다 — 심볼이 뭉개지거나 바뀌는 원인.
 */
import sharp from 'sharp'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/brand-pulse-icon.png')
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')
const APP_BG = '#070d18'

const symbolBuffer = await sharp(source).png().toBuffer()

async function renderHomeIcon(size, logoScale) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(symbolBuffer)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  const left = Math.round((size - logoSize) / 2)
  const top = left

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: APP_BG,
    },
  })
    .composite([{ input: logo, left, top }])
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

console.log('Generated PWA icons from brand-pulse-icon.png (heartbeat symbol preserved)')
