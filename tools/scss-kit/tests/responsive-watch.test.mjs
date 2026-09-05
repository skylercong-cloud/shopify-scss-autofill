import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const watcherPath = path.join(repoRoot, 'tools', 'scss-kit', 'responsive-watch.mjs')

function createProject(entries = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scss-kit-watch-'))
  fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tools', 'scss-kit'), { recursive: true })
  fs.copyFileSync(watcherPath, path.join(root, 'tools', 'scss-kit', 'responsive-watch.mjs'))
  fs.copyFileSync(path.join(repoRoot, 'tools', 'scss-kit', 'cli.mjs'), path.join(root, 'tools', 'scss-kit', 'cli.mjs'))
  const config = {
    design: { desktopWidth: 1920, mobileWidth: 750 },
    fixedCore: null,
    paths: { scssSrcDir: 'src/styles', cssOutDir: 'assets' },
    autofill: {
      function: 'r.resp',
      vwFunction: 'r.vw',
      mobileMax: 850,
      scanDirs: ['src/styles'],
      output: 'src/styles/_responsive-autofill.generated.scss',
      entries,
    },
    themeKit: { env: 'development', configYml: 'config.yml', ignoreFiles: [] },
    coefficients: {
      readable: { min: 0.625, max: 1.5 },
      dense: { min: 0.5, max: 1.5 },
    },
  }
  fs.writeFileSync(path.join(root, 'scss-kit.config.json'), JSON.stringify(config, null, 2) + '\n')
  return root
}

function runWatcher(root, relativePath) {
  return spawnSync(process.execPath, [watcherPath, relativePath], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('watcher creates placeholder before boilerplate and registers an empty entry', () => {
  const root = createProject()
  const entry = path.join(root, 'src', 'styles', 'autumn-sale-2026.scss')
  fs.writeFileSync(entry, '')

  const result = runWatcher(root, 'src/styles/autumn-sale-2026.scss')
  assert.equal(result.status, 0, result.stderr)

  const entryText = fs.readFileSync(entry, 'utf8')
  const generated = path.join(root, 'src', 'styles', '_responsive-autofill.autumn-sale-2026.generated.scss')
  assert.ok(fs.existsSync(generated))
  assert.match(entryText, /@use "\.\/responsive" as r;/)
  assert.match(entryText, /@use "\.\/_responsive-autofill\.autumn-sale-2026\.generated" as auto;/)
  assert.equal(entryText.match(/@font-face \{/g)?.length, 14)
  assert.match(entryText, /font-family: "MiSans Bold";/)
  assert.match(entryText, /font-family: "Rany Bold";/)
  assert.match(entryText, /font-family: "MiSans Latin Light";/)
  assert.match(
    entryText,
    /MiSans-Bold_36d8ea4e-3ca2-4f8c-85b3-21ba185fa45c\.ttf\?v=1777011186/
  )
  assert.equal(entryText.match(/font-display: swap;/g)?.length, 14)
  assert.match(entryText, /@include auto\.responsive_autofill_overrides\(\);/)
  assert.ok(entryText.indexOf('@use "./_responsive-autofill') < entryText.indexOf('@font-face'))
  assert.ok(entryText.lastIndexOf('@font-face') < entryText.indexOf('@include auto.'))

  const config = JSON.parse(fs.readFileSync(path.join(root, 'scss-kit.config.json'), 'utf8'))
  assert.deepEqual(config.autofill.entries, ['src/styles/autumn-sale-2026.scss'])
})

test('watcher preserves object entry varScope and does not duplicate it', () => {
  const root = createProject([{ file: 'src/styles/page.scss', varScope: '.autumn-sale-2026' }])
  const entry = path.join(root, 'src', 'styles', 'page.scss')
  fs.writeFileSync(entry, '')

  assert.equal(runWatcher(root, 'src/styles/page.scss').status, 0)
  assert.equal(runWatcher(root, 'src/styles/page.scss').status, 0)

  const config = JSON.parse(fs.readFileSync(path.join(root, 'scss-kit.config.json'), 'utf8'))
  assert.deepEqual(config.autofill.entries, [{ file: 'src/styles/page.scss', varScope: '.autumn-sale-2026' }])
  const generated = fs.readFileSync(path.join(root, 'src', 'styles', '_responsive-autofill.page.generated.scss'), 'utf8')
  assert.match(generated, /\.autumn-sale-2026 \{/)
})
