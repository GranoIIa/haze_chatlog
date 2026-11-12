/**
 * Tier 5: lógica pura das miniaturas dos Visuais (HAZE-UX-002, fases B/C)
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { ThumbCache, runThumbJob, thumbKey, thumbSize, THUMB_W, THUMB_MIN_H, THUMB_MAX_H, type ThumbFrame } from '../../src/utils/visualThumb';

const frame: ThumbFrame = { w: 1920, h: 1080, fit: 'cover', panX: 0, panY: 0, zoom: 100 };
const now = (fn: () => void) => fn();

describe('Tier 5: geometria e identidade das miniaturas', () => {
  test('T5_THB_01_SizeKeepsAspect: largura fixa, altura na proporção do quadro, com limites', () => {
    assertEqual(JSON.stringify(thumbSize({ w: 1920, h: 1080 })), JSON.stringify({ w: THUMB_W, h: 270 }));
    assertEqual(thumbSize({ w: 1080, h: 1920 }).h, THUMB_MAX_H);
    assertEqual(thumbSize({ w: 4000, h: 100 }).h, THUMB_MIN_H);
    assertEqual(thumbSize({ w: 0, h: 0 }).h, 270); // sem dimensões: 16:9
  });

  test('T5_THB_02_KeyChangesWithPhotoAndFraming: foto ou enquadramento diferentes → chave diferente', () => {
    const k = thumbKey('blob:a', frame);
    assertEqual(thumbKey('blob:a', { ...frame }), k);
    assert(thumbKey('blob:b', frame) !== k, 'foto');
    assert(thumbKey('blob:a', { ...frame, fit: 'contain' }) !== k, 'modo');
    assert(thumbKey('blob:a', { ...frame, w: 1280, h: 720 }) !== k, 'saída');
    assert(thumbKey('blob:a', { ...frame, zoom: 120 }) !== k, 'zoom');
    assert(thumbKey('blob:a', { ...frame, panX: 5 }) !== k, 'pan');
  });
});

describe('Tier 5: cache LRU', () => {
  test('T5_THB_03_LruEvictsOldest: descarta o menos usado e respeita o limite', () => {
    const c = new ThumbCache<number>(2);
    c.set('a', 1); c.set('b', 2);
    c.get('a'); // a fica recente
    c.set('c', 3);
    assertEqual(c.size, 2);
    assertEqual(c.get('b'), undefined);
    assertEqual(c.get('a'), 1);
    assertEqual(c.get('c'), 3);
  });
});

describe('Tier 5: tarefa incremental', () => {
  test('T5_THB_04_DeliversAllInOrder: entrega cada miniatura na ordem', async () => {
    const got: string[] = [];
    const r = await runThumbJob({ ids: ['a', 'b', 'c'], render: id => `u-${id}`, isStale: () => false, onThumb: (id, u) => got.push(`${id}=${u}`), schedule: now });
    assertEqual(got.join(','), 'a=u-a,b=u-b,c=u-c');
    assertEqual(JSON.stringify(r), JSON.stringify({ done: 3, failed: 0, cancelled: false }));
  });

  test('T5_THB_05_StaleResultsAreDiscarded: foto trocada no meio → nada obsoleto é entregue', async () => {
    let stale = false;
    const got: string[] = [];
    const r = await runThumbJob({
      ids: ['a', 'b', 'c'],
      render: id => { if (id === 'b') stale = true; return `u-${id}`; }, // a foto muda durante o desenho de "b"
      isStale: () => stale,
      onThumb: (id) => got.push(id),
      schedule: now
    });
    assertEqual(got.join(','), 'a'); // "b" foi desenhada, mas já era obsoleta: descartada; "c" nem começa
    assertEqual(r.cancelled, true);
  });

  test('T5_THB_06_OneFailureDoesNotStopOthers: falha isolada em um visual', async () => {
    const got: string[] = [];
    const r = await runThumbJob({
      ids: ['a', 'b', 'c', 'd'],
      render: id => { if (id === 'b') throw new Error('x'); return id === 'c' ? '' : `u-${id}`; },
      isStale: () => false, onThumb: (id) => got.push(id), schedule: now
    });
    assertEqual(got.join(','), 'a,d');
    assertEqual(r.failed, 2);
    assertEqual(r.done, 2);
  });

  test('T5_THB_07_YieldsBetweenThumbs: cada miniatura espera uma tarefa ociosa (não bloqueia a interface)', async () => {
    let ticks = 0;
    await runThumbJob({ ids: ['a', 'b', 'c'], render: id => id, isStale: () => false, onThumb: () => {}, schedule: fn => { ticks++; setTimeout(fn, 0); } });
    assertEqual(ticks, 3);
  });
});
