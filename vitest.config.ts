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
      // The protocol's bridge, used as the conformance test double, imports the SDK by its package name
      '@ai-maestro/device-sdk': path.resolve(__dirname, 'lib/device-sdk/index.mjs'),
      '@': path.resolve(__dirname, '.'),
    },
  },
})
