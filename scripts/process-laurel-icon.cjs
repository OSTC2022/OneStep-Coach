const sharp = require('sharp')
const path = require('path')

const src = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-123-Downloads-sports-center-app',
  'assets',
  'pb-laurel-circle.jpg',
)
const outV2 = path.join(__dirname, '..', 'public', 'pb-hall-of-fame-laurel-v2.png')
const outIcon = path.join(__dirname, '..', 'public', 'pb-hall-of-fame-laurel-icon.png')

function isBackgroundPixel(r, g, b) {
  const maxRB = Math.max(r, b)
  const greenStrength = g - maxRB
  if (g > 120 && greenStrength > 26) return true
  if (g > 170 && r < 155 && b < 155 && greenStrength > 16) return true
  if (g > 200 && r < 180 && b < 130) return true
  if (g > r + 10 && g > b + 10 && g > 95 && r < 175 && b < 150) return true
  if (r > 235 && g > 235 && b > 235) return true
  if (r > 220 && g > 220 && b > 220 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    return true
  }
  return false
}

async function main() {
  const { data, info } = await sharp(src)
    .resize(800, 800, {
      fit: 'contain',
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    if (isBackgroundPixel(data[i], data[i + 1], data[i + 2])) {
      data[i + 3] = 0
    }
  }

  // 가로로 눌린 형태 보정: 세로를 조금 더 키운 정사각으로 출력
  const buffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize({
      width: 340,
      height: 360,
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .extend({
      top: 0,
      bottom: 0,
      left: 10,
      right: 10,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(360, 360, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await sharp(buffer).toFile(outV2)
  await sharp(buffer).toFile(outIcon)

  const meta = await sharp(outV2).metadata()
  console.log('saved', outV2, meta.width, 'x', meta.height, 'alpha=', meta.hasAlpha)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
