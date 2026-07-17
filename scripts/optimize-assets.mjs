import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const publicDir = path.join(root, 'public')
const sourceDir = path.join(root, 'source-assets')

async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true })
}

async function convertImage(input, output, width, quality = 78) {
  await ensureDirectory(path.dirname(output))
  await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, alphaQuality: 90, effort: 5, smartSubsample: true })
    .toFile(output)
}

async function convertLosslessImage(input, output, width) {
  await ensureDirectory(path.dirname(output))
  await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ lossless: true, effort: 6 })
    .toFile(output)
}

async function runPool(tasks, concurrency = 6) {
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      await task()
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

const imageSourceDir = path.join(sourceDir, 'images')
const imageDir = path.join(publicDir, 'images')
await Promise.all([
  convertLosslessImage(
    path.join(imageSourceDir, 'cabin-windows.png'),
    path.join(imageDir, 'cabin-windows-desktop-v2.webp'),
    3840
  ),
  convertLosslessImage(
    path.join(imageSourceDir, 'cabin-windows.png'),
    path.join(imageDir, 'cabin-windows-mobile-v2.webp'),
    2400
  ),
  convertImage(
    path.join(imageSourceDir, 'awan (1).png'),
    path.join(imageDir, 'cloud-1.webp'),
    1600,
    80
  ),
  convertImage(
    path.join(imageSourceDir, 'awan (2).png'),
    path.join(imageDir, 'cloud-2.webp'),
    1600,
    80
  ),
  convertImage(
    path.join(imageSourceDir, 'fisherman.png'),
    path.join(imageDir, 'fisherman.webp'),
    2048,
    82
  )
])

const sourceFrames = path.join(sourceDir, 'frames', 'hero')
const desktopFrames = path.join(publicDir, 'frames', 'hero-desktop')
const mobileFrames = path.join(publicDir, 'frames', 'hero-mobile')
await Promise.all([ensureDirectory(desktopFrames), ensureDirectory(mobileFrames)])

const frameNames = (await readdir(sourceFrames))
  .filter(name => /^frame_\d{4}\.jpg$/i.test(name))
  .sort()

const frameTasks = frameNames.flatMap(name => {
  const input = path.join(sourceFrames, name)
  const webpName = name.replace(/\.jpg$/i, '.webp')
  return [
    () => convertImage(input, path.join(desktopFrames, webpName), 1600, 74),
    () => convertImage(input, path.join(mobileFrames, webpName), 1080, 70)
  ]
})

await runPool(frameTasks)
console.log(`Optimized ${frameNames.length} sequence frames and 5 storytelling images.`)
