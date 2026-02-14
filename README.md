# shopify-scss-autofill

This repo contains the **scss-kit** toolchain used in Shopify ThemeKit development:

- Write SCSS in `src/styles/`
- Compile to `assets/*.css` (safe mode)
- Generate mobile overrides from `r.resp(pc, mobile, type)` (per-entry)
- Upload via ThemeKit `theme watch`

## Quick start (demo)

A runnable demo theme project is included under `demo/`.

```bash
cd demo
npm install
npm run dev:theme:auto
```

## Scaffold a new project

Use the published npm initializer:

```bash
npm create shopify-scss-autofill@latest
```

## Repo layout

- `tools/scss-kit/`: source-of-truth implementation
- `tools/create-scss-kit/`: npm initializer package (published as `create-shopify-scss-autofill`)
- `demo/`: example project generated from the initializer
