# create-shopify-scss-autofill

This package scaffolds **scss-kit** into an existing folder (or a new folder) so you can get a stable workflow:

- write SCSS → compile to CSS (safe mode)
- auto-generate per-entry responsive overrides from `r.resp(pc, mobile, type)`
- upload via Shopify Theme Kit (`theme watch`)

## Usage (npm create)

```bash
npm create shopify-scss-autofill@latest
# or
npm init shopify-scss-autofill@latest
```

To scaffold into a specific directory:

```bash
npm create shopify-scss-autofill@latest my-theme
```

Options:

- `--no-install`: do not run `npm install`
- `--force`: overwrite existing `tools/scss-kit` and `scss-kit.config.json`

## After scaffolding

- Fill `config.yml` placeholders (Theme Kit credentials)
- Run `npm run dev:theme:auto`

## What it writes

- `tools/scss-kit/*` (the CLI + watchers)
- `scss-kit.config.json` (default config)
- Runs `node tools/scss-kit/cli.mjs init` to patch scripts/devDependencies safely
