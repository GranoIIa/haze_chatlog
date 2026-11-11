/**
 * Tier 5: paleta do tema (src/theme/palette.js) — contrastes mínimos de acessibilidade (WCAG)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
// @ts-ignore - arquivo JS compartilhado com o tailwind.config.js
import { palette, toChannels, kebab } from '../../src/theme/palette.js';

const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const P = palette as Record<string, string>;

describe('Tier 5: Paleta do tema', () => {

  test('T5_PAL_01_TextContrast: textos legíveis sobre painel e fundo (AA ≥ 4,5:1; texto principal ≥ 7:1)', () => {
    for (const surface of ['panel', 'bg', 'raised']) {
      assert(contrast(P.text, P[surface]) >= 7, `text/${surface}`);
      assert(contrast(P.soft, P[surface]) >= 7, `soft/${surface}`);
      assert(contrast(P.muted, P[surface]) >= 4.5, `muted/${surface}`);
      assert(contrast(P.faint, P[surface]) >= 4.5, `faint/${surface} = ${contrast(P.faint, P[surface]).toFixed(2)}`);
    }
  });

  test('T5_PAL_02_Accent: acento legível sobre o painel e botão de acento com texto legível', () => {
    assert(contrast(P.accent, P.panel) >= 4.5, 'acento/painel');
    assert(contrast(P.accent, P.bg) >= 4.5, 'acento/fundo');
    assert(contrast(P.onAccent, P.accent) >= 7, 'texto no botão');
    assert(contrast(P.onAccent, P.accentHover) >= 7, 'texto no botão (hover)');
    // semânticas legíveis sobre o painel
    for (const k of ['danger', 'warning', 'info']) assert(contrast(P[k], P.panel) >= 4.5, k);
  });

  test('T5_PAL_03_SurfacesAreSeparated: bordas e níveis de superfície distinguíveis', () => {
    assert(contrast(P.border, P.panel) >= 1.3, `borda/painel = ${contrast(P.border, P.panel).toFixed(2)}`);
    assert(contrast(P.borderStrong, P.panel) >= 1.6, 'borda forte/painel');
    assert(contrast(P.raised, P.panel) >= 1.05, 'elevado/painel');
    assert(contrast(P.panel, P.bg) >= 1.05, 'painel/fundo');
    // o palco da foto é mais escuro que o fundo do app (a imagem é a protagonista)
    assert(lum(P.stage) < lum(P.bg), 'palco deve ser mais escuro que o fundo');
  });

  test('T5_PAL_04_NeutralStage: o palco é neutro (não altera a percepção das cores da foto)', () => {
    const h = P.stage.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    assert(Math.max(r, g, b) - Math.min(r, g, b) <= 6, 'palco com matiz forte');
  });

  test('T5_PAL_05_Helpers: conversões usadas pelo Tailwind', () => {
    assertEqual(toChannels('#34D399'), '52 211 153');
    assertEqual(kebab('raisedHover'), 'raised-hover');
    assertEqual(kebab('onAccent'), 'on-accent');
  });

  test('T5_PAL_06_AllHex: todos os tokens são hex de 6 dígitos', () => {
    for (const [k, v] of Object.entries(P)) assert(/^#[0-9a-fA-F]{6}$/.test(v), `${k}: ${v}`);
  });
});
