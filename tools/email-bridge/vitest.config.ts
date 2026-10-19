import { defineConfig } from 'vitest/config'

// Its own config, so the repository's root vitest config (for the app) is never picked up from here
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
