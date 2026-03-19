# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [0.6.0] - 2026-03-19

### Added

- **r.re() shorthand mappings**: `r.re()` now supports shorthand patterns for complex property values. PC side expanded via SCSS `$_re-shorthands` map + `_expand-re()` function; mobile side expanded via JS `expandReValue()`. Supported shorthands:
  - `grid-cols-N` / `cols-N` → `repeat(N, 1fr)` (grid columns)
  - `grid-rows-N` / `rows-N` → `repeat(N, 1fr)` (grid rows)
  - `span-N` → `span N` (column/row span)
  - `order-N` → `N` (flex/grid order)
  - `gap-N` → `Npx` (spacing)
  - `opacity-N` → `N/100` (e.g. `opacity-50` → `0.5`)
  - `z-N` → `N` (z-index)
- **Incremental generation**: `responsive:generate:entries` now caches source file SHA-256 hashes in `.scss-kit-cache.json`; unchanged files are skipped. Config changes automatically invalidate all caches. Use `--force` flag to force full regeneration.
- **Error recovery & rollback**: Both `responsive:generate` and `responsive:generate:entries` now back up target files (`.bak`) before generation. On failure, the previous file is automatically restored; on success, backups are cleaned up.
- **VS Code code snippets**: Added `.vscode/scss-kit.code-snippets` with 13 snippet definitions for all responsive functions (`r.resp`, `r.vw`, `r.re`, `r.re-grid`, `r.clamp_pc`, `r.clamp_mb`, etc.) and an entry file boilerplate template.

### Changed

- Generated `_responsive.scss` now includes `$_re-shorthands` SCSS map and `_expand-re()` wrapper function for PC-side shorthand expansion in `r.re()`.
- CLI usage help updated to show `responsive:generate:entries [--force]` syntax.

### Documentation

- Updated `tools/scss-kit/README.md` with r.re() shorthand format, incremental cache, rollback behavior, and VS Code snippets section.
- Updated `tools/scss-kit/MAINTAINING.md` with new capabilities and incremental cache details.
- Updated website docs (`website/docs/index.html`) with r.re() shorthand examples, `--force` flag, and new “增量生成与开发体验” section.

## [0.5.1] - 2026-03-17

### Fixed

- **`r.resp(pc, mb, 0)` type=0 crash**: When the type argument is `0` (pure fluid, no clamp bounds), autofill now emits `r.vw_mb(mobile)` instead of `r.resp_mb(mobile, 0)`, which previously caused a SCSS compile error (`max_px() expects positive coefficient`).
- **Comment-only CSS blocks**: Instead of dropping the block entirely, comments are now extracted and emitted as standalone lines immediately before the next rule — preserving intent while eliminating empty selector blocks.
- **CSS variable hoisting**: `--px-to-vw` and `--px-to-vw-mb` `:root` declarations are now moved to the very top of the output CSS file (right after the managed marker), ensuring variables are defined before any usage.

## [0.5.0] - 2026-03-17

### Added

- Added `r.re($pc-val, $mobile-val: null)` function for non-dimension responsive values (e.g. `color`, `display`, `background`). PC returns first arg; autofill scanner emits mobile override with second arg directly. Usage: `color: r.re(#fff, #000);`
- Added `vw_pc_raw($pc)` helper: outputs `calc(n * var(--px-to-vw))` without an upper-bound cap (contrast with `vw_pc` which adds `min(..., px)`).

### Fixed

- **Comment-only CSS blocks**: `css-watch-safe.mjs` now post-processes compiled CSS to remove selector blocks that contain only CSS comments (`/* */`) and no declarations, eliminating spurious empty rules in output CSS.
- **Duplicate `--px-to-vw-mb` variable**: Removed per-selector `--px-to-vw-mb` declarations from autofill output. `:root { --px-to-vw-mb }` in the `@media` block is sufficient for all descendants.

### Changed

- `dev:theme:auto` script now runs `scss-kit:generate && scss-kit:responsive:generate` before starting watchers, so config changes take effect immediately on project start.

## [0.4.1] - 2026-03-10

### Added

- Added `responsive.mobileProfilePreset` config (`off | auto | 375 | 590`) to support built-in mobile profile presets.
- Added built-in 590 and 375 preset value tables in scss-kit runtime:
  - 590 preset applies complete `coefficients.mobile` + `floors.mobile` + `maxCoefficients.mobile` + `ceilings.mobile` values.
  - 375 preset applies complete `maxCoefficients.mobile` + `ceilings.mobile` values for max-first strategy.

### Changed

- `create-scss-kit` default scaffold now sets `responsive.mobileProfilePreset: "auto"`.
- Synced updated `tools/scss-kit` runtime and schema to template and demo copies.

## [0.4.0] - 2026-03-10

### Added

- Added `responsive.mobileClampMode` (`auto|min-first|max-first|dual-bound`) and `responsive.smallMobileThreshold` (default `400`) to control mobile clamp behavior by design width.
- Added `responsive.dualClampMinWidth` / `responsive.dualClampMaxWidth` (default `500/600`) for medium-canvas dual-bound strategy.
- Added `maxCoefficients.mobile/desktop` and `ceilings.mobile/desktop` config maps for max-first upper-bound calculation.
- Added `r.max_px(...)` and `r.resp_mb(...)` helper paths in generated responsive runtime.
- Default scaffold config now includes:
  - `responsive.mobileClampMode: "auto"`
  - `responsive.smallMobileThreshold: 400`
  - `responsive.dualClampMinWidth: 500`
  - `responsive.dualClampMaxWidth: 600`
  - `maxCoefficients.mobile` presets for common text/price types
  - `ceilings.mobile` presets to cap max-first growth on small canvases

### Changed

- Updated mobile autofill generation to use `r.resp_mb(mobile, type)`, which selects min-first/max-first/dual-bound based on `mobileClampMode` (and width thresholds when `auto`).
- Updated default `design.note` to clarify that mobile fallback behavior (small-canvas max-first and medium-canvas dual-bound) is controlled by responsive strategy config.

## [0.3.0] - 2026-03-06

### Added

- Added `floors.mobile` / `floors.desktop` config maps and default blocks for absolute minimum font-size floors.
- Added `scale-100: 1` to low-range defaults for coefficient customization.

### Changed

- Refined `r.resp` minimum calculation to unified rule: `max(designPx * coef, floor)` for both desktop and mobile.
- Kept `r.vw` as a strict two-arg API (`r.vw(pc, mobile)`); spacing cases needing minimum floors should use `r.resp(...)`.
- Updated default typography/interaction coefficient presets to match the new `coef + floor` minimum strategy.
- Synced template `tools/scss-kit` to latest source-of-truth implementation and docs.

## [0.2.1] - 2026-03-04

### Added

- Added dual-track responsive helpers: `r.resp(pc, mobile, desktopType[, mobileType])` and `r.vw(pc, mobile)`.
- Added configurable `autofill.vwFunction` support and synchronized schema/template/demo configs.
- Added full responsive function catalog to tool docs and website docs (under 指令大全).

### Changed

- Updated `r.vw` desktop behavior to `min(vw, px)` cap for large-screen safety; mobile remains pure `vw` via autofill overrides.
- Updated docs navigation and command reference to include the new function catalog entry.

## [0.2.0] - 2026-03-03

### Added

- 扩充默认系数表范围：新增 `scale-00` 到 `scale-50`（步进 `0.05`，即 `0.00 ~ 0.50`）。
- 脚手架默认输出的 `scss-kit.config.json` 将自动包含以上低区间系数，可直接用于更小缩放场景。

### Changed

- `r.resp` 支持第 4 个可选参数，用于区分 PC 与移动端的 type：
  - 旧写法（继续可用）：`r.resp(pc, mobile, type)`
  - 新写法：`r.resp(pc, mobile, desktopType, mobileType)`
- `responsive` 自动生成逻辑更新为：当存在第 4 参时，移动端覆盖计算使用第 4 参；否则回退为第 3 参。

### Documentation

- 更新 `README.md` 与维护文档中的函数签名说明：
  - `r.resp(pc, mobile, desktopType[, mobileType])`
  - New `min_px` behavior and `floors` configuration.
  - Spacing recommendation: prefer `r.vw`, switch to `r.resp` when minimum floors are required.
  - Small-canvas (`<400`) recommendation: configure `maxCoefficients.mobile` with `ceilings.mobile` for controlled growth.

## [0.1.0] - 2026-02-14

### Added

- Initial release of the Shopify Theme Kit SCSS workflow tooling.
- `create-shopify-scss-autofill` initializer for `npm create shopify-scss-autofill@latest`.
- `scss-kit` CLI (init/doctor/generate) with responsive autofill and safe CSS watch.
