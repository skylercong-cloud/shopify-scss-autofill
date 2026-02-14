#!/usr/bin/env node
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

const ROOT = process.cwd()
const CONFIG_NAME = 'scss-kit.config.json'

const DEFAULT_MOBILE_MAX = 850

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
  return p.replaceAll('\\\\', '/')
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
  return {
    ns,
    name,
    mobileMax,
    scanDirs,
    outputAbs: path.join(ROOT, output),
    outputRel: toPosix(output),
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

function replaceRespCalls(value, { ns, name }) {
  const token = `${ns}.${name}(`
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
    if (args.length >= 3) {
      const mobile = args[1]
      const type = args[2]
      out += `${ns}.clamp_mb(${mobile}, ${ns}.min_px(${mobile}, ${type}, mobile))`
      changed = true
    } else {
      // Not enough args: keep original call.
      out += value.slice(hit, i + 1)
    }

    idx = i + 1
  }

  return { value: out.trim(), changed }
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

function scanScssForAutofill_legacy(absFilePath, { ns, name }) {
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

    const replaced = replaceRespCalls(value, { ns, name })
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

function scanScssForAutofill_ast(absFilePath, { ns, name }) {
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
  const root = postcss.parse(raw, { syntax: scssSyntax, from: absFilePath })

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

          const replaced = replaceRespCalls(value, { ns, name })
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

function scanScssForAutofill(absFilePath, { ns, name }) {
  try {
    return scanScssForAutofill_ast(absFilePath, { ns, name })
  } catch (e) {
    // Fallback for edge cases where parser can't handle a file.
    return scanScssForAutofill_legacy(absFilePath, { ns, name })
  }
}

function getAutofillEntries(cfg) {
  const entries = cfg?.autofill?.entries
  if (!entries) return []
  if (!Array.isArray(entries)) {
    throw new Error('autofill.entries must be an array of entry scss paths')
  }
  return entries.filter(Boolean)
}

function generateAutofillScss(cfg, collectedRules) {
  const { ns, mobileMax } = getAutofill(cfg)

  const header = `@use "./responsive" as ${ns};

// Generated by scss-kit from ${CONFIG_NAME}
// Source: scanned ${ns}.resp(pc, mobile, type) markers in scss.
// Do not edit this file directly; re-run: npm run scss-kit:responsive:generate
\n`

  const mixinHeader = `@mixin responsive_autofill_overrides() {\n`
  const mixinFooter = `\n}\n`

  if (!collectedRules.length) {
    return (
      header +
      mixinHeader +
      `  @media screen and (max-width: ${mobileMax}px) {\n  }\n` +
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
    `  @media screen and (max-width: ${mobileMax}px) {\n` +
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
  return `(${entries}\n)`
}

function generateResponsiveScss(cfg) {
  const mobileMap = toScssMap(cfg.coefficients.mobile)
  const desktopMap = toScssMap(cfg.coefficients.desktop)

  return `@use "sass:map";
@use "sass:math";
@use "sass:list";
@use "sass:meta";

// Generated by scss-kit from ${CONFIG_NAME}
// Edit ${CONFIG_NAME} to change design sizes / coefficient tables.

// Design widths:
// - desktop: ${cfg.design.desktopWidth}
// - mobile: ${cfg.design.mobileWidth}

$coef-mobile: ${mobileMap};

$coef-desktop: ${desktopMap};

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

@function coef($type, $range: mobile) {
  $table: if($range == desktop, $coef-desktop, $coef-mobile);
  @if map.has-key($table, $type) {
    @return map.get($table, $type);
  }
  @error "Unknown coef type: #{$type}";
}

// 根据 ${cfg.design.mobileWidth} 稿数值 + 系数，推导 clamp() 的最小值。
@function min_px($mobile, $type, $range: mobile, $override-coef: null) {
  $v: _to-px($mobile);

  // Mobile typography rule:
  // - Scale ${cfg.design.mobileWidth}px design to 375px proportion
  // - Apply readable floors: h1>=16px, h2>=14px, other text>=12px
  // - Ensure min <= max (design value)
  @if $range == mobile and $override-coef == null {
    $typography-types: (h1, h2, h3, body, small, button-text);
    @if list.index($typography-types, $type) {
      $scaled-375: $v * math.div(375, ${cfg.design.mobileWidth});
      $floor: if($type == h1, 16px, if($type == h2, 14px, 12px));
      @return math.min($v, math.max($scaled-375, $floor));
    }
  }

  $c: if($override-coef == null, coef($type, $range), $override-coef);
  @return $v * $c;
}

// 生成桌面段 clamp：min + calc(pc * var(--px-to-vw)) + pc
@function clamp_pc($pc, $min) {
  $v: _to-px($pc);
  $n: _to-num($pc);
  @return clamp(#{$min}, calc(#{$n} * var(--px-to-vw)), #{$v});
}

// 生成移动段 clamp：min + calc(mobile * var(--px-to-vw-mb)) + mobile
@function clamp_mb($mobile, $min) {
  $v: _to-px($mobile);
  $n: _to-num($mobile);
  @return clamp(#{$min}, calc(#{$n} * var(--px-to-vw-mb)), #{$v});
}

// resp(): write PC with mobile+type embedded (for scss-kit autofill scanning)
@function resp($pc, $mobile, $type) {
  @if meta.type-of($pc) != number {
    @error "resp() expects a number (px) for pc value";
  }
  @return clamp_pc($pc, min_px($pc, $type, desktop));
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
      'concurrently -k -n AUTO,CSS,THEME "npm:responsive:watch" "npm:css:watch" "npm:theme:watch"',
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
  const { config } = loadConfig()

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
            'deprecated: responsive map mode removed; use r.resp(pc, mobile, type) + responsive:generate',
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

      const collected = scanScssForAutofill(targetAbs, autofill)
      const scss = generateAutofillScss(config, collected)
      const res = writeFileSafely(outAbs, scss, {
        overwriteIfContains: 'Generated by scss-kit',
      })
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
      return
    }

    const absFiles = []
    for (const d of autofill.scanDirs) {
      walkScssFiles(path.isAbsolute(d) ? d : path.join(ROOT, d), absFiles)
    }

    // Avoid scanning the output file itself.
    const outputAbs = autofill.outputAbs
    const files = absFiles.filter(
      (f) => path.resolve(f) !== path.resolve(outputAbs)
    )

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

    if (!entries.length) {
      console.log(
        JSON.stringify(
          {
            action: 'responsive:generate:entries',
            ok: false,
            reason:
              'missing autofill.entries in scss-kit.config.json (expected array of entry scss paths)',
          },
          null,
          2
        )
      )
      process.exit(1)
    }

    const results = []
    for (const entryRel of entries) {
      const entryAbs = path.isAbsolute(entryRel)
        ? entryRel
        : path.join(ROOT, entryRel)
      if (!fs.existsSync(entryAbs)) {
        results.push({ entry: entryRel, ok: false, reason: 'file not found' })
        continue
      }

      const base = path.basename(entryAbs, '.scss')
      const outRel = path.join(
        config?.paths?.scssSrcDir ?? 'src/styles',
        `_responsive-autofill.${base}.generated.scss`
      )
      const outAbs = path.join(ROOT, outRel)

      const collected = scanScssForAutofill(entryAbs, autofill)
      const scss = generateAutofillScss(config, collected)
      const res = writeFileSafely(outAbs, scss, {
        overwriteIfContains: 'Generated by scss-kit',
      })
      results.push({
        entry: toPosix(path.relative(ROOT, entryAbs)),
        ok: true,
        rules: collected.length,
        output: toPosix(path.relative(ROOT, outAbs)),
        written: toPosix(path.relative(ROOT, res.written)),
        mode: res.mode,
      })
    }

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
    `scss-kit usage:\n  node tools/scss-kit/cli.mjs init\n  node tools/scss-kit/cli.mjs generate\n  node tools/scss-kit/cli.mjs doctor\n  node tools/scss-kit/cli.mjs responsive:extract <file.scss>\n  node tools/scss-kit/cli.mjs responsive:generate\n`
  )
}

main()
