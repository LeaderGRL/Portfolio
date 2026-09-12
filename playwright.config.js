import { defineConfig, devices } from '@playwright/test'

const visualRegression = /visual-regression\.spec\.js/

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Fullscreen CRT uses software GL on hosted runners. Give one high-resolution
  // surface the CPU budget instead of making two renderers compete for it.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    reducedMotion: 'reduce',
    // Continuous recording also renders/encodes the animated glass. Keep the
    // explicit visual captures on every run; collect the heavy diagnostics on
    // retry in CI so that instrumentation does not dominate the interaction.
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: visualRegression, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: visualRegression, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: visualRegression, use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', testIgnore: visualRegression, use: { ...devices['Pixel 7'] } },
    {
      name: 'visual-regression',
      testMatch: visualRegression,
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
