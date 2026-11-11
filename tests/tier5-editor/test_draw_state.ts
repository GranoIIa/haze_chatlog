/**
 * Tier 5: estado do contexto 2D não vaza entre o chat e os elementos de RP.
 * (Bug: o chat deixava textBaseline='top' e o preset Weazel desenhava o "AO VIVO" deslocado, escondido sob a tarja.)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { createMockContext2D } from '../harness/mockEnv';
import { renderChatText, ChatStyle } from '../../src/utils/chatRenderer';
import { drawCanvasLayer } from '../../src/utils/canvasLayerRenderer';
import { RP_PRESETS } from '../../src/utils/rpPresets';
import type { CanvasLayer } from '../../src/types';

type Rec = { method: string; args: any[]; state: any };
const mk = () => createMockContext2D(1280, 720) as unknown as CanvasRenderingContext2D & { operationHistory: Rec[]; textBaseline: string };

const style: ChatStyle = {
  rawText: 'Mike Johnson diz (normal): olá', characters: [], fontSize: 20, fontFamily: 'Arial',
  lineHeightFactor: 1.5, strokeEnabled: true, strokeWidth: 2, strokeColor: '#000',
  bgEnabled: true, bgColor: '#000', bgOpacity: 0.5, maxWidthPercent: 100, shadowEnabled: true,
  censorStyle: 'mosaic', showTimestamps: true, chatPos: { x: 10, y: 10 }
};

const preset = (key: keyof typeof RP_PRESETS): CanvasLayer => ({
  id: 'p', type: 'preset', name: 'p', x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1,
  visible: true, presetType: key as any, presetData: { ...(RP_PRESETS as any)[key].defaultData }
});

describe('Tier 5: Estado do desenho', () => {

  test('T5_DRAW_01_ChatDoesNotLeakState: renderChatText restaura o estado do contexto', () => {
    const ctx = mk();
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px serif';
    renderChatText(ctx, 1280, 720, 1, style);
    assertEqual(ctx.textBaseline, 'alphabetic');
    assertEqual(ctx.font, '10px serif');
    assertEqual(ctx.shadowBlur, 0);
  });

  test('T5_DRAW_02_PresetUsesAlphabeticBaseline: o preset desenha texto com linha de base normal, mesmo após o chat', () => {
    for (const key of ['weazel', 'bodycam', 'cctv', 'mugshot', 'flir', 'dashcam'] as const) {
      const ctx = mk();
      ctx.textBaseline = 'top';   // estado que o chat costumava deixar
      ctx.textAlign = 'center';
      drawCanvasLayer(ctx, preset(key), 1280, 720, 1);
      const texts = ctx.operationHistory.filter(c => c.method === 'fillText');
      assert(texts.length > 0, `${key}: sem texto desenhado`);
      // o primeiro texto de cada preset deve ser desenhado com a linha de base "alphabetic" (padrão do navegador),
      // ou com a que o próprio preset definir — nunca herdada do chat
      const inherited = texts.filter(t => t.state.textBaseline === 'top' && !/top/.test(String((RP_PRESETS as any)[key].draw)));
      assertEqual(inherited.length, 0, `${key}: ${inherited.length} textos com baseline herdada`);
    }
  });

  test('T5_DRAW_03_WeazelBadgeAboveBanner: o selo "AO VIVO" é escrito dentro do selo vermelho, acima da tarja', () => {
    const ctx = mk();
    ctx.textBaseline = 'top';
    drawCanvasLayer(ctx, preset('weazel'), 1280, 720, 1);
    const h = 720;
    const bannerH = Math.round(h * 0.18);
    const startY = h - bannerH - Math.round(h * 0.04);
    const badgeH = Math.round(bannerH * 0.28);
    const tag = ctx.operationHistory.find(c => c.method === 'fillText' && String(c.args[0]).includes('AO VIVO'))!;
    assertEqual(tag.state.textBaseline, 'alphabetic');
    // com baseline alphabetic, y é a linha de base: precisa ficar dentro da faixa do selo (acima de startY)
    assert(tag.args[2] <= startY && tag.args[2] >= startY - badgeH, `y=${tag.args[2]} fora do selo [${startY - badgeH}, ${startY}]`);
  });
});
