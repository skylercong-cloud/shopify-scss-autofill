# Readable/Dense Responsive Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace semantic responsive coefficients and pixel fallbacks with readable/dense profiles, add fixed-core output and inherited modes, and make preconfigured missing entries safe during development startup.

**Architecture:** Keep `tools/scss-kit` as the implementation source of truth. Add configuration normalization and migration validation in the CLI, generate a smaller Sass runtime using profile-bound helpers and inherited CSS variables, extend autofill replacement for optional/map arguments, and make the watcher create generated placeholders before boilerplate imports. Synchronize source changes into the scaffold template and demo only after source tests pass.

**Tech Stack:** Node.js 18+, ESM, `node:test`, Sass, PostCSS SCSS, JSON Schema, Theme Kit workflow scripts.

**Spec:** `docs/superpowers/specs/2026-09-05-readable-dense-responsive-design.md`

## Global Constraints

- Default coefficients are readable `min: 0.625, max: 1.5` and dense `min: 0.5, max: 1.5`.
- `r.resp(pc, mobile)` defaults to readable; arg 4 inherits arg 3.
- Numeric profile arguments override only minimum coefficient; Sass maps can override `min`, `max`, or both.
- `@include r.mode(readable|dense)` establishes an inherited mode; explicit child arguments override it.
- Remove semantic coefficient tables, floors, ceilings, preset tables, fallback division, and safety-anchor comparisons completely.
- Legacy configuration must fail with a migration error.
- `fixedCore.width` is validated metadata only; `fixedCore.breakpoint` fixes desktop r-unit output at one pixel.
- Missing configured entries are pending, not fatal, and must not lose object-form `varScope`.
- Preserve every unrelated feature and synchronize source, template, demo, snippets, schema, docs, and changelogs.

---

### Task 1: Add Integration Test Harness And New Configuration Contract

**Files:**
- Create: `tools/scss-kit/tests/cli.test.mjs`
- Modify: `tools/scss-kit/cli.mjs`
- Modify: `tools/scss-kit/schema.json`

**Interfaces:**
- Produces: `validateAndNormalizeConfig(rawConfig)` returning the validated new configuration.
- Produces: integration helper that runs `cli.mjs` in an isolated temporary project.

- [ ] **Step 1: Write failing tests for defaults, validation, and legacy migration errors**

Create tests that write minimal temporary `scss-kit.config.json` files and invoke `node tools/scss-kit/cli.mjs generate`. Assert that the new configuration succeeds and generated Sass contains readable/dense maps. Assert that each legacy form fails with a message containing `Legacy responsive coefficient config detected`:

```js
for (const legacy of [
  { maxCoefficients: {} },
  { floors: {} },
  { ceilings: {} },
  { coefficients: { mobile: {}, desktop: {} } },
  { responsive: { mobileProfilePreset: 'auto' } },
]) {
  const result = runCli(projectWith(legacy), 'generate')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr + result.stdout, /Legacy responsive coefficient config detected/)
}
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test tools/scss-kit/tests/cli.test.mjs`

Expected: FAIL because the CLI still resolves old presets and expects mobile/desktop coefficient tables.

- [ ] **Step 3: Implement configuration normalization and schema**

Add a single validation path before command dispatch. It must:

```js
const DEFAULT_COEFFICIENTS = {
  readable: { min: 0.625, max: 1.5 },
  dense: { min: 0.5, max: 1.5 },
}
```

Reject legacy top-level fields and `responsive.mobileProfilePreset`, validate both named profiles and optional `fixedCore`, and return defaults only for omitted new fields. Replace the schema with `coefficients.readable/dense` objects and nullable `fixedCore`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tools/scss-kit/tests/cli.test.mjs`

Expected: configuration tests PASS; later generator assertions may still fail.

- [ ] **Step 5: Commit**

```bash
git add tools/scss-kit/cli.mjs tools/scss-kit/schema.json tools/scss-kit/tests/cli.test.mjs
git commit -m "refactor: define readable dense config contract"
```

### Task 2: Generate The Readable/Dense Sass Runtime

**Files:**
- Modify: `tools/scss-kit/cli.mjs`
- Modify: `tools/scss-kit/tests/cli.test.mjs`

**Interfaces:**
- Produces Sass APIs: `mode($profile)`, `profile_min($profile)`, `profile_max($profile)`, `min_px($value, $profile: null)`, `max_px($value, $profile: null)`, `resp_mb($mobile, $profile: null)`, and `resp($pc, $mobile, $desktop-profile: null, $mobile-profile: null)`.

- [ ] **Step 1: Add failing generation and Sass compilation tests**

Use an entry containing:

```scss
@use "./responsive" as r;

:root { font-size: r.resp(24px, 16px); }
.card {
  @include r.mode(dense);
  padding: r.resp(32px, 20px);
  .title { font-size: r.resp(24px, 16px, readable); }
  .price { font-size: r.resp(20px, 14px, (min: 0.55, max: 1.4)); }
}
```

Assert generated Sass no longer contains `$floor-`, `$ceiling-`, semantic maps, or safety anchors. Compile representative SCSS with `npx sass` and assert success.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tools/scss-kit/tests/cli.test.mjs --test-name-pattern="Sass runtime"`

Expected: FAIL because the current function requires arg 3 and has no `mode()` mixin.

- [ ] **Step 3: Replace the generated runtime**

Generate only readable/dense profile maps. Implement profile parsing for named strings, numeric minimum overrides, and Sass maps. Default calls use inherited custom properties emitted at the root and by `mode()`; explicit calls calculate direct bounds. Preserve `type=0` as the existing pure-fluid escape hatch unless the spec explicitly supersedes it.

- [ ] **Step 4: Verify all clamp modes**

Generate configs with mobile widths 750, 590, and 375 and assert respectively:

```text
$mobile-clamp-mode: min-first
$mobile-clamp-mode: dual-bound
$mobile-clamp-mode: max-first
```

Compile each generated runtime and sample entry.

- [ ] **Step 5: Commit**

```bash
git add tools/scss-kit/cli.mjs tools/scss-kit/tests/cli.test.mjs
git commit -m "refactor: generate readable dense Sass runtime"
```

### Task 3: Extend Autofill Scanning And Fixed-Core Output

**Files:**
- Modify: `tools/scss-kit/cli.mjs`
- Modify: `tools/scss-kit/tests/cli.test.mjs`

**Interfaces:**
- Consumes: new `resp_mb($mobile, $profile: null)` Sass API.
- Produces: mobile replacements that preserve optional arg 4 and complex Sass maps.
- Produces: fixed-core desktop unit media query in global and per-entry generated mixins.

- [ ] **Step 1: Add failing scanner tests**

Assert these replacements:

```text
r.resp(24px, 16px) -> r.resp_mb(16px)
r.resp(24px, 16px, dense) -> r.resp_mb(16px, dense)
r.resp(24px, 16px, readable, dense) -> r.resp_mb(16px, dense)
r.resp(24px, 16px, (min: 0.7, max: 1.3)) -> r.resp_mb(16px, (min: 0.7, max: 1.3))
```

Add a fixed-core config and assert the generated mixin contains `@media screen and (min-width: 1500px)` and scoped `--px-to-vw: 1px`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tools/scss-kit/tests/cli.test.mjs --test-name-pattern="autofill|fixed core"`

Expected: FAIL because two-argument calls are ignored and fixed-core output does not exist.

- [ ] **Step 3: Implement scanner and fixed-core generation**

Change `replaceAutofillCalls` to accept two arguments, preserve nested map syntax through `splitTopLevelArgs`, retain the fourth-argument override, and continue mapping explicit `0` to `vw_mb`. Add fixed-core output after the normal desktop variable block and before the mobile block, using entry `varScope` when present.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tools/scss-kit/tests/cli.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/scss-kit/cli.mjs tools/scss-kit/tests/cli.test.mjs
git commit -m "feat: add inherited autofill and fixed core output"
```

### Task 4: Make Missing Configured Entries Pending And Race-Free

**Files:**
- Modify: `tools/scss-kit/responsive-watch.mjs`
- Modify: `tools/scss-kit/cli.mjs`
- Create: `tools/scss-kit/tests/responsive-watch.test.mjs`

**Interfaces:**
- Produces: `responsive:generate:entries` result item `{ entry, ok: true, pending: true, reason: 'file not found' }`.
- Produces: watcher matching object/string entries by normalized `file`.

- [ ] **Step 1: Write failing pending-entry test**

Configure an object entry that does not exist, run `responsive:generate:entries`, and assert exit code zero plus `pending: true`.

- [ ] **Step 2: Write failing watcher creation test**

Create the empty file after setup, invoke `responsive-watch.mjs`, and assert:

```js
assert.match(entry, /@use "\.\/responsive" as r;/)
assert.match(entry, /@use "\.\/_responsive-autofill\.autumn-sale-2026\.generated" as auto;/)
assert.equal(config.autofill.entries.length, 1)
assert.equal(config.autofill.entries[0].varScope, '.autumn-sale-2026')
assert.ok(existsSync(generatedPath))
```

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test tools/scss-kit/tests/responsive-watch.test.mjs`

Expected: FAIL because missing entries are fatal and object entries are not matched by `includes()`.

- [ ] **Step 4: Implement pending and placeholder flow**

Treat missing entries as successful pending results. In the watcher normalize entry records, create a generated placeholder before writing imports into an empty entry, preserve existing object entries, and only append a string for genuinely unconfigured files.

- [ ] **Step 5: Run tests**

Run: `node --test tools/scss-kit/tests/*.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/scss-kit/cli.mjs tools/scss-kit/responsive-watch.mjs tools/scss-kit/tests/responsive-watch.test.mjs
git commit -m "fix: allow pending responsive entries"
```

### Task 5: Synchronize Scaffold, Demo, Snippets, And Defaults

**Files:**
- Modify: `tools/create-scss-kit/bin/create-scss-kit.mjs`
- Modify: `.vscode/scss-kit.code-snippets`
- Modify: `demo/scss-kit.config.json`
- Regenerate: `demo/src/styles/_responsive.scss`
- Regenerate: `demo/src/styles/_responsive-autofill.generated.scss`
- Sync: `tools/create-scss-kit/template/tools/scss-kit/**`
- Sync: `demo/tools/scss-kit/**`

**Interfaces:**
- Consumes: source runtime and schema from Tasks 1-4.
- Produces: new projects and demo projects using the same new contract.

- [ ] **Step 1: Update initializer defaults and snippets**

Remove old profiles/fallback tables and emit `fixedCore: null` plus readable/dense coefficients. Update snippets so `r.resp` arg 3 suggestions are `readable`, `dense`, a number, or a bounds map, and add an `r.mode` snippet.

- [ ] **Step 2: Synchronize runtime copies**

Run: `node tools/create-scss-kit/scripts/sync-template.mjs`

Copy the source runtime directory to `demo/tools/scss-kit` using the repository's established synchronization approach, then regenerate demo outputs from its new config.

- [ ] **Step 3: Verify synchronized content**

Run comparisons that exclude intentional demo-specific files and assert `cli.mjs`, `responsive-watch.mjs`, and `schema.json` are identical across source, template, and demo.

- [ ] **Step 4: Run demo commands**

Run in `demo`:

```bash
npm install
npm run scss-kit:generate
npm run scss-kit:responsive:generate
npm run scss-kit:responsive:generate:entries
npm run scss-kit:doctor
npx sass src/styles:assets --no-source-map
```

Expected: every command exits zero.

- [ ] **Step 5: Commit**

```bash
git add .vscode tools/create-scss-kit demo
git commit -m "chore: sync readable dense scaffold runtime"
```

### Task 6: Update Documentation And Run Final Verification

**Files:**
- Modify: `README.md`
- Modify: `tools/scss-kit/README.md`
- Modify: `tools/scss-kit/MAINTAINING.md`
- Modify: `tools/create-scss-kit/README.md`
- Modify: `tools/create-scss-kit/CHANGELOG.md`
- Modify: `website/docs/index.html`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: migration guidance and complete public documentation for the new API.

- [ ] **Step 1: Replace old coefficient documentation**

Document readable/dense defaults, inherited `r.mode()`, numeric/map overrides, automatic mobile modes, fixed-core behavior, and pending entry creation. Remove all semantic coefficient/floor/ceiling/preset guidance without removing unrelated instructions.

- [ ] **Step 2: Add migration section and changelog entry**

Show old-to-new configuration and explicitly list removed fields. Document that `r.resp(pc, mobile)` is now valid and defaults to readable.

- [ ] **Step 3: Run repository-wide stale-reference scan**

Run:

```bash
rg -n "mobileProfilePreset|maxCoefficients|floors|ceilings|h1.*0\\.|button-text|price-large" README.md CHANGELOG.md tools demo website .vscode
```

Expected: matches appear only in historical changelog entries, explicit migration/error tests, or wording that states the feature was removed.

- [ ] **Step 4: Run complete verification**

Run:

```bash
node --test tools/scss-kit/tests/*.test.mjs
node tools/create-scss-kit/scripts/sync-template.mjs
npm --prefix tools/create-scss-kit pack --dry-run
npm --prefix website run build
git diff --check
git status --short
```

Also rerun the demo CLI and Sass compilation commands from Task 5.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md CHANGELOG.md tools website .vscode demo
git commit -m "docs: document readable dense responsive profiles"
```

- [ ] **Step 6: Review final branch diff**

Compare the branch against `origin/main`, verify that every changed file belongs to the approved scope, and report tests plus any residual compatibility risks.
