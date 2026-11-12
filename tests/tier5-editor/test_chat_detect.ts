/**
 * Tier 5: detecção de personagens no chat colado do servidor (HAZE-UX-002, fase A)
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  detectSpeakers, newCharactersFor, detectCandidates, extractSpeaker, classify, planDetection,
  parseCustomVerbs, makeCharacters
} from '../../src/utils/chatDetect';
import { CHAR_COLORS } from '../../src/utils/chatParser';

const names = (text: string, profile: any = 'auto', verbs = '') => detectCandidates(text, profile, verbs).map(c => c.name);
const J = (x: unknown) => JSON.stringify(x);

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

describe('Tier 5: detectSpeakers (compatibilidade)', () => {
  test('T5_DET_01_FindsUniqueSpeakersInOrder: nomes únicos na ordem de aparição', () => {
    assertEqual(J(detectSpeakers(SAMPLE)), J(['Mike Johnson', 'Sarah Miller', 'Policial #12']));
  });
  test('T5_DET_02_IgnoresActionsSystemAndOoc: ações, sistema, OOC e linhas vazias não viram personagem', () => {
    assertEqual(detectSpeakers('* A porta abre\n! Aviso: teste\n((ooc: oi))\n\n$ item').length, 0);
    assertEqual(detectSpeakers('').length, 0);
  });
  test('T5_DET_03_EnglishAndCase: "says" é reconhecido e maiúsculas não duplicam', () => {
    assertEqual(J(detectSpeakers('John Doe says: hi\njohn doe says: again\r\nAnna Lee whispers: psst')), J(['John Doe', 'Anna Lee']));
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

describe('Tier 5: formatos suportados (HAZE-UX-002)', () => {
  test('T5_DET_10_ExplicitFormats: os 7 formatos do briefing', () => {
    const cases: Array<[string, string]> = [
      ['Ramon Mendoza diz: Boa noite.', 'Ramon Mendoza'],
      ['Ramon Mendoza diz (baixo): Calma.', 'Ramon Mendoza'],
      ['Ramon Mendoza grita: PARADO!', 'Ramon Mendoza'],
      ['John Doe says: Hello.', 'John Doe'],
      ['John Doe whispers: Be quiet.', 'John Doe'],
      ['[21:04:11] Ramon Mendoza diz: Entendi.', 'Ramon Mendoza'],
      ['[Rádio] Unidade 12 diz (rádio): Recebido.', 'Unidade 12']
    ];
    for (const [line, expected] of cases) assertEqual(extractSpeaker(line)?.name, expected, line);
  });

  test('T5_DET_11_AccentsHyphenApostropheCompound: acentos, hífen, apóstrofo, partículas e pontos', () => {
    assertEqual(J(names('José Antônio da Conceição diz: oi\nJean-Luc O\'Neil diz: yo\nMaría Pérez Jr. diz: ok\nÁlvaro Nuñez grita: ei')),
      J(['José Antônio da Conceição', "Jean-Luc O'Neil", 'María Pérez Jr.', 'Álvaro Nuñez']));
    // acento preservado: "Ramón" e "Ramon" são nomes diferentes
    assertEqual(names('Ramón Díaz diz: a\nRamon Diaz diz: b').length, 2);
  });

  test('T5_DET_12_TimestampsAndPrefixes: horários e prefixos variados', () => {
    const lines = ['[21:04] Ana Lima diz: a', '(21:04:11) Bruno Reis diz: b', '[9:05:01] Caio Dias diz: c',
      '[Rádio] [Unidade 4] Dora Alves diz (rádio): d', '  Eva Prado   diz:   e'];
    assertEqual(J(names(lines.join('\n'))), J(['Ana Lima', 'Bruno Reis', 'Caio Dias', 'Dora Alves', 'Eva Prado']));
  });

  test('T5_DET_13_SystemAndNonSpeech: sistema, OOC, ações e comandos nunca viram personagem', () => {
    const lines = ['Sistema diz: reiniciando', 'Admin says: restart', '[Staff] Servidor diz: aviso', '! Aviso: x', '/me Ana diz: oi',
      '* Ana Lima diz: oi', '> Ana Lima diz: oi', '(( Ana Lima diz: oi ))', '/ooc Ana Lima diz: oi', '$ Ana Lima diz: oi', '# Ana Lima diz: oi',
      'Você diz: oi', 'You say: hi', 'Notícia: Ana Lima diz: oi'];
    assertEqual(names(lines.join('\n')).length, 0, J(names(lines.join('\n'))));
  });

  test('T5_DET_14_ColonAloneIsNotAName: texto antes de ":" sem verbo de fala não vira nome', () => {
    assertEqual(names('Horário: 21:04\nRua: Vinewood Blvd\nOfficer Down: 10-13\nPlaca: ABC123').length, 0);
  });

  test('T5_DET_15_Malformed: linhas malformadas não quebram nem criam lixo', () => {
    const junk = ['diz: oi', ' diz: ', 'A diz', ':::', 'Nome diz', 'Nome diz:', 'Nome diz:   ', '[ ] diz: x', '(', 'x'.repeat(5000)];
    assertEqual(names(junk.join('\n')).length, 0, J(names(junk.join('\n'))));
  });

  test('T5_DET_16_LongMessageFirstVerbWins: "diz:" dentro da fala não muda o nome', () => {
    assertEqual(J(names('Ana Lima diz: ele disse "Bruno Reis diz: oi" e saiu')), J(['Ana Lima']));
  });
});

describe('Tier 5: perfis de importação e confiança', () => {
  test('T5_DET_20_Profiles: cada perfil só reconhece seus verbos', () => {
    const mix = 'Ana Lima diz: a\nJohn Doe says: b';
    assertEqual(J(names(mix, 'auto')), J(['Ana Lima', 'John Doe']));
    assertEqual(J(names(mix, 'fivem-pt')), J(['Ana Lima']));
    assertEqual(J(names(mix, 'gtaw-en')), J(['John Doe']));
  });

  test('T5_DET_21_CustomVerbs: verbos personalizados (só letras, sem regex do usuário)', () => {
    assertEqual(J(parseCustomVerbs('comenta, Responde;  a.b , x, (.*)')), J(['comenta', 'responde']));
    assertEqual(J(names('Ana Lima comenta: oi\nBruno Reis diz: oi', 'custom', 'comenta')), J(['Ana Lima']));
    assertEqual(names('Ana Lima diz: oi', 'custom', '').length, 0);
  });

  test('T5_DET_22_ConfidenceLevels: inequívoco x revisão', () => {
    assertEqual(classify('Ramon Mendoza')?.confidence, 'sure');
    assertEqual(classify('Ramon')?.confidence, 'sure');
    assertEqual(classify('Policial #12')?.confidence, 'review');
    assertEqual(classify('unidade 4')?.confidence, 'review');
    assertEqual(classify('Desconhecido')?.confidence, 'review');
    assertEqual(classify('RAMON MENDOZA')?.confidence, 'review');
    assertEqual(classify('ramon mendoza')?.confidence, 'review');
    assertEqual(classify('Sistema'), null);
    assertEqual(classify('a b c d e f'), null);
    assertEqual(classify('Nome: x'), null);
  });

  test('T5_DET_23_BetterSpellingUpgradesConfidence: "john doe" e depois "John Doe" vira inequívoco', () => {
    const c = detectCandidates('john doe says: a\nJohn Doe says: b');
    assertEqual(c.length, 1);
    assertEqual(c[0].confidence, 'sure');
    assertEqual(c[0].name, 'John Doe');
    assertEqual(c[0].count, 2);
  });
});

describe('Tier 5: planDetection e cadastro', () => {
  const have = [{ id: '1', name: 'Mike Johnson', color: '#111111' }];

  test('T5_DET_30_PlanSplitsAutoAndReview: automáticos x revisão, sem repetir cadastrados', () => {
    const p = planDetection(SAMPLE, have);
    assertEqual(J(p.auto.map(c => c.name)), J(['Sarah Miller']));
    assertEqual(J(p.review.map(c => c.name)), J(['Policial #12']));
    assertEqual(p.known, 1);
    assertEqual(p.total, 3);
  });

  test('T5_DET_31_IgnoredNamesAreNotAskedAgain: nomes ignorados não voltam', () => {
    const p = planDetection(SAMPLE, have, { ignored: new Set(['policial #12']) });
    assertEqual(p.review.length, 0);
  });

  test('T5_DET_32_ConsecutivePastes: colagens consecutivas acumulam sem duplicar', () => {
    let chars = [...have];
    for (const paste of ['Ana Lima diz: oi', 'Ana Lima diz: de novo\nBruno Reis diz: e aí', 'bruno reis diz: ok\nCaio Dias diz: opa']) {
      chars = [...chars, ...makeCharacters(planDetection(paste, chars).auto.map(c => c.name), chars, chars.length * 100)];
    }
    // "bruno reis" (minúsculo) é o mesmo Bruno Reis já cadastrado
    assertEqual(J(chars.map(c => c.name)), J(['Mike Johnson', 'Ana Lima', 'Bruno Reis', 'Caio Dias']));
    assertEqual(new Set(chars.map(c => c.id)).size, chars.length);
    assertEqual(chars[3].color, CHAR_COLORS[3 % CHAR_COLORS.length]);
  });

  test('T5_DET_33_WhitespaceAndCaseDedup: espaços extras e caixa não duplicam cadastrados', () => {
    const r = makeCharacters(['  mike   johnson ', 'Nova  Pessoa'], have);
    assertEqual(J(r.map(c => c.name)), J(['Nova Pessoa']));
  });

  test('T5_DET_34_LargeLog: 30 mil linhas em tempo razoável e só os nomes certos', () => {
    const lines: string[] = [];
    for (let i = 0; i < 30000; i++) {
      const k = i % 6;
      lines.push(k === 0 ? `[21:${String(i % 60).padStart(2, '0')}:00] Ramon Mendoza diz: linha ${i}`
        : k === 1 ? `Hector Alvarez diz (baixo): ${'palavra '.repeat(40)}`
        : k === 2 ? `* Ramon Mendoza olha ${i}`
        : k === 3 ? `Texto qualquer sem fala número ${i}: ${'x'.repeat(300)}`
        : k === 4 ? `Lucas Morales grita: ${i}`
        : '');
    }
    const t0 = Date.now();
    const found = names(lines.join('\n'));
    const ms = Date.now() - t0;
    assertEqual(J(found), J(['Ramon Mendoza', 'Hector Alvarez', 'Lucas Morales']));
    assert(ms < 1500, `muito lento: ${ms} ms`);
  });
});
