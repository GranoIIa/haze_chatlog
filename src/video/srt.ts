/**
 * Haze Video Studio (F3): importação de legendas SRT. O arquivo é tratado como NÃO confiável:
 * nunca lança, descarta blocos inválidos, limita a quantidade e remove marcações (<i>, {\an8}).
 */
export interface Cue { start: number; end: number; text: string }

export const MAX_CUES = 5000;
export const MAX_SRT_BYTES = 2 * 1024 * 1024;

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const toSeconds = (m: RegExpMatchArray): number =>
  Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;

export function parseSrt(raw: string): { cues: Cue[]; skipped: number } {
  const cues: Cue[] = [];
  let skipped = 0;
  if (typeof raw !== 'string') return { cues, skipped };
  const text = raw.slice(0, MAX_SRT_BYTES).replace(/^﻿/, '').replace(/\r\n?/g, String.fromCharCode(10));
  for (const block of text.split(/\n{2,}/)) {
    if (!block.trim()) continue;
    const lines = block.split(String.fromCharCode(10));
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) { skipped++; continue; }
    const [a, b] = lines[i].split('-->');
    const ma = a?.match(TIME), mb = b?.match(TIME);
    if (!ma || !mb) { skipped++; continue; }
    const start = toSeconds(ma), end = toSeconds(mb);
    const body = lines.slice(i + 1).join(String.fromCharCode(10))
      .replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (!(end > start) || !body) { skipped++; continue; }
    if (cues.length >= MAX_CUES) { skipped++; continue; }
    cues.push({ start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: body.slice(0, 300) });
  }
  return { cues, skipped };
}
