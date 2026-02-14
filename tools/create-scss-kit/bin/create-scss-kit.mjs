#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

function toPosix(p) {
  return p.replaceAll('\\\\', '/').replaceAll('\\', '/')
}

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

function copyDirRecursive(srcDir, dstDir, { force } = {}) {
  ensureDir(dstDir)
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const ent of entries) {
    const srcAbs = path.join(srcDir, ent.name)
    const dstAbs = path.join(dstDir, ent.name)

    if (ent.isDirectory()) {
      copyDirRecursive(srcAbs, dstAbs, { force })
      continue
    }

    if (!ent.isFile()) continue

    if (exists(dstAbs) && !force) continue

    ensureDir(path.dirname(dstAbs))
    fs.copyFileSync(srcAbs, dstAbs)
  }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p))
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function runInDir(cwd, cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd,
    shell: process.platform === 'win32',
  })
  return typeof result.status === 'number' ? result.status : 1
}

function parseArgs(argv) {
  const out = {
    targetDir: '.',
    install: true,
    force: false,
  }

  const rest = []
  for (const a of argv) {
    if (a === '--no-install') out.install = false
    else if (a === '--install') out.install = true
    else if (a === '--force') out.force = true
    else rest.push(a)
  }

  if (rest[0]) out.targetDir = rest[0]
  return out
}

function makeDefaultConfig() {
  return {
    $schema: './tools/scss-kit/schema.json',
    design: {
      desktopWidth: 1920,
      mobileWidth: 750,
      note: '设计稿尺寸：PC(1920) + Mobile(750)。mobileMinWidth(如375)由系数表间接兜底。',
    },
    paths: {
      scssSrcDir: 'src/styles',
      cssOutDir: 'assets',
    },
    autofill: {
      function: 'r.resp',
      mobileMax: 850,
      scanDirs: ['src/styles'],
      output: 'src/styles/_responsive-autofill.generated.scss',
      entries: [],
    },
    themeKit: {
      env: 'development',
      configYml: 'config.yml',
      ignoreFiles: [
        'src/**',
        'node_modules/**',
        'package.json',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'vite.config.*',
        'tsconfig.*',
        'README.md',
      ],
    },
    coefficients: {
      mobile: {
        h1: 0.5,
        h2: 0.625,
        h3: 0.75,
        body: 0.857,
        small: 1,
        'section-gap': 0.5,
        'card-gap': 0.6,
        'element-gap': 0.75,
        'button-text': 1,
        icon: 0.67,
      },
      desktop: {
        h1: 0.625,
        h2: 0.67,
        h3: 0.75,
        body: 0.875,
        small: 1,
        'section-gap': 0.5,
        'card-gap': 0.6,
        'element-gap': 0.67,
        'button-text': 1,
        icon: 0.625,
      },
    },
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const packageRoot = path.resolve(__dirname, '..')
  const templateScssKitDir = path.join(
    packageRoot,
    'template',
    'tools',
    'scss-kit'
  )
  const targetDir = path.resolve(process.cwd(), args.targetDir)

  if (!exists(templateScssKitDir)) {
    console.error(
      `[create-scss-kit] template not found: ${toPosix(
        path.relative(process.cwd(), templateScssKitDir)
      )}`
    )
    process.exit(1)
  }

  ensureDir(targetDir)

  // Ensure a minimal package.json exists so `cli.mjs init` can patch it.
  const pkgPath = path.join(targetDir, 'package.json')
  if (!exists(pkgPath)) {
    const name = path.basename(targetDir)
    writeJson(pkgPath, {
      name,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {},
      devDependencies: {},
    })
    console.log('[create-scss-kit] created package.json')
  }

  // Copy scss-kit tool files.
  const dstScssKitDir = path.join(targetDir, 'tools', 'scss-kit')
  if (exists(dstScssKitDir) && !args.force) {
    console.log(
      '[create-scss-kit] tools/scss-kit already exists; use --force to overwrite'
    )
  } else {
    copyDirRecursive(templateScssKitDir, dstScssKitDir, { force: args.force })
    console.log('[create-scss-kit] copied tools/scss-kit')
  }

  // Write scss-kit.config.json if missing.
  const cfgPath = path.join(targetDir, 'scss-kit.config.json')
  if (exists(cfgPath) && !args.force) {
    console.log(
      '[create-scss-kit] scss-kit.config.json already exists; use --force to overwrite'
    )
  } else {
    writeJson(cfgPath, makeDefaultConfig())
    console.log('[create-scss-kit] wrote scss-kit.config.json')
  }

  // Run init (safe patching + generate responsive helpers + config.yml template).
  const initCode = runInDir(targetDir, 'node', [
    path.join('tools', 'scss-kit', 'cli.mjs'),
    'init',
  ])
  if (initCode !== 0) process.exit(initCode)

  if (args.install) {
    const installCode = runInDir(targetDir, 'npm', ['install'])
    if (installCode !== 0) process.exit(installCode)
  }

  console.log('\n[create-scss-kit] done.')
  console.log('Next:')
  console.log('  1) Fill config.yml placeholders (password/theme_id/store)')
  console.log('  2) Run: npm run dev:theme:auto')
}

main()
