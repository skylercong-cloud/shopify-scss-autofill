# scss-kit 维护备忘（持续迭代）

更新时间：2026-03-31

这份文档的目的：把 scss-kit 的“关键约束 / 设计决策 / 发布要点”固化下来，方便我们后续持续更新、迭代而不走回头路。

## 核心目标

- 写 SCSS（`src/styles`）→ 自动编译为 CSS（`assets/*.css`）→ ThemeKit (`theme watch`) 自动上传 → 刷新即可看到效果。
- 响应式：PC + Mobile 双设计稿，通过 `r.resp(pc, mobile, desktopType[, mobileType])` 埋点 + 自动生成移动端覆盖。
- 小稿策略：当 `design.mobileWidth < responsive.smallMobileThreshold`（默认 `400`）时，`mobileClampMode=auto` 会切到 `max-first`，让小稿按上限增长而不是过早封顶。
- 中稿策略：当 `design.mobileWidth` 落在 `responsive.dualClampMinWidth ~ responsive.dualClampMaxWidth`（默认 `500~600`）时，`mobileClampMode=auto` 会切到 `dual-bound`，用一条 `clamp(min, fluid, max)` 同时约束小屏下限与大屏上限。
- **设计稿安全防护**：`resp()` 和 `resp_mb()` 均将内部计算的 raw min/max 与设计稿原值对齐，防止 floor/ceiling 配置过大/过小导致 clamp 区间非法：
  - `resp()`：`eff-min = math.min(min_px(pc), pc)` — 保证 min 不超过 PC 设计稿值
  - `resp_mb()`：`eff-min = math.min(min_px(mb), mb)`，`eff-max = math.max(max_px(mb), mb)` — 双向安全兜底

## 关键约束（不要破坏）

- 主题运行时不会编译 SCSS：最终必须产出并上传 `assets/*.css`。
- **安全优先**：
  - 生成/初始化时，遇到潜在冲突不强行覆盖：写 `*.new` 或 `scss-kit/patches/*.new`。
  - safe CSS watch 同步 `assets/` 时，只有含 `scss-kit:managed` marker 的历史 CSS 才允许覆盖。
- **per-entry 生成**：避免跨页面污染。
  - `src/styles/<entry>.scss` → `src/styles/_responsive-autofill.<entry>.generated.scss`
  - 入口末尾需要 `@include auto.responsive_autofill_overrides();` 保证覆盖顺序。

## 主要命令与职责边界

- `node tools/scss-kit/cli.mjs init`
  - 生成/更新 `src/styles/_responsive.scss`
  - 确保 autofill 产物占位存在
  - patch `package.json` scripts/devDependencies（冲突写 `.new`）
  - 生成/补齐 `config.yml`（缺失则创建占位；冲突写建议文件）

- `node tools/scss-kit/cli.mjs responsive:generate <entry.scss>`
  - 只扫描该入口文件内的 `r.resp()`，生成该入口的 per-entry 覆盖文件
  - 移动端覆盖通过 `r.resp_mb(...)` 自动选择 `min-first / max-first / dual-bound`

- `node tools/scss-kit/cli.mjs responsive:generate:entries`
  - 按 `scss-kit.config.json` 的 `autofill.entries` 批量生成
  - 默认增量模式：基于文件 SHA-256 哈希缓存（`.scss-kit-cache.json`），源文件未变化时跳过
  - `--force` 强制全量重新生成
  - 生成前自动备份（`.bak`），失败时回滚，成功后清理

- `npm run css:watch`
  - 默认 safe mode：Sass 输出到 `src/.sass-out/` → 安全同步到 `assets/`

- `npm run dev:theme:auto`
  - 启动前先运行 `scss-kit:generate` + `scss-kit:responsive:generate` + `scss-kit:responsive:generate:entries`
  - 然后并行：responsive:watch + css:watch + theme:watch

## 扫描器策略（稳定性）

- 优先 AST（`postcss` + `postcss-scss`），失败回退 legacy 正则扫描。
- AST 依赖是"可选按需加载"，保证"先 init 再 install"的接入流程可用。
- `responsive:generate` 扫描时会排除所有 `_responsive-autofill*.generated.scss` 文件，防止循环扫描。

## 发布/脚手架（npm create）

我们提供 `create-scss-kit` 用于标准体验：

`npm create shopify-scss-autofill@latest`

关键点：

- 模板必须随包发布：`tools/create-scss-kit/template/tools/scss-kit/*`
- 为避免模板漂移，`create-scss-kit` 提供 `prepack` 自动同步脚本：
  - 见 [tools/create-scss-kit/scripts/sync-template.mjs](../create-scss-kit/scripts/sync-template.mjs)

## 扩展能力

- **r.re() 短写映射**：`RE_SHORTHAND_MAP` 存放快捷写法（如 `grid-cols-N`、`span-N`），PC 侧由 SCSS `$_re-shorthands` map + `_expand-re()` 展开，Mobile 侧由 JS `expandReValue()` 展开。
- **varScope**：`autofill.entries` 支持 `{ file, varScope }` 对象格式，把 CSS 变量作用域限定到指定选择器。
- **VS Code 代码片段**：`.vscode/scss-kit.code-snippets` 提供函数签名补全。
- **增量缓存**：`.scss-kit-cache.json`（已加入 `.gitignore`）存储源文件哈希与配置哈希。

## 迭代清单（建议）

- 每次改动 scss-kit：
  - 同步更新文档（README / docs/README / 本文件）
  - 若改动 `responsive`/`maxCoefficients`/`ceilings` 语义，必须同步更新 website docs 与 CHANGELOG
  - 跑一次最小冒烟：`cli.mjs doctor`、`responsive:generate`、`css:watch`（可选）
- 每次发布 create-scss-kit：
  - 确认 `npm pack` 包内包含 `template/`（以及模板下的 `cli.mjs` 等关键文件）
