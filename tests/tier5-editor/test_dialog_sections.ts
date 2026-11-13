/**
 * Tier 5: edição de diálogos (dialogEdit), seções do painel e canal de texto do chat
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { insertAtSelection, censorSelection, speechPrefix } from '../../src/utils/dialogEdit';
import { SECTION_IDS } from '../../src/components/ChatLog/EditorSection';
import { requestChatText, subscribeChatTextRequests, requestSetBackground, subscribeBackgroundRequests, type BackgroundRequest } from '../../src/utils/chatStore';

describe('Tier 5: Diálogos, seções e canal de texto', () => {

  test('T5_DLG_01_InsertAtCursorStartOfLine: insere no cursor e quebra a linha se estiver no meio dela', () => {
    const r = insertAtSelection('Primeira linha', 14, 14, 'Mike diz (normal): ');
    assertEqual(r.value, 'Primeira linha\nMike diz (normal): ');
    assertEqual(r.selStart, r.value.length);

    // no início de uma linha: sem quebra extra
    const r2 = insertAtSelection('a\n', 2, 2, '$ ');
    assertEqual(r2.value, 'a\n$ ');
    // texto vazio
    assertEqual(insertAtSelection('', 0, 0, '* ').value, '* ');
  });

  test('T5_DLG_02_InsertReplacesSelection: a seleção é substituída', () => {
    const r = insertAtSelection('abc XXX def', 4, 7, 'Y', false);
    assertEqual(r.value, 'abc Y def');
    assertEqual(r.selStart, 5);
  });

  test('T5_DLG_03_InsertClampsBadRange: posições fora do texto não quebram', () => {
    assertEqual(insertAtSelection('abc', -5, 99, 'Z', false).value, 'Z');
    assertEqual(insertAtSelection('abc', 99, 1, '!', false).value, 'abc!');
  });

  test('T5_DLG_04_CensorWrapsSelection: censura envolve a seleção; sem seleção insere marcador', () => {
    const r = censorSelection('a senha 4892 do cofre', 8, 12);
    assertEqual(r.value, 'a senha ||4892|| do cofre');
    assertEqual(r.selStart, 16);

    const m = censorSelection('texto', 5, 5);
    assertEqual(m.value, 'texto||CENSURADO|| ');
  });

  test('T5_DLG_05_SpeechPrefix: monta a linha de fala com o tom', () => {
    assertEqual(speechPrefix('Sarah Miller', 'sussurrando'), 'Sarah Miller diz (sussurrando): ');
    assertEqual(speechPrefix('', 'normal'), 'Personagem diz (normal): ');
  });

  test('T5_SEC_01_SectionOrder: as seções do Editor RP seguem a ordem do fluxo de trabalho', () => {
    assertDeepEqual([...SECTION_IDS], [
      'fundo', 'resolucao', 'personagens', 'dialogos', 'camera', 'retoque',
      'rp', 'adesivos', 'tipografia', 'iluminacao', 'camadas', 'inspetor', 'salvar'
    ]);
    assertEqual(new Set(SECTION_IDS).size, SECTION_IDS.length);
  });

  test('T5_STORE_02_TextRequests: pedidos de texto chegam aos assinantes e podem ser cancelados', () => {
    const got: string[] = [];
    const unsub = subscribeChatTextRequests(t => got.push(t));
    requestChatText('um');
    requestChatText('dois');
    unsub();
    requestChatText('três');
    assertDeepEqual(got, ['um', 'dois']);
    assert(true);
  });

  test('T5_STORE_03_BackgroundRequests: envio de Blob/GIF para o Editor RP funciona e pode ser cancelado', () => {
    const received: BackgroundRequest[] = [];
    const unsub = subscribeBackgroundRequests(req => received.push(req));

    const fakeBlob = new Blob(['fake-gif-data'], { type: 'image/gif' });
    requestSetBackground({
      blob: fakeBlob,
      isGif: true,
      metadata: {
        duration: 3.5,
        frames: 42,
        fps: 12,
        width: 480,
        height: 260
      }
    });

    assertEqual(received.length, 1);
    assertEqual(received[0].isGif, true);
    assertEqual(received[0].metadata?.frames, 42);
    assertEqual(received[0].metadata?.fps, 12);

    unsub();

    requestSetBackground({
      blob: fakeBlob,
      isGif: false
    });

    // Como cancelou, não deve ter recebido a segunda chamada
    assertEqual(received.length, 1);
  });

  test('T5_GIF_08_DecodeGifGracefulFallback: no Node ou sem ImageDecoder retorna null com segurança', async () => {
    const { decodeGif } = await import('../../src/utils/gifDecoder');
    const fakeBlob = new Blob(['GIF89a'], { type: 'image/gif' });
    const result = await decodeGif(fakeBlob);
    assertEqual(result, null);
  });
});
