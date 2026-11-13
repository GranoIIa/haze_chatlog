/**
 * Tier 6: modelo de timeline do Video Studio (POC). Puro, sem navegador.
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  addClip, addOverlay, commit, createHistory, emptyTimeline, layout, locate, moveClip, overlaysAt, redo, removeClip,
  sanitizeTimeline, splitAt, totalDuration, trimClip, undo, updateOverlay, validate, clipDuration, MIN_CLIP, MediaRef
} from '../../src/video/timeline';

const A: MediaRef = { id: 'mA', name: 'a.mp4', duration: 4, width: 640, height: 360, hasAudio: true };
const B: MediaRef = { id: 'mB', name: 'b.mp4', duration: 3, width: 640, height: 360, hasAudio: true };
const MEDIA = new Map([[A.id, A], [B.id, B]]);
const base = () => addClip(addClip(emptyTimeline(), A, 'c1'), B, 'c2');

describe('Tier 6: Video Studio, timeline', () => {
  test('T6_TL_01_Sequential: a trilha é sequencial e a duração é a soma', () => {
    const tl = base();
    assertEqual(totalDuration(tl), 7);
    const l = layout(tl);
    assertEqual(l[0].start, 0); assertEqual(l[0].end, 4); assertEqual(l[1].start, 4); assertEqual(l[1].end, 7);
  });

  test('T6_TL_02_Trim: cortar início e fim muda a duração e ripple fecha o buraco', () => {
    let tl = trimClip(base(), 'c1', { inPoint: 1 }, A.duration);
    tl = trimClip(tl, 'c1', { outPoint: 3 }, A.duration);
    assertEqual(clipDuration(tl.clips[0]), 2);
    assertEqual(totalDuration(tl), 5);
    assertEqual(layout(tl)[1].start, 2, 'o segundo clipe sobe para fechar o buraco');
  });

  test('T6_TL_03_TrimClamps: limites da mídia e duração mínima são respeitados', () => {
    let tl = trimClip(base(), 'c1', { outPoint: 99 }, A.duration);
    assertEqual(tl.clips[0].outPoint, 4, 'não passa do fim da mídia');
    tl = trimClip(tl, 'c1', { inPoint: -5 }, A.duration);
    assertEqual(tl.clips[0].inPoint, 0);
    tl = trimClip(tl, 'c1', { inPoint: 4 }, A.duration);
    assert(clipDuration(tl.clips[0]) >= MIN_CLIP - 0.001, 'nunca zera o clipe');
    const same = trimClip(tl, 'c1', { inPoint: NaN }, A.duration);
    assertEqual(same.clips[0].inPoint, tl.clips[0].inPoint, 'NaN é ignorado');
  });

  test('T6_TL_04_Split: dividir mantém a duração total e os pontos da mídia continuam contíguos', () => {
    const tl = splitAt(base(), 1.5, 'c3');
    assertEqual(tl.clips.length, 3);
    assertEqual(totalDuration(tl), 7);
    assertEqual(tl.clips[0].outPoint, 1.5); assertEqual(tl.clips[1].inPoint, 1.5); assertEqual(tl.clips[1].id, 'c3');
    assertEqual(tl.clips[1].mediaId, 'mA');
  });

  test('T6_TL_05_SplitEdges: dividir perto da borda ou fora de clipe não faz nada', () => {
    const tl = base();
    assert(splitAt(tl, 0.02) === tl, 'perto do início');
    assert(splitAt(tl, 4) === tl, 'exatamente na emenda');
    assert(splitAt(tl, 99) === tl, 'fora da timeline');
    assert(splitAt(emptyTimeline(), 1) === emptyTimeline() || splitAt(emptyTimeline(), 1).clips.length === 0);
  });

  test('T6_TL_06_Reorder: reorganizar troca a ordem sem alterar a duração', () => {
    const tl = moveClip(base(), 'c2', 0);
    assertEqual(tl.clips[0].id, 'c2');
    assertEqual(totalDuration(tl), 7);
    assertEqual(locate(tl, 0.5)!.clip.id, 'c2');
    assertEqual(locate(tl, 3.5)!.clip.id, 'c1');
    assert(moveClip(tl, 'nao-existe', 0) === tl);
  });

  test('T6_TL_07_Locate: tempo da timeline → tempo da mídia (com corte e divisão)', () => {
    let tl = trimClip(base(), 'c1', { inPoint: 1 }, A.duration); // c1 agora vai de 1 a 4 da mídia
    assertEqual(locate(tl, 0)!.sourceTime, 1);
    assertEqual(locate(tl, 2.5)!.sourceTime, 3.5);
    assertEqual(locate(tl, 3)!.clip.id, 'c2', 'a emenda pertence ao clipe seguinte');
    assert(locate(tl, 99) === null && locate(tl, -1) === null);
    tl = splitAt(tl, 1, 'c9');
    assertEqual(locate(tl, 1.2)!.sourceTime, 2.2);
  });

  test('T6_TL_08_History: desfazer/refazer, e ação sem efeito não polui o histórico', () => {
    let h = createHistory(base());
    h = commit(h, splitAt(h.present, 1.5, 'c3'));
    h = commit(h, moveClip(h.present, 'c2', 0));
    assertEqual(h.past.length, 2);
    const noop = commit(h, h.present);
    assert(noop === h, 'mesma referência não cria passo');
    h = undo(h); h = undo(h);
    assertEqual(h.present.clips.length, 2);
    assertEqual(undo(h).past.length, 0, 'desfazer no início não quebra');
    h = redo(h);
    assertEqual(h.present.clips.length, 3);
    h = commit(h, removeClip(h.present, 'c1'));
    assertEqual(h.future.length, 0, 'nova ação limpa o refazer');
  });

  test('T6_TL_09_Overlays: chats ativos só dentro da janela [início, início+duração)', () => {
    let tl = addOverlay(base(), { text: 'Ana diz: oi', start: 2, duration: 3 }, 'o1');
    assertEqual(overlaysAt(tl, 1.99).length, 0);
    assertEqual(overlaysAt(tl, 2).length, 1);
    assertEqual(overlaysAt(tl, 4.99).length, 1);
    assertEqual(overlaysAt(tl, 5).length, 0);
    tl = updateOverlay(tl, 'o1', { start: -3, duration: 0 });
    assertEqual(tl.overlays[0].start, 0); assert(tl.overlays[0].duration >= MIN_CLIP);
  });

  test('T6_TL_10_Validate: aponta mídia ausente, pontos fora da mídia e chat depois do fim', () => {
    assertEqual(validate(base(), MEDIA).length, 0);
    const bad = { ...base(), clips: [{ id: 'x', mediaId: 'zzz', inPoint: 0, outPoint: 1, volume: 1 }] };
    assert(validate(bad, MEDIA).some(e => e.includes('mídia ausente')));
    const out = trimClip(base(), 'c1', { outPoint: 4 }, 4);
    const over = { ...out, clips: [{ ...out.clips[0], outPoint: 9 }] };
    assert(validate(over, MEDIA).some(e => e.includes('fora da mídia')));
    const late = addOverlay(base(), { text: 'x', start: 50 }, 'o9');
    assert(validate(late, MEDIA).some(e => e.includes('depois do fim')));
  });

  test('T6_TL_11_Sanitize: dados não confiáveis nunca lançam e itens inválidos são descartados', () => {
    for (const junk of [null, undefined, 5, 'x', [], {}, { clips: 'oops' }, { clips: [null, 1, {}] }]) {
      const r = sanitizeTimeline(junk);
      assertEqual(r.clips.length, 0);
    }
    const r = sanitizeTimeline({
      clips: [{ id: 'a', mediaId: 'm', inPoint: 0, outPoint: 2, volume: 9 }, { id: 'b', mediaId: 'm', inPoint: 3, outPoint: 3 }, { id: 'c', mediaId: 'm', inPoint: -1, outPoint: 2 }],
      overlays: [{ id: 'o', text: 'x', start: -4, duration: 'NaN', fontSize: 999 }]
    });
    assertEqual(r.clips.length, 1);
    assertEqual(r.clips[0].volume, 2, 'volume limitado');
    assertEqual(r.overlays[0].start, 0); assertEqual(r.overlays[0].fontSize, 72);
    const again = sanitizeTimeline(JSON.parse(JSON.stringify(base())));
    assertEqual(again.clips.length, 2, 'ida e volta por JSON preserva');
  });

  test('T6_TL_12_Scale: 500 clipes em ordem aleatória mantêm a duração e o layout em tempo curto', () => {
    let tl = emptyTimeline();
    for (let i = 0; i < 500; i++) tl = addClip(tl, A, `k${i}`);
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) tl = moveClip(tl, `k${(i * 7) % 500}`, (i * 13) % 500);
    assertEqual(totalDuration(tl), 2000);
    assert(Date.now() - t0 < 2000, 'operações rápidas');
    assertEqual(new Set(tl.clips.map(c => c.id)).size, 500, 'sem duplicar nem perder clipes');
  });
});
