# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

- Added `responsive.mobileClampMode` (`auto|min-first|max-first|dual-bound`) and `responsive.smallMobileThreshold` (default `400`) to control mobile clamp behavior by design width.
- Added `responsive.dualClampMinWidth` / `responsive.dualClampMaxWidth` (default `500/600`) for medium-canvas dual-bound strategy.
- Added `maxCoefficients.mobile/desktop` and `ceilings.mobile/desktop` config maps for max-first upper-bound calculation.
- Added `r.max_px(...)` and `r.resp_mb(...)` helper paths in generated responsive runtime.

### Changed

- Refined `r.resp` minimum calculation to unified rule: `max(designPx * coef, floor)` for both desktop and mobile.
- Kept `r.vw` as a strict two-arg API (`r.vw(pc, mobile)`); spacing cases needing minimum floors should use `r.resp(...)`.
- Added `floors.mobile` / `floors.desktop` config maps and updated default type presets for typography/interaction elements.
- Added `scale-100: 1` to low-range defaults for coefficient customization.
- Updated mobile autofill generation to use `r.resp_mb(mobile, type)`, which selects min-first/max-first/dual-bound based on `mobileClampMode` (and width thresholds when `auto`).

### Documentation

- Updated tool docs and website docs to reflect:
  - `r.resp(pc, mobile, desktopType[, mobileType])` supports different desktop/mobile types.
  - New `min_px` behavior and `floors` configuration.
  - Spacing recommendation: prefer `r.vw`, switch to `r.resp` when minimum floors are required.
  - Small-canvas (`<400`) recommendation: configure `maxCoefficients.mobile` with `ceilings.mobile` for controlled growth.

## [0.2.1] - 2026-03-04

### Added

- Added dual-track responsive helpers: `r.resp(pc, mobile, desktopType[, mobileType])` and `r.vw(pc, mobile)`.
- Added configurable `autofill.vwFunction` support and synchronized schema/template/demo configs.
- Added full responsive function catalog to tool docs and website docs (under 指令大全).

### Changed

- Updated `r.vw` desktop behavior to `min(vw, px)` cap for large-screen safety; mobile remains pure `vw` via autofill overrides.
- Updated docs navigation and command reference to include the new function catalog entry.

## [0.1.0] - 2026-02-14

### Added

- Initial release of the Shopify Theme Kit SCSS workflow tooling.
- `create-shopify-scss-autofill` initializer for `npm create shopify-scss-autofill@latest`.
- `scss-kit` CLI (init/doctor/generate) with responsive autofill and safe CSS watch.
