/**
 * Tier 5: geometria do quadro do GIF (resolução de saída + cover/contain/stretch)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { computeGifFrame, clampGifSize, GIF_MAX_RES, GIF_MIN_RES } from '../../src/utils/gifFrame';

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

describe('Tier 5: Quadro do GIF', () => {

  test('T5_GIF_01_LegacyOriginal: sem resolução escolhida, usa largura + proporção do vídeo', () => {
    const g = computeGifFrame(1920, 1080, 'original', 480, null, 'cover');
    assertEqual(g.outWidth, 480);
    assertEqual(g.outHeight, 270);
    assertEqual(g.sw, 1920);
    assertEqual(g.fillBackground, false);
  });

  test('T5_GIF_02_LegacySquare: recorte 1:1 central continua igual', () => {
    const g = computeGifFrame(1920, 1080, 'square', 320, null, 'cover');
    assertEqual(g.outWidth, 320);
    assertEqual(g.outHeight, 320);
    assertEqual(g.sw, 1080);
    assertEqual(g.sx, 420);
  });

  test('T5_GIF_03_CoverFillsFrame: cover preenche o quadro e recorta o excesso, sem distorcer', () => {
    const g = computeGifFrame(1920, 1080, 'original', 480, { w: 1080, h: 1080 }, 'cover');
    assertEqual(g.outWidth, 1080);
    assertEqual(g.outHeight, 1080);
    assert(near(g.sw, g.sh), 'origem quadrada (mesma proporção do destino)');
    assert(near(g.sh, 1080), 'usa a altura inteira do vídeo');
    assert(near(g.sx, 420), 'recorte centralizado');
    assertEqual(g.fillBackground, false);
  });

  test('T5_GIF_04_ContainShowsAll: contain mostra o vídeo inteiro com faixas pretas', () => {
    const g = computeGifFrame(1920, 1080, 'original', 480, { w: 1080, h: 1080 }, 'contain');
    assertEqual(g.sw, 1920);
    assertEqual(g.sh, 1080);
    assert(near(g.dw, 1080), 'largura total');
    assert(near(g.dh, 607.5), 'altura proporcional');
    assert(near(g.dy, (1080 - 607.5) / 2), 'centralizado na vertical');
    assertEqual(g.fillBackground, 'black');
  });

  test('T5_GIF_07_BlurMode: contain + desfoque tem a mesma geometria, com fundo desfocado', () => {
    const g = computeGifFrame(1920, 1080, 'original', 480, { w: 1080, h: 1080 }, 'blur');
    assertEqual(g.fillBackground, 'blur');
    assert(near(g.dw, 1080));
  });

  test('T5_GIF_05_StretchDeforms: esticar ocupa o quadro inteiro', () => {
    const g = computeGifFrame(1920, 1080, 'original', 480, { w: 854, h: 480 * 2 }, 'stretch');
    assertEqual(g.dw, 854);
    assertEqual(g.dh, 960);
    assertEqual(g.sw, 1920);
  });

  test('T5_GIF_06_ClampSize: limites do GIF e entradas inválidas', () => {
    assertEqual(JSON.stringify(clampGifSize(99999, 10)), JSON.stringify({ w: GIF_MAX_RES, h: GIF_MIN_RES }));
    assertEqual(clampGifSize(NaN, 100), null);
    assertEqual(JSON.stringify(clampGifSize(640.4, 360.6)), JSON.stringify({ w: 640, h: 361 }));
  });
});
