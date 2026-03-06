# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-06

### Added

- Added `floors.mobile` / `floors.desktop` default config blocks for absolute minimum font-size floors.
- Added `scale-100: 1` to default low-range coefficient presets.

### Changed

- Updated default typography/interaction coefficient presets to match the new `coef + floor` minimum strategy.
- Synced template `tools/scss-kit` to latest source-of-truth implementation and docs.

## [0.2.0] - 2026-03-03 (建议发布版本)

### Added

- 扩充默认系数表范围：新增 `scale-00` 到 `scale-50`（步进 `0.05`，即 `0.00 ~ 0.50`）。
- 脚手架默认输出的 `scss-kit.config.json` 将自动包含以上低区间系数，可直接用于更小缩放场景。

### Changed

- `r.resp` 支持第 4 个可选参数，用于区分 PC 与移动端的 type：
  - 旧写法（继续可用）：`r.resp(pc, mobile, type)`
  - 新写法：`r.resp(pc, mobile, desktopType, mobileType)`
- `responsive` 自动生成逻辑更新为：当存在第 4 参时，移动端覆盖计算使用第 4 参；否则回退为第 3 参。
- 废弃提示文本升级为新签名，避免团队误用旧说明。

### Documentation

- 更新 `README.md` 与维护文档中的函数签名说明：
  - `r.resp(pc, mobile, desktopType[, mobileType])`

### Internal

- 同步更新了模板目录与 `tools/scss-kit` 源目录实现，避免后续 `sync-template` 覆盖本次能力改动。

---

## 版本建议说明

- 当前版本：`0.1.0`
- 建议版本：`0.2.0`
- 原因：本次为**向后兼容的新能力增强**（新增可选参数 + 默认配置能力扩展），适合做 **minor** 升级。
