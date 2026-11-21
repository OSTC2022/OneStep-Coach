/**
 * iOS PWA 시작 이미지 — 풀블리드 다크 + 펄스 (이중 박스/흰 테두리 느낌 제거)
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
const outPath = path.join(root, 'public/images/onestep-splash-startup.png')

const iconSize = 260
const iconTop = Math.round(height * 0.38) - Math.round(iconSize / 2)
const stroke = 2.1

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <defs>
    <radialGradient id="g" cx="50%" cy="36%" r="42%">
      <stop offset="0%" stop-color="${primary}" stop-opacity="0.2"/>
      <stop offset="55%" stop-color="${primary}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <g transform="translate(${(width - iconSize) / 2} ${iconTop})">
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24">
      <path d="M3 12A9 9 0 0112 3A9 9 0 0121 12" fill="none" stroke="${primary}" stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12A9 9 0 0012 21A9 9 0 0021 12" fill="none" stroke="${primary}" stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M3 12H6.25L7.1 6L8.65 12L12 18.5L15.35 9.5L16.9 12H21" fill="none" stroke="${primary}" stroke-width="${stroke}" stroke-linecap="butt" stroke-linejoin="miter"/>
    </svg>
  </g>
  <text x="50%" y="${iconTop + iconSize + 120}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff">원스텝</text>
  <text x="50%" y="${iconTop + iconSize + 186}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="12"
    fill="rgba(255,255,255,0.55)">ONE-STEP TRAINING CENTER</text>
</svg>`)

await sharp(svg).png().toFile(outPath)
console.log(`Wrote ${outPath}`)
