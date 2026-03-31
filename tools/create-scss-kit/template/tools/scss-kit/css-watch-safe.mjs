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
 * Collect a balanced { } block starting at lines[startIdx].
 * Returns the slice of lines from opener to closer (inclusive).
 * @param {string[]} lines
 * @param {number} startIdx
 * @returns {string[]}
 */
function collectBlock(lines, startIdx) {
  const block = [lines[startIdx]]
  let depth =
    (lines[startIdx].match(/\{/g) || []).length -
    (lines[startIdx].match(/\}/g) || []).length
  let i = startIdx + 1
  while (i < lines.length && depth > 0) {
    const l = lines[i]
    block.push(l)
    depth += (l.match(/\{/g) || []).length
    depth -= (l.match(/\}/g) || []).length
    i++
  }
  return block
}

/**
 * Process rule blocks that contain ONLY CSS comments (no declarations).
 * Instead of dropping them, the comments are extracted and emitted as
 * standalone lines before the following rule — preserving intent without
 * generating empty selector blocks in the output.
 *
 * Works on Sass --style=expanded output.
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
    // Detect a rule opener: ends with '{' and is NOT an @-rule
    if (!trimmed.startsWith('@') && trimmed.endsWith('{')) {
      const block = collectBlock(lines, i)
      i += block.length
      const body = block.slice(1, block.length - 1)
      const hasDecl = body.some(
        (l) => l.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, '').trim().length > 0
      )
      if (hasDecl) {
        result.push(...block)
      } else {
        // Comment-only block: lift comments out as standalone lines
        for (const bl of body) {
          const t = bl.trim()
          if (t.length > 0) result.push(t)
        }
      }
    } else {
      result.push(line)
      i++
    }
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Hoist --px-to-vw and --px-to-vw-mb :root declarations to the top of the
 * file (right after the scss-kit:managed marker / @charset lines).
 *
 * The --px-to-vw block is a top-level :root { ... }.
 * The --px-to-vw-mb block is a :root { ... } nested inside a @media rule;
 * we extract it and place a matching @media{ :root{ --px-to-vw-mb } } at the
 * top, then remove it from the original @media block (the block is dropped
 * entirely if it has no remaining rules).
 * @param {string} cssText
 * @returns {string}
 */
function hoistCssVars(cssText) {
  const lines = cssText.split(/\r?\n/)

  const pcVarLines = [] // lines of :root { --px-to-vw }
  let mbMediaHeader = '' // @media header for the --px-to-vw-mb block
  const mbVarLines = [] // lines of :root { --px-to-vw-mb }

  const output = []
  let markerPos = -1 // index in output where the marker line sits

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimStart()

    // Track marker line position in output
    if (markerPos === -1 && line.includes('scss-kit:managed')) {
      markerPos = output.length
      output.push(line)
      i++
      continue
    }

    // Top-level :root block
    if (trimmed === ':root {') {
      const block = collectBlock(lines, i)
      i += block.length
      const blockText = block.join('\n')
      if (
        blockText.includes('--px-to-vw:') &&
        !blockText.includes('--px-to-vw-mb')
      ) {
        pcVarLines.push(...block)
      } else {
        output.push(...block)
      }
      continue
    }

    // @media blocks — look for --px-to-vw-mb inside
    if (/^@media\b/.test(trimmed)) {
      const mediaBlock = collectBlock(lines, i)
      i += mediaBlock.length

      if (!mediaBlock.join('\n').includes('--px-to-vw-mb:')) {
        output.push(...mediaBlock)
        continue
      }

      const mediaHeader = mediaBlock[0]
      const mediaFooter = mediaBlock[mediaBlock.length - 1]
      const mediaBody = mediaBlock.slice(1, -1)

      // Separate :root { --px-to-vw-mb } from the rest of the media body
      const innerRest = []
      let j = 0
      while (j < mediaBody.length) {
        const bl = mediaBody[j]
        if (bl.trimStart() === ':root {') {
          const inner = collectBlock(mediaBody, j)
          j += inner.length
          if (inner.join('\n').includes('--px-to-vw-mb:')) {
            mbMediaHeader = mbMediaHeader || mediaHeader
            mbVarLines.push(...inner)
          } else {
            innerRest.push(...inner)
          }
        } else {
          innerRest.push(bl)
          j++
        }
      }

      // Keep the @media block only if it still has rules
      if (innerRest.some((l) => l.trim().length > 0)) {
        output.push(mediaHeader)
        output.push(...innerRest)
        output.push(mediaFooter)
      }
      continue
    }

    output.push(line)
    i++
  }

  // Build the lines to insert at the top
  const toInsert = []
  if (pcVarLines.length > 0) {
    toInsert.push('', ...pcVarLines)
  }
  if (mbVarLines.length > 0 && mbMediaHeader) {
    toInsert.push('', mbMediaHeader, ...mbVarLines, '}')
  }

  if (toInsert.length > 0) {
    const insertAt = markerPos >= 0 ? markerPos + 1 : 0
    output.splice(insertAt, 0, ...toInsert)
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n')
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
  const cleaned = removeCommentOnlyBlocks(tmpText)
  const withMarkerAdded = withMarker(cleaned, sourceRel)
  const nextText = hoistCssVars(withMarkerAdded)

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
    'sass',
    '--watch',
    `${toPosix(path.relative(ROOT, STYLES_DIR))}:${toPosix(
      path.relative(ROOT, OUT_DIR)
    )}`,
    '--style=expanded',
    '--no-source-map',
    '--silence-deprecation=if-function',
  ]

  console.log('[scss-kit] starting sass watch (safe mode)')
  const child = spawn('npx', sassArgs, {
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
