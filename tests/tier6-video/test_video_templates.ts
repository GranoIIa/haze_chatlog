/**
 * Tier 6 (F4): modelos de montagem e presets de destino.
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { TEMPLATES, applyTemplate, findTemplate, bitrateFor, EXPORT_PRESETS, MIN_VIDEO_BPS, TemplateDef } from '../../src/video/templates';
import { layout, sanitizeTimeline, totalDuration, validate, clipDuration, MediaRef } from '../../src/video/timeline';

const mk = (id: string, dur: number): MediaRef => ({ id, name: `${id}.mp4`, duration: dur, width: 1280, height: 720, hasAudio: true });
const NOW = { date: '2026-03-01', time: '20:00:00' };
const allPicks = (def: TemplateDef, dur = 10) => Object.fromEntries(def.slots.map(s => [s.id, mk('m_' + s.id, dur)]));
const mediaMap = (picks: Record<string, MediaRef | undefined>) => new Map(Object.values(picks).filter(Boolean).map(m => [m!.id, m!]));

describe('Tier 6 (F4): modelos e presets de destino', () => {
  test('T6_TPL_01_Catalog: os 7 modelos pedidos existem e são coerentes', () => {
    assertEqual(TEMPLATES.length, 7);
    assertEqual(new Set(TEMPLATES.map(t => t.id)).size, 7, 'ids únicos');
    for (const t of TEMPLATES) {
      assertEqual(new Set(t.slots.map(s => s.id)).size, t.slots.length, `${t.id}: ids de cena únicos`);
      assert(t.slots.some(s => s.required), `${t.id}: tem cena obrigatória`);
      for (const tx of t.texts) assert(!tx.slot || t.slots.some(s => s.id === tx.slot), `${t.id}: texto aponta para cena inexistente`);
      assert(t.transition >= 0 && t.fadeIn >= 0 && t.fadeOut >= 0);
    }
    for (const id of ['documentario', 'reportagem', 'registro-policial', 'trailer-personagem', 'divulgacao-empresa', 'cena-faccao', 'entrevista']) assert(!!findTemplate(id), id);
  });

  test('T6_TPL_02_ApplyAll: aplica todas as cenas com transições, fades, câmera e textos', () => {
    for (const t of TEMPLATES) {
      const picks = allPicks(t);
      const r = applyTemplate(t, picks, NOW);
      assertEqual(r.errors.length, 0, `${t.id}: sem erros`);
      assertEqual(r.timeline.clips.length, t.slots.length);
      assertEqual(r.timeline.overlays.length, t.texts.length);
      assertEqual(validate(r.timeline, mediaMap(picks)).length, 0, `${t.id}: timeline válida`);
      const total = totalDuration(r.timeline);
      for (const o of r.timeline.overlays) assert(o.start >= 0 && o.start < total && o.start + o.duration <= total + 0.002, `${t.id}: texto dentro do vídeo`);
      if (t.transition > 0) assertEqual(r.timeline.clips[1].transition!.duration, t.transition);
      assert(r.timeline.clips[0].transition === undefined, 'o primeiro clipe não tem transição');
      if (t.fadeIn > 0) assertEqual(r.timeline.clips[0].fadeIn, t.fadeIn);
      if (t.fadeOut > 0) assert(r.timeline.clips[r.timeline.clips.length - 1].fadeOut! > 0);
      t.slots.forEach((s, i) => { if (s.camera) assertEqual(r.timeline.clips[i].camera!.preset, s.camera); });
    }
  });

  test('T6_TPL_03_PartialSlots: cenas vazias são puladas e o texto da cena ausente cai numa cena que existe', () => {
    const doc = findTemplate('documentario')!;
    const r = applyTemplate(doc, { abertura: mk('a', 10), cena1: mk('b', 10) }, NOW);
    assertEqual(r.used.join(','), 'abertura,cena1'); assertEqual(r.skipped.join(','), 'cena2,final');
    assertEqual(r.timeline.clips.length, 2);
    const fim = r.timeline.overlays.find(o => o.text === 'FIM')!;
    const lastEnd = layout(r.timeline)[1].end;
    assert(fim.start < lastEnd && fim.start + fim.duration <= lastEnd + 0.002, 'o "FIM" ancora no fim da última cena que existe');
  });

  test('T6_TPL_04_Required: sem mídia nas cenas obrigatórias volta erro e timeline vazia', () => {
    const doc = findTemplate('documentario')!;
    const none = applyTemplate(doc, {}, NOW);
    assert(none.errors.length === 1 && none.timeline.clips.length === 0);
    const onlyOptional = applyTemplate(doc, { cena1: mk('b', 5) }, NOW);
    assert(onlyOptional.errors[0].includes('Abertura'), onlyOptional.errors[0]);
    assertEqual(onlyOptional.timeline.clips.length, 0, 'não monta nada sem a cena obrigatória');
  });

  test('T6_TPL_05_MaxSeconds: o trailer usa só o começo de cada cena', () => {
    const t = findTemplate('trailer-personagem')!;
    const r = applyTemplate(t, allPicks(t, 20), NOW);
    for (const c of r.timeline.clips) assert(clipDuration(c) <= 4.001, 'cena limitada a 4 s');
    const short = applyTemplate(t, allPicks(t, 2), NOW);
    assert(clipDuration(short.timeline.clips[0]) <= 2.001, 'mídia mais curta que o limite fica inteira');
  });

  test('T6_TPL_06_ChatSequence: o registro policial entra com linhas em sequência e relógio de bodycam', () => {
    const t = findTemplate('registro-policial')!;
    const r = applyTemplate(t, { bodycam1: mk('a', 30) }, NOW);
    const chat = r.timeline.overlays.find(o => !o.kind || o.kind === 'chat')!;
    assertEqual(chat.lineOffsets!.length, 3);
    assertEqual(r.timeline.clips[0].camera!.preset, 'bodycam'); assertEqual(r.timeline.clips[0].camera!.time, '20:00:00');
  });

  test('T6_TPL_06b_ChatFitsShortMedia: com mídia curta o chat aperta o intervalo entre as falas para caberem todas', () => {
    const t = findTemplate('registro-policial')!;
    const long = applyTemplate(t, { bodycam1: mk('a', 30) }, NOW).timeline.overlays[0];
    assertEqual(long.lineOffsets!.join(','), '0,2.5,5', 'mídia longa mantém o ritmo do modelo');
    const short = applyTemplate(t, { bodycam1: mk('a', 4) }, NOW).timeline.overlays[0];
    const last = short.lineOffsets![2];
    assert(last <= short.duration - 0.99, `última fala em ${last} cabe em ${short.duration}`);
    assert(short.lineOffsets![1] - short.lineOffsets![0] >= 0.5 - 1e-9, 'nunca menos de 0,5 s entre falas');
  });

  test('T6_TPL_07_ShortMedia: com mídia curtíssima os textos ficam dentro do vídeo', () => {
    const t = findTemplate('documentario')!;
    const r = applyTemplate(t, allPicks(t, 1), NOW);
    const total = totalDuration(r.timeline);
    for (const o of r.timeline.overlays) assert(o.start >= 0 && o.start + o.duration <= total + 0.002 && o.duration >= 0.1 - 1e-9, `texto fora: ${o.start}/${o.duration}/${total}`);
  });

  test('T6_TPL_08_Editable: o resultado é uma timeline comum (sobrevive a salvar/abrir) e cada aplicação gera ids novos', () => {
    const t = findTemplate('entrevista')!;
    const a = applyTemplate(t, allPicks(t), NOW), b = applyTemplate(t, allPicks(t), NOW);
    assert(a.timeline.clips[0].id !== b.timeline.clips[0].id);
    const back = sanitizeTimeline(JSON.parse(JSON.stringify(a.timeline)));
    assertEqual(back.clips.length, a.timeline.clips.length); assertEqual(back.overlays.length, a.timeline.overlays.length);
    assertEqual(back.overlays[0].text, a.timeline.overlays[0].text);
  });

  test('T6_TPL_09_Bitrate: orçamento por tamanho e duração, com aviso quando não cabe', () => {
    const a = bitrateFor(10 * 1024 * 1024, 60);
    assert(a.ok && a.videoBps > 1_000_000 && a.videoBps < 1_300_000, `bps ${a.videoBps}`);
    const half = bitrateFor(10 * 1024 * 1024, 120);
    assert(half.videoBps < a.videoBps * 0.55, 'dobrar a duração corta o bitrate pela metade (menos o áudio)');
    const huge = bitrateFor(10 * 1024 * 1024, 7200);
    assert(!huge.ok && huge.videoBps === MIN_VIDEO_BPS && !!huge.message);
    assert(!bitrateFor(0, 10).ok && !bitrateFor(1000, 0).ok && !bitrateFor(NaN, NaN).ok);
  });

  test('T6_TPL_10_ExportPresets: dimensões pares, fps válido, e o limite só nos presets leves', () => {
    for (const p of EXPORT_PRESETS) {
      assert(p.width % 2 === 0 && p.height % 2 === 0 && [24, 30, 60].includes(p.fps), p.id);
    }
    assert(EXPORT_PRESETS.find(p => p.id === 'discord')!.targetBytes === 10 * 1024 * 1024);
    assert(EXPORT_PRESETS.find(p => p.id === 'hq')!.targetBytes === undefined);
  });
});
