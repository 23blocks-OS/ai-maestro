import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for AI Maestro E2E tests.
 *
 * Assumes the server is already running at http://localhost:23000.
 * Run with: npx playwright test tests/e2e/
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,            // Run tests sequentially — they share server state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                      // Single worker — tests mutate shared team/group state
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 120_000,                // 2 minutes per test — governance ops are slow
  expect: {
    timeout: 15_000,               // 15s for assertions (UI may need to poll/refresh)
  },

  use: {
    baseURL: 'http://localhost:23000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
