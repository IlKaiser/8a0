import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:3001' },
  webServer: {
    command: 'npm run build && npm run start',
    port: 3001,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
