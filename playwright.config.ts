import { defineConfig } from '@playwright/test';
import { statfsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';

/**
 * Garante que diretórios de saída e temporários usem um disco com espaço seguro (>= 1 GB livre).
 * Evita estouro de disco silencioso e cancelamento de downloads em ambientes com pouca folga no disco C:.
 */
function resolveSafeWorkDir(): { outputDir: string; tempDir: string } {
  if (process.env.PW_OUTPUT_DIR && process.env.TEMP) {
    return { outputDir: process.env.PW_OUTPUT_DIR, tempDir: process.env.TEMP };
  }

  const sysTmp = tmpdir();
  let hasEnoughSpace = false;
  try {
    const root = parse(sysTmp).root;
    const stat = statfsSync(root);
    const freeBytes = stat.bavail * stat.bsize;
    if (freeBytes >= 1024 * 1024 * 1024) { // >= 1 GB
      hasEnoughSpace = true;
    }
  } catch {
    hasEnoughSpace = true; // fallback
  }

  if (hasEnoughSpace) {
    return {
      outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
      tempDir: sysTmp
    };
  }

  // Se o disco padrão tiver menos de 1 GB, busca drive secundário disponível
  const candidates = ['D:/', 'E:/', 'F:/', 'G:/'];
  for (const c of candidates) {
    try {
      const stat = statfsSync(c);
      const freeBytes = stat.bavail * stat.bsize;
      if (freeBytes >= 2 * 1024 * 1024 * 1024) { // >= 2 GB
        const safeBase = join(c, 'haze-test-tmp');
        mkdirSync(safeBase, { recursive: true });
        const outDir = join(safeBase, 'test-results');
        mkdirSync(outDir, { recursive: true });
        process.env.TEMP = safeBase;
        process.env.TMP = safeBase;
        return {
          outputDir: process.env.PW_OUTPUT_DIR || outDir,
          tempDir: safeBase
        };
      }
    } catch {}
  }

  return {
    outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
    tempDir: sysTmp
  };
}

const safeDirs = resolveSafeWorkDir();

/**
 * Testes de ponta a ponta no navegador (npm run test:browser).
 * Usa o Chrome instalado no computador por padrão (sem baixar nada).
 * PW_CHANNEL=chromium usa o Chromium do Playwright (rode `npx playwright install chromium` antes).
 */
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');

export default defineConfig({
  testDir: './tests-e2e',
  outputDir: safeDirs.outputDir,
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
