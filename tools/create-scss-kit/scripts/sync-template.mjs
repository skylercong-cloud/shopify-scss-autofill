import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function copyDirRecursive(srcDir, dstDir) {
  ensureDir(dstDir)
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const ent of entries) {
    const srcAbs = path.join(srcDir, ent.name)
    const dstAbs = path.join(dstDir, ent.name)

    if (ent.isDirectory()) {
      copyDirRecursive(srcAbs, dstAbs)
      continue
    }

    if (!ent.isFile()) continue

    ensureDir(path.dirname(dstAbs))
    fs.copyFileSync(srcAbs, dstAbs)
  }
}

function removeDirContents(dirPath) {
  if (!exists(dirPath)) return
  const entries = fs.readdirSync(dirPath)
  for (const name of entries) {
    fs.rmSync(path.join(dirPath, name), { recursive: true, force: true })
  }
}

function main() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  // tools/create-scss-kit/scripts -> tools/create-scss-kit
  const packageRoot = path.resolve(__dirname, '..')

  // Monorepo source-of-truth: tools/scss-kit
  const repoRoot = path.resolve(packageRoot, '..', '..')
  const sourceDir = path.join(repoRoot, 'tools', 'scss-kit')
  const targetDir = path.join(packageRoot, 'template', 'tools', 'scss-kit')

  if (!exists(sourceDir)) {
    console.error(`[sync-template] missing source: ${sourceDir}`)
    process.exit(1)
  }

  ensureDir(targetDir)
  removeDirContents(targetDir)
  copyDirRecursive(sourceDir, targetDir)

  console.log(
    '[sync-template] synced tools/scss-kit -> template/tools/scss-kit'
  )
}

main()
