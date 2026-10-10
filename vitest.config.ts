import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // components are compiled by Next with the automatic JSX runtime; tests that render them need the same
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
