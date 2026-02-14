import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return typeof result.status === 'number' ? result.status : 1
}

const changed = process.argv[2]
if (!changed) {
  console.error(
    'Usage: node tools/scss-kit/responsive-watch.mjs <changed-scss-path>'
  )
  process.exit(1)
}

const normalized = String(changed).replaceAll('\\\\', '/').replaceAll('\\', '/')
const base = path.posix.basename(normalized)

// Ignore generated files to avoid loops
if (
  base.startsWith('_responsive-autofill') &&
  base.endsWith('.generated.scss')
) {
  process.exit(0)
}

if (!normalized.endsWith('.scss')) process.exit(0)

const isPartial = base.startsWith('_')

function getEntryBaseName(scssPath) {
  return path.posix.basename(scssPath).replace(/\.scss$/i, '')
}

function ensureEntryBoilerplate(entryRelPath) {
  const abs = path.isAbsolute(entryRelPath)
    ? entryRelPath
    : path.join(process.cwd(), entryRelPath)
  if (!fs.existsSync(abs)) return { ok: false, changed: false, wasEmpty: false }

  const raw = fs.readFileSync(abs, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const entryBase = getEntryBaseName(entryRelPath)

  const wasEmpty = raw.trim().length === 0
  if (!wasEmpty) return { ok: true, changed: false, wasEmpty }

  const responsiveUse = '@use "./responsive" as r;'
  const generatedUse = `@use "./_responsive-autofill.${entryBase}.generated" as auto;`
  const includeLine = '@include auto.responsive_autofill_overrides();'
  const includeComment =
    '// 注意：请保持本行在文件末尾，避免自动生成的移动端代码覆盖顺序异常。'

  const next =
    responsiveUse +
    eol +
    generatedUse +
    eol +
    eol +
    includeComment +
    eol +
    includeLine +
    eol

  fs.writeFileSync(abs, next, 'utf8')
  return { ok: true, changed: true, wasEmpty }
}

function maybeAddEntryToConfig(entryRelPath) {
  // Only manage entries for non-partials inside src/styles
  if (!entryRelPath.startsWith('src/styles/'))
    return { ok: false, changed: false }

  const cfgAbs = path.join(process.cwd(), 'scss-kit.config.json')
  if (!fs.existsSync(cfgAbs)) return { ok: false, changed: false }

  const raw = fs.readFileSync(cfgAbs, 'utf8')
  let cfg
  try {
    cfg = JSON.parse(raw)
  } catch {
    return { ok: false, changed: false }
  }

  const entries = cfg?.autofill?.entries
  if (!Array.isArray(entries)) return { ok: false, changed: false }

  if (entries.includes(entryRelPath)) return { ok: true, changed: false }

  entries.push(entryRelPath)
  cfg.autofill.entries = entries
  fs.writeFileSync(cfgAbs, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  return { ok: true, changed: true }
}

// When editing a partial, regenerate all configured entries.
// When editing an entry, regenerate only that entry's per-entry output.
const cli = path.join('tools', 'scss-kit', 'cli.mjs')
if (isPartial) {
  process.exit(run('node', [cli, 'responsive:generate:entries']))
}

// For entry files: ensure boilerplate + ensure it's part of entries list,
// then generate its per-entry autofill file.
const boot = ensureEntryBoilerplate(normalized)
if (boot.wasEmpty) {
  maybeAddEntryToConfig(normalized)
}

process.exit(run('node', [cli, 'responsive:generate', normalized]))
