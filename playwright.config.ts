import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'node tests/fixtures/server.ts',
    url: 'http://127.0.0.1:4173/no-video.html',
    reuseExistingServer: true,
  },
});
