import { defineConfig } from '@playwright/test';

/**
 * Testes de ponta a ponta no navegador (npm run test:browser).
 * Usa o Chrome instalado no computador por padrão (sem baixar nada).
 * PW_CHANNEL=chromium usa o Chromium do Playwright (rode `npx playwright install chromium` antes).
 */
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');

export default defineConfig({
  testDir: './tests-e2e',
  outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    channel,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
