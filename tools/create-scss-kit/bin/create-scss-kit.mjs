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
    responsive: {
      mobileProfilePreset: 'auto',
      mobileClampMode: 'auto',
      smallMobileThreshold: 400,
      dualClampMinWidth: 500,
      dualClampMaxWidth: 600,
    },
    paths: {
      scssSrcDir: 'src/styles',
      cssOutDir: 'assets',
    },
    autofill: {
      function: 'r.resp',
      vwFunction: 'r.vw',
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
        h1: 0.52,
        h2: 0.55,
        h3: 0.55,
        h4: 0.6,
        h5: 0.6,
        h6: 0.6,
        body: 0.6,
        small: 0.65,
        quote: 0.55,
        'button-text': 0.6,
        'nav-link': 0.6,
        'form-label': 0.6,
        'form-input': 0.6,
        'price-large': 0.5,
        'price-small': 0.6,
        badge: 0.65,
        breadcrumb: 0.65,
      },
      desktop: {
        h1: 0.58,
        h2: 0.6,
        h3: 0.6,
        h4: 0.6,
        h5: 0.65,
        h6: 0.65,
        body: 0.65,
        small: 0.65,
        quote: 0.6,
        'button-text': 0.65,
        'nav-link': 0.65,
        'form-label': 0.65,
        'form-input': 0.65,
        'price-large': 0.55,
        'price-small': 0.65,
        badge: 0.7,
        breadcrumb: 0.7,
      },
    },
    maxCoefficients: {
      mobile: {
        h1: 1.5,
        h2: 1.5,
        h3: 1.5,
        h4: 1.5,
        body: 1.3,
        small: 1.3,
        'button-text': 1.25,
        'form-input': 1.25,
        'price-large': 1.4,
        badge: 1.3,
      },
      desktop: {},
    },
    floors: {
      mobile: {
        h1: '24px',
        h2: '20px',
        h3: '18px',
        h4: '16px',
        h5: '14px',
        h6: '14px',
        body: '14px',
        small: '12px',
        quote: '14px',
        'button-text': '14px',
        'nav-link': '14px',
        'form-label': '14px',
        'form-input': '16px',
        'price-large': '22px',
        'price-small': '14px',
        badge: '11px',
        breadcrumb: '11px',
      },
      desktop: {
        h1: '28px',
        h2: '22px',
        h3: '18px',
        h4: '16px',
        h5: '14px',
        h6: '14px',
        body: '14px',
        small: '12px',
        quote: '16px',
        'button-text': '14px',
        'nav-link': '14px',
        'form-label': '14px',
        'form-input': '14px',
        'price-large': '24px',
        'price-small': '14px',
        badge: '12px',
        breadcrumb: '12px',
      },
    },
    ceilings: {
      mobile: {
        h1: '48px',
        h2: '42px',
        h3: '36px',
        h4: '30px',
        body: '18px',
        small: '16px',
        'button-text': '20px',
        'form-input': '20px',
        'price-large': '40px',
        badge: '14px',
      },
      desktop: {},
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
