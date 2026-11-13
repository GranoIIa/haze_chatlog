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

  test('T5_DRAW_04_SpeakerColorFollowsStyleNotCharacter: a cor do nome segue o estilo da fala/ação, sem forçar cor do personagem', () => {
    const chars = [{ id: '1', name: 'Oliver Walker', color: '#10b981' }];

    // Fala normal: deve usar #ffffff mesmo tendo personagem verde cadastrado
    const ctxNormal = mk();
    renderChatText(ctxNormal, 1280, 720, 1, {
      ...style,
      characters: chars,
      rawText: 'Oliver Walker diz (normal): Olá mundo'
    });
    const normalTexts = ctxNormal.operationHistory.filter(c => c.method === 'fillText');
    assert(normalTexts.length > 0);
    // Nenhum pedaço do texto deve ter sido pintado com a cor verde do personagem
    const greenTokens = normalTexts.filter(t => t.state.fillStyle === '#10b981');
    assertEqual(greenTokens.length, 0, 'Nome do personagem não deve herdar cor personalizada do personagem');
    const whiteTokens = normalTexts.filter(t => t.state.fillStyle === '#ffffff');
    assert(whiteTokens.length > 0, 'Texto da fala normal deve ser renderizado em branco (#ffffff)');

    // Ação RP (* Oliver Walker ...): deve usar a cor da ação (#d8b4fe)
    const ctxAction = mk();
    renderChatText(ctxAction, 1280, 720, 1, {
      ...style,
      characters: chars,
      rawText: '* Oliver Walker puxa a faca.'
    });
    const actionTexts = ctxAction.operationHistory.filter(c => c.method === 'fillText');
    const actionTokens = actionTexts.filter(t => t.state.fillStyle === '#d8b4fe');
    assert(actionTokens.length > 0, 'Ação RP deve ser renderizada em roxo (#d8b4fe)');
    assertEqual(actionTexts.filter(t => t.state.fillStyle === '#10b981').length, 0);

    // Tom de voz celular: deve ser branco (#ffffff)
    const ctxPhone = mk();
    renderChatText(ctxPhone, 1280, 720, 1, {
      ...style,
      characters: chars,
      rawText: 'Oliver Walker diz (celular): Alô, tudo certo?'
    });
    const phoneTexts = ctxPhone.operationHistory.filter(c => c.method === 'fillText');
    const phoneWhite = phoneTexts.filter(t => t.state.fillStyle === '#ffffff');
    assert(phoneWhite.length > 0, 'Tom celular deve ser renderizado em branco (#ffffff)');
    assertEqual(phoneTexts.filter(t => t.state.fillStyle === '#f5c500').length, 0);

    // Ação # Cel: permanece em amarelo (#f5c500)
    const ctxActionPhone = mk();
    renderChatText(ctxActionPhone, 1280, 720, 1, {
      ...style,
      rawText: '# Oliver Walker atende o celular'
    });
    const actionPhoneTexts = ctxActionPhone.operationHistory.filter(c => c.method === 'fillText');
    const actionPhoneYellow = actionPhoneTexts.filter(t => t.state.fillStyle === '#f5c500');
    assert(actionPhoneYellow.length > 0, 'Ação # Cel permanece amarela (#f5c500)');

    // Sussurro: deve usar tom cinza visível (#94a3b8)
    const ctxWhisper = mk();
    renderChatText(ctxWhisper, 1280, 720, 1, {
      ...style,
      rawText: 'Oliver Walker diz (sussurrando): silêncio agora'
    });
    const whisperTexts = ctxWhisper.operationHistory.filter(c => c.method === 'fillText');
    const whisperSlate = whisperTexts.filter(t => t.state.fillStyle === '#94a3b8');
    assert(whisperSlate.length > 0, 'Sussurro deve ser renderizado em cinza legível (#94a3b8)');
  });

  test('T5_DRAW_05_ShoutingTextUppercasedAfterColon: em gritando, somente o texto após ":" fica todo em MAIÚSCULO', () => {
    // 1. Oliver Walker diz (gritando): socorro me ajuda!
    const ctx1 = mk();
    renderChatText(ctx1, 1280, 720, 1, {
      ...style,
      rawText: 'Oliver Walker diz (gritando): socorro me ajuda!'
    });
    const texts1 = ctx1.operationHistory.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
    const rendered1 = texts1.join('');
    assert(rendered1.includes('Oliver Walker diz (gritando): '), 'Prefixo antes dos dois pontos deve manter caixa original');
    assert(rendered1.includes('SOCORRO ME AJUDA!'), 'Texto após dois pontos deve ser transformado em maiúsculo');
    assert(!rendered1.includes('socorro me ajuda!'), 'Texto minúsculo não deve estar presente no diálogo');

    // 2. Policial grita: parem agora
    const ctx2 = mk();
    renderChatText(ctx2, 1280, 720, 1, {
      ...style,
      rawText: 'Policial #12 grita: parem agora imediatamente'
    });
    const texts2 = ctx2.operationHistory.filter(c => c.method === 'fillText').map(c => String(c.args[0]));
    const rendered2 = texts2.join('');
    assert(rendered2.includes('Policial #12 grita: '), 'Prefixo grita deve manter formato');
    assert(rendered2.includes('PAREM AGORA IMEDIATAMENTE'), 'Diálogo pós : deve ser maiúsculo');
  });
});
