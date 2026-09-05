# scss-kit 维护备忘

`tools/scss-kit/` 是源码实现。修改 CLI、schema 或 watcher 后，必须同步到 `tools/create-scss-kit/template/tools/scss-kit/` 和 `demo/tools/scss-kit/`。

## 核心约束

- `r.resp()` 默认使用 readable；`r.mode(dense)` 通过 CSS custom properties 让嵌套子选择器继承 dense。
- `readable/dense` 只包含 `min/max` 两个乘法系数。不得恢复元素分类系数、绝对 floor/ceiling、max coefficient fallback 或 mobileProfilePreset。
- `fixedCore` 只负责在断点以上把 `--px-to-vw` 固定为 `1px`；必须保留 `width` 配置字段用于表达版心信息。
- per-entry 输出必须保留 `varScope`，并排除所有 generated 文件，避免自扫描循环。
- 缺失 entry 是 pending，不得让启动阶段失败；watcher 要先写 generated 占位文件，再写入口 import。
- 新建空 entry 的 watcher boilerplate 必须在两条 `@use` 后写入 14 组共享 MiSans/Rany `@font-face`，并保留末尾 include；不得改写非空 entry。
- safe CSS watch、增量缓存、回滚、`r.vw`、`r.re` 和 shorthand 行为属于未修改的既有能力。

## 验证

```bash
node --test tools/scss-kit/tests/*.test.mjs
git diff --check
```

如果本机安装了 Sass，还应编译代表性 SCSS，覆盖默认 readable、dense、数字/map profile、嵌套继承、显式覆盖和 fixedCore。
