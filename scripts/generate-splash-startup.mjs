/**
 * 첫 화면 전용 풀스크린 — 흰 박스/테두리 없음
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
const markPath = path.join(root, 'public/brand-pulse-icon.png')
const outPath = path.join(root, 'public/images/onestep-splash-startup.png')

const markSize = 300
const markTop = Math.round(height * 0.35) - Math.round(markSize / 2)

/** 투명 가장자리 안티앨리어싱(흰 테두리처럼 보이는 것) 제거 */
const mark = await sharp({
  create: {
    width: markSize,
    height: markSize,
    channels: 3,
    background: bgColor,
  },
})
  .composite([
    {
      input: await sharp(markPath)
        .resize(markSize, markSize, { fit: 'contain', background: bgColor })
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
    },
  ])
  .png()
  .toBuffer()

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="38%">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="${markTop + markSize + 120}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff">원스텝</text>
  <text x="50%" y="${markTop + markSize + 186}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="11"
    fill="rgba(255,255,255,0.5)">ONE-STEP TRAINING CENTER</text>
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
