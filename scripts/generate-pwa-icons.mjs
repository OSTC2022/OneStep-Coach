import sharp from 'sharp'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const iconsDir = path.join(root, 'public/icons')
const appDir = path.join(root, 'app')
const sourceIcon = path.join(root, 'public/brand-pulse-icon.png')

const sizes = [
  { name: 'icon-32.png', size: 32 },
  { name: 'icon-180.png', size: 180 },
  { name: 'apple-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
]

await mkdir(iconsDir, { recursive: true })

for (const { name, size } of sizes) {
  await sharp(sourceIcon).resize(size, size).png().toFile(path.join(iconsDir, name))
}

await copyFile(path.join(iconsDir, 'icon-512.png'), path.join(appDir, 'icon.png'))
await copyFile(path.join(iconsDir, 'apple-icon.png'), path.join(appDir, 'apple-icon.png'))

console.log('Generated PWA icons from brand-pulse-icon.png')
