/**
 * Challenger 1: Empirical Adversarial Stress Harness for Milestone 2
 * Focus: RP Commands, Whitespace Slicing, Timestamps, Character State, Censorship, Text Wrapping
 */

import { setupMockEnv, createMockContext2D } from './harness/mockEnv';
import { parseChatLine, splitCensoredSegments, wrapText, CHAT_COLORS, CHAR_COLORS } from '../src/utils/chatParser';

setupMockEnv();

interface StressResult {
  category: string;
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const stressResults: StressResult[] = [];

function runStress(category: string, testName: string, fn: () => void) {
  try {
    fn();
    stressResults.push({ category, testName, passed: true });
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m [${category}] ${testName}`);
  } catch (err: any) {
    stressResults.push({ category, testName, passed: false, error: err.message, details: err.stack });
    console.log(`  \x1b[31m✗ [FAIL]\x1b[0m [${category}] ${testName}\n    -> Error: ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ' | ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\n\x1b[36m======================================================================\x1b[0m');
console.log('\x1b[36m   CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS SUITE (MILESTONE 2)    \x1b[0m');
console.log('\x1b[36m======================================================================\x1b[0m\n');

// ============================================================================
// 1. ALL RP COMMANDS STRESS TESTING
// ============================================================================
console.log('\x1b[33m--- Category 1: RP Commands Full Matrix & Variations ---\x1b[0m');

// 1.1 /me
runStress('RP_Commands', '/me standard action', () => {
  const p = parseChatLine('/me puxa o distintivo do bolso');
  assertEqual(p.type, 'me');
  assertEqual(p.messageText, 'puxa o distintivo do bolso');
});

runStress('RP_Commands', '/me case-insensitivity (/ME, /Me)', () => {
  assertEqual(parseChatLine('/ME acena com a cabeça').type, 'me');
  assertEqual(parseChatLine('/Me acena com a cabeça').type, 'me');
});

runStress('RP_Commands', '/me bare command without arguments', () => {
  const p = parseChatLine('/me');
  assertEqual(p.type, 'me');
  assertEqual(p.messageText, '');
});

runStress('RP_Commands', '/me multiple spaces after slash', () => {
  const p = parseChatLine('/me    corre rapidamente');
  assertEqual(p.type, 'me');
  assertEqual(p.messageText, 'corre rapidamente');
});

// 1.2 /do
runStress('RP_Commands', '/do environmental state', () => {
  const p = parseChatLine('/do O motor está em chamas.');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, 'O motor está em chamas.');
});

runStress('RP_Commands', '/do case-insensitivity (/DO, /Do)', () => {
  assertEqual(parseChatLine('/DO Vidros estilhaçados').type, 'yellow');
  assertEqual(parseChatLine('/Do Vidros estilhaçados').type, 'yellow');
});

runStress('RP_Commands', '/do bare command', () => {
  const p = parseChatLine('/do');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, '');
});

// 1.3 /ame
runStress('RP_Commands', '/ame ambient action', () => {
  const p = parseChatLine('/ame ajeita a gravata');
  assertEqual(p.type, 'ame');
  assertEqual(p.messageText, 'ajeita a gravata');
});

runStress('RP_Commands', '/ame case-insensitivity & bare', () => {
  assertEqual(parseChatLine('/AME suspira').type, 'ame');
  assertEqual(parseChatLine('/ame').type, 'ame');
  assertEqual(parseChatLine('/ame').messageText, '');
});

// 1.4 /ooc and /b
runStress('RP_Commands', '/ooc out-of-character chat', () => {
  const p = parseChatLine('/ooc volto em 2 minutos');
  assertEqual(p.type, 'ooc');
  assertEqual(p.messageText, 'volto em 2 minutos');
  assertEqual(parseChatLine('/OOC já volto').type, 'ooc');
  assertEqual(parseChatLine('/ooc').type, 'ooc');
  assertEqual(parseChatLine('/ooc').messageText, '');
});

runStress('RP_Commands', '/b local out-of-character chat', () => {
  const p = parseChatLine('/b segura o RP rapidinho');
  assertEqual(p.type, 'ooc');
  assertEqual(p.messageText, 'segura o RP rapidinho');
  assertEqual(parseChatLine('/B crashou aqui').type, 'ooc');
  assertEqual(parseChatLine('/b').type, 'ooc');
  assertEqual(parseChatLine('/b').messageText, '');
});

// 1.5 /s (shout)
runStress('RP_Commands', '/s shout command', () => {
  const p = parseChatLine('/s Parados! É a Polícia!');
  assertEqual(p.type, 'white');
  assertEqual(p.messageText, 'Parados! É a Polícia!');
  assertEqual(parseChatLine('/S Mãos para o alto!').type, 'white');
  assertEqual(parseChatLine('/s').type, 'white');
  assertEqual(parseChatLine('/s').messageText, '');
});

// 1.6 /w, /low, /c (whispers)
runStress('RP_Commands', '/w whisper to ID/player', () => {
  const p = parseChatLine('/w 42 passa o pen drive');
  assertEqual(p.type, 'darkgrey');
  assertEqual(p.messageText, '42 passa o pen drive');
  assertEqual(parseChatLine('/W 42 segredo').type, 'darkgrey');
  assertEqual(parseChatLine('/w').type, 'darkgrey');
  assertEqual(parseChatLine('/w').messageText, '');
});

runStress('RP_Commands', '/low low-voice command', () => {
  const p = parseChatLine('/low não faz nenhum movimento brusco');
  assertEqual(p.type, 'darkgrey');
  assertEqual(p.messageText, 'não faz nenhum movimento brusco');
  assertEqual(parseChatLine('/LOW silêncio').type, 'darkgrey');
  assertEqual(parseChatLine('/low').type, 'darkgrey');
  assertEqual(parseChatLine('/low').messageText, '');
});

runStress('RP_Commands', '/c close whisper command', () => {
  const p = parseChatLine('/c eles estão vindo por trás');
  assertEqual(p.type, 'darkgrey');
  assertEqual(p.messageText, 'eles estão vindo por trás');
  assertEqual(parseChatLine('/C cuidado').type, 'darkgrey');
  assertEqual(parseChatLine('/c').type, 'darkgrey');
  assertEqual(parseChatLine('/c').messageText, '');
});

// 1.7 /r, /radio, /dep, /f (radio & departments)
runStress('RP_Commands', '/r radio reply', () => {
  const p = parseChatLine('/r 10-4, a caminho do 10-20');
  assertEqual(p.type, 'blue');
  assertEqual(p.messageText, '10-4, a caminho do 10-20');
  assertEqual(parseChatLine('/R cópia').type, 'blue');
  assertEqual(parseChatLine('/r').type, 'blue');
  assertEqual(parseChatLine('/r').messageText, '');
});

runStress('RP_Commands', '/radio frequency broadcast', () => {
  const p = parseChatLine('/radio QRR código 3 na Vinewood Blvd');
  assertEqual(p.type, 'blue');
  assertEqual(p.messageText, 'QRR código 3 na Vinewood Blvd');
  assertEqual(parseChatLine('/RADIO central na escuta').type, 'blue');
  assertEqual(parseChatLine('/radio').type, 'blue');
  assertEqual(parseChatLine('/radio').messageText, '');
});

runStress('RP_Commands', '/dep with arguments', () => {
  const p = parseChatLine('/dep LSPD para EMS: solicitamos resgate na praia');
  assertEqual(p.type, 'blue', 'type for /dep with arguments');
  assertEqual(p.messageText, 'LSPD para EMS: solicitamos resgate na praia');
});

runStress('RP_Commands', '/dep case insensitivity', () => {
  assertEqual(parseChatLine('/DEP central').type, 'blue', 'type for /DEP');
});

runStress('RP_Commands', '/dep bare command', () => {
  assertEqual(parseChatLine('/dep').type, 'blue', 'type for bare /dep');
  assertEqual(parseChatLine('/dep').messageText, '');
});

runStress('RP_Commands', '/f with arguments', () => {
  const p = parseChatLine('/f Carregamento de armas pronto');
  assertEqual(p.type, 'blue', 'type for /f with arguments');
  assertEqual(p.messageText, 'Carregamento de armas pronto');
});

runStress('RP_Commands', '/f case insensitivity', () => {
  assertEqual(parseChatLine('/F reunião').type, 'blue', 'type for /F');
});

runStress('RP_Commands', '/f bare command', () => {
  assertEqual(parseChatLine('/f').type, 'blue', 'type for bare /f');
  assertEqual(parseChatLine('/f').messageText, '');
});

// 1.8 /phone, /sms
runStress('RP_Commands', '/phone dial & call', () => {
  const p = parseChatLine('/phone discando para 555-0149...');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, 'discando para 555-0149...');
  assertEqual(parseChatLine('/PHONE chamada ativa').type, 'yellow');
  assertEqual(parseChatLine('/phone').type, 'yellow');
  assertEqual(parseChatLine('/phone').messageText, '');
});

runStress('RP_Commands', '/sms text messaging', () => {
  const p = parseChatLine('/sms 555-8821 Encontro você no pier');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, '555-8821 Encontro você no pier');
  assertEqual(parseChatLine('/SMS mensagem recebida').type, 'yellow');
  assertEqual(parseChatLine('/sms').type, 'yellow');
  assertEqual(parseChatLine('/sms').messageText, '');
});

// 1.9 /dispatch, /911
runStress('RP_Commands', '/dispatch emergency callout', () => {
  const p = parseChatLine('/dispatch 10-99 Tiroteio com agentes envolvidos');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, '10-99 Tiroteio com agentes envolvidos');
  assertEqual(parseChatLine('/DISPATCH código 0').type, 'yellow');
  assertEqual(parseChatLine('/dispatch').type, 'yellow');
  assertEqual(parseChatLine('/dispatch').messageText, '');
});

runStress('RP_Commands', '/911 citizen emergency call', () => {
  const p = parseChatLine('/911 Veículo suspeito rondando a joalheria');
  assertEqual(p.type, 'yellow');
  assertEqual(p.messageText, 'Veículo suspeito rondando a joalheria');
  assertEqual(parseChatLine('/911 socorro').type, 'yellow');
  assertEqual(parseChatLine('/911').type, 'yellow');
  assertEqual(parseChatLine('/911').messageText, '');
});

// 1.10 Legacy prefix symbols (*, >, $, !, #, ((, [radio])
runStress('RP_Commands', 'Legacy prefix symbols (*, >, $, !, #, ((), [radio])', () => {
  assertEqual(parseChatLine('* Sarah sorri').type, 'me');
  assertEqual(parseChatLine('> Sarah pensa').type, 'ame');
  assertEqual(parseChatLine('$ [BANCO] +$50.000 recebidos').type, 'yellow');
  assertEqual(parseChatLine('! [SISTEMA] Reinício em 10m').type, 'system');
  assertEqual(parseChatLine('# [ANÚNCIO] Vendo Karin Sultan').type, 'yellow');
  assertEqual(parseChatLine('(( OOC chat entre parênteses ))').type, 'ooc');
  assertEqual(parseChatLine('[rádio] Canal tático 1').type, 'blue');
  assertEqual(parseChatLine('[radio] Tactical channel 2').type, 'blue');
});

// 1.11 Conversational tone tags in speech
runStress('RP_Commands', 'Conversational tone matching in speech lines', () => {
  assertEqual(parseChatLine('Marcus diz (celular): Alô?').type, 'yellow');
  assertEqual(parseChatLine('Marcus diz (telefone): Estou chegando.').type, 'yellow');
  assertEqual(parseChatLine('Marcus diz (baixo): Silêncio aí.').type, 'darkgrey');
  assertEqual(parseChatLine('Marcus diz (sussurrando): Não olhe agora.').type, 'darkgrey');
  assertEqual(parseChatLine('Marcus diz (gritando): Cuidado!').type, 'white');
  assertEqual(parseChatLine('Marcus grita: Polícia!').type, 'white');
});

// ============================================================================
// 2. LEADING WHITESPACE & PREFIX SLICING BUG STRESS
// ============================================================================
console.log('\n\x1b[33m--- Category 2: Leading Whitespace & Prefix Slicing ---\x1b[0m');

runStress('Whitespace_Slicing', '"   ! Urgent" leading spaces with system prefix', () => {
  const p = parseChatLine('   ! Urgent broadcast message');
  assertEqual(p.type, 'system');
  assertEqual(p.rawText, '   ! Urgent broadcast message');
  // segments should NOT contain '!'
  assert(!p.segments[0].text.startsWith('!'), `segments[0].text should not start with '!', got "${p.segments[0].text}"`);
  assertEqual(p.segments[0].text, 'Urgent broadcast message');
});

runStress('Whitespace_Slicing', '"  # Notice" leading spaces with yellow notification prefix', () => {
  const p = parseChatLine('  # Notice to all residents');
  assertEqual(p.type, 'yellow');
  assertEqual(p.rawText, '  # Notice to all residents');
  assert(!p.segments[0].text.startsWith('#'), `segments[0].text should not start with '#', got "${p.segments[0].text}"`);
  assertEqual(p.segments[0].text, 'Notice to all residents');
});

runStress('Whitespace_Slicing', 'Tab and mixed whitespace with prefix ("\t\t! Alert")', () => {
  const p = parseChatLine('\t\t! Server maintenance in 5 min');
  assertEqual(p.type, 'system');
  assertEqual(p.segments[0].text, 'Server maintenance in 5 min');
});

runStress('Whitespace_Slicing', 'Prefix with multiple spaces between prefix and body ("!    Peculiar")', () => {
  const p = parseChatLine('   !    Multiple spaces following exclamation');
  assertEqual(p.type, 'system');
  assertEqual(p.segments[0].text, 'Multiple spaces following exclamation');
});

runStress('Whitespace_Slicing', 'Lone prefix symbol alone ("   !", "   #")', () => {
  const p1 = parseChatLine('   !');
  assertEqual(p1.type, 'system');
  assertEqual(p1.segments[0].text, '');

  const p2 = parseChatLine('   #');
  assertEqual(p2.type, 'yellow');
  assertEqual(p2.segments[0].text, '');
});

runStress('Whitespace_Slicing', 'Leading whitespace before slash commands ("   /me jumps")', () => {
  const p = parseChatLine('   /me salta a mureta');
  assertEqual(p.type, 'me');
  assertEqual(p.messageText, 'salta a mureta');
});

// ============================================================================
// 3. COMPLEX & INVALID TIMESTAMPS
// ============================================================================
console.log('\n\x1b[33m--- Category 3: Timestamps Boundary & Edge Cases ---\x1b[0m');

runStress('Timestamps', 'Midnight boundary [00:00:00]', () => {
  const p = parseChatLine('[00:00:00] Novo dia começa');
  assertEqual(p.timestamp, '[00:00:00]');
  assertEqual(p.type, 'white');
  assertEqual(p.messageText, 'Novo dia começa');
});

runStress('Timestamps', 'Day-end boundary [23:59:59]', () => {
  const p = parseChatLine('[23:59:59] Turno encerrado');
  assertEqual(p.timestamp, '[23:59:59]');
  assertEqual(p.messageText, 'Turno encerrado');
});

runStress('Timestamps', 'Parentheses two-digit format (23:59)', () => {
  const p = parseChatLine('(23:59) /me tranca as portas');
  assertEqual(p.timestamp, '(23:59)');
  assertEqual(p.type, 'me');
  assertEqual(p.messageText, 'tranca as portas');
});

runStress('Timestamps', 'Three-part timestamp [12:34:56]', () => {
  const p = parseChatLine('[12:34:56] Operação deflagrada');
  assertEqual(p.timestamp, '[12:34:56]');
  assertEqual(p.messageText, 'Operação deflagrada');
});

runStress('Timestamps', 'Three-part parenthesis timestamp (12:34:56)', () => {
  const p = parseChatLine('(12:34:56) Teste de parenteses');
  assertEqual(p.timestamp, '(12:34:56)');
  assertEqual(p.messageText, 'Teste de parenteses');
});

runStress('Timestamps', 'Two-part bracket timestamp [08:15]', () => {
  const p = parseChatLine('[08:15] Carlos diz: Bom dia');
  assertEqual(p.timestamp, '[08:15]');
  assertEqual(p.speaker, 'Carlos');
  assertEqual(p.messageText, 'Bom dia');
});

runStress('Timestamps', 'Invalid timestamp [99:99]', () => {
  const p = parseChatLine('[99:99] Horário impossível');
  assertEqual(p.timestamp, undefined);
  assert(p.messageText?.includes('[99:99]'), 'messageText preserves [99:99]');
});

runStress('Timestamps', 'Invalid timestamp hour > 23 [25:00:00]', () => {
  const p = parseChatLine('[25:00:00] Hora 25 inválida');
  assertEqual(p.timestamp, undefined);
  assert(p.messageText?.includes('[25:00:00]'), 'messageText preserves [25:00:00]');
});

runStress('Timestamps', 'Invalid timestamp minute > 59 [12:60:00]', () => {
  const p = parseChatLine('[12:60:00] Minuto 60 inválido');
  assertEqual(p.timestamp, undefined);
});

runStress('Timestamps', 'Invalid timestamp second > 59 [12:34:60]', () => {
  const p = parseChatLine('[12:34:60] Segundo 60 inválido');
  assertEqual(p.timestamp, undefined);
});

runStress('Timestamps', 'Invalid timestamp parentheses (99:99)', () => {
  const p = parseChatLine('(99:99) Parênteses impossíveis');
  assertEqual(p.timestamp, undefined);
});

runStress('Timestamps', 'Empty brackets []', () => {
  const p = parseChatLine('[] Colchete vazio');
  assertEqual(p.timestamp, undefined);
});

runStress('Timestamps', 'Non-timestamp callsign bracket [K-9]', () => {
  const p = parseChatLine('[K-9] Unidade canina em patrulha');
  assertEqual(p.timestamp, undefined);
  assert(p.messageText?.includes('[K-9]'), 'messageText preserves [K-9]');
});

runStress('Timestamps', 'Timestamp followed by slash command with leading spaces', () => {
  const p = parseChatLine('   [14:30:00]   /radio QRR na delegacia');
  assertEqual(p.timestamp, '[14:30:00]');
  assertEqual(p.type, 'blue');
  assertEqual(p.messageText, 'QRR na delegacia');
});

runStress('Timestamps', 'Consecutive timestamps in same line', () => {
  const p = parseChatLine('[10:00:00] [10:00:05] Duplo timestamp');
  assertEqual(p.timestamp, '[10:00:00]');
  assert(p.messageText?.includes('[10:00:05]'));
});

// ============================================================================
// 4. CHARACTER NAME ISOLATION & SPEECH TONES
// ============================================================================
console.log('\n\x1b[33m--- Category 4: Speaker Isolation & Character State ---\x1b[0m');

runStress('Speaker_Isolation', 'Standard speech verb "diz:"', () => {
  const p = parseChatLine('Jack Bauer diz: Não temos muito tempo.');
  assertEqual(p.speaker, 'Jack Bauer');
  assertEqual(p.messageText, 'Não temos muito tempo.');
});

runStress('Speaker_Isolation', 'Whisper verb "sussurra:"', () => {
  const p = parseChatLine('Agente 47 sussurra: O pacote está seguro.');
  assertEqual(p.speaker, 'Agente 47');
  assertEqual(p.messageText, 'O pacote está seguro.');
});

runStress('Speaker_Isolation', 'Shout verb "grita:"', () => {
  const p = parseChatLine('Policial #1 grita: Larguem as armas agora!');
  assertEqual(p.speaker, 'Policial #1');
  assertEqual(p.messageText, 'Larguem as armas agora!');
  assertEqual(p.type, 'white');
});

runStress('Speaker_Isolation', 'Tone with parentheses "diz (baixo):"', () => {
  const p = parseChatLine('Sarah Miller diz (baixo): Cuidado com os guardas.');
  assertEqual(p.speaker, 'Sarah Miller');
  assertEqual(p.messageText, 'Cuidado com os guardas.');
  assertEqual(p.type, 'darkgrey');
});

runStress('Speaker_Isolation', 'Tone with parentheses "diz (sussurrando):"', () => {
  const p = parseChatLine('Elena Rostova diz (sussurrando): Pegue a chave.');
  assertEqual(p.speaker, 'Elena Rostova');
  assertEqual(p.messageText, 'Pegue a chave.');
  assertEqual(p.type, 'darkgrey');
});

runStress('Speaker_Isolation', 'Tone with parentheses "diz (celular):"', () => {
  const p = parseChatLine('Franklin diz (celular): Sim, o carro está pronto.');
  assertEqual(p.speaker, 'Franklin');
  assertEqual(p.messageText, 'Sim, o carro está pronto.');
  assertEqual(p.type, 'yellow');
});

runStress('Speaker_Isolation', 'Complex speaker name with quotes (Alex "Ghost" Silva)', () => {
  const p = parseChatLine('Alex "Ghost" Silva diz: Silêncio no rádio.');
  assertEqual(p.speaker, 'Alex "Ghost" Silva');
  assertEqual(p.messageText, 'Silêncio no rádio.');
});

runStress('Speaker_Isolation', 'Complex speaker name with badges and brackets (Officer #42 [K9])', () => {
  const p = parseChatLine('Officer #42 [K9] diz: O cão encontrou o rastro.');
  assertEqual(p.speaker, 'Officer #42 [K9]');
  assertEqual(p.messageText, 'O cão encontrou o rastro.');
});

runStress('Speaker_Isolation', 'Complex callsign with apostrophes (OFC. J. O\'Connor [K-9])', () => {
  const p = parseChatLine("OFC. J. O'Connor [K-9] diz: Perímetro fechado.");
  assertEqual(p.speaker, "OFC. J. O'Connor [K-9]");
  assertEqual(p.messageText, 'Perímetro fechado.');
});

runStress('Speaker_Isolation', 'Action speaker isolation in * /me (verbs: puxa, saca, acende, etc)', () => {
  const p1 = parseChatLine('* Jack acende o fósforo.');
  assertEqual(p1.speaker, 'Jack');
  assertEqual(p1.type, 'me');

  const p2 = parseChatLine('* Sarah Miller puxa a alavanca de emergência.');
  assertEqual(p2.speaker, 'Sarah Miller');
  assertEqual(p2.type, 'me');

  const p3 = parseChatLine('* OFC. Miller saca a taser com agilidade.');
  assertEqual(p3.speaker, 'OFC. Miller');
  assertEqual(p3.type, 'me');
});

runStress('Speaker_Isolation', 'Multiple colons inside message text', () => {
  const p = parseChatLine('Marcus diz: Horário: 14:30:00, IP: 192.168.1.1, Status: OK.');
  assertEqual(p.speaker, 'Marcus');
  assertEqual(p.messageText, 'Horário: 14:30:00, IP: 192.168.1.1, Status: OK.');
});

runStress('Speaker_Isolation', 'Speaker line with empty message text ("Marcus diz:")', () => {
  const p = parseChatLine('Marcus diz:');
  assertEqual(p.speaker, 'Marcus');
  assertEqual(p.messageText?.trim(), '');
});

// ============================================================================
// 5. CENSORSHIP MARKERS & MALFORMED INPUTS
// ============================================================================
console.log('\n\x1b[33m--- Category 5: Censorship Markers & Edge Cases ---\x1b[0m');

runStress('Censorship', 'Standard ||spoiler|| censorship tags', () => {
  const segs = splitCensoredSegments('O suspeito é ||John Doe|| e fugiu a pé.');
  assertEqual(segs.length, 3);
  assertEqual(segs[0].text, 'O suspeito é ');
  assertEqual(segs[0].isCensored, false);
  assertEqual(segs[1].text, 'John Doe');
  assertEqual(segs[1].isCensored, true);
  assertEqual(segs[2].text, ' e fugiu a pé.');
  assertEqual(segs[2].isCensored, false);
});

runStress('Censorship', 'BBCode [censor]...[/censor] tags', () => {
  const segs = splitCensoredSegments('Senha: [censor]admin1234[/censor]');
  assertEqual(segs.length, 2);
  assertEqual(segs[0].text, 'Senha: ');
  assertEqual(segs[0].isCensored, false);
  assertEqual(segs[1].text, 'admin1234');
  assertEqual(segs[1].isCensored, true);
});

runStress('Censorship', 'BBCode [censura]...[/censura] tags', () => {
  const segs = splitCensoredSegments('Local: [censura]Galpão 4[/censura]');
  assertEqual(segs.length, 2);
  assertEqual(segs[1].text, 'Galpão 4');
  assertEqual(segs[1].isCensored, true);
});

runStress('Censorship', 'Solid block character markers (█████)', () => {
  const segs = splitCensoredSegments('Identidade: ████████ confirmada');
  assertEqual(segs.length, 3);
  assertEqual(segs[1].text, '████████');
  assertEqual(segs[1].isCensored, true);
});

runStress('Censorship', 'Mixed censorship formats on a single line', () => {
  const line = 'Agente ||007|| usou chave [censor]X99-A[/censor] na base ████ com sucesso';
  const segs = splitCensoredSegments(line);
  assertEqual(segs.length, 7);
  assertEqual(segs[1].text, '007');
  assertEqual(segs[1].isCensored, true);
  assertEqual(segs[3].text, 'X99-A');
  assertEqual(segs[3].isCensored, true);
  assertEqual(segs[5].text, '████');
  assertEqual(segs[5].isCensored, true);
});

runStress('Censorship', 'Unclosed delimiter ("||sem fechar")', () => {
  const segs = splitCensoredSegments('Texto com segredo ||não fechado aqui');
  // Should not crash or infinite loop, returns plain text
  assert(segs.length >= 1);
  assertEqual(segs[0].isCensored, false);
});

runStress('Censorship', 'Unclosed bbcode ("[censor]sem fechar")', () => {
  const segs = splitCensoredSegments('Texto [censor]não fechado');
  assert(segs.length >= 1);
  assertEqual(segs[0].isCensored, false);
});

runStress('Censorship', 'Empty censorship tags ("||||", "[censor][/censor]")', () => {
  const segs1 = splitCensoredSegments('Vazio: |||| aqui');
  assert(segs1.length >= 2);
  assert(segs1.some(s => s.isCensored));

  const segs2 = splitCensoredSegments('Vazio: [censor][/censor] aqui');
  assert(segs2.length >= 2);
  assert(segs2.some(s => s.isCensored));
});

runStress('Censorship', 'High density consecutive censorship markers (50x)', () => {
  const tokens = Array.from({ length: 50 }, (_, i) => `||T${i}||`).join(' ');
  const start = Date.now();
  const segs = splitCensoredSegments(tokens);
  const elapsed = Date.now() - start;

  assert(elapsed < 50, `Censorship parsing took ${elapsed}ms, expected < 50ms`);
  const censoredCount = segs.filter(s => s.isCensored).length;
  assertEqual(censoredCount, 50);
});

// ============================================================================
// 6. CANVAS TEXT WRAPPING (wrapText) ENGINE
// ============================================================================
console.log('\n\x1b[33m--- Category 6: wrapText Engine Edge Cases ---\x1b[0m');

runStress('wrapText', 'Empty string returns empty array', () => {
  const ctx = createMockContext2D(800, 600);
  const lines = wrapText(ctx as any, '', 300);
  assertEqual(lines.length, 0);
});

runStress('wrapText', 'Zero or negative maxWidth clamped to safe minimum (50)', () => {
  const ctx = createMockContext2D(800, 600);
  const l1 = wrapText(ctx as any, 'Texto teste', 0);
  const l2 = wrapText(ctx as any, 'Texto teste', -100);
  assert(l1.length >= 1);
  assert(l2.length >= 1);
});

runStress('wrapText', 'Whitespace-only paragraph handling', () => {
  const ctx = createMockContext2D(800, 600);
  const l1 = wrapText(ctx as any, '     ', 300);
  // Preserves empty line for blank paragraphs
  assertEqual(l1.length, 1);
  assertEqual(l1[0], '');
});

runStress('wrapText', 'Preservation of explicit newlines', () => {
  const ctx = createMockContext2D(800, 600);
  const text = 'Linha 1\n\nLinha 3\nLinha 4';
  const lines = wrapText(ctx as any, text, 400);
  assertEqual(lines.length, 4);
  assertEqual(lines[0], 'Linha 1');
  assertEqual(lines[1], '');
  assertEqual(lines[2], 'Linha 3');
  assertEqual(lines[3], 'Linha 4');
});

runStress('wrapText', 'Multiple consecutive words exceeding maxWidth', () => {
  const ctx = createMockContext2D(800, 600);
  const words = 'WWWWWWWWWWWWWWWWWWWW XXXXXXXXXXXXXXXXXXXX YYYYYYYYYYYYYYYYYYYY';
  const lines = wrapText(ctx as any, words, 60);
  assert(lines.length >= 3, `Expected at least 3 lines, got ${lines.length}`);
});

runStress('wrapText', 'Single unbroken word exceeding maxWidth splits into character chunks', () => {
  const ctx = createMockContext2D(800, 600);
  const giantWord = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(10); // 260 chars
  const lines = wrapText(ctx as any, giantWord, 100);
  assert(lines.length > 5, `Expected > 5 chunks, got ${lines.length}`);
  // verify all characters preserved
  assertEqual(lines.join(''), giantWord);
});

runStress('wrapText', 'Mixed short words, long sentence, and Unicode emojis', () => {
  const ctx = createMockContext2D(800, 600);
  const text = 'Atenção todas as viaturas 🚓🚨 código 3 acionado na interseção da rodovia principal 🔥!';
  const lines = wrapText(ctx as any, text, 200);
  assert(lines.length >= 2);
  const joined = lines.join(' ');
  assert(joined.includes('🚓🚨'));
  assert(joined.includes('🔥!'));
});

// ============================================================================
// 7. SUMMARY & INTEGRITY VERDICT
// ============================================================================
console.log('\n\x1b[36m======================================================================\x1b[0m');
console.log('\x1b[36m                     STRESS TEST EXECUTION SUMMARY                    \x1b[0m');
console.log('\x1b[36m======================================================================\x1b[0m\n');

const total = stressResults.length;
const passed = stressResults.filter(r => r.passed).length;
const failed = stressResults.filter(r => !r.passed).length;

console.log(`Total Stress Tests: ${total}`);
console.log(`Passed:             \x1b[32m${passed}\x1b[0m`);
console.log(`Failed:             ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);

if (failed > 0) {
  console.log('\nFailed Tests:');
  stressResults.filter(r => !r.passed).forEach(f => {
    console.log(`  - [${f.category}] ${f.testName}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('\n\x1b[32m[SUCCESS] All Milestone 2 empirical stress tests passed with 100% success rate.\x1b[0m\n');
  process.exit(0);
}
