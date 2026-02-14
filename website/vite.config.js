import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// GitHub Pages project site base path:
// https://<user>.github.io/<repo>/
const repoName = 'shopify-scss-autofill'

export default defineConfig({
  base: `/${repoName}/`,
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs/index.html'),
      },
    },
  },
})
