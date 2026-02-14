# shopify-scss-autofill

Tooling for a stable Shopify Theme Kit workflow:

- Write SCSS in `src/styles/`
- Compile to `assets/*.css` (safe mode; avoids overwriting unknown legacy CSS)
- Auto-generate **per-entry** mobile overrides from `r.resp(pc, mobile, type)`
- Upload via Theme Kit `theme watch`

## Use it (recommended)

Scaffold into a new folder (or into an existing folder):

```bash
npm create shopify-scss-autofill@latest
```

Then:

- Fill `config.yml` placeholders (Theme Kit credentials)
- Run `npm run dev:theme:auto`

## Quick start (demo)

A runnable demo project is included under `demo/`.

```bash
cd demo
npm install
npm run dev:theme:auto
```

## Repo layout

- `tools/scss-kit/`: source-of-truth implementation (CLI + watchers)
- `tools/create-scss-kit/`: npm initializer package (published as `create-shopify-scss-autofill`)
- `demo/`: example project generated from the initializer

## Development

Prereqs: Node.js >= 18.

- Work on the initializer: `cd tools/create-scss-kit && npm install`
- Refresh the bundled template before packing/publishing:
  - `npm run sync-template`

Local smoke test (without publishing):

```bash
cd tools/create-scss-kit
node ./bin/create-scss-kit.mjs ../../_local-test --force --no-install
```

## Security

See `SECURITY.md` for reporting guidance.

## Contributing

See `CONTRIBUTING.md`.

## Changelog

See `CHANGELOG.md`.

## License

MIT. See `LICENSE`.
