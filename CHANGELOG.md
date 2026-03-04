# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

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
