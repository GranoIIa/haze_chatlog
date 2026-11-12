/**
 * Detecção de personagens no chat colado do servidor.
 *
 * Duas etapas separadas:
 *  1. `extractSpeaker`: isola o nome de quem fala (regras por perfil de importação);
 *  2. `classify`: decide se o nome é inequívoco ("sure") ou se vale uma revisão ("review").
 * O tipo/cor de cada linha continua sendo responsabilidade de `parseChatLine` (chatParser.ts).
 *
 * Só há nome quando existe um verbo de fala antes dos dois-pontos ("Nome diz:", "Nome says (low):").
 * Texto qualquer antes de ":" nunca vira personagem.
 */
import { CHAR_COLORS } from './chatParser';
import type { Character } from '../types';

export type ImportProfile = 'auto' | 'fivem-pt' | 'gtaw-en' | 'custom';

export const IMPORT_PROFILES: Array<{ id: ImportProfile; label: string; hint: string }> = [
  { id: 'auto', label: 'Automático', hint: 'Reconhece português e inglês' },
  { id: 'fivem-pt', label: 'FiveM PT-BR', hint: 'diz, grita, sussurra, fala' },
  { id: 'gtaw-en', label: 'GTA World EN', hint: 'says, shouts, whispers, yells' },
  { id: 'custom', label: 'Personalizado', hint: 'Seus próprios verbos' }
];

const VERBS_PT = ['diz', 'grita', 'sussurra', 'fala'];
const VERBS_EN = ['says', 'say', 'shouts', 'shout', 'whispers', 'whisper', 'yells', 'yell', 'screams', 'scream'];

export const MAX_NAME_LENGTH = 40;
export const MAX_NAME_WORDS = 5;
/** Só o começo da linha é examinado: limita o custo em logs enormes e linhas sem sentido. */
const HEAD_LENGTH = 120;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Verbos personalizados: "fala, comenta" → ['fala', 'comenta'] (só letras; no máximo 12). */
export const parseCustomVerbs = (raw: string): string[] =>
  Array.from(new Set(
    raw.split(/[,;\n]/).map(v => v.trim().toLocaleLowerCase('pt-BR')).filter(v => /^[a-zà-ÿ]{2,20}$/i.test(v))
  )).slice(0, 12);

const verbsFor = (profile: ImportProfile, customVerbs: string): string[] => {
  switch (profile) {
    case 'fivem-pt': return VERBS_PT;
    case 'gtaw-en': return VERBS_EN;
    case 'custom': return parseCustomVerbs(customVerbs);
    default: return [...VERBS_PT, ...VERBS_EN];
  }
};

const ruleFor = (verbs: string[]): RegExp | null => {
  if (verbs.length === 0) return null;
  const alt = verbs.map(escapeRe).join('|');
  // NOME  verbo  [modificador opcional]  :  conteúdo
  return new RegExp(`^(.{2,60}?)\\s+(?:${alt})(?:\\s*[\\(\\[][^\\)\\]]{0,30}[\\)\\]])?\\s*:\\s*\\S`, 'i');
};

const ruleCache = new Map<string, RegExp | null>();
const cachedRule = (profile: ImportProfile, customVerbs: string): RegExp | null => {
  const verbs = verbsFor(profile, customVerbs);
  const key = verbs.join('|');
  if (!ruleCache.has(key)) {
    if (ruleCache.size > 20) ruleCache.clear();
    ruleCache.set(key, ruleFor(verbs));
  }
  return ruleCache.get(key) ?? null;
};

// ---------------------------------------------------------------- normalização

const TIMESTAMP = /^\s*(?:\[[0-2]?\d:[0-5]\d(?::[0-5]\d)?\]|\([0-2]?\d:[0-5]\d(?::[0-5]\d)?\))\s*/;
/** Prefixos entre colchetes ("[Rádio]", "[OOC]", "[12/11]") que não fazem parte do nome. */
const BRACKET_PREFIX = /^\s*\[[^\]]{1,20}\]\s*/;
/** Linhas que nunca são fala de personagem. */
const NON_SPEECH_START = /^(?:\/(?:me|do|ame|ooc|b|r|radio|dep|f|w|low|c|s|dispatch|911|phone|sms)\b|[*>$!#]|\(\()/i;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Nomes que descrevem o sistema, não uma pessoa: nunca viram personagem. */
const HARD_BLOCK = new Set([
  'sistema', 'system', 'server', 'servidor', 'admin', 'administrador', 'administrator', 'staff', 'aviso', 'warning',
  'ooc', 'info', 'informação', 'informacao', 'notícia', 'noticia', 'news', 'anúncio', 'anuncio', 'announcement',
  'você', 'voce', 'you', 'alguém', 'alguem', 'someone', 'ninguém', 'ninguem'
]);
/** Nomes plausíveis mas genéricos: pedem confirmação. */
const SOFT_REVIEW = new Set(['desconhecido', 'unknown', 'central', 'dispatch', 'rádio', 'radio', 'policial', 'officer', 'oficial']);

const WORD = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\-]*$/;
const CAPITALIZED = /^[A-ZÀ-Þ]/;

export interface Speaker {
  name: string;
  /** "sure": cadastro automático; "review": mostrar ao usuário antes de adicionar. */
  confidence: 'sure' | 'review';
  reason?: string;
}

/** Decide se um nome já isolado é aceitável e quão confiável ele é. `null` = rejeitado. */
export function classify(rawName: string): Speaker | null {
  const name = squash(rawName);
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) return null;
  if (!/[A-Za-zÀ-ÿ]/.test(name)) return null;
  if (/[:()\[\]{}<>|\\/]/.test(name)) return null;
  const words = name.split(' ');
  if (words.length > MAX_NAME_WORDS) return null;
  if (HARD_BLOCK.has(name.toLocaleLowerCase('pt-BR'))) return null;

  const hasDigit = /\d/.test(name);
  const wordsOk = words.every(w => WORD.test(w) || /^#?\d{1,4}$/.test(w));
  if (!wordsOk) return null;
  if (hasDigit) return { name, confidence: 'review', reason: 'contém número' };
  if (SOFT_REVIEW.has(name.toLocaleLowerCase('pt-BR'))) return { name, confidence: 'review', reason: 'nome genérico' };
  if (!words.every(w => CAPITALIZED.test(w) || /^(?:de|da|do|dos|das|di|del|von|van|la|le|y|e)$/i.test(w))) {
    return { name, confidence: 'review', reason: 'começa com minúscula' };
  }
  if (name === name.toLocaleUpperCase('pt-BR') && name.length > 3) return { name, confidence: 'review', reason: 'tudo em maiúsculas' };
  return { name, confidence: 'sure' };
}

/** Etapa 1: isola o nome de quem fala numa linha (ou `null` se a linha não for uma fala). */
export function extractSpeaker(line: string, profile: ImportProfile = 'auto', customVerbs = ''): Speaker | null {
  const rule = cachedRule(profile, customVerbs);
  if (!rule) return null;
  let head = line.slice(0, HEAD_LENGTH + 80);
  head = head.replace(TIMESTAMP, '');
  // até dois prefixos entre colchetes ("[Rádio] [Unidade 4]")
  for (let i = 0; i < 2; i++) head = head.replace(BRACKET_PREFIX, '');
  head = head.trimStart().slice(0, HEAD_LENGTH);
  if (!head || NON_SPEECH_START.test(head)) return null;
  const m = head.match(rule);
  if (!m) return null;
  return classify(m[1]);
}

export interface Candidate extends Speaker {
  /** Linhas em que o nome aparece falando. */
  count: number;
}

/** Etapa 2: percorre o texto e devolve os nomes únicos (ignora maiúsculas) na ordem da primeira fala. */
export function detectCandidates(text: string, profile: ImportProfile = 'auto', customVerbs = ''): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const s = extractSpeaker(line, profile, customVerbs);
    if (!s) continue;
    const key = s.name.toLocaleLowerCase('pt-BR');
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      // uma ocorrência bem escrita melhora a confiança ("john doe" depois "John Doe")
      if (prev.confidence === 'review' && s.confidence === 'sure') { prev.confidence = 'sure'; prev.name = s.name; prev.reason = undefined; }
    } else {
      byKey.set(key, { ...s, count: 1 });
    }
  }
  return Array.from(byKey.values());
}

// ---------------------------------------------------------------- compatibilidade (API anterior)

/** Nomes de quem fala, na ordem da primeira aparição e sem repetir (qualquer confiança). */
export const detectSpeakers = (text: string): string[] => detectCandidates(text).map(c => c.name);

const nameKey = (n: string) => squash(n).toLocaleLowerCase('pt-BR');

/** Cria personagens (com cor em sequência) para nomes ainda não cadastrados. */
export function makeCharacters(names: string[], existing: Character[], now = Date.now()): Character[] {
  const have = new Set(existing.map(c => nameKey(c.name)));
  const out: Character[] = [];
  for (const raw of names) {
    const name = squash(raw);
    const key = nameKey(name);
    if (!name || have.has(key)) continue;
    have.add(key);
    out.push({ id: `${now + out.length}`, name, color: CHAR_COLORS[(existing.length + out.length) % CHAR_COLORS.length] });
  }
  return out;
}

export const newCharactersFor = (text: string, existing: Character[], now = Date.now()): Character[] =>
  makeCharacters(detectSpeakers(text), existing, now);

/** Divide os candidatos novos (não cadastrados, não ignorados) em automáticos e para revisão. */
export function planDetection(
  text: string,
  existing: Character[],
  opts: { profile?: ImportProfile; customVerbs?: string; ignored?: ReadonlySet<string> } = {}
): { auto: Candidate[]; review: Candidate[]; known: number; total: number } {
  const have = new Set(existing.map(c => nameKey(c.name)));
  const all = detectCandidates(text, opts.profile ?? 'auto', opts.customVerbs ?? '');
  const fresh = all.filter(c => !have.has(nameKey(c.name)) && !opts.ignored?.has(nameKey(c.name)));
  return {
    auto: fresh.filter(c => c.confidence === 'sure'),
    review: fresh.filter(c => c.confidence === 'review'),
    known: all.filter(c => have.has(nameKey(c.name))).length,
    total: all.length
  };
}

export { nameKey };
