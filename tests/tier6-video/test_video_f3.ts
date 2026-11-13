/**
 * Tier 6 (F3): velocidade, entrada/saída gradual, transições, snap, legendas SRT e forma de onda.
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  activeLayers, addClip, addOverlay, addSubtitles, clipDuration, emptyTimeline, fadeFactor, layout, locate, sanitizeTimeline,
  setClipFades, setClipSpeed, setClipTransition, snapTime, splitAt, totalDuration, trimClip, validate, MIN_CLIP, MediaRef
} from '../../src/video/timeline';
import { parseSrt, MAX_CUES } from '../../src/video/srt';
import { sliceBars } from '../../src/video/waveform';
import { buildVideoProjectBlob, parseVideoProject } from '../../src/video/videoProject';

const A: MediaRef = { id: 'mA', name: 'a.mp4', duration: 4, width: 640, height: 360, hasAudio: true };
const B: MediaRef = { id: 'mB', name: 'b.mp4', duration: 3, width: 640, height: 360, hasAudio: true };
const two = () => addClip(addClip(emptyTimeline(), A, 'c1'), B, 'c2');

describe('Tier 6 (F3): velocidade, fades, transições, legendas', () => {
  test('T6_F3_01_Speed: a duração na timeline é (saída - entrada) / velocidade', () => {
    let tl = setClipSpeed(two(), 'c1', 2);
    assertEqual(clipDuration(tl.clips[0]), 2);
    assertEqual(totalDuration(tl), 5);
    tl = setClipSpeed(tl, 'c1', 0.5);
    assertEqual(clipDuration(tl.clips[0]), 8);
    assertEqual(setClipSpeed(tl, 'c1', 1).clips[0].speed, undefined, 'velocidade 1 remove o campo');
    assertEqual(setClipSpeed(tl, 'c1', 99).clips[0].speed, 4, 'limita a 4×');
    assertEqual(setClipSpeed(tl, 'c1', 0.01).clips[0].speed, 0.25, 'limita a 0,25×');
    assert(setClipSpeed(tl, 'c1', NaN) === tl, 'NaN é ignorado');
  });

  test('T6_F3_02_SpeedLocate: tempo da timeline → tempo da mídia com velocidade, corte e divisão', () => {
    let tl = setClipSpeed(two(), 'c1', 2); // c1: mídia 0..4 em 2 s
    assertEqual(locate(tl, 1)!.sourceTime, 2);
    tl = splitAt(tl, 1, 'c9');             // divide na metade da timeline = 2 s da mídia
    assertEqual(tl.clips[0].outPoint, 2); assertEqual(tl.clips[1].inPoint, 2);
    assertEqual(tl.clips[1].speed, 2, 'a velocidade vai para as duas metades');
    assertEqual(totalDuration(tl), 5);
    const t2 = trimClip(setClipSpeed(two(), 'c1', 4), 'c1', { inPoint: 3.9 }, 4);
    assert(clipDuration(t2.clips[0]) >= MIN_CLIP - 0.001, 'duração mínima vale em tempo de timeline');
  });

  test('T6_F3_03_Transition: o clipe seguinte começa antes e a duração total encurta', () => {
    const tl = setClipTransition(two(), 'c2', 1);
    const l = layout(tl);
    assertEqual(l[1].start, 3); assertEqual(l[1].overlap, 1);
    assertEqual(totalDuration(tl), 6);
    assertEqual(l[0].audioFadeOut, 1); assertEqual(l[1].audioFadeIn, 1, 'o som também se funde');
    const big = layout(setClipTransition(two(), 'c2', 5));
    assertEqual(big[1].overlap, 1.5, 'limitada à metade do clipe mais curto');
    assertEqual(layout(setClipTransition(two(), 'c1', 2))[0].overlap, 0, 'o primeiro clipe não tem anterior');
    assert(setClipTransition(tl, 'c2', 0).clips[1].transition === undefined, '0 remove');
  });

  test('T6_F3_04_Layers: duas camadas só durante a transição, com a opacidade subindo', () => {
    const tl = setClipTransition(two(), 'c2', 1);
    assertEqual(activeLayers(tl, 1).length, 1);
    const mid = activeLayers(tl, 3.5);
    assertEqual(mid.length, 2);
    assertEqual(mid[0].alpha, 1); assert(Math.abs(mid[1].alpha - 0.5) < 1e-6, `alpha ${mid[1].alpha}`);
    assertEqual(mid[1].clip.id, 'c2', 'o que entra fica por cima');
    assertEqual(activeLayers(tl, 5).length, 1);
    assertEqual(locate(tl, 3.5)!.clip.id, 'c2');
    assertEqual(activeLayers(tl, 99).length, 0);
  });

  test('T6_F3_05_Fades: rampas de entrada e saída, limitadas à metade do clipe', () => {
    assertEqual(fadeFactor(0, 4, 1, 1), 0); assertEqual(fadeFactor(0.5, 4, 1, 1), 0.5);
    assertEqual(fadeFactor(2, 4, 1, 1), 1); assertEqual(fadeFactor(3.5, 4, 1, 1), 0.5);
    assertEqual(fadeFactor(1, 4, 0, 0), 1);
    const tl = setClipFades(two(), 'c1', { fadeIn: 1, fadeOut: 99 });
    assertEqual(tl.clips[0].fadeIn, 1); assertEqual(tl.clips[0].fadeOut, 2, 'no máximo metade de 4 s');
    assert(setClipFades(tl, 'c1', { fadeIn: 0 }).clips[0].fadeIn === undefined, '0 remove');
    assertEqual(activeLayers(tl, 0.5)[0].alpha, 0.5);
  });

  test('T6_F3_06_SplitFades: a entrada fica na 1ª metade, a saída na 2ª, e a transição só na 1ª', () => {
    let tl = setClipFades(two(), 'c2', { fadeIn: 0.5, fadeOut: 0.5 });
    tl = setClipTransition(tl, 'c2', 0.4);
    tl = splitAt(tl, layout(tl)[1].start + 1.2, 'c3');
    const [, left, right] = tl.clips;
    assertEqual(left.fadeIn, 0.5); assert(left.fadeOut === undefined);
    assert(right.fadeIn === undefined); assertEqual(right.fadeOut, 0.5);
    assertEqual(left.transition!.duration, 0.4); assert(right.transition === undefined);
  });

  test('T6_F3_07_SanitizeAndRoundTrip: campos novos sobrevivem ao projeto; lixo é limitado', async () => {
    let tl = setClipSpeed(two(), 'c1', 1.5);
    tl = setClipFades(tl, 'c1', { fadeIn: 0.3 });
    tl = setClipTransition(tl, 'c2', 0.5);
    tl = addSubtitles(tl, [{ start: 1, end: 2.5, text: 'Olá' }]);
    const blob = await buildVideoProjectBlob(tl, [{ ...A, size: 1 }, { ...B, size: 2 }]);
    const back = (await parseVideoProject(blob)).timeline;
    assertEqual(back.clips[0].speed, 1.5); assertEqual(back.clips[0].fadeIn, 0.3); assertEqual(back.clips[1].transition!.duration, 0.5);
    assertEqual(back.overlays[0].align, 'center');
    const r = sanitizeTimeline({ clips: [
      { id: 'a', mediaId: 'm', inPoint: 0, outPoint: 2, speed: 99, fadeIn: 50, transition: { duration: 99 } },
      { id: 'b', mediaId: 'm', inPoint: 0, outPoint: 0.3, speed: 4 }
    ] });
    assertEqual(r.clips[0].speed, 4); assertEqual(r.clips[0].fadeIn, 0.25, 'metade de 0,5 s (2 s a 4×)');
    assertEqual(r.clips[0].transition!.duration, 5);
    assertEqual(r.clips.length, 1, 'clipe curto demais na timeline (0,3 s a 4×) é descartado');
    assertEqual(validate(setClipSpeed(two(), 'c1', 4), new Map([[A.id, A], [B.id, B]])).length, 0);
  });

  test('T6_F3_08_Snap: gruda em bordas de clipes e de outros textos dentro do limiar', () => {
    let tl = addOverlay(two(), { text: 'x', start: 5.2, duration: 1 }, 'o1');
    assertEqual(snapTime(tl, 4.06), 4, 'borda entre os clipes');
    assertEqual(snapTime(tl, 4.3), 4.3, 'fora do limiar não gruda');
    assertEqual(snapTime(tl, 5.15, 'o2'), 5.2, 'borda de outro texto');
    assertEqual(snapTime(tl, 5.17, 'o1'), 5.17, 'ignora o próprio texto');
    assertEqual(snapTime(tl, 0.05), 0);
    tl = setClipTransition(tl, 'c2', 1);
    assertEqual(snapTime(tl, 2.95), 3, 'usa a posição com a transição');
  });

  test('T6_F3_09_Srt: formatos comuns, BOM, CRLF, tags, ponto nos milissegundos', () => {
    const raw = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Olá</i>, {\\an8}mundo\r\n\r\n2\r\n00:01:02.5 --> 00:01:04.25\r\nlinha 1\r\nlinha 2\r\n\r\n3\r\n00:00:05,000 --> 00:00:04,000\r\nao contrário\r\n\r\nlixo sem tempo\r\n\r\n4\r\n00:00:07,000 --> 00:00:08,000\r\n\r\n';
    const { cues, skipped } = parseSrt(raw);
    assertEqual(cues.length, 2);
    assertEqual(cues[0].start, 1); assertEqual(cues[0].end, 3.5); assertEqual(cues[0].text, 'Olá, mundo');
    assertEqual(cues[1].start, 62.5); assertEqual(cues[1].end, 64.25); assertEqual(cues[1].text, 'linha 1\nlinha 2');
    assertEqual(skipped, 3, 'fim antes do início, sem tempo e texto vazio');
  });

  test('T6_F3_10_SrtHostile: entradas estranhas nunca lançam e respeitam o limite', () => {
    for (const bad of [undefined as unknown as string, '', '\n\n\n', '-->', '00:00:01,000 -->', 'a-->b', 'x'.repeat(100000)]) {
      assertEqual(parseSrt(bad).cues.length, 0);
    }
    const many = Array.from({ length: MAX_CUES + 50 }, (_, i) => `${i + 1}\n00:00:01,000 --> 00:00:02,000\nx`).join('\n\n');
    const r = parseSrt(many);
    assertEqual(r.cues.length, MAX_CUES); assertEqual(r.skipped >= 50, true);
  });

  test('T6_F3_11_Subtitles: cada trecho vira um texto centralizado embaixo, no tempo do SRT', () => {
    const tl = addSubtitles(emptyTimeline(), [{ start: 1, end: 2.5, text: 'a' }, { start: 3, end: 3.05, text: 'b' }]);
    assertEqual(tl.overlays.length, 2);
    assertEqual(tl.overlays[0].start, 1); assertEqual(tl.overlays[0].duration, 1.5); assertEqual(tl.overlays[0].align, 'center');
    assert(tl.overlays[1].duration >= MIN_CLIP, 'legenda curtíssima ganha a duração mínima');
  });

  test('T6_F3_12_Bars: picos por coluna cobrem só o trecho visível', () => {
    const peaks = new Float32Array(100); peaks[10] = 1; peaks[90] = 0.5; // mídia de 10 s: picos em ~1 s e ~9 s
    const first = sliceBars(peaks, 10, 0, 5, 5);
    assert(first.some(v => v === 1) && !first.some(v => v === 0.5), 'metade inicial só vê o pico de 1 s');
    const last = sliceBars(peaks, 10, 5, 10, 5);
    assert(last.some(v => v === 0.5) && !last.some(v => v === 1));
    assertEqual(sliceBars(peaks, 0, 0, 1, 4).length, 4);
    assertEqual(sliceBars(peaks, 10, 0, 10, 0).length, 0);
  });
});
