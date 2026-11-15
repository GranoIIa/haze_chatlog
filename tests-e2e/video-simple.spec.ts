import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
let fRed = '', fBlue = '';

const ARTIFACTS_DIR = 'C:\\Users\\Vinicius\\.gemini\\antigravity\\brain\\627418ca-96cf-4f90-8b23-f30348541dac';

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-simple-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'cena1.mp4'); mk(fRed, 'red', 440, 3);
  fBlue = join(dir, 'cena2.mp4'); mk(fBlue, 'blue', 880, 3);
});

test.describe('Video Studio PR E - Modo Simples Guiado (Assistente em 4 Passos)', () => {
  test('1. Indicadores de passos: lista ordenada, aria-current="step" no ativo e estados dos botões', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // Valida container guiado
    await expect(page.getByTestId('guided-flow')).toBeVisible();

    // Valida lista ordenada (<ol>)
    const stepsList = page.getByTestId('simple-steps');
    await expect(stepsList).toBeVisible();
    expect(await stepsList.evaluate(el => el.tagName.toLowerCase())).toBe('ol');

    // Ao iniciar, Passo 1 é ativo
    const step1 = page.getByTestId('simple-step-1');
    const step2 = page.getByTestId('simple-step-2');
    const step3 = page.getByTestId('simple-step-3');
    const step4 = page.getByTestId('simple-step-4');

    await expect(step1).toHaveAttribute('aria-current', 'step');
    await expect(step2).not.toHaveAttribute('aria-current', 'step');
    await expect(step3).not.toHaveAttribute('aria-current', 'step');
    await expect(step4).not.toHaveAttribute('aria-current', 'step');

    // Passos 3 e 4 estão desabilitados/bloqueados antes de importar mídia
    await expect(step3).toBeDisabled();
    await expect(step4).toBeDisabled();

    // Navega para o passo 2 via botão Próximo
    await page.getByTestId('simple-next').click();
    await expect(step2).toHaveAttribute('aria-current', 'step');
    await expect(step1).not.toHaveAttribute('aria-current', 'step');
    await expect(step1).toContainText('✓');
  });

  test('2. Validação do Passo 2: sem vídeo "Próximo" fica desabilitado com texto de ajuda; ao importar, libera', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // Avança para o Passo 2
    await page.getByTestId('simple-next').click();
    await expect(page.getByTestId('simple-step-2')).toHaveAttribute('aria-current', 'step');

    // Sem mídia importada: botão Próximo deve estar desabilitado
    const nextBtn = page.getByTestId('simple-next');
    await expect(nextBtn).toBeDisabled();
    await expect(page.getByTestId('simple-step2-hint')).toBeVisible();
    await expect(page.getByTestId('simple-step2-hint')).toContainText('Importe ao menos um vídeo');

    // Importa o primeiro vídeo
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();

    // Com mídia importada: botão Próximo libera imediatamente
    await expect(nextBtn).toBeEnabled();
    await expect(nextBtn).toContainText('Próximo: Chat/Texto');

    // Avança para o Passo 3
    await nextBtn.click();
    await expect(page.getByTestId('simple-step-3')).toHaveAttribute('aria-current', 'step');
  });

  test('3. Transição bidirecional: monta no Simples, troca para Avançado e volta sem perder nada', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // Importa dois vídeos
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();
    await expect(page.getByTestId('simple-clip-1')).toBeVisible();

    // Adiciona título no Passo 3
    await page.getByTestId('simple-step-3').click();
    await page.getByTestId('simple-title').fill('Cena de Ação RP');
    await page.getByTestId('simple-title-add').click();
    await expect(page.getByTestId('simple-overlays')).toContainText('Cena de Ação RP');

    // Alterna para o Modo Avançado
    await page.getByTestId('video-mode-advanced').click();
    await expect(page.getByTestId('timeline')).toBeVisible();
    await expect(page.getByTestId('clip-block')).toHaveCount(2);
    await expect(page.getByTestId('chat-block')).toHaveCount(1); // overlay de texto na trilha T Texto/Chat

    // Alterna de volta para o Modo Simples
    await page.getByTestId('video-mode-simple').click();
    await expect(page.getByTestId('guided-flow')).toBeVisible();
    await expect(page.getByTestId('timeline')).toHaveCount(0);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();
    await expect(page.getByTestId('simple-clip-1')).toBeVisible();
    await expect(page.getByTestId('simple-overlays')).toContainText('Cena de Ação RP');
  });

  test('4. Texto do chat: digita no passo 3, confere renderização e persistência', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();

    // Vai para o Passo 3
    await page.getByTestId('simple-step-3').click();
    const chatInput = page.getByTestId('guided-flow').getByTestId('simple-chat');
    await chatInput.fill('Oficial Santos diz: Parado!\nSuspeito diz: Não atire!');
    await page.getByTestId('simple-chat-add').click();

    await expect(page.getByTestId('simple-overlays')).toContainText('Oficial Santos diz: Parado!');

    // Troca para Avançado e retorna para confirmar sobrevivência
    await page.getByTestId('video-mode-advanced').click();
    await expect(page.getByTestId('chat-block')).toBeVisible();

    await page.getByTestId('video-mode-simple').click();
    await expect(page.getByTestId('simple-overlays')).toContainText('Oficial Santos diz: Parado!');
  });

  test('5. Presets de exportação na coluna direita: seleção de Discord, Fórum e HQ e acionamento de exportação', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();

    // Coluna direita visível
    const panel = page.getByTestId('simple-export-panel');
    await expect(panel).toBeVisible();

    // Seleciona Fórum
    await page.getByTestId('preset-card-forum').click();
    await expect(page.getByTestId('preset-card-forum')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('preset-card-discord')).toHaveAttribute('aria-pressed', 'false');

    // Seleciona Discord
    await page.getByTestId('preset-card-discord').click();
    await expect(page.getByTestId('preset-card-discord')).toHaveAttribute('aria-pressed', 'true');

    // Aciona botão grande Exportar vídeo
    const exportBtn = page.getByTestId('simple-export');
    await expect(exportBtn).toBeEnabled();
    await exportBtn.click();

    // Aguarda resultado
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('export-download')).toBeVisible();
  });

  test('6. Atalhos no modo Simples: Espaço toca/pausa fora de inputs; C e Delete não fazem nada', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();

    // 1. Espaço toca e pausa fora de inputs
    const playBtn = page.getByTestId('play');
    await expect(playBtn).toContainText('Reproduzir');
    await page.keyboard.press('Space');
    await expect(playBtn).toContainText('Pausar');
    await page.keyboard.press('Space');
    await expect(playBtn).toContainText('Reproduzir');

    // 2. Foco num campo de texto: Espaço digita caractere sem alternar play/pause
    await page.getByTestId('simple-step-3').click();
    const titleInput = page.getByTestId('simple-title');
    await titleInput.focus();
    await titleInput.fill('Olá');
    await page.keyboard.press('Space');
    await expect(titleInput).toHaveValue('Olá ');
    await expect(playBtn).toContainText('Reproduzir'); // player NÃO iniciou reprodução

    // 3. Tecla 'c' e 'Delete' não afetam os clipes no Modo Simples
    await page.keyboard.press('Escape'); // tira foco do input
    await page.locator('body').click();
    await page.keyboard.press('c');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');

    // Clipes continuam exatamente 1 (não dividiu nem deletou)
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();
    await expect(page.getByTestId('simple-clip-1')).toHaveCount(0);
  });

  test('7. Responsividade e Capturas de Tela nos viewports 1440x900 e 1280x720 (Passos 1 a 4)', async ({ page }) => {
    const viewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1280x720', width: 1280, height: 720 },
      { name: '1366x768', width: 1366, height: 768 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.getByTestId('tab-video').click();
      await page.getByTestId('video-mode-simple').click();

      // Confere que layout tem 3 colunas e não tem rolagem horizontal da página
      await expect(page.getByTestId('guided-flow')).toBeVisible();
      await expect(page.getByTestId('video-preview')).toBeVisible();
      await expect(page.getByTestId('simple-export-panel')).toBeVisible();

      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientW = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollW).toBeLessThanOrEqual(clientW + 1);

      // Botões de ação do rodapé e exportação dentro da viewport
      const backBox = await page.getByTestId('simple-back').boundingBox();
      const nextBox = await page.getByTestId('simple-next').boundingBox();
      const expBox = await page.getByTestId('simple-export').boundingBox();

      expect(backBox).not.toBeNull();
      expect(nextBox).not.toBeNull();
      expect(expBox).not.toBeNull();

      expect(backBox!.y + backBox!.height).toBeLessThanOrEqual(vp.height);
      expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(vp.height);
      expect(expBox!.y + expBox!.height).toBeLessThanOrEqual(vp.height);

      // Capturas específicas dos 4 passos para 1440x900 e 1280x720
      if (vp.name === '1440x900' || vp.name === '1280x720') {
        // Passo 1: Inicial
        const p1 = join(dir, `simple_step1_${vp.name}.png`);
        await page.screenshot({ path: p1 });
        if (existsSync(ARTIFACTS_DIR)) copyFileSync(p1, join(ARTIFACTS_DIR, `simple_step1_${vp.name}.png`));

        // Passo 2: Vídeos importados
        await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
        await page.getByTestId('simple-step-2').click();
        const p2 = join(dir, `simple_step2_${vp.name}.png`);
        await page.screenshot({ path: p2 });
        if (existsSync(ARTIFACTS_DIR)) copyFileSync(p2, join(ARTIFACTS_DIR, `simple_step2_${vp.name}.png`));

        // Passo 3: Chat/Texto
        await page.getByTestId('simple-step-3').click();
        await page.getByTestId('guided-flow').getByTestId('simple-chat').fill('Santos diz: Teste do modo simples');
        await page.getByTestId('simple-chat-add').click();
        const p3 = join(dir, `simple_step3_${vp.name}.png`);
        await page.screenshot({ path: p3 });
        if (existsSync(ARTIFACTS_DIR)) copyFileSync(p3, join(ARTIFACTS_DIR, `simple_step3_${vp.name}.png`));

        // Passo 4: Exportar
        await page.getByTestId('simple-step-4').click();
        const p4 = join(dir, `simple_step4_${vp.name}.png`);
        await page.screenshot({ path: p4 });
        if (existsSync(ARTIFACTS_DIR)) copyFileSync(p4, join(ARTIFACTS_DIR, `simple_step4_${vp.name}.png`));
      }
    }
  });

  test('8. Apenas um passo visível por vez: conteúdo ativo expandido e outros compactos', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // 1. Passo 1 ativo
    await expect(page.getByTestId('simple-template-select')).toBeVisible();
    await expect(page.getByTestId('simple-step2-hint')).not.toBeAttached();
    await expect(page.getByTestId('guided-flow').getByTestId('simple-chat')).not.toBeAttached();
    await expect(page.getByTestId('simple-summary')).not.toBeAttached();

    // 2. Avança para Passo 2
    await page.getByTestId('simple-next').click();
    await expect(page.getByTestId('simple-step2-hint')).toBeVisible();
    await expect(page.getByTestId('simple-template-select')).not.toBeAttached();
    await expect(page.getByTestId('guided-flow').getByTestId('simple-chat')).not.toBeAttached();
    await expect(page.getByTestId('simple-summary')).not.toBeAttached();

    // 3. Importa vídeo e avança para Passo 3
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await page.getByTestId('simple-next').click();
    await expect(page.getByTestId('guided-flow').getByTestId('simple-chat')).toBeVisible();
    await expect(page.getByTestId('simple-template-select')).not.toBeAttached();
    await expect(page.getByTestId('simple-step2-hint')).not.toBeAttached();
    await expect(page.getByTestId('simple-summary')).not.toBeAttached();

    // 4. Avança para Passo 4
    await page.getByTestId('simple-next').click();
    await expect(page.getByTestId('simple-summary')).toBeVisible();
    await expect(page.getByTestId('simple-template-select')).not.toBeAttached();
    await expect(page.getByTestId('guided-flow').getByTestId('simple-chat')).not.toBeAttached();
  });

  test('9. Passo 4 exibe resumo da montagem: cenas, duração, texto e preset escolhido', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // Importa 2 cenas
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('simple-clip-0')).toBeVisible();

    // Adiciona texto no Passo 3
    await page.getByTestId('simple-step-3').click();
    await page.getByTestId('simple-title').fill('Operação Policial');
    await page.getByTestId('simple-title-add').click();
    await expect(page.getByTestId('simple-overlays')).toContainText('Operação Policial');

    // Seleciona preset Discord
    await page.getByTestId('preset-card-discord').click();

    // Vai para o Passo 4
    await page.getByTestId('simple-step-4').click();
    await expect(page.getByTestId('simple-summary')).toBeVisible();

    // Valida itens do resumo
    await expect(page.getByTestId('summary-scenes')).toContainText('2 cena(s)');
    await expect(page.getByTestId('summary-duration')).toContainText('0:06');
    await expect(page.getByTestId('summary-texts')).toContainText('1 texto(s)');
    await expect(page.getByTestId('summary-preset')).toContainText('Discord');
  });

  test('10. Atribuição de ✓ só nos passos completos e remoção de "pendente" solto', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();

    // Passo 1 inicial tem ✓ (modelo/edição livre já definida)
    const step1 = page.getByTestId('simple-step-1');
    const step2 = page.getByTestId('simple-step-2');
    const step3 = page.getByTestId('simple-step-3');
    const step4 = page.getByTestId('simple-step-4');

    // Ao iniciar: Passo 1 é ativo (mostra "1"), mas o cartão não tem a palavra "pendente" solta
    await expect(page.getByTestId('simple-step-card-1')).not.toContainText('pendente');
    await expect(page.getByTestId('simple-step-card-2')).not.toContainText('pendente');
    await expect(page.getByTestId('simple-step-card-3')).not.toContainText('pendente');
    await expect(page.getByTestId('simple-step-card-4')).not.toContainText('pendente');

    // Passos 2, 3 e 4 NÃO têm ✓
    await expect(step2).not.toContainText('✓');
    await expect(step3).not.toContainText('✓');
    await expect(step4).not.toContainText('✓');

    // Importa vídeo: Passo 2 ganha ✓
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(step2).toContainText('✓');
    await expect(step3).not.toContainText('✓');

    // No Passo 3 sem texto: não tem ✓
    await page.getByTestId('simple-step-3').click();
    await expect(step3).not.toContainText('✓');

    // Adiciona chat no Passo 3: ganha ✓
    await page.getByTestId('guided-flow').getByTestId('simple-chat').fill('Santos diz: Teste');
    await page.getByTestId('simple-chat-add').click();
    await expect(page.getByTestId('simple-step-card-3')).toContainText('✓');

    // Ao avançar para o Passo 4, step3 no stepper também exibe ✓
    await page.getByTestId('simple-step-4').click();
    await expect(step3).toContainText('✓');
    await expect(step4).not.toContainText('✓');
  });

  test('11. Botões Voltar, Próximo e Exportar dentro da viewport nos 3 tamanhos (1440x900, 1366x768, 1280x720)', async ({ page }) => {
    const viewports = [
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1366x768', width: 1366, height: 768 },
      { name: '1280x720', width: 1280, height: 720 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.getByTestId('tab-video').click();
      await page.getByTestId('video-mode-simple').click();
      await page.getByTestId('video-file-input').setInputFiles([fRed]);

      // Testa em cada um dos 4 passos
      for (let s = 1; s <= 4; s++) {
        await page.getByTestId(`simple-step-${s}`).click();

        const backBox = await page.getByTestId('simple-back').boundingBox();
        const nextBox = await page.getByTestId('simple-next').boundingBox();
        const expBox = await page.getByTestId('simple-export').boundingBox();

        expect(backBox).not.toBeNull();
        expect(nextBox).not.toBeNull();
        expect(expBox).not.toBeNull();

        expect(backBox!.y).toBeGreaterThanOrEqual(0);
        expect(backBox!.y + backBox!.height).toBeLessThanOrEqual(vp.height);

        expect(nextBox!.y).toBeGreaterThanOrEqual(0);
        expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(vp.height);

        expect(expBox!.y).toBeGreaterThanOrEqual(0);
        expect(expBox!.y + expBox!.height).toBeLessThanOrEqual(vp.height);
      }
    }
  });

  test('12. Ação do último passo foca simple-export sem disparar exportação sozinho', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed]);

    // Vai para o Passo 4
    await page.getByTestId('simple-step-4').click();

    // Confere que no Passo 4 o botão indica ação de exportação
    const actionBtn = page.getByTestId('simple-next');
    await expect(actionBtn).toContainText('Ir para exportação');
    await expect(actionBtn).toBeEnabled();

    // Clica no botão
    await actionBtn.click();

    // Valida que o botão de exportação à direita recebeu o foco
    const exportBtn = page.getByTestId('simple-export');
    await expect(exportBtn).toBeFocused();

    // Valida que nenhuma exportação foi iniciada de forma autônoma
    await page.waitForTimeout(500);
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await expect(page.getByTestId('export-progress')).toHaveCount(0);
  });
});
