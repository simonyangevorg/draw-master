import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost',
    headless: true,
    trace: 'retain-on-failure',
  },
});
