import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/images/onestep-splash-startup.png')
const outDir = path.join(root, 'public/images/splash')

/** width x height (portrait pixels) */
const SPLASH_SIZES = {
  iphone5_splash: { width: 640, height: 1136 },
  iphone6_splash: { width: 750, height: 1334 },
  iphoneplus_splash: { width: 1242, height: 2208 },
  iphonex_splash: { width: 1125, height: 2436 },
  iphonexr_splash: { width: 828, height: 1792 },
  iphonexsmax_splash: { width: 1242, height: 2688 },
  iphone12_splash: { width: 1170, height: 2532 },
  iphone12max_splash: { width: 1284, height: 2778 },
  iphone14pro_splash: { width: 1179, height: 2556 },
  iphone14promax_splash: { width: 1290, height: 2796 },
  iphone16pro_splash: { width: 1206, height: 2622 },
  iphone16promax_splash: { width: 1320, height: 2868 },
}

await mkdir(outDir, { recursive: true })

for (const [name, { width, height }] of Object.entries(SPLASH_SIZES)) {
  await sharp(source)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(path.join(outDir, `${name}.png`))
  console.log(`Generated ${name}.png (${width}x${height})`)
}

console.log('Done — iOS PWA splash screens in public/images/splash/')
