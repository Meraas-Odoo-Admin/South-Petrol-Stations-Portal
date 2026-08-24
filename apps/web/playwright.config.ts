import { defineConfig } from '@playwright/test';

// Real end-to-end smoke tests against the actual running stack (real API,
// real Postgres, real Vite dev server) — not mocks. Fixtures are created
// via the real HTTP API in e2e/global-setup.ts (mirroring the pattern
// apps/api's own e2e specs use: dedicated test-only data, cleaned up
// afterward where a delete path exists).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'pnpm --filter @fuel-tracking/api run dev',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @fuel-tracking/web run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
