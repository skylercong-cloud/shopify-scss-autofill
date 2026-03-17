import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Manual fallback (unsafe): direct Sass directory mapping that overwrites assets.
// sass --watch src/styles:assets --style=expanded --no-source-map

const ROOT = process.cwd()
const STYLES_DIR = path.join(ROOT, 'src', 'styles')
const OUT_DIR = path.join(ROOT, 'src', '.sass-out')
const ASSETS_DIR = path.join(ROOT, 'assets')

const MARKER_PREFIX = 'scss-kit:managed'

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function listCssFilesRec(dir) {
  /** @type {string[]} */
  const out = []
  /** @type {string[]} */
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const abs = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(abs)
      else if (ent.isFile() && ent.name.endsWith('.css')) out.push(abs)
    }
  }
  return out
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function hasMarker(text) {
  return text.includes(MARKER_PREFIX)
}

function withMarker(cssText, sourceRel) {
  const marker = `/* ${MARKER_PREFIX} source=${sourceRel} */`

  // Keep @charset as the very first statement if present.
  const lines = cssText.split(/\r?\n/)
  if (lines.length && /^@charset\s+".*";\s*$/.test(lines[0].trim())) {
    if (lines[1]?.includes(MARKER_PREFIX)) return cssText
    lines.splice(1, 0, marker)
    return lines.join('\n')
  }

  if (cssText.startsWith(marker)) return cssText
  return marker + '\n' + cssText
}

function toPosix(p) {
  return p.replaceAll('\\', '/')
}

/**
 * Remove CSS rule blocks (non-@-rules) that contain no declarations —
 * only CSS comments and/or whitespace. Sass preserves /* *\/ comments
 * in output; this post-process step prevents empty selector blocks from
 * cluttering the compiled CSS.
 *
 * Works on Sass --style=expanded output (flat, no nesting inside rules).
 * @param {string} cssText
 * @returns {string}
 */
function removeCommentOnlyBlocks(cssText) {
  const lines = cssText.split(/\r?\n/)
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()
    // Detect a rule opener: line ends with '{' and is NOT an @-rule
    if (!trimmed.startsWith('@') && trimmed.endsWith('{')) {
      const block = [line]
      let depth =
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      i++
      while (i < lines.length && depth > 0) {
        const bl = lines[i]
        block.push(bl)
        depth += (bl.match(/\{/g) || []).length
        depth -= (bl.match(/\}/g) || []).length
        i++
      }
      // Check whether the body has any actual declarations
      // (lines that are non-empty after stripping CSS comments)
      const body = block.slice(1, block.length - 1)
      const hasDecl = body.some((l) => {
        const stripped = l.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, '').trim()
        return stripped.length > 0
      })
      if (hasDecl) result.push(...block)
      // else: block contains only comments — drop it
    } else {
      result.push(line)
      i++
    }
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

function syncOne(tmpCssAbs) {
  const relFromOut = path.relative(OUT_DIR, tmpCssAbs)
  const targetAbs = path.join(ASSETS_DIR, relFromOut)
  const targetRel = toPosix(path.relative(ROOT, targetAbs))

  // Guard against any unexpected path escape (e.g. weird symlinks).
  const assetsRoot = path.resolve(ASSETS_DIR) + path.sep
  const resolvedTarget = path.resolve(targetAbs)
  if (!resolvedTarget.startsWith(assetsRoot)) {
    console.error(
      `[scss-kit] BLOCKED write outside assets/: ${toPosix(
        path.relative(ROOT, resolvedTarget)
      )}`
    )
    return
  }

  // Map tmp CSS back to its SCSS entry and avoid creating/updating assets CSS
  // for stale outputs left behind in src/.sass-out.
  const sourceAbs = path
    .join(ROOT, 'src', 'styles', relFromOut)
    .replace(/\.css$/i, '.scss')
  const sourceRel = toPosix(path.relative(ROOT, sourceAbs))
  if (!fs.existsSync(sourceAbs)) {
    console.warn(
      `[scss-kit] skipped stale output: ${toPosix(
        path.relative(ROOT, tmpCssAbs)
      )} (missing ${sourceRel})`
    )
    return
  }

  const tmpText = readText(tmpCssAbs)
  const cleanedText = removeCommentOnlyBlocks(tmpText)
  const nextText = withMarker(cleanedText, sourceRel)

  if (!fs.existsSync(targetAbs)) {
    ensureDir(path.dirname(targetAbs))
    fs.writeFileSync(targetAbs, nextText, 'utf8')
    console.log(`[scss-kit] wrote ${targetRel}`)
    return
  }

  const existing = readText(targetAbs)
  if (!hasMarker(existing)) {
    console.error(
      `[scss-kit] BLOCKED overwrite: ${targetRel}\n` +
        `  Reason: existing CSS has no '${MARKER_PREFIX}' marker.\n` +
        `  Fix: rename/delete the existing file, or add a marker comment to confirm it's managed.\n` +
        `  Example (keep @charset first if present): /* ${MARKER_PREFIX} source=${sourceRel} */\n`
    )
    return
  }

  fs.writeFileSync(targetAbs, nextText, 'utf8')
  console.log(`[scss-kit] updated ${targetRel}`)
}

function startSassWatch() {
  ensureDir(OUT_DIR)
  const sassArgs = [
    '--watch',
    `${toPosix(path.relative(ROOT, STYLES_DIR))}:${toPosix(
      path.relative(ROOT, OUT_DIR)
    )}`,
    '--style=expanded',
    '--no-source-map',
  ]

  console.log('[scss-kit] starting sass watch (safe mode)')
  const child = spawn('sass', sassArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: ROOT,
  })
  return child
}

function main() {
  const sassProc = startSassWatch()

  /** @type {Map<string, number>} */
  const lastMtime = new Map()

  const timer = setInterval(() => {
    const files = listCssFilesRec(OUT_DIR)
    for (const f of files) {
      let stat
      try {
        stat = fs.statSync(f)
      } catch {
        continue
      }
      const prev = lastMtime.get(f)
      if (prev === stat.mtimeMs) continue
      lastMtime.set(f, stat.mtimeMs)
      try {
        syncOne(f)
      } catch (e) {
        console.error(`[scss-kit] sync failed: ${String(e?.message ?? e)}`)
      }
    }
  }, 500)

  function shutdown(code) {
    clearInterval(timer)
    try {
      sassProc.kill('SIGINT')
    } catch {
      // ignore
    }
    process.exit(code)
  }

  sassProc.on('exit', (code) => {
    // If sass stops, stop the sync loop too.
    shutdown(typeof code === 'number' ? code : 1)
  })

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
}

main()
