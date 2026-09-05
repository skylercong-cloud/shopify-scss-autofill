# scss-kit

用于 Shopify Theme Kit 的 SCSS 响应式开发工具。源码通过 `r.resp(pc, mobile[, profile[, mobileProfile]])` 埋点，CLI 自动生成移动端覆盖；`r.vw(pc, mobile)` 用于纯流式间距和尺寸。

## 配置

```json
{
  "design": { "desktopWidth": 1920, "mobileWidth": 750 },
  "fixedCore": null,
  "coefficients": {
    "readable": { "min": 0.625, "max": 1.5 },
    "dense": { "min": 0.5, "max": 1.5 }
  }
}
```

`readable` 默认用于 `r.resp()`，适合标题、段落和阅读空间充足的内容；`dense` 适合产品卡、tag、徽章等有限空间内容。最值始终直接按 `设计值 * 系数` 计算，不再使用元素分类、绝对 floor/ceiling 或兜底比较。

`fixedCore` 可填写 `{ "breakpoint": 1500, "width": 1200 }`。在断点以上，生成器会把 `--px-to-vw` 设为 `1px`，因此 `r.resp`、`r.vw` 和 `r.vw_pc_raw` 保持设计稿尺寸；`width` 是版心配置元数据，不会生成布局规则。

## API

```scss
.card {
  @include r.mode(dense);
  padding: r.resp(32px, 20px); // 继承 dense
  .title { font-size: r.resp(24px, 16px); }
  .description { font-size: r.resp(20px, 14px, readable); }
  .price { font-size: r.resp(20px, 14px, (min: 0.55, max: 1.4)); }
}
```

- `r.resp(pc, mobile)`：默认 readable；父级 `r.mode()` 可改变未显式声明的调用。
- 第三个参数可传 `readable`、`dense`、数字最小系数，或包含 `min`/`max` 的 Sass map。
- 第四个参数只影响移动端，省略时继承第三个参数；显式声明后覆盖父级模式。
- 数字参数只覆盖 `min`；map 中未填写的边界继承当前模式。
- `r.vw(pc, mobile)`：PC 端带设计值上限，移动端由 autofill 输出纯 `vw`。
- `r.re(pc, mobile)`：非数值属性的移动端覆盖。

移动端策略由 `design.mobileWidth` 和 `responsive.mobileClampMode` 决定：小于 400 使用 `max-first`，500~600 使用 `dual-bound`，其余使用 `min-first`；也可以显式指定模式。

## 命令

```bash
node tools/scss-kit/cli.mjs init
node tools/scss-kit/cli.mjs generate
node tools/scss-kit/cli.mjs responsive:generate:entries
npm run dev:theme:auto
```

`autofill.entries` 支持字符串或 `{ "file": "src/styles/page.scss", "varScope": ".page" }`。缺失 entry 在启动生成时标记为 `pending`，不会阻塞开发服务器。文件创建后，watcher 会创建 generated 占位文件、补入口 boilerplate，并生成真实覆盖文件。

当 watcher 首次发现新建且内容为空的入口 SCSS 时，boilerplate 会按顺序写入 `responsive` 与 per-entry generated 文件的 `@use`、14 组共享 MiSans/Rany `@font-face`，以及文件末尾的 `responsive_autofill_overrides()` include。字体包含 MiSans 的中文与 Latin Bold、Medium、Demibold、Semibold、Regular、Light/Normal 变体，以及 Rany Bold，均使用 Shopify CDN 地址和 `font-display: swap`。已有内容的非空 SCSS 文件不会被补写或覆盖。

`tools/scss-kit/` 是源码实现；`tools/create-scss-kit/template/tools/scss-kit/` 和 `demo/tools/scss-kit/` 必须保持同步。
