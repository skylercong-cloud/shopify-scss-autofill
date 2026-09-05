import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const cliPath = path.join(repoRoot, 'tools', 'scss-kit', 'cli.mjs')

function baseConfig() {
  return {
    design: { desktopWidth: 1920, mobileWidth: 750 },
    fixedCore: null,
    paths: { scssSrcDir: 'src/styles', cssOutDir: 'assets' },
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
      ignoreFiles: [],
    },
    coefficients: {
      readable: { min: 0.625, max: 1.5 },
      dense: { min: 0.5, max: 1.5 },
    },
  }
}

function projectWith(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scss-kit-cli-'))
  const config = {
    ...baseConfig(),
    ...overrides,
  }
  fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'scss-kit.config.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  )
  return { root, config }
}

function runCli(root, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

function writeEntry(root, content, name = 'page.scss') {
  const file = path.join(root, 'src', 'styles', name)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function readGenerated(root, name = '_responsive.scss') {
  return fs.readFileSync(path.join(root, 'src', 'styles', name), 'utf8')
}

test('generate fills default readable and dense profiles when omitted', () => {
  const { root } = projectWith({ coefficients: undefined })
  const result = runCli(root, 'generate')

  assert.equal(result.status, 0, result.stderr)
  const output = readGenerated(root)
  assert.match(output, /\$profile-readable:/)
  assert.match(output, /min: 0\.625/)
  assert.match(output, /\$profile-dense:/)
  assert.match(output, /min: 0\.5/)
  assert.doesNotMatch(output, /\$floor-|\$ceiling-|\$max-coef|MOBILE_PROFILE/)
})
test('legacy responsive coefficient fields fail with a migration error', () => {
  const legacyConfigs = [
    { maxCoefficients: {} },
    { floors: {} },
    { ceilings: {} },
    { coefficients: { mobile: {}, desktop: {} } },
    { responsive: { mobileProfilePreset: 'auto' } },
    { coefficients: { readable: { h1: 0.6 }, dense: { min: 0.5, max: 1.5 } } },
  ]

  for (const legacy of legacyConfigs) {
    const { root } = projectWith(legacy)
    const result = runCli(root, 'generate')
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr + result.stdout,
      /Legacy responsive coefficient config detected/
    )
  }
})
test('fixedCore emits a desktop unit override in generated autofill output', () => {
  const { root } = projectWith({
    fixedCore: { breakpoint: 1500, width: 1200 },
    autofill: {
      ...baseConfig().autofill,
      entries: [{ file: 'src/styles/page.scss', varScope: '.autumn-sale-2026' }],
    },
  })
  writeEntry(root, 'a { font-size: r.resp(24px, 16px); }')

  const result = runCli(root, 'responsive:generate:entries', '--force')
  assert.equal(result.status, 0, result.stderr)
  const output = fs.readFileSync(
    path.join(root, 'src', 'styles', '_responsive-autofill.page.generated.scss'),
    'utf8'
  )
  assert.match(output, /@media screen and \(min-width: 1500px\)/)
  assert.match(output, /\.autumn-sale-2026 \{[\s\S]*--px-to-vw: 1px;/)
  assert.match(output, /--r-min-coef: 0\.625;/)
})

test('autofill preserves optional profile forms and supports two-argument resp', () => {
  const { root } = projectWith()
  const source = `
@use "./responsive" as r;

.default {
  font-size: r.resp(24px, 16px);
}

.dense {
  font-size: r.resp(24px, 16px, dense);
}

.split {
  font-size: r.resp(24px, 16px, readable, dense);
}

.number {
  font-size: r.resp(24px, 16px, 0.7);
}

.map {
  font-size: r.resp(24px, 16px, (min: 0.7, max: 1.3));
}
`
  writeEntry(root, source)

  const result = runCli(root, 'responsive:generate', 'src/styles/page.scss')
  assert.equal(result.status, 0, result.stderr)
  const output = fs.readFileSync(
    path.join(root, 'src', 'styles', '_responsive-autofill.page.generated.scss'),
    'utf8'
  )
  assert.match(output, /r\.resp_mb\(16px\)/)
  assert.match(output, /r\.resp_mb\(16px, dense\)/)
  assert.match(output, /r\.resp_mb\(16px, \(min: 0\.7, max: 1\.3\)\)/)
  assert.doesNotMatch(output, /r\.resp_mb\(16px, readable, dense\)/)
})

test('generated runtime supports inherited mode and explicit child overrides', () => {
  const { root } = projectWith()
  writeEntry(
    root,
    `
@use "./responsive" as r;

.card {
  @include r.mode(dense);
  padding: r.resp(32px, 20px);
  .title { font-size: r.resp(24px, 16px); }
  .description { font-size: r.resp(20px, 14px, readable); }
  .price { font-size: r.resp(20px, 14px, (min: 0.55, max: 1.4)); }
}
`
  )

  assert.equal(runCli(root, 'generate').status, 0)
  assert.equal(
    runCli(root, 'responsive:generate', 'src/styles/page.scss').status,
    0
  )
  const runtime = readGenerated(root)
  assert.match(runtime, /@mixin mode\(\$profile\)/)
  assert.match(runtime, /var\(--r-min-coef, #\{\$readable-min\}\)/)
  assert.match(runtime, /@function resp\(\$pc, \$mobile, \$desktop-profile: null/)
  assert.doesNotMatch(runtime, /math\.min\(\$raw|\$raw-min|\$raw-max/)
})

test('auto mobile clamp mode follows the configured design width', () => {
  for (const [mobileWidth, expected] of [
    [750, 'min-first'],
    [590, 'dual-bound'],
    [375, 'max-first'],
  ]) {
    const { root } = projectWith({ design: { desktopWidth: 1920, mobileWidth } })
    const result = runCli(root, 'generate')
    assert.equal(result.status, 0, result.stderr)
    assert.match(readGenerated(root), new RegExp(`\\$mobile-clamp-mode: ${expected}`))
  }
})

test('missing configured entries are pending and do not fail startup generation', () => {
  const { root } = projectWith({
    autofill: {
      ...baseConfig().autofill,
      entries: [{ file: 'src/styles/autumn-sale-2026.scss', varScope: '.autumn-sale-2026' }],
    },
  })
  const result = runCli(root, 'responsive:generate:entries')

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.entries[0], {
    entry: 'src/styles/autumn-sale-2026.scss',
    ok: true,
    pending: true,
    reason: 'file not found',
  })
})
