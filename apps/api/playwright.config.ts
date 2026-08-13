import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${process.env.PORT || 3000}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'api',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx tsx src/main.ts',
    url: `http://localhost:${process.env.PORT || 3000}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
})
