/**
 * Tier 5: toda classe "*-haze-*" usada no código precisa existir na paleta.
 * (Pega o bug em que uma classe inexistente é ignorada pelo Tailwind e o texto fica sem a cor certa.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, assert } from '../harness/testRunner';
// @ts-ignore - arquivo JS compartilhado com o tailwind.config.js
import { palette } from '../../src/theme/palette.js';
// @ts-ignore - configuração real do Tailwind (as classes só existem se estiverem aqui)
import tailwindConfig from '../../tailwind.config.js';

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|html)$/.test(e.name)) out.push(p);
  }
  return out;
};

describe('Tier 5: Classes do tema', () => {

  test('T5_THEME_01_AllHazeClassesExist: nenhuma classe de cor "haze" aponta para token inexistente no Tailwind', () => {
    // nomes realmente gerados pelo Tailwind (kebab-case: text-haze-on-accent, bg-haze-raised-hover...)
    const tokens = new Set(Object.keys((tailwindConfig as any).theme.extend.colors.haze));
    assert(tokens.size === Object.keys(palette as Record<string, string>).length, 'todos os tokens da paleta viram classes');
    assert(tokens.has('on-accent') && tokens.has('accent-fill') && tokens.has('border-strong'), 'tokens em kebab-case');
    const files = [...walk(path.resolve(process.cwd(), 'src')), path.resolve(process.cwd(), 'index.html')];
    const re = /\b(?:bg|text|border|ring|accent|shadow|divide|outline|from|to|via|fill|stroke|decoration|placeholder:text)-haze-([a-z]+(?:-[a-z]+)*)(?:\/\d+)?/g;
    const unknown = new Map<string, string>();

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(re)) {
        if (!tokens.has(m[1])) unknown.set(m[1], path.relative(process.cwd(), f));
      }
    }
    assert(unknown.size === 0, 'tokens inexistentes: ' + [...unknown].map(([k, f]) => `${k} (${f})`).join(', '));
  });

  test('T5_THEME_02_NoLegacyHardcodedColors: sem cores fixas da paleta antiga nas classes', () => {
    const files = walk(path.resolve(process.cwd(), 'src')).filter(f => f.endsWith('.tsx'));
    const re = /\b(?:bg|text|border|ring|accent)-(?:emerald|slate)-\d{2,3}\b|\[#(?:0b0e14|1e2638|121722)\]/gi;
    const found: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(re)) found.push(`${m[0]} (${path.basename(f)})`);
    }
    assert(found.length === 0, 'cores fixas encontradas: ' + found.slice(0, 5).join(', '));
  });
});
