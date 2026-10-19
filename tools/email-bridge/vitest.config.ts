import { defineConfig } from 'vitest/config'

// Its own config, so nothing from the repository's root (the app's vitest and PostCSS/Tailwind configs)
// is picked up when this folder is tested on its own
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
