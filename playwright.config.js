import { defineConfig } from '@playwright/test';

const ci = Boolean(process.env.CI);

// Each test launches its own Chromium with Browsekit loaded (see tests/fixtures.js).
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: ci ? 2 : 4,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
});
