import { defineConfig, devices } from '@playwright/test';

/** Rombo Light: la stessa app compilata con -c light (niente modo Logico ne' SQL). Porta diversa dalla completa. */
export default defineConfig({
  testDir: 'e2e-light',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4330', viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'npx ng serve --configuration light --port 4330', url: 'http://localhost:4330', reuseExistingServer: true, timeout: 180_000 },
});
