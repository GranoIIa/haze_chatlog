/**
 * Tier 5: posicionamento do vídeo para captura de quadros do GIF (videoSeek)
 */

import { describe, test, assertEqual, assert } from '../harness/testRunner';
import { seekVideo, seekWithRetry, SeekableVideo } from '../../src/utils/videoSeek';

/** Vídeo falso: emite "seeked" quando a posição é atribuída (a menos que configurado para falhar). */
class FakeVideo extends EventTarget {
  duration = 10;
  readyState = 4;
  sets = 0;
  private _t = 0;
  /** Quantas atribuições de currentTime serão ignoradas (sem "seeked"). */
  ignoreFirst = 0;
  /** "seeked" chega com readyState baixo; "canplay" completa depois. */
  slowDecode = false;
  failWithError = false;

  get currentTime() { return this._t; }
  set currentTime(v: number) {
    this.sets++;
    this._t = v;
    if (this.sets <= this.ignoreFirst) return;
    setTimeout(() => {
      if (this.failWithError) { this.dispatchEvent(new Event('error')); return; }
      if (this.slowDecode) {
        this.readyState = 1;
        this.dispatchEvent(new Event('seeked'));
        setTimeout(() => { this.readyState = 3; this.dispatchEvent(new Event('canplay')); }, 5);
        return;
      }
      this.dispatchEvent(new Event('seeked'));
    }, 1);
  }
}

const asVideo = (v: FakeVideo) => v as unknown as SeekableVideo;

describe('Tier 5: videoSeek', () => {

  test('T5_SEEK_01_AlreadyThere: já na posição e com dados -> ok sem mexer no vídeo', async () => {
    const v = new FakeVideo();
    assertEqual(await seekVideo(asVideo(v), 0), 'ok');
    assertEqual(v.sets, 0);
  });

  test('T5_SEEK_02_Seeks: posiciona e resolve no evento seeked', async () => {
    const v = new FakeVideo();
    assertEqual(await seekVideo(asVideo(v), 3.5, { timeoutMs: 200 }), 'ok');
    assertEqual(v.currentTime, 3.5);
  });

  test('T5_SEEK_03_ClampsToDuration: alvo além do fim é limitado à duração', async () => {
    const v = new FakeVideo();
    await seekVideo(asVideo(v), 99, { timeoutMs: 200 });
    assertEqual(v.currentTime, 10);
  });

  test('T5_SEEK_04_Timeout: sem evento -> "timeout" (nunca "ok")', async () => {
    const v = new FakeVideo(); v.ignoreFirst = 99;
    assertEqual(await seekVideo(asVideo(v), 2, { timeoutMs: 20 }), 'timeout');
  });

  test('T5_SEEK_05_MediaError: erro de mídia -> "error"', async () => {
    const v = new FakeVideo(); v.failWithError = true;
    assertEqual(await seekVideo(asVideo(v), 2, { timeoutMs: 200 }), 'error');
  });

  test('T5_SEEK_06_Abort: cancelamento durante e antes da espera -> "aborted"', async () => {
    const v = new FakeVideo(); v.ignoreFirst = 99;
    const ac = new AbortController();
    const p = seekVideo(asVideo(v), 2, { timeoutMs: 500, signal: ac.signal });
    setTimeout(() => ac.abort(), 5);
    assertEqual(await p, 'aborted');

    const ac2 = new AbortController(); ac2.abort();
    assertEqual(await seekVideo(asVideo(new FakeVideo()), 2, { signal: ac2.signal }), 'aborted');
  });

  test('T5_SEEK_07_SlowDecode: seeked sem dados do quadro espera o canplay', async () => {
    const v = new FakeVideo(); v.slowDecode = true;
    assertEqual(await seekVideo(asVideo(v), 4, { timeoutMs: 300 }), 'ok');
    assert(v.readyState >= 2, 'só deve resolver com dados disponíveis');
  });

  test('T5_SEEK_08_RetrySucceeds: repete após timeout até conseguir', async () => {
    const v = new FakeVideo(); v.ignoreFirst = 2; // 1ª tentativa e o "empurrão" são ignorados
    assertEqual(await seekWithRetry(asVideo(v), 5, { timeoutMs: 25, retries: 2 }), 'ok');
    assertEqual(v.currentTime, 5);
  });

  test('T5_SEEK_09_RetryGivesUp: esgota as tentativas e devolve "timeout"', async () => {
    const v = new FakeVideo(); v.ignoreFirst = 99;
    assertEqual(await seekWithRetry(asVideo(v), 5, { timeoutMs: 15, retries: 1 }), 'timeout');
  });

  test('T5_SEEK_10_NoRetryOnError: erro de mídia não é repetido', async () => {
    const v = new FakeVideo(); v.failWithError = true;
    assertEqual(await seekWithRetry(asVideo(v), 5, { timeoutMs: 100, retries: 3 }), 'error');
    assertEqual(v.sets, 1);
  });
});
