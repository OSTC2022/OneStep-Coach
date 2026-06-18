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

/** Home-screen / PWA icon canvas */
const APP_BG = '#070d18'

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

const symbolBuffer = await sharp(final).png().toBuffer()
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')

async function renderHomeIcon(size, logoScale) {
  const logoSize = Math.round(size * logoScale)
  const logo = await sharp(symbolBuffer)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()

  const top = Math.round((size - logoSize) / 2) + Math.max(1, Math.round(size * 0.04))
  const left = Math.round((size - logoSize) / 2)

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: APP_BG,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toBuffer()
}

const homeIcons = [
  { name: 'icon-32.png', size: 32, scale: 0.88 },
  { name: 'icon-180.png', size: 180, scale: 0.86 },
  { name: 'apple-icon.png', size: 180, scale: 0.86 },
  { name: 'icon-192.png', size: 192, scale: 0.86 },
  { name: 'icon-512.png', size: 512, scale: 0.86 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.72 },
]

for (const { name, size, scale } of homeIcons) {
  const buffer = await renderHomeIcon(size, scale)
  await sharp(buffer).toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))

// favicon.ico for desktop browser tabs
await sharp(await renderHomeIcon(32, 0.88)).toFile(path.join(root, 'public/favicon.ico'))

console.log('Generated home-screen / PWA icons')
