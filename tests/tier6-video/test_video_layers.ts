/**
 * Tier 6: trilha de sobreposição (multifaixa) e keyframes.
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  activeLayerClips, addClip, addKeyframe, addLayer, audioItems, clampTransform, emptyTimeline, evalTransform, layerDuration,
  MAX_KEYFRAMES, MAX_LAYERS, removeKeyframe, removeLayer, sanitizeTimeline, snapTime, totalDuration, trimLayer, updateLayer,
  validate, MediaRef
} from '../../src/video/timeline';
import { buildVideoProjectBlob, parseVideoProject } from '../../src/video/videoProject';

const A: MediaRef = { id: 'mA', name: 'a.mp4', duration: 4, width: 640, height: 360, hasAudio: true };
const B: MediaRef = { id: 'mB', name: 'b.mp4', duration: 3, width: 640, height: 360, hasAudio: true };
const MEDIA = new Map([[A.id, A], [B.id, B]]);
const withLayer = () => addLayer(addClip(emptyTimeline(), A, 'c1'), B, 1, 'L1');
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('Tier 6: sobreposição e keyframes', () => {
  test('T6_LAY_01_Basics: camada entra no tempo certo e estende a duração total se passar do fim', () => {
    let tl = withLayer();
    assertEqual(tl.layers![0].start, 1); assertEqual(layerDuration(tl.layers![0]), 3);
    assertEqual(totalDuration(tl), 4, 'a camada (1 a 4 s) cabe dentro do vídeo principal de 4 s');
    tl = updateLayer(tl, 'L1', { start: 3 });
    assertEqual(totalDuration(tl), 6, 'passa do fim do principal e estende');
    assertEqual(totalDuration(addLayer(emptyTimeline(), B, 0, 'x')), 3, 'só camadas também têm duração');
    assertEqual(removeLayer(tl, 'L1').layers!.length, 0);
    assertEqual(updateLayer(tl, 'L1', { start: -5 }).layers![0].start, 0, 'início negativo vira 0');
  });

  test('T6_LAY_02_Active: só aparece dentro do intervalo e a ordem é de baixo para cima', () => {
    let tl = addLayer(withLayer(), A, 2, 'L2');
    assertEqual(activeLayerClips(tl, 0.5).length, 0);
    assertEqual(activeLayerClips(tl, 1.5).length, 1);
    const both = activeLayerClips(tl, 2.5);
    assertEqual(both.length, 2); assertEqual(both[1].layer.id, 'L2', 'a última fica por cima');
    assertEqual(both[0].sourceTime, 1.5, 'tempo da mídia = entrada + (t - início)');
    assertEqual(activeLayerClips(tl, 4.0).length, 1, 'L1 termina em 4 s');
  });

  test('T6_LAY_03_Interpolate: sem keyframes vale a base; com keyframes interpola linear e segura as pontas', () => {
    let tl = withLayer();
    const l0 = tl.layers![0];
    assertEqual(evalTransform(l0, 1).x, l0.base.x);
    tl = addKeyframe(tl, 'L1', 0, { x: 0.2, y: 0.2, scale: 0.2, opacity: 0 });
    tl = addKeyframe(tl, 'L1', 2, { x: 0.8, y: 0.6, scale: 0.4, opacity: 1 });
    const l = tl.layers![0];
    assertEqual(l.keyframes!.length, 2);
    const mid = evalTransform(l, 1);
    assert(near(mid.x, 0.5) && near(mid.y, 0.4) && near(mid.scale, 0.3) && near(mid.opacity, 0.5), JSON.stringify(mid));
    assertEqual(evalTransform(l, 0).opacity, 0);
    assertEqual(evalTransform(l, 2.5).x, 0.8, 'depois do último segura o último');
    assertEqual(evalTransform(l, -1).x, 0.2, 'antes do primeiro segura o primeiro');
    tl = addKeyframe(tl, 'L1', 3, { x: 0.1 });
    assert(near(evalTransform(tl.layers![0], 2.5).x, 0.45), 'terceiro segmento');
  });

  test('T6_LAY_04_KeyframeOps: substitui no mesmo instante, mantém ordenado, limita e remove', () => {
    let tl = withLayer();
    tl = addKeyframe(tl, 'L1', 2, { x: 0.9 });
    tl = addKeyframe(tl, 'L1', 0.5, { x: 0.1 });
    tl = addKeyframe(tl, 'L1', 2.0004, { x: 0.7 });
    const k = tl.layers![0].keyframes!;
    assertEqual(k.length, 2); assertEqual(k[0].time, 0.5); assertEqual(k[1].time, 2.0004 >= 2.001 ? 2.0004 : 2, 'quase o mesmo instante substitui');
    assertEqual(k[1].x, 0.7);
    assertEqual(addKeyframe(tl, 'L1', 99).layers![0].keyframes!.pop()!.time, 3, 'tempo limitado à duração');
    assert(addKeyframe(tl, 'L1', NaN) === tl || addKeyframe(tl, 'L1', NaN).layers![0].keyframes!.length === 2, 'NaN ignorado');
    tl = removeKeyframe(tl, 'L1', 0.5); tl = removeKeyframe(tl, 'L1', k[1].time);
    assert(tl.layers![0].keyframes === undefined, 'sem keyframes volta a valer a base');
    // captura do valor atual quando não se informam valores
    let t2 = addKeyframe(withLayer(), 'L1', 1, { opacity: 0.4 });
    t2 = addKeyframe(t2, 'L1', 2);
    assertEqual(t2.layers![0].keyframes![1].opacity, 0.4, 'copia o valor interpolado/segurado');
  });

  test('T6_LAY_05_Limits: valores são limitados; quantidade máxima de camadas e de keyframes', () => {
    const t = clampTransform({ x: 99, y: -99, scale: 0, opacity: 5 });
    assertEqual(t.x, 1.5); assertEqual(t.y, -0.5); assertEqual(t.scale, 0.05); assertEqual(t.opacity, 1);
    assertEqual(clampTransform({ x: NaN, scale: 'a' }).x, 0.75, 'lixo vira o padrão');
    let tl = emptyTimeline();
    for (let i = 0; i < MAX_LAYERS + 5; i++) tl = addLayer(tl, B, 0, `l${i}`);
    assertEqual(tl.layers!.length, MAX_LAYERS);
    let k = addLayer(emptyTimeline(), A, 0, 'K');
    for (let i = 0; i < MAX_KEYFRAMES + 10; i++) k = addKeyframe(k, 'K', (i % 3999) / 1000, { x: i / 1000 });
    assert(k.layers![0].keyframes!.length <= MAX_KEYFRAMES);
  });

  test('T6_LAY_06_Trim: cortar a camada respeita a mídia e a duração mínima e limita keyframes', () => {
    let tl = addKeyframe(withLayer(), 'L1', 3, { x: 0.9 });
    tl = trimLayer(tl, 'L1', { outPoint: 1.5 }, B.duration);
    assertEqual(layerDuration(tl.layers![0]), 1.5);
    assertEqual(tl.layers![0].keyframes![0].time, 1.5, 'keyframe além do novo fim é puxado');
    tl = trimLayer(tl, 'L1', { inPoint: 99 }, B.duration);
    assert(layerDuration(tl.layers![0]) >= 0.1 - 1e-9);
    assertEqual(trimLayer(tl, 'L1', { outPoint: 99 }, B.duration).layers![0].outPoint, 3, 'não passa da mídia');
  });

  test('T6_LAY_07_Validate: mídia ausente e pontos fora da mídia são apontados', () => {
    assertEqual(validate(withLayer(), MEDIA).length, 0);
    const bad = { ...withLayer(), layers: [{ ...withLayer().layers![0], mediaId: 'zzz' }] };
    assert(validate(bad, MEDIA).some(e => e.includes('sobreposição') && e.includes('ausente')));
    const out = { ...withLayer(), layers: [{ ...withLayer().layers![0], outPoint: 9 }] };
    assert(validate(out, MEDIA).some(e => e.includes('fora da mídia')));
  });

  test('T6_LAY_08_Sanitize: dados hostis nunca lançam; keyframes duplicados/fora de ordem são normalizados', () => {
    const r = sanitizeTimeline({ layers: [
      null, 5, { id: 1 },
      { id: 'a', mediaId: 'm', start: -3, inPoint: 0, outPoint: 4, volume: 99, base: { x: 'a', scale: 99 },
        keyframes: [{ time: 3, x: 0.9 }, { time: 1, x: 0.1 }, { time: 1.0001, x: 0.2 }, { time: NaN }, { time: 99, x: 0.5 }, null] },
      { id: 'b', mediaId: 'm', inPoint: 2, outPoint: 2 }
    ] });
    assertEqual(r.layers!.length, 1);
    const l = r.layers![0];
    assertEqual(l.start, 0); assertEqual(l.volume, 2); assertEqual(l.base.scale, 4); assertEqual(l.base.x, 0.75);
    assertEqual(l.keyframes!.map(k => k.time).join(','), '1,3,4', 'ordenados, duplicado colapsado e tempo limitado à duração');
    assertEqual(sanitizeTimeline({ clips: [], overlays: [] }).layers, undefined, 'timeline antiga continua sem camadas');
    const many = sanitizeTimeline({ layers: Array.from({ length: 500 }, (_, i) => ({ id: `l${i}`, mediaId: 'm', inPoint: 0, outPoint: 1 })) });
    assertEqual(many.layers!.length, MAX_LAYERS);
  });

  test('T6_LAY_09_Audio: o áudio das camadas entra na mixagem, em ordem de início', () => {
    const tl = addLayer(addLayer(addClip(emptyTimeline(), A, 'c1'), B, 3, 'L1'), B, 1, 'L0');
    const items = audioItems(tl);
    assertEqual(items.map(i => i.clip.id).join(','), 'c1,L0,L1'.replace('c1,L0', 'c1,L0') === 'c1,L0,L1' ? 'c1,L0,L1' : '');
    assertEqual(items[1].start, 1); assertEqual(items[1].end, 4);
    assertEqual(items[1].audioFadeIn, 0);
  });

  test('T6_LAY_10_Snap: gruda nas bordas das camadas', () => {
    const tl = withLayer();
    assertEqual(snapTime(tl, 1.05), 1); assertEqual(snapTime(tl, 3.95), 4);
  });

  test('T6_LAY_11_Project: ida e volta preserva camadas e keyframes; mídia desconhecida é descartada com aviso', async () => {
    let tl = addKeyframe(addKeyframe(withLayer(), 'L1', 0, { x: 0.1 }), 'L1', 2, { x: 0.9 });
    const blob = await buildVideoProjectBlob(tl, [{ ...A, size: 1 }, { ...B, size: 2 }]);
    const back = await parseVideoProject(blob);
    assertEqual(back.timeline.layers!.length, 1); assertEqual(back.timeline.layers![0].keyframes!.length, 2);
    assertEqual(back.media.length, 2, 'a mídia usada só pela camada entra no projeto');
    const orphan = await parseVideoProject(await buildVideoProjectBlob(tl, [{ ...A, size: 1 }]));
    assertEqual(orphan.timeline.layers === undefined || orphan.timeline.layers.length === 0, true);
    assertEqual(orphan.warnings.length, 1);
  });
});
