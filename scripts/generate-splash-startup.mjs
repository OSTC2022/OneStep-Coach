/**
 * PC HTML 스플래시와 동일한 구성의 iOS/모바일 시작 이미지
 * (스쿼클 마크 + 원스텝 + ONE-STEP TRAINING CENTER, 흰 박스 없음)
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
const svgPath = path.join(root, 'public/brand-pulse.svg')
const outPath = path.join(root, 'public/images/onestep-splash-startup.png')

const markSize = 320
const markTop = Math.round(height * 0.34) - Math.round(markSize / 2)

const markRaw = await sharp(svgPath, { density: 512 })
  .resize(markSize, markSize, {
    fit: 'contain',
    background: { r: 7, g: 13, b: 24, alpha: 0 },
    kernel: sharp.kernel.lanczos3,
  })
  .png()
  .toBuffer()

/** 투명 가장자리 안티앨리어싱(흰 테두리) 제거 */
const mark = await sharp({
  create: {
    width: markSize,
    height: markSize,
    channels: 3,
    background: bgColor,
  },
})
  .composite([{ input: markRaw, left: 0, top: 0 }])
  .png()
  .toBuffer()

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="34%" r="40%">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="${markTop + markSize + 128}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="100" font-weight="700" fill="#ffffff">원스텝</text>
  <text x="50%" y="${markTop + markSize + 196}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="28" font-weight="600" letter-spacing="12"
    fill="rgba(255,255,255,0.52)">ONE-STEP TRAINING CENTER</text>
</svg>`)

await sharp(svg)
  .composite([
    {
      input: mark,
      left: Math.round((width - markSize) / 2),
      top: markTop,
    },
  ])
  .png()
  .toFile(outPath)

console.log(`Wrote ${outPath}`)
