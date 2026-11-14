import { defineConfig } from '@playwright/test';
import { statfsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';

/**
 * Garante que diretórios de saída e temporários usem um disco com espaço seguro (>= 1 GB livre).
 * Evita estouro de disco silencioso e cancelamento de downloads em ambientes com pouca folga no disco C:.
 * Se nenhuma unidade tiver espaço e PW_OUTPUT_DIR não for fornecido, lança erro com mensagem explicativa.
 */
function resolveSafeWorkDir(): { outputDir: string; tempDir: string } {
  if (process.env.PW_OUTPUT_DIR && process.env.TEMP) {
    return { outputDir: process.env.PW_OUTPUT_DIR, tempDir: process.env.TEMP };
  }

  const isListMode = process.argv.includes('--list');
  const skipCheck = process.env.PW_SKIP_DISK_CHECK === '1' || Boolean(process.env.PW_OUTPUT_DIR) || isListMode;
  const REQUIRED_BYTES = 1024 * 1024 * 1024; // 1 GB mínimo

  const sysTmp = tmpdir();
  const root = parse(sysTmp).root || 'C:/';
  const detectedDrives: { drive: string; freeBytes: number }[] = [];

  let defaultFree = 0;
  try {
    const stat = statfsSync(root);
    defaultFree = stat.bavail * stat.bsize;
    detectedDrives.push({ drive: root, freeBytes: defaultFree });
  } catch {
    defaultFree = REQUIRED_BYTES; // fallback caso statfs não consiga ler
  }

  if (defaultFree >= REQUIRED_BYTES) {
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
      detectedDrives.push({ drive: c, freeBytes });
      if (freeBytes >= REQUIRED_BYTES) {
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

  // Se nenhuma unidade tiver espaço e não estiver em modo de skip/list/custom dir, falha explicitamente
  if (!skipCheck) {
    const detectedInfo = detectedDrives.length
      ? detectedDrives.map(d => `${d.drive} (${(d.freeBytes / 1024 / 1024).toFixed(0)} MB livres)`).join(', ')
      : 'nenhuma unidade acessível';
    throw new Error(
      `[Playwright] Espaço insuficiente em disco: nenhuma unidade possui o espaço mínimo de 1024 MB (1 GB) necessário para os testes.\n` +
      `Espaço detectado nas unidades: ${detectedInfo}.\n` +
      `Espaço mínimo requerido: 1024 MB.\n` +
      `Para resolver, libere espaço em disco ou defina manualmente o diretório de saída via variável de ambiente:\n` +
      `  PowerShell: $env:PW_OUTPUT_DIR = "D:\\haze-test-tmp\\test-results"\n` +
      `  CMD:        set PW_OUTPUT_DIR=D:\\haze-test-tmp\\test-results\n` +
      `  Linux/macOS: export PW_OUTPUT_DIR=/caminho/test-results\n` +
      `Ou use PW_SKIP_DISK_CHECK=1 para ignorar esta verificação.`
    );
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
