# Contributing

Thanks for helping improve **shopify-scss-autofill**.

## Prerequisites

- Node.js >= 18
- npm

## Repo structure (important)

- `tools/scss-kit/` is the source-of-truth implementation.
- `tools/create-scss-kit/` is the published initializer.
- The initializer embeds a template copy under `tools/create-scss-kit/template/tools/scss-kit/`.

If you change anything under `tools/scss-kit/`, you must refresh the template before packing/publishing:

```bash
cd tools/create-scss-kit
npm run sync-template
```

## Local development

Install deps for the initializer:

```bash
cd tools/create-scss-kit
npm install
```

### Smoke test (local scaffold)

```bash
cd tools/create-scss-kit
node ./bin/create-scss-kit.mjs ../../_local-test --force --no-install
```

Then in the generated folder:

```bash
cd ../../_local-test
npm install
npm run scss-kit:doctor
```

## Pull requests

- Keep changes focused and minimal.
- Prefer backward-compatible changes to the CLI and generated output.
- Update docs when behavior changes.
- If you change generator output, include a short note in `CHANGELOG.md`.
