# scss-kit 维护备忘（持续迭代）

更新时间：2026-02-13

这份文档的目的：把 scss-kit 的“关键约束 / 设计决策 / 发布要点”固化下来，方便我们后续持续更新、迭代而不走回头路。

## 核心目标

- 写 SCSS（`src/styles`）→ 自动编译为 CSS（`assets/*.css`）→ ThemeKit (`theme watch`) 自动上传 → 刷新即可看到效果。
- 响应式：PC(1920) + Mobile(750) 双设计稿，通过 `r.resp(pc, mobile, type)` 埋点 + 自动生成移动端覆盖。

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

- `node tools/scss-kit/cli.mjs responsive:generate:entries`
  - 按 `scss-kit.config.json` 的 `autofill.entries` 批量生成

- `npm run css:watch`
  - 默认 safe mode：Sass 输出到 `src/.sass-out/` → 安全同步到 `assets/`

- `npm run dev:theme:auto`
  - 并行：responsive:watch + css:watch + theme:watch

## 扫描器策略（稳定性）

- 优先 AST（`postcss` + `postcss-scss`），失败回退 legacy 正则扫描。
- AST 依赖是“可选按需加载”，保证“先 init 再 install”的接入流程可用。

## 发布/脚手架（npm create）

我们提供 `create-scss-kit` 用于标准体验：

`npm create shopify-scss-autofill@latest`

关键点：

关键点：

- 模板必须随包发布：`tools/create-scss-kit/template/tools/scss-kit/*`
- 为避免模板漂移，`create-scss-kit` 提供 `prepack` 自动同步脚本：
  - 见 [tools/create-scss-kit/scripts/sync-template.mjs](../create-scss-kit/scripts/sync-template.mjs)

## 迭代清单（建议）

- 每次改动 scss-kit：
  - 同步更新文档（README / docs/README / 本文件）
  - 跑一次最小冒烟：`cli.mjs doctor`、`responsive:generate`、`css:watch`（可选）
- 每次发布 create-scss-kit：
  - 确认 `npm pack` 包内包含 `template/`（以及模板下的 `cli.mjs` 等关键文件）
