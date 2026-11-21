/**
 * 브랜드 스플래시 마스터 이미지 생성 → generate-pwa-splash.mjs 입력
 */
import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const width = 1290
const height = 2796
const bgColor = '#070d18'
const primary = '#AAFF00'

const iconPath = path.join(root, 'public/brand-pulse-icon.png')
const bgPath = path.join(root, 'public/images/onestep-splash-bg.png')
const outPath = path.join(root, 'public/images/onestep-splash-startup.png')

const iconSize = 220
const iconTop = Math.round(height * 0.36) - Math.round(iconSize / 2)

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="34%" r="48%">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="${iconTop + iconSize + 110}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="92" font-weight="700" fill="#ffffff">원스텝</text>
  <text x="50%" y="${iconTop + iconSize + 168}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="28" font-weight="600" letter-spacing="10"
    fill="rgba(255,255,255,0.58)">ONE-STEP TRAINING CENTER</text>
  <line x1="${width / 2 - 150}" y1="${iconTop + iconSize + 220}" x2="${width / 2 - 48}" y2="${iconTop + iconSize + 220}"
    stroke="${primary}" stroke-opacity="0.7" stroke-width="2"/>
  <line x1="${width / 2 + 48}" y1="${iconTop + iconSize + 220}" x2="${width / 2 + 150}" y2="${iconTop + iconSize + 220}"
    stroke="${primary}" stroke-opacity="0.7" stroke-width="2"/>
  <text x="50%" y="${iconTop + iconSize + 228}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="30" font-weight="500" fill="rgba(255,255,255,0.72)">러닝 &amp; 트레이닝</text>
  <rect x="${width / 2 - 120}" y="${height - 280}" width="240" height="4" rx="2" fill="rgba(255,255,255,0.1)"/>
  <rect x="${width / 2 - 120}" y="${height - 280}" width="110" height="4" rx="2" fill="${primary}"/>
  <text x="50%" y="${height - 230}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="24" font-weight="500" letter-spacing="8"
    fill="rgba(255,255,255,0.55)">시작 준비 중</text>
</svg>`)

const bg = await sharp(bgPath)
  .resize(width, height, { fit: 'cover', position: 'centre' })
  .modulate({ brightness: 0.55 })
  .toBuffer()

const icon = await sharp(iconPath)
  .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const base = await sharp({
  create: {
    width,
    height,
    channels: 3,
    background: bgColor,
  },
})
  .composite([
    { input: bg, blend: 'over', opacity: 0.34 },
    { input: svg, blend: 'over' },
    {
      input: icon,
      left: Math.round((width - iconSize) / 2),
      top: iconTop,
    },
  ])
  .png()
  .toFile(outPath)

console.log(`Wrote ${outPath}`)
void base
