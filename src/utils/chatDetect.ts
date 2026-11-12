/**
 * Detecção de personagens a partir do chat colado do servidor.
 * Reconhece "Nome diz: …", "Nome diz (baixo): …", "Nome grita: …", "Nome says: …", com ou sem horário.
 */
import { parseChatLine, CHAR_COLORS } from './chatParser';
import type { Character } from '../types';

const MAX_NAME = 40;

const EN_SAYS = /^(.+?)\s+(?:says?|shouts?|whispers?)(?:\s*\([^)]*\))?\s*:\s*\S/i;

/** Remove marcas que não fazem parte do nome (prefixos de rádio, horário, números de linha). */
const cleanName = (raw: string): string =>
  raw
    .replace(/^\[[^\]]*\]\s*/, '')
    .replace(/^\*+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

const validName = (n: string): boolean =>
  n.length >= 2 && n.length <= MAX_NAME && /[A-Za-zÀ-ÿ]/.test(n) && !/^[/!$#>(]/.test(n) && !/[:()]/.test(n);

/** Nomes de quem fala no texto, na ordem da primeira aparição e sem repetir (ignora maiúsculas). */
export function detectSpeakers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const p = parseChatLine(line);
    let name = p.speaker && p.messageText !== undefined && /:/.test(p.rawText) ? p.speaker : '';
    if (!name) {
      const m = p.rawText.replace(/^\s*(?:\[[0-2]\d:[0-5]\d(?::[0-5]\d)?\]|\([0-2]\d:[0-5]\d(?::[0-5]\d)?\))\s*/, '').match(EN_SAYS);
      if (m) name = m[1];
    }
    name = cleanName(name);
    if (!validName(name)) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Personagens novos (com cor) para os nomes ainda não cadastrados. */
export function newCharactersFor(text: string, existing: Character[], now = Date.now()): Character[] {
  const have = new Set(existing.map(c => c.name.toLocaleLowerCase('pt-BR')));
  const fresh = detectSpeakers(text).filter(n => !have.has(n.toLocaleLowerCase('pt-BR')));
  return fresh.map((name, i) => ({
    id: `${now + i}`,
    name,
    color: CHAR_COLORS[(existing.length + i) % CHAR_COLORS.length]
  }));
}
