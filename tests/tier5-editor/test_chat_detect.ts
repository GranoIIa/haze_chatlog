/**
 * Tier 5: detecção de personagens no chat colado do servidor
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { detectSpeakers, newCharactersFor } from '../../src/utils/chatDetect';
import { CHAR_COLORS } from '../../src/utils/chatParser';

const SAMPLE = [
  '[21:04:11] Mike Johnson diz: Boa noite, oficial.',
  '* Mike Johnson ajusta o colete.',
  'Sarah Miller diz (baixo): Ele está armado.',
  '[Rádio] Policial #12 diz (rádio): Central, copiado.',
  'Policial #12 grita: Parado!',
  'Sarah Miller diz: ok',
  '((fora do personagem))',
  '! Sistema: algo',
  '$ R$ 500'
].join('\n');

describe('Tier 5: detectSpeakers', () => {
  test('T5_DET_01_FindsUniqueSpeakersInOrder: nomes únicos na ordem de aparição', () => {
    assertEqual(JSON.stringify(detectSpeakers(SAMPLE)), JSON.stringify(['Mike Johnson', 'Sarah Miller', 'Policial #12']));
  });

  test('T5_DET_02_IgnoresActionsSystemAndOoc: ações, sistema, OOC e linhas vazias não viram personagem', () => {
    assertEqual(detectSpeakers('* A porta abre\n! Aviso: teste\n((ooc: oi))\n\n$ item').length, 0);
    assertEqual(detectSpeakers('').length, 0);
  });

  test('T5_DET_03_EnglishAndCase: "says" é reconhecido e maiúsculas não duplicam', () => {
    const r = detectSpeakers('John Doe says: hi\njohn doe says: again\r\nAnna Lee whispers: psst');
    assertEqual(JSON.stringify(r), JSON.stringify(['John Doe', 'Anna Lee']));
  });

  test('T5_DET_04_RejectsAbsurdNames: nomes enormes ou sem letras são descartados', () => {
    assertEqual(detectSpeakers(`${'a'.repeat(60)} diz: oi`).length, 0);
    assertEqual(detectSpeakers('123 diz: oi').length, 0);
  });

  test('T5_DET_05_NewCharactersSkipExistingWithColors: só cria os que faltam, com cores em sequência', () => {
    const existing = [{ id: '1', name: 'mike johnson', color: '#000000' }];
    const fresh = newCharactersFor(SAMPLE, existing, 1000);
    assertEqual(fresh.map(c => c.name).join('|'), 'Sarah Miller|Policial #12');
    assertEqual(fresh[0].color, CHAR_COLORS[1 % CHAR_COLORS.length]);
    assertEqual(new Set(fresh.map(c => c.id)).size, 2);
    assert(newCharactersFor(SAMPLE, [...existing, ...fresh]).length === 0);
  });
});
