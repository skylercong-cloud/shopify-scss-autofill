#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

const ROOT = process.cwd()
const CONFIG_NAME = 'scss-kit.config.json'

const DEFAULT_MOBILE_MAX = 850

const CACHE_FILE = '.scss-kit-cache.json'

// ── Incremental cache helpers ──

function loadHashCache() {
  const cachePath = path.join(ROOT, CACHE_FILE)
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveHashCache(cache) {
  const cachePath = path.join(ROOT, CACHE_FILE)
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8')
}

function fileHash(absPath) {
  const content = fs.readFileSync(absPath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

function contentHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

// ── Backup / rollback helpers ──

function backupFile(absPath) {
  if (!fs.existsSync(absPath)) return null
  const backupPath = absPath + '.bak'
  fs.copyFileSync(absPath, backupPath)
  return backupPath
}

function rollbackFile(absPath, backupPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, absPath)
    fs.unlinkSync(backupPath)
  }
}

function cleanupBackup(backupPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath)
  }
}

const DEFAULT_COEFFICIENTS = {
  readable: { min: 0.625, max: 1.5 },
  dense: { min: 0.5, max: 1.5 },
}

const PROFILE_NAMES = new Set(['readable', 'dense'])

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key)

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function assertPositiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid ${label}: ${String(value)}. Expected a positive number`
    )
  }
}

function validateProfileConfig(profileName, rawProfile) {
  if (rawProfile == null) return { ...DEFAULT_COEFFICIENTS[profileName] }
  if (!isPlainObject(rawProfile)) {
    throw new Error(`Invalid coefficients.${profileName}: expected an object`)
  }

  const profile = {
    ...DEFAULT_COEFFICIENTS[profileName],
    ...rawProfile,
  }

  assertPositiveNumber(profile.min, `coefficients.${profileName}.min`)
  assertPositiveNumber(profile.max, `coefficients.${profileName}.max`)
  if (profile.min > 1) {
    throw new Error(
      `Invalid coefficients.${profileName}.min: ${profile.min}. Expected a value <= 1`
    )
  }
  if (profile.max < 1) {
    throw new Error(
      `Invalid coefficients.${profileName}.max: ${profile.max}. Expected a value >= 1`
    )
  }
  if (profile.min > profile.max) {
    throw new Error(
      `Invalid coefficients.${profileName}: min (${profile.min}) must be <= max (${profile.max})`
    )
  }

  return { min: profile.min, max: profile.max }
}

function validateAndNormalizeConfig(rawConfig) {
  if (!isPlainObject(rawConfig)) {
    throw new Error(`Invalid ${CONFIG_NAME}: expected a JSON object`)
  }

  const legacyPaths = new Set()
  for (const key of ['maxCoefficients', 'floors', 'ceilings']) {
    if (hasOwn(rawConfig, key)) legacyPaths.add(key)
  }
  if (hasOwn(rawConfig?.responsive, 'mobileProfilePreset')) {
    legacyPaths.add('responsive.mobileProfilePreset')
  }

  const rawCoefficients = rawConfig.coefficients
  if (rawCoefficients != null) {
    if (!isPlainObject(rawCoefficients)) {
      throw new Error('Invalid coefficients: expected an object')
    }

    for (const key of Object.keys(rawCoefficients)) {
      if (!PROFILE_NAMES.has(key)) {
        legacyPaths.add(`coefficients.${key}`)
      }
    }

    for (const profileName of PROFILE_NAMES) {
      const rawProfile = rawCoefficients[profileName]
      if (!isPlainObject(rawProfile)) continue
      for (const key of Object.keys(rawProfile)) {
        if (!['min', 'max'].includes(key)) {
          legacyPaths.add(`coefficients.${profileName}.${key}`)
        }
      }
    }
  }

  if (legacyPaths.size) {
    throw new Error(
      `Legacy responsive coefficient config detected: ${[
        ...legacyPaths,
      ].join(', ')}. Remove the legacy fields and use coefficients.readable/dense with min/max.`
    )
  }

  const mobileMax = rawConfig?.autofill?.mobileMax ?? DEFAULT_MOBILE_MAX
  assertPositiveNumber(mobileMax, 'autofill.mobileMax')

  let fixedCore = null
  if (rawConfig.fixedCore != null) {
    if (!isPlainObject(rawConfig.fixedCore)) {
      throw new Error('Invalid fixedCore: expected null or an object')
    }
    assertPositiveNumber(rawConfig.fixedCore.breakpoint, 'fixedCore.breakpoint')
    assertPositiveNumber(rawConfig.fixedCore.width, 'fixedCore.width')
    if (rawConfig.fixedCore.breakpoint <= mobileMax) {
      throw new Error(
        `Invalid fixedCore.breakpoint: ${rawConfig.fixedCore.breakpoint}. Expected a value greater than autofill.mobileMax (${mobileMax})`
      )
    }
    fixedCore = {
      breakpoint: rawConfig.fixedCore.breakpoint,
      width: rawConfig.fixedCore.width,
    }
  }

  return {
    ...rawConfig,
    fixedCore,
    coefficients: {
      readable: validateProfileConfig(
        'readable',
        rawCoefficients?.readable
      ),
      dense: validateProfileConfig('dense', rawCoefficients?.dense),
    },
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeFileSafely(targetPath, content, { overwriteIfContains } = {}) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, content, 'utf8')
    return { written: targetPath, mode: 'created' }
  }

  const existing = fs.readFileSync(targetPath, 'utf8')
  if (overwriteIfContains && existing.includes(overwriteIfContains)) {
    fs.writeFileSync(targetPath, content, 'utf8')
    return { written: targetPath, mode: 'overwritten' }
  }

  const newPath = `${targetPath}.new`
  fs.writeFileSync(newPath, content, 'utf8')
  return { written: newPath, mode: 'conflict_new_file' }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function loadConfig() {
  const configPath = path.join(ROOT, CONFIG_NAME)
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${CONFIG_NAME} in repo root.`)
  }
  return { configPath, config: readJson(configPath) }
}

function toPosix(p) {
  return p.replaceAll('\\', '/')
}

function ensurePx(v) {
  if (typeof v === 'number') return `${v}px`
  if (typeof v !== 'string') return String(v)
  const s = v.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return `${s}px`
  return s
}

function asValueList(v) {
  if (Array.isArray(v)) return v.map(ensurePx)
  return [ensurePx(v)]
}

function getMobileMax(cfg) {
  return cfg?.autofill?.mobileMax ?? DEFAULT_MOBILE_MAX
}

function getAutofill(cfg) {
  const fn = cfg?.autofill?.function ?? 'r.resp'
  const vwFn = cfg?.autofill?.vwFunction
  const mobileMax = getMobileMax(cfg)
  const scanDirs = cfg?.autofill?.scanDirs ?? [
    cfg?.paths?.scssSrcDir ?? 'src/styles',
  ]
  const output =
    cfg?.autofill?.output ?? 'src/styles/_responsive-autofill.generated.scss'

  const parts = fn.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid autofill.function: ${fn}. Expected format: <ns>.<name> (e.g. r.resp)`
    )
  }
  const ns = parts[0]
  const name = parts[1]

  const defaultVwFn = `${ns}.vw`
  const vwParts = String(vwFn ?? defaultVwFn).split('.')
  if (vwParts.length !== 2 || !vwParts[0] || !vwParts[1]) {
    throw new Error(
      `Invalid autofill.vwFunction: ${String(
        vwFn
      )}. Expected format: <ns>.<name> (e.g. ${defaultVwFn})`
    )
  }
  if (vwParts[0] !== ns) {
    throw new Error(
      `autofill.vwFunction namespace must match autofill.function namespace (${ns})`
    )
  }
  const vwName = vwParts[1]

  return {
    ns,
    name,
    vwName,
    mobileMax,
    scanDirs,
    outputAbs: path.join(ROOT, output),
    outputRel: toPosix(output),
  }
}

function getResponsive(cfg) {
  const modeRaw = cfg?.responsive?.mobileClampMode ?? 'auto'
  const mode = String(modeRaw)
  const smallMobileThreshold = Number(
    cfg?.responsive?.smallMobileThreshold ?? 400
  )
  const dualClampMinWidth = Number(cfg?.responsive?.dualClampMinWidth ?? 500)
  const dualClampMaxWidth = Number(cfg?.responsive?.dualClampMaxWidth ?? 600)
  const mobileWidth = Number(cfg?.design?.mobileWidth ?? 750)

  if (!['auto', 'min-first', 'max-first', 'dual-bound'].includes(mode)) {
    throw new Error(
      `Invalid responsive.mobileClampMode: ${mode}. Expected one of: auto|min-first|max-first|dual-bound`
    )
  }
  if (!Number.isFinite(smallMobileThreshold) || smallMobileThreshold <= 0) {
    throw new Error(
      `Invalid responsive.smallMobileThreshold: ${String(
        cfg?.responsive?.smallMobileThreshold
      )}. Expected a positive number`
    )
  }
  if (!Number.isFinite(dualClampMinWidth) || dualClampMinWidth <= 0) {
    throw new Error(
      `Invalid responsive.dualClampMinWidth: ${String(
        cfg?.responsive?.dualClampMinWidth
      )}. Expected a positive number`
    )
  }
  if (!Number.isFinite(dualClampMaxWidth) || dualClampMaxWidth <= 0) {
    throw new Error(
      `Invalid responsive.dualClampMaxWidth: ${String(
        cfg?.responsive?.dualClampMaxWidth
      )}. Expected a positive number`
    )
  }
  if (dualClampMinWidth > dualClampMaxWidth) {
    throw new Error(
      `Invalid responsive dual clamp range: dualClampMinWidth (${dualClampMinWidth}) must be <= dualClampMaxWidth (${dualClampMaxWidth})`
    )
  }

  const resolvedMobileClampMode =
    mode === 'auto'
      ? mobileWidth < smallMobileThreshold
        ? 'max-first'
        : mobileWidth >= dualClampMinWidth && mobileWidth <= dualClampMaxWidth
          ? 'dual-bound'
          : 'min-first'
      : mode

  return {
    mode,
    resolvedMobileClampMode,
    smallMobileThreshold,
    dualClampMinWidth,
    dualClampMaxWidth,
  }
}

function walkScssFiles(dirAbs, out) {
  if (!fs.existsSync(dirAbs)) return
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true })
  for (const ent of entries) {
    const abs = path.join(dirAbs, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue
      walkScssFiles(abs, out)
      continue
    }
    if (!ent.isFile()) continue
    if (!ent.name.endsWith('.scss')) continue
    out.push(abs)
  }
}

function splitTopLevelArgs(argsStr) {
  const args = []
  let buf = ''
  let depth = 0
  let quote = null

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]
    if (quote) {
      buf += ch
      if (ch === quote && argsStr[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
      continue
    }
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      args.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) args.push(buf.trim())
  return args
}

function replaceFunctionCalls(value, token, mapArgsToReplacement) {
  let out = ''
  let idx = 0
  let changed = false

  while (idx < value.length) {
    const hit = value.indexOf(token, idx)
    if (hit === -1) {
      out += value.slice(idx)
      break
    }

    out += value.slice(idx, hit)

    const argsStart = hit + token.length
    let i = argsStart
    let depth = 1
    let quote = null
    for (; i < value.length; i++) {
      const ch = value[i]
      if (quote) {
        if (ch === quote && value[i - 1] !== '\\') quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '(') depth++
      if (ch === ')') {
        depth--
        if (depth === 0) break
      }
    }

    // Unbalanced parentheses: keep the rest as-is.
    if (i >= value.length) {
      out += value.slice(hit)
      break
    }

    const argsStr = value.slice(argsStart, i)
    const args = splitTopLevelArgs(argsStr)
    const replacement = mapArgsToReplacement(args)
    if (replacement != null) {
      out += replacement
      changed = true
    } else {
      // Not enough args: keep original call.
      out += value.slice(hit, i + 1)
    }

    idx = i + 1
  }

  return { value: out.trim(), changed }
}

// ── r.re() complex property expansion ──

const RE_SHORTHAND_MAP = {
  // grid-cols-N → repeat(N, 1fr)
  'grid-cols': (n) => `repeat(${n}, 1fr)`,
  // grid-rows-N → repeat(N, 1fr)
  'grid-rows': (n) => `repeat(${n}, 1fr)`,
  // cols-N → (alias for grid-cols)
  cols: (n) => `repeat(${n}, 1fr)`,
  // rows-N → (alias for grid-rows)
  rows: (n) => `repeat(${n}, 1fr)`,
  // gap-N → Npx
  gap: (n) => `${n}px`,
  // span-N → span N
  span: (n) => `span ${n}`,
  // order-N → N
  order: (n) => `${n}`,
  // opacity-N → N/100
  opacity: (n) => `${n / 100}`,
  // z-N → N
  z: (n) => `${n}`,
}

function expandReValue(raw) {
  const val = raw.trim()
  // Try matching pattern: prefix-N (e.g. grid-cols-4, span-2)
  const match = val.match(/^(.+?)-(\d+(?:\.\d+)?)$/)
  if (match) {
    const prefix = match[1]
    const num = Number(match[2])
    const expander = RE_SHORTHAND_MAP[prefix]
    if (expander) return expander(num)
  }
  // No shorthand match: return as-is (original behavior)
  return val
}

function generateReShorthandMap() {
  const entries = []
  // grid-cols-1 through grid-cols-12
  for (let n = 1; n <= 12; n++) {
    entries.push(`  grid-cols-${n}: repeat(${n}, 1fr)`)
    entries.push(`  cols-${n}: repeat(${n}, 1fr)`)
    entries.push(`  grid-rows-${n}: repeat(${n}, 1fr)`)
    entries.push(`  rows-${n}: repeat(${n}, 1fr)`)
    entries.push(`  span-${n}: span ${n}`)
    entries.push(`  order-${n}: ${n}`)
    entries.push(`  z-${n}: ${n}`)
  }
  // gap shortcuts (common spacing values)
  for (const g of [0, 2, 4, 8, 10, 12, 16, 20, 24, 32, 40, 48, 60, 80]) {
    entries.push(`  gap-${g}: ${g}px`)
  }
  // opacity shortcuts (0, 10, 20, ..., 100)
  for (let o = 0; o <= 100; o += 10) {
    entries.push(`  opacity-${o}: ${o === 0 ? 0 : o / 100}`)
  }
  entries.push(`  opacity-5: 0.05`)
  entries.push(`  opacity-25: 0.25`)
  entries.push(`  opacity-75: 0.75`)
  return '\n' + entries.join(',\n') + ',\n'
}

function replaceAutofillCalls(value, { ns, name, vwName }) {
  const respToken = `${ns}.${name}(`
  const replacedResp = replaceFunctionCalls(value, respToken, (args) => {
    if (args.length < 2) return null
    const mobile = args[1]
    const desktopProfile = args[2]
    const mobileProfile = args.length >= 4 ? args[3] : desktopProfile
    const effectiveProfile = mobileProfile?.trim()

    // An explicit zero keeps the existing pure-fluid escape hatch.
    if (effectiveProfile === '0') return `${ns}.vw_mb(${mobile})`
    if (!effectiveProfile) return `${ns}.resp_mb(${mobile})`
    return `${ns}.resp_mb(${mobile}, ${effectiveProfile})`
  })

  const vwToken = `${ns}.${vwName}(`
  const replacedVw = replaceFunctionCalls(
    replacedResp.value,
    vwToken,
    (args) => {
      if (args.length < 2) return null
      const mobile = args[1]
      return `${ns}.vw_mb(${mobile})`
    }
  )

  // r.re(pc-val, mobile-val): passthrough for non-dimension responsive values.
  // Supports complex property mappings:
  //   r.re(#fff, #000)               → mobile: #000
  //   r.re(flex, none)               → mobile: none
  //   r.re(grid-cols-4, grid-cols-2) → mobile: repeat(2, 1fr)
  //   r.re(grid-cols-6, grid-cols-3) → mobile: repeat(3, 1fr)
  const reToken = `${ns}.re(`
  const replacedRe = replaceFunctionCalls(replacedVw.value, reToken, (args) => {
    if (args.length < 2) return null
    return expandReValue(args[1])
  })

  return {
    value: replacedRe.value.trim(),
    changed: replacedResp.changed || replacedVw.changed || replacedRe.changed,
  }
}

function combineSelectors(parents, children) {
  const out = []
  for (const p of parents) {
    for (const cRaw of children) {
      const c = cRaw.trim()
      if (!p) {
        out.push(c)
        continue
      }
      if (c.includes('&')) out.push(c.replaceAll('&', p))
      else out.push(`${p} ${c}`)
    }
  }
  return out
}

function scanScssForAutofill_legacy(absFilePath, { ns, name, vwName }) {
  const raw = fs.readFileSync(absFilePath, 'utf8')
  const lines = raw.split(/\r?\n/)

  /** @type {{ fullSelectors: string[] }[]} */
  const stack = []
  /** @type {{ selector: string, property: string, value: string, order: number }[]} */
  const rules = []

  let order = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]

    // close blocks first (handles lines like "}" or "};")
    const closeCount = (line.match(/}/g) || []).length
    if (closeCount) {
      for (let i = 0; i < closeCount; i++) stack.pop()
    }

    const openIdx = line.indexOf('{')
    if (openIdx !== -1) {
      const before = line.slice(0, openIdx).trim()
      // Rough selector detection: ignore at-rules & declarations
      if (before && !before.startsWith('@') && !before.includes(':')) {
        const children = before
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const parents = stack.length
          ? stack[stack.length - 1].fullSelectors
          : ['']
        stack.push({ fullSelectors: combineSelectors(parents, children) })
      }
    }

    if (!stack.length) continue

    // Allow trailing comments after semicolon, e.g.
    //   font-size: r.resp(56px, 28px, h1); /* comment */
    //   font-size: r.resp(56px, 28px, h1); // comment
    const propMatch = line.match(
      /^\s*([a-zA-Z-]+)\s*:\s*(.+?);\s*(?:\/\*.*\*\/\s*)?(?:\/\/.*)?$/
    )
    if (!propMatch) continue

    const property = propMatch[1]
    let value = propMatch[2].trim()

    // If comments appear before the semicolon (less common), strip them too.
    value = value.replace(/\s*\/\*.*\*\/\s*$/g, '').trim()
    value = value.replace(/\s*\/\/.*$/g, '').trim()

    let important = false
    if (/\s!important\s*$/i.test(value)) {
      important = true
      value = value.replace(/\s!important\s*$/i, '').trim()
    }

    const replaced = replaceAutofillCalls(value, { ns, name, vwName })
    if (!replaced.changed) continue

    const finalValue = important
      ? `${replaced.value} !important`
      : replaced.value
    const selectors = stack[stack.length - 1].fullSelectors
    for (const selector of selectors) {
      rules.push({ selector, property, value: finalValue, order: order++ })
    }
  }

  return rules
}

function scanScssForAutofill_ast(absFilePath, { ns, name, vwName }) {
  // Lazy-load optional deps so `init` can run before `npm install`.
  /** @type {typeof import('postcss')} */
  let postcss
  /** @type {any} */
  let scssSyntax
  try {
    postcss = require('postcss')
    scssSyntax = require('postcss-scss')
  } catch (e) {
    throw new Error(
      `Missing optional deps for AST scanner: postcss/postcss-scss. (${String(
        e?.message ?? e
      )})`
    )
  }

  const raw = fs.readFileSync(absFilePath, 'utf8')
  const root = scssSyntax.parse(raw, { from: absFilePath })

  /** @type {{ selector: string, property: string, value: string, order: number }[]} */
  const rules = []
  let order = 0

  /**
   * @param {import('postcss').Container} container
   * @param {string[]} parentSelectors
   */
  function walkContainer(container, parentSelectors) {
    for (const node of container.nodes ?? []) {
      if (node.type === 'rule') {
        const children = (node.selectors ?? [])
          .map((s) => String(s).trim())
          .filter(Boolean)
        const fullSelectors = combineSelectors(parentSelectors, children)

        for (const child of node.nodes ?? []) {
          if (child.type !== 'decl') continue

          const property = String(child.prop)
          let value = String(child.value ?? '').trim()

          const replaced = replaceAutofillCalls(value, { ns, name, vwName })
          if (!replaced.changed) continue

          const finalValue = child.important
            ? `${replaced.value} !important`
            : replaced.value

          for (const selector of fullSelectors) {
            rules.push({
              selector,
              property,
              value: finalValue,
              order: order++,
            })
          }
        }

        // Nested rules / at-rules inside this rule
        walkContainer(node, fullSelectors)
      } else if (node.type === 'atrule') {
        // At-rules don't change selectors; keep current parent selectors
        walkContainer(node, parentSelectors)
      }
    }
  }

  walkContainer(root, [''])
  return rules
}

function scanScssForAutofill(absFilePath, { ns, name, vwName }) {
  try {
    return scanScssForAutofill_ast(absFilePath, { ns, name, vwName })
  } catch (e) {
    // Fallback for edge cases where parser can't handle a file.
    return scanScssForAutofill_legacy(absFilePath, { ns, name, vwName })
  }
}

function getAutofillEntries(cfg) {
  const entries = cfg?.autofill?.entries
  if (!entries) return []
  if (!Array.isArray(entries)) {
    throw new Error('autofill.entries must be an array of entry scss paths')
  }
  // Each entry may be a string path or an object { file, varScope }
  return entries.filter(Boolean).map((e) => {
    if (typeof e === 'string') return { file: e, varScope: null }
    if (e && typeof e === 'object' && typeof e.file === 'string')
      return { file: e.file, varScope: e.varScope ?? null }
    throw new Error(
      'autofill.entries items must be a string path or { file, varScope }'
    )
  })
}

function generateAutofillScss(cfg, collectedRules, varScope) {
  const { ns, mobileMax } = getAutofill(cfg)
  const desktopWidth = cfg?.design?.desktopWidth ?? 1920
  const mobileWidth = cfg?.design?.mobileWidth ?? 750
  const scope = varScope ?? ':root'

  const header = `@use "./responsive" as ${ns};

// Generated by scss-kit from ${CONFIG_NAME}
// Source: scanned ${ns}.resp(...), ${ns}.vw(...) and ${ns}.re(...) markers in scss.
// Do not edit this file directly; re-run: npm run scss-kit:responsive:generate
\n`

  const mixinHeader = `@mixin responsive_autofill_overrides() {\n`
  const mixinFooter = `\n}\n`

  // PC vars block: 2-space indent inside mixin, 4-space for property
  const pcVarsBlock =
    `  ${scope} {\n` +
    `    --px-to-vw: calc(100vw / ${desktopWidth});\n` +
    `    --r-min-coef: ${cfg.coefficients.readable.min};\n` +
    `    --r-max-coef: ${cfg.coefficients.readable.max};\n` +
    `  }\n`

  const fixedCoreBlock = cfg.fixedCore
    ? `\n  @media screen and (min-width: ${cfg.fixedCore.breakpoint}px) {\n` +
      `    ${scope} {\n` +
      `      --px-to-vw: 1px;\n` +
      `    }\n` +
      `  }\n`
    : ''

  // MB vars block: 4-space indent inside @media, 6-space for property
  const mbVarsBlock =
    `    ${scope} {\n` +
    `      --px-to-vw-mb: calc(100vw / ${mobileWidth});\n` +
    `    }\n`

  if (!collectedRules.length) {
    return (
      header +
      mixinHeader +
      pcVarsBlock +
      fixedCoreBlock +
      `\n` +
      `  @media screen and (max-width: ${mobileMax}px) {\n` +
      mbVarsBlock +
      `  }\n` +
      mixinFooter
    )
  }

  // Keep insertion order, but last write wins for same selector+property.
  const selectorMap = new Map()
  for (const r of collectedRules.sort((a, b) => a.order - b.order)) {
    if (!selectorMap.has(r.selector)) selectorMap.set(r.selector, new Map())
    selectorMap.get(r.selector).set(r.property, r.value)
  }

  const blocks = []
  for (const [selector, props] of selectorMap.entries()) {
    const lines = []
    for (const [prop, val] of props.entries()) {
      lines.push(`  ${prop}: ${val};`)
    }
    blocks.push(`${selector} {\n${lines.join('\n')}\n}`)
  }

  return (
    header +
    mixinHeader +
    pcVarsBlock +
    fixedCoreBlock +
    `\n` +
    `  @media screen and (max-width: ${mobileMax}px) {\n` +
    mbVarsBlock +
    `\n` +
    blocks.map((b) => b.replaceAll(/^/gm, '    ')).join('\n\n') +
    `\n  }` +
    mixinFooter
  )
}

function extractPxCandidates(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath)
  const raw = fs.readFileSync(abs, 'utf8')
  const lines = raw.split(/\r?\n/)

  const whitelist = new Set([
    'font-size',
    'margin',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'gap',
    'row-gap',
    'column-gap',
    'width',
    'height',
    'top',
    'right',
    'bottom',
    'left',
    'border-radius',
  ])

  let currentSelector = null
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const selMatch = line.match(/^\s*([^@][^{]+)\{\s*$/)
    if (selMatch) {
      currentSelector = selMatch[1].trim()
      continue
    }
    if (/^\s*}\s*$/.test(line)) {
      currentSelector = null
      continue
    }
    if (!currentSelector) continue

    const propMatch = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;]+);/)
    if (!propMatch) continue
    const prop = propMatch[1]
    const value = propMatch[2]
    if (!whitelist.has(prop)) continue

    const px = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(
      (m) => `${m[1]}px`
    )
    if (!px.length) continue

    const typeGuess =
      prop === 'font-size'
        ? 'body'
        : prop.includes('gap')
          ? 'card-gap'
          : 'element-gap'

    out.push({
      selector: currentSelector,
      property: prop,
      type: typeGuess,
      desktop: px.length === 1 ? px[0] : px,
      mobile: null,
      important: /!important/.test(value),
      source: { file: toPosix(path.relative(ROOT, abs)), line: i + 1 },
    })
  }

  return { file: toPosix(path.relative(ROOT, abs)), rules: out }
}

function toScssMap(obj) {
  const entries = Object.entries(obj)
    .map(([k, v]) => `  ${k}: ${v},`)
    .join('\n')
  return `(\n${entries}\n)`
}

function generateResponsiveScss(cfg) {
  const readableMap = toScssMap(cfg.coefficients.readable)
  const denseMap = toScssMap(cfg.coefficients.dense)
  const responsive = getResponsive(cfg)

  return `@use "sass:map";
@use "sass:math";
@use "sass:meta";
@use "sass:string";

// Generated by scss-kit from ${CONFIG_NAME}
// Edit ${CONFIG_NAME} to change design sizes and responsive profiles.

// Design widths:
// - desktop: ${cfg.design.desktopWidth}
// - mobile: ${cfg.design.mobileWidth}

$profile-readable: ${readableMap};

$profile-dense: ${denseMap};

$readable-min: #{map.get($profile-readable, min)};
$readable-max: #{map.get($profile-readable, max)};

$mobile-clamp-mode: ${responsive.resolvedMobileClampMode};

@function _to-px($value) {
  @return if(math.is-unitless($value), $value * 1px, $value);
}

@function _to-num($value) {
  @if meta.type-of($value) != number {
    @error "Expected a number, got: #{meta.type-of($value)}";
  }
  @if math.is-unitless($value) {
    @return $value;
  }
  @if math.unit($value) != 'px' {
    @error "Expected px or unitless number, got: #{math.unit($value)}";
  }
  @return math.div($value, 1px);
}

@function _inherited-min() {
  @return string.unquote("var(--r-min-coef, #{$readable-min})");
}

@function _inherited-max() {
  @return string.unquote("var(--r-max-coef, #{$readable-max})");
}

@function _validate-custom-min($value) {
  @if meta.type-of($value) != number or not math.is-unitless($value) {
    @error "Responsive minimum coefficient must be a unitless number";
  }
  @if $value <= 0 or $value > 1 {
    @error "Responsive minimum coefficient must be greater than 0 and <= 1";
  }
  @return $value;
}

@function _validate-custom-max($value) {
  @if meta.type-of($value) != number or not math.is-unitless($value) {
    @error "Responsive maximum coefficient must be a unitless number";
  }
  @if $value < 1 {
    @error "Responsive maximum coefficient must be >= 1";
  }
  @return $value;
}

@function _profile-map($profile) {
  @if $profile == readable {
    @return $profile-readable;
  }
  @if $profile == dense {
    @return $profile-dense;
  }
  @error "Unknown responsive profile: #{$profile}. Use readable, dense, a positive minimum coefficient, or a map with min/max";
}

@function _resolve-profile($profile: null) {
  $default-min: _inherited-min();
  $default-max: _inherited-max();

  @if $profile == null {
    @return (min: $default-min, max: $default-max);
  }

  @if meta.type-of($profile) == string {
    @return _profile-map($profile);
  }

  @if meta.type-of($profile) == number {
    @return (
      min: _validate-custom-min($profile),
      max: $default-max,
    );
  }

  @if meta.type-of($profile) == map {
    $min: $default-min;
    $max: $default-max;
    @if map.has-key($profile, min) {
      $min: _validate-custom-min(map.get($profile, min));
    }
    @if map.has-key($profile, max) {
      $max: _validate-custom-max(map.get($profile, max));
    }
    @if meta.type-of($min) == number and meta.type-of($max) == number and $min > $max {
      @error "Responsive profile min must be <= max";
    }
    @return (min: $min, max: $max);
  }

  @error "Responsive profile must be readable, dense, a number, or a Sass map";
}

@function profile_min($profile: null) {
  @return map.get(_resolve-profile($profile), min);
}

@function profile_max($profile: null) {
  @return map.get(_resolve-profile($profile), max);
}

@function _scale-bound($value, $coefficient) {
  $v: _to-px($value);
  @if meta.type-of($coefficient) == number {
    @return $v * $coefficient;
  }
  @return string.unquote("calc(#{$v} * #{$coefficient})");
}

@function min_px($value, $profile: null) {
  @return _scale-bound($value, profile_min($profile));
}

@function max_px($value, $profile: null) {
  @return _scale-bound($value, profile_max($profile));
}

@mixin mode($profile) {
  @if $profile != readable and $profile != dense {
    @error "r.mode() expects readable or dense";
  }
  $values: _profile-map($profile);
  --r-min-coef: #{map.get($values, min)};
  --r-max-coef: #{map.get($values, max)};
}

// Generate the desktop clamp. Direct calls retain the design value as max;
// resp() supplies the active profile max.
@function clamp_pc($pc, $min, $max: null) {
  $max-value: if($max == null, _to-px($pc), $max);
  $n: _to-num($pc);
  @return clamp(#{$min}, calc(#{$n} * var(--px-to-vw)), #{$max-value});
}

// Generate the mobile clamp: min + fluid + optional max.
@function clamp_mb($mobile, $min, $max: null) {
  $max-value: if($max == null, _to-px($mobile), $max);
  $n: _to-num($mobile);
  @return clamp(#{$min}, calc(#{$n} * var(--px-to-vw-mb)), #{$max-value});
}

// Mobile output strategy is selected from the configured design width.
@function resp_mb($mobile, $profile: null) {
  $v: _to-px($mobile);

  @if $mobile-clamp-mode == max-first {
    @return clamp_mb($mobile, $v, max_px($mobile, $profile));
  }

  @if $mobile-clamp-mode == dual-bound {
    @return clamp_mb($mobile, min_px($mobile, $profile), max_px($mobile, $profile));
  }

  @return clamp_mb($mobile, min_px($mobile, $profile));
}

// 直接输出 PC 段 vw，并用设计稿 px 做上限兜底。
@function vw_pc($pc) {
  $v: _to-px($pc);
  $n: _to-num($pc);
  @return min(calc(#{$n} * var(--px-to-vw)), #{$v});
}

// 直接输出 PC 段纯 vw（无上限兜底）。
@function vw_pc_raw($pc) {
  $n: _to-num($pc);
  @return calc(#{$n} * var(--px-to-vw));
}

// 直接输出移动段 vw（无 clamp）。
@function vw_mb($mobile) {
  $n: _to-num($mobile);
  @return calc(#{$n} * var(--px-to-vw-mb));
}

// vw(): spacing-first helper（间距优先，默认不设最小值）
// - PC: min(vw, px)
// - Mobile: 纯 vw（通过 autofill 覆盖生成）
@function vw($pc, $mobile) {
  @if meta.type-of($pc) != number or meta.type-of($mobile) != number {
    @error "vw() expects numeric px values for both pc and mobile";
  }
  @return vw_pc($pc);
}

// resp() defaults to the inherited readable profile when no explicit profile
// is supplied. A parent r.mode() can replace those inherited CSS variables.
@function resp($pc, $mobile, $desktop-profile: null, $mobile-profile: null) {
  @if meta.type-of($pc) != number {
    @error "resp() expects a number (px) for pc value";
  }
  @return clamp_pc($pc, min_px($pc, $desktop-profile), max_px($pc, $desktop-profile));
}

// re(): passthrough for non-dimension responsive values (color, display, background, etc.)
// - PC: returns first arg unchanged.
// - Mobile: scss-kit autofill scanner reads second arg and emits mobile override directly.
// Shorthand mappings (expanded by scanner):
//   grid-cols-N → repeat(N, 1fr)    grid-rows-N → repeat(N, 1fr)
//   span-N → span N                 order-N → N
//   opacity-N → N/100               z-N → N
// Usage:  color: r.re(#fff, #000);   → PC: #fff, Mobile override: #000
//         display: r.re(flex, none);
//         grid-template-columns: r.re(grid-cols-4, grid-cols-2); → PC: repeat(4, 1fr), Mobile: repeat(2, 1fr)

// Shorthand expansion map for r.re() (PC side).
// The scanner expands the mobile side in JS; this map handles the PC side in SCSS.
$_re-shorthands: (${generateReShorthandMap()});

@function _expand-re($val) {
  @if meta.type-of($val) == string and map.has-key($_re-shorthands, $val) {
    @return map.get($_re-shorthands, $val);
  }
  @return $val;
}

@function re($pc-val, $mobile-val: null) {
  @return _expand-re($pc-val);
}
`
}

function patchPackageJson(cfg) {
  const packagePath = path.join(ROOT, 'package.json')
  if (!fs.existsSync(packagePath)) {
    return { ok: false, reason: 'missing package.json' }
  }

  const pkg = readJson(packagePath)
  pkg.scripts ??= {}
  pkg.devDependencies ??= {}

  const desiredScripts = {
    'scss-kit:init': 'node tools/scss-kit/cli.mjs init',
    'scss-kit:generate': 'node tools/scss-kit/cli.mjs generate',
    'scss-kit:doctor': 'node tools/scss-kit/cli.mjs doctor',
    'scss-kit:responsive:generate':
      'node tools/scss-kit/cli.mjs responsive:generate',
    'scss-kit:responsive:generate:entries':
      'node tools/scss-kit/cli.mjs responsive:generate:entries',
  }

  const desiredDevDeps = {
    'chokidar-cli': '^3.0.0',
    concurrently: '^9.2.0',
    postcss: '^8.5.6',
    'postcss-scss': '^4.0.9',
    sass: '^1.92.1',
  }

  const conflicts = []
  for (const [k, v] of Object.entries(desiredScripts)) {
    if (pkg.scripts[k] && pkg.scripts[k] !== v) conflicts.push(`scripts.${k}`)
    if (!pkg.scripts[k]) pkg.scripts[k] = v
  }

  // 这些是工作流必需脚本：如果不存在则补上；存在但不同则不覆盖，输出 .patch
  const watchScripts = {
    'theme:watch': `theme watch --env=${cfg.themeKit.env}`,
    // Use safe mode to prevent accidentally overwriting existing assets CSS.
    'css:watch': 'node tools/scss-kit/css-watch-safe.mjs',
    // Auto-generate per-entry responsive overrides when SCSS changes.
    'responsive:watch':
      'chokidar "src/styles/**/*.scss" -i "src/styles/_responsive-autofill*.generated.scss" -c "node tools/scss-kit/responsive-watch.mjs {path}"',
    'dev:theme':
      'concurrently -k -n CSS,THEME "npm:css:watch" "npm:theme:watch"',
    'dev:theme:auto':
      'npm run scss-kit:generate && npm run scss-kit:responsive:generate && npm run scss-kit:responsive:generate:entries && concurrently -k -n AUTO,CSS,THEME "npm:responsive:watch" "npm:css:watch" "npm:theme:watch"',
  }
  for (const [k, v] of Object.entries(watchScripts)) {
    if (pkg.scripts[k] && pkg.scripts[k] !== v) conflicts.push(`scripts.${k}`)
    if (!pkg.scripts[k]) pkg.scripts[k] = v
  }

  for (const [k, v] of Object.entries(desiredDevDeps)) {
    if (pkg.devDependencies[k] && pkg.devDependencies[k] !== v)
      conflicts.push(`devDependencies.${k}`)
    if (!pkg.devDependencies[k]) pkg.devDependencies[k] = v
  }

  const out = JSON.stringify(pkg, null, 2) + '\n'

  if (conflicts.length) {
    ensureDir(path.join(ROOT, 'scss-kit', 'patches'))
    const patchPath = path.join(ROOT, 'scss-kit', 'patches', 'package.json.new')
    fs.writeFileSync(patchPath, out, 'utf8')
    return { ok: false, reason: 'conflicts', conflicts, written: patchPath }
  }

  fs.writeFileSync(packagePath, out, 'utf8')
  return { ok: true }
}

function patchConfigYml(cfg) {
  const configPath = path.join(ROOT, cfg.themeKit.configYml)
  if (!fs.existsSync(configPath)) {
    const lines = [
      `# Generated by scss-kit (${new Date().toISOString()})`,
      '# Fill in the required Theme Kit credentials before running: npm run theme:watch',
      '# Docs: https://shopify.dev/docs/themes/tools/theme-kit',
      '',
      `${cfg.themeKit.env}:`,
      '  password: "<YOUR_THEMEKIT_PASSWORD>"',
      "  theme_id: '<YOUR_THEME_ID>'",
      '  store: <YOUR_STORE>.myshopify.com',
      '  ignore_files:',
      ...cfg.themeKit.ignoreFiles.map((p) => `    - '${p}'`),
      '',
    ]
    fs.writeFileSync(configPath, lines.join('\n'), 'utf8')
    return {
      ok: true,
      note: 'created config.yml with placeholders',
      created: cfg.themeKit.configYml,
    }
  }

  const raw = fs.readFileSync(configPath, 'utf8')
  const envHeader = new RegExp(`^${cfg.themeKit.env}:\\s*$`, 'm')
  if (!envHeader.test(raw)) {
    const desiredBlock = [
      `${cfg.themeKit.env}:`,
      '  password: "<YOUR_THEMEKIT_PASSWORD>"',
      "  theme_id: '<YOUR_THEME_ID>'",
      '  store: <YOUR_STORE>.myshopify.com',
      '  ignore_files:',
      ...cfg.themeKit.ignoreFiles.map((p) => `    - '${p}'`),
      '',
    ].join('\n')
    ensureDir(path.join(ROOT, 'scss-kit', 'patches'))
    const patchPath = path.join(
      ROOT,
      'scss-kit',
      'patches',
      path.basename(cfg.themeKit.configYml) + `.${cfg.themeKit.env}.new`
    )
    fs.writeFileSync(patchPath, desiredBlock, 'utf8')
    return {
      ok: true,
      note: `env ${cfg.themeKit.env} not found; wrote suggestion file`,
      written: patchPath,
    }
  }

  // 已存在 ignore_files 时不合并（按你的偏好）。生成 .new 给你手动比对。
  if (/^\s+ignore_files:\s*$/m.test(raw)) {
    const desiredBlock = `  ignore_files:\n${cfg.themeKit.ignoreFiles.map((p) => `    - '${p}'`).join('\n')}\n`
    ensureDir(path.join(ROOT, 'scss-kit', 'patches'))
    const patchPath = path.join(
      ROOT,
      'scss-kit',
      'patches',
      path.basename(cfg.themeKit.configYml) + '.ignore_files.new'
    )
    fs.writeFileSync(patchPath, desiredBlock, 'utf8')
    return {
      ok: true,
      note: 'ignore_files exists; wrote suggestion file',
      written: patchPath,
    }
  }

  // 在 env block 里，找到 store/theme_id/password 之后插入 ignore_files。简单文本插入，保持原文件其它内容不变。
  const lines = raw.split(/\r?\n/)
  let envLineIndex = lines.findIndex((l) => l.trim() === `${cfg.themeKit.env}:`)
  if (envLineIndex === -1) return { ok: false, reason: 'env line not found' }

  // 在 env block 内找到最后一个以两个空格缩进的 key（例如 store:）的位置。
  let insertAt = envLineIndex + 1
  for (let i = envLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('  ') && line.trim() !== '') break // 下一个 env 或顶级
    if (/^\s{2}[a-zA-Z0-9_]+:\s*/.test(line)) insertAt = i + 1
  }

  const block = [
    '  ignore_files:',
    ...cfg.themeKit.ignoreFiles.map((p) => `    - '${p}'`),
    '',
  ]

  lines.splice(insertAt, 0, ...block)
  fs.writeFileSync(configPath, lines.join('\n'), 'utf8')
  return { ok: true }
}

function doctor(cfg) {
  const issues = []
  const pkgPath = path.join(ROOT, 'package.json')
  if (!fs.existsSync(pkgPath)) issues.push('missing package.json')
  const configPath = path.join(ROOT, cfg.themeKit.configYml)
  if (!fs.existsSync(configPath))
    issues.push(`missing ${cfg.themeKit.configYml}`)

  const responsivePath = path.join(
    ROOT,
    cfg.paths.scssSrcDir,
    '_responsive.scss'
  )
  if (!fs.existsSync(responsivePath))
    issues.push(`missing ${path.relative(ROOT, responsivePath)}`)

  try {
    const autofill = getAutofill(cfg)
    if (!fs.existsSync(autofill.outputAbs)) {
      issues.push(`missing ${path.relative(ROOT, autofill.outputAbs)}`)
    }
  } catch (e) {
    issues.push(String(e?.message ?? e))
  }

  return issues
}

function main() {
  const cmd = process.argv[2] || 'help'
  const { config: rawConfig } = loadConfig()
  const config = validateAndNormalizeConfig(rawConfig)

  if (cmd === 'generate') {
    const scss = generateResponsiveScss(config)
    const target = path.join(ROOT, config.paths.scssSrcDir, '_responsive.scss')
    const res = writeFileSafely(target, scss, {
      overwriteIfContains: 'Generated by scss-kit',
    })
    console.log(JSON.stringify({ action: 'generate', ...res }, null, 2))
    return
  }

  if (cmd === 'init') {
    // 1) ensure dirs
    ensureDir(path.join(ROOT, config.paths.scssSrcDir))

    // 2) generate responsive helper
    const scss = generateResponsiveScss(config)
    const target = path.join(ROOT, config.paths.scssSrcDir, '_responsive.scss')
    const gen = writeFileSafely(target, scss, {
      overwriteIfContains: 'Generated by scss-kit',
    })

    // 2.1) ensure autofill generated file exists (placeholder)
    let autofillGen = null
    try {
      const autofill = getAutofill(config)
      const placeholder = generateAutofillScss(config, [])
      autofillGen = writeFileSafely(autofill.outputAbs, placeholder, {
        overwriteIfContains: 'Generated by scss-kit',
      })
    } catch (e) {
      autofillGen = { ok: false, reason: String(e?.message ?? e) }
    }

    // 3) patch package.json and config.yml
    const pkg = patchPackageJson(config)
    const yml = patchConfigYml(config)

    console.log(
      JSON.stringify(
        {
          action: 'init',
          generated: gen,
          autofillGenerated: autofillGen,
          package: pkg,
          configYml: yml,
        },
        null,
        2
      )
    )
    return
  }

  if (cmd === 'doctor') {
    const issues = doctor(config)
    const ok = issues.length === 0
    console.log(JSON.stringify({ action: 'doctor', ok, issues }, null, 2))
    process.exit(ok ? 0 : 1)
  }

  if (cmd === 'responsive:template') {
    console.log(
      JSON.stringify(
        {
          action: 'responsive:template',
          ok: false,
          reason:
            'deprecated: responsive map mode removed; use r.resp(pc, mobile[, profile[, mobileProfile]]) + responsive:generate',
        },
        null,
        2
      )
    )
    process.exit(1)
  }

  if (cmd === 'responsive:extract') {
    const target = process.argv[3]
    if (!target) {
      console.log(
        JSON.stringify(
          {
            action: 'responsive:extract',
            ok: false,
            reason: 'missing file arg',
          },
          null,
          2
        )
      )
      process.exit(1)
    }
    const extracted = extractPxCandidates(target)
    ensureDir(path.join(ROOT, 'scss-kit'))
    const outPath = path.join(ROOT, 'scss-kit', 'responsive-extract.json')
    fs.writeFileSync(outPath, JSON.stringify(extracted, null, 2) + '\n', 'utf8')
    console.log(
      JSON.stringify(
        {
          action: 'responsive:extract',
          ok: true,
          written: toPosix(path.relative(ROOT, outPath)),
          count: extracted.rules.length,
        },
        null,
        2
      )
    )
    return
  }

  if (cmd === 'responsive:generate') {
    const autofill = getAutofill(config)

    // Optional: generate only for a single SCSS entry file.
    // Usage:
    //   node tools/scss-kit/cli.mjs responsive:generate src/styles/page.scss
    //   node tools/scss-kit/cli.mjs responsive:generate src/styles/page.scss src/styles/_responsive-autofill.page.generated.scss
    const targetFileArg = process.argv[3]
    if (targetFileArg) {
      const targetAbs = path.isAbsolute(targetFileArg)
        ? targetFileArg
        : path.join(ROOT, targetFileArg)

      if (!fs.existsSync(targetAbs)) {
        console.log(
          JSON.stringify(
            {
              action: 'responsive:generate',
              ok: false,
              reason: `file not found: ${targetFileArg}`,
            },
            null,
            2
          )
        )
        process.exit(1)
      }

      const explicitOutputArg = process.argv[4]
      const base = path.basename(targetAbs, '.scss')
      const defaultOutRel = path.join(
        config?.paths?.scssSrcDir ?? 'src/styles',
        `_responsive-autofill.${base}.generated.scss`
      )
      const outAbs = explicitOutputArg
        ? path.isAbsolute(explicitOutputArg)
          ? explicitOutputArg
          : path.join(ROOT, explicitOutputArg)
        : path.join(ROOT, defaultOutRel)

      // Backup for rollback on failure
      const backupPath = backupFile(outAbs)
      try {
        const collected = scanScssForAutofill(targetAbs, autofill)
        // Look up varScope for this entry from config
        const entryVarScope =
          getAutofillEntries(config).find(
            (e) =>
              path.resolve(
                path.isAbsolute(e.file) ? e.file : path.join(ROOT, e.file)
              ) === path.resolve(targetAbs)
          )?.varScope ?? null
        const scss = generateAutofillScss(config, collected, entryVarScope)
        const res = writeFileSafely(outAbs, scss, {
          overwriteIfContains: 'Generated by scss-kit',
        })
        cleanupBackup(backupPath)
        console.log(
          JSON.stringify(
            {
              action: 'responsive:generate',
              ok: true,
              output: toPosix(path.relative(ROOT, outAbs)),
              scannedFiles: 1,
              rules: collected.length,
              written: toPosix(path.relative(ROOT, res.written)),
              mode: res.mode,
              target: toPosix(path.relative(ROOT, targetAbs)),
            },
            null,
            2
          )
        )
      } catch (err) {
        rollbackFile(outAbs, backupPath)
        console.log(
          JSON.stringify(
            {
              action: 'responsive:generate',
              ok: false,
              reason: `generation failed (rolled back): ${String(err?.message ?? err)}`,
              target: toPosix(path.relative(ROOT, targetAbs)),
            },
            null,
            2
          )
        )
        process.exit(1)
      }
      return
    }

    const absFiles = []
    for (const d of autofill.scanDirs) {
      walkScssFiles(path.isAbsolute(d) ? d : path.join(ROOT, d), absFiles)
    }

    // Avoid scanning the output file itself and any per-entry generated files.
    const outputAbs = autofill.outputAbs
    const files = absFiles.filter((f) => {
      const resolved = path.resolve(f)
      if (resolved === path.resolve(outputAbs)) return false
      // Skip all _responsive-autofill*.generated.scss files
      const base = path.basename(f)
      if (
        base.startsWith('_responsive-autofill') &&
        base.endsWith('.generated.scss')
      )
        return false
      return true
    })

    const collected = []
    for (const f of files) {
      collected.push(...scanScssForAutofill(f, autofill))
    }

    const scss = generateAutofillScss(config, collected)
    const res = writeFileSafely(outputAbs, scss, {
      overwriteIfContains: 'Generated by scss-kit',
    })
    console.log(
      JSON.stringify(
        {
          action: 'responsive:generate',
          ok: true,
          output: autofill.outputRel,
          scannedFiles: files.length,
          rules: collected.length,
          written: toPosix(path.relative(ROOT, res.written)),
          mode: res.mode,
        },
        null,
        2
      )
    )
    return
  }

  if (cmd === 'responsive:generate:entries') {
    const autofill = getAutofill(config)
    const entries = getAutofillEntries(config)
    const forceAll = process.argv.includes('--force')

    if (!entries.length) {
      console.log(
        JSON.stringify(
          {
            action: 'responsive:generate:entries',
            ok: true,
            skipped: true,
            reason:
              'autofill.entries is empty — nothing to generate. Create .scss files in src/styles/ and the responsive:watch watcher will register them automatically.',
          },
          null,
          2
        )
      )
      process.exit(0)
    }

    // Load incremental cache
    const cache = forceAll ? {} : loadHashCache()
    const configHash = contentHash(JSON.stringify(config))
    const nextCache = { _configHash: configHash }

    const results = []
    for (const { file: entryRel, varScope: entryVarScope } of entries) {
      const entryAbs = path.isAbsolute(entryRel)
        ? entryRel
        : path.join(ROOT, entryRel)
      if (!fs.existsSync(entryAbs)) {
        results.push({
          entry: entryRel,
          ok: true,
          pending: true,
          reason: 'file not found',
        })
        continue
      }

      const base = path.basename(entryAbs, '.scss')
      const outRel = path.join(
        config?.paths?.scssSrcDir ?? 'src/styles',
        `_responsive-autofill.${base}.generated.scss`
      )
      const outAbs = path.join(ROOT, outRel)

      // ── Incremental check: skip if source hash unchanged ──
      const srcHash = fileHash(entryAbs)
      const cacheKey = toPosix(path.relative(ROOT, entryAbs))
      if (
        !forceAll &&
        cache[cacheKey] === srcHash &&
        cache._configHash === configHash &&
        fs.existsSync(outAbs)
      ) {
        nextCache[cacheKey] = srcHash
        results.push({
          entry: cacheKey,
          ok: true,
          rules: null,
          output: toPosix(path.relative(ROOT, outAbs)),
          written: null,
          mode: 'skipped (unchanged)',
        })
        continue
      }

      // ── Backup existing output for rollback ──
      const backupPath = backupFile(outAbs)

      try {
        const collected = scanScssForAutofill(entryAbs, autofill)
        const scss = generateAutofillScss(config, collected, entryVarScope)
        const res = writeFileSafely(outAbs, scss, {
          overwriteIfContains: 'Generated by scss-kit',
        })

        // Success: update cache, cleanup backup
        nextCache[cacheKey] = srcHash
        cleanupBackup(backupPath)

        results.push({
          entry: cacheKey,
          ok: true,
          rules: collected.length,
          output: toPosix(path.relative(ROOT, outAbs)),
          written: toPosix(path.relative(ROOT, res.written)),
          mode: res.mode,
        })
      } catch (err) {
        // ── Rollback on failure ──
        rollbackFile(outAbs, backupPath)
        results.push({
          entry: cacheKey,
          ok: false,
          reason: `generation failed (rolled back): ${String(err?.message ?? err)}`,
        })
      }
    }

    // Persist cache
    saveHashCache(nextCache)

    const ok = results.every((r) => r.ok)
    console.log(
      JSON.stringify(
        {
          action: 'responsive:generate:entries',
          ok,
          entries: results,
        },
        null,
        2
      )
    )
    process.exit(ok ? 0 : 1)
  }

  console.log(
    `scss-kit usage:\n  node tools/scss-kit/cli.mjs init\n  node tools/scss-kit/cli.mjs generate\n  node tools/scss-kit/cli.mjs doctor\n  node tools/scss-kit/cli.mjs responsive:extract <file.scss>\n  node tools/scss-kit/cli.mjs responsive:generate [file.scss]\n  node tools/scss-kit/cli.mjs responsive:generate:entries [--force]\n`
  )
}

main()
