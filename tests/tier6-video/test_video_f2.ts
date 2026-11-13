/**
 * Tier 6 (F2): presets de câmera por clipe, chat linha a linha, texto livre e projeto de vídeo (.haze v2).
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  addClip, addOverlay, cameraClock, emptyTimeline, overlayText, sanitizeTimeline, setClipCamera, setLineStep, MediaRef
} from '../../src/video/timeline';
import { buildVideoProjectBlob, parseVideoProject, matchesSaved, SavedMedia } from '../../src/video/videoProject';
import { parseProjectFile, PROJECT_FORMAT } from '../../src/utils/projectFile';

const M: SavedMedia = { id: 'mA', name: 'a.mp4', duration: 10, width: 1920, height: 1080, hasAudio: true, size: 5000 };
const NOW = { date: '2026-03-01', time: '22:10:05' };
const base = () => addClip(emptyTimeline(), M, 'c1');

describe('Tier 6 (F2): câmera, chat e projeto de vídeo', () => {
  test('T6_F2_01_Camera: ligar, trocar e remover preset; relógio vem do instante da mídia', () => {
    let tl = setClipCamera(base(), 'c1', 'bodycam', NOW, { officer: 'J. Silva' });
    assertEqual(tl.clips[0].camera!.preset, 'bodycam');
    assertEqual(tl.clips[0].camera!.officer, 'J. Silva');
    tl = setClipCamera(tl, 'c1', 'cctv', NOW);
    assertEqual(tl.clips[0].camera!.preset, 'cctv');
    assertEqual(tl.clips[0].camera!.officer, 'J. Silva', 'campos já preenchidos são preservados');
    tl = setClipCamera(tl, 'c1', 'none', NOW);
    assert(tl.clips[0].camera === undefined, 'remove');
    assert(!('camera' in tl.clips[0]));
  });

  test('T6_F2_02_Clock: o relógio avança com o vídeo e vira a data à meia-noite', () => {
    const cam = { preset: 'bodycam' as const, date: '2026-03-01', time: '23:59:50' };
    assertEqual(cameraClock(cam, 0).time, '23:59:50');
    assertEqual(cameraClock(cam, 9.9).time, '23:59:59');
    const next = cameraClock(cam, 12);
    assertEqual(next.date, '2026-03-02'); assertEqual(next.time, '00:00:02');
  });

  test('T6_F2_03_CameraBadInput: data/hora inválidas caem no padrão informado', () => {
    const tl = setClipCamera(base(), 'c1', 'cctv', NOW, { date: '01/03/2026', time: 'tarde' });
    assertEqual(tl.clips[0].camera!.date, NOW.date); assertEqual(tl.clips[0].camera!.time, NOW.time);
  });

  test('T6_F2_04_LineByLine: as linhas do chat entram uma a uma', () => {
    let tl = addOverlay(base(), { text: 'A diz: um\nB diz: dois\nC diz: três', start: 2, duration: 6 }, 'o1');
    tl = setLineStep(tl, 'o1', 1.5);
    const o = tl.overlays[0];
    assertEqual(o.lineOffsets!.join(','), '0,1.5,3');
    assertEqual(overlayText(o, 2.0).split('\n').length, 1);
    assertEqual(overlayText(o, 3.6).split('\n').length, 2);
    assertEqual(overlayText(o, 5.0).split('\n').length, 3);
    assertEqual(overlayText(setLineStep(tl, 'o1', 0).overlays[0], 2.0).split('\n').length, 3, 'sem sequência = tudo de uma vez');
  });

  test('T6_F2_05_Sanitize: campos novos válidos ficam, inválidos caem, projetos antigos seguem abrindo', () => {
    const r = sanitizeTimeline({
      clips: [
        { id: 'a', mediaId: 'm', inPoint: 0, outPoint: 2, volume: 1, camera: { preset: 'noir', date: '2026-01-01', time: '10:00:00' } },
        { id: 'b', mediaId: 'm', inPoint: 0, outPoint: 2, volume: 1, camera: { preset: 'hack', date: 'x', time: 'y' } },
        { id: 'c', mediaId: 'm', inPoint: 0, outPoint: 2, volume: 1 }
      ],
      overlays: [
        { id: 'o1', text: 'x\ny', start: 0, duration: 2, kind: 'text', color: '#ff0000', lineOffsets: [0, 1] },
        { id: 'o2', text: 'x\ny', start: 0, duration: 2, kind: 'text', color: 'javascript:1', lineOffsets: [0] },
        { id: 'o3', text: 'x', start: 0, duration: 2 }
      ]
    });
    assertEqual(r.clips[0].camera!.preset, 'noir');
    assert(r.clips[1].camera === undefined && r.clips[2].camera === undefined);
    assertEqual(r.overlays[0].color, '#ff0000'); assertEqual(r.overlays[0].lineOffsets!.length, 2);
    assertEqual(r.overlays[1].color, '#ffffff', 'cor inválida volta ao padrão');
    assert(r.overlays[1].lineOffsets === undefined, 'offsets com tamanho errado são descartados');
    assert(r.overlays[2].kind === undefined, 'overlay sem kind continua sendo chat');
  });

  test('T6_F2_06_ProjectRoundTrip: salvar e abrir preserva timeline e mídias', async () => {
    let tl = setClipCamera(base(), 'c1', 'bodycam', NOW, { officer: 'R. Lima' });
    tl = addOverlay(tl, { text: 'Título', kind: 'text', start: 1, duration: 3 }, 'o1');
    const blob = await buildVideoProjectBlob(tl, [M, { ...M, id: 'nao-usada' }]);
    const back = await parseVideoProject(blob);
    assertEqual(back.timeline.clips.length, 1);
    assertEqual(back.timeline.clips[0].camera!.officer, 'R. Lima');
    assertEqual(back.timeline.overlays[0].kind, 'text');
    assertEqual(back.media.length, 1, 'só as mídias usadas entram');
    assertEqual(back.media[0].size, 5000);
    assertEqual(back.warnings.length, 0);
  });

  test('T6_F2_07_ProjectCompat: projeto de cena (v1) não abre como vídeo e vice-versa, com mensagens claras', async () => {
    const { default: JSZip } = await import('jszip');
    const z = new JSZip();
    z.file('manifest.json', JSON.stringify({ format: PROJECT_FORMAT, schemaVersion: 1, scene: {}, assets: [] }));
    const scene = new Blob([await z.generateAsync({ type: 'uint8array' }) as BlobPart]);
    let msg = '';
    try { await parseVideoProject(scene); } catch (e) { msg = (e as Error).message; }
    assert(msg.includes('Editor RP'), `mensagem: ${msg}`);
    const video = await buildVideoProjectBlob(base(), [M]);
    msg = '';
    try { await parseProjectFile(video); } catch (e) { msg = (e as Error).message; }
    assert(msg.includes('Video Studio'), `mensagem: ${msg}`);
  });

  test('T6_F2_08_ProjectHostile: lixo, versão futura e clipe de mídia desconhecida', async () => {
    const { default: JSZip } = await import('jszip');
    const mk = async (m: unknown) => { const z = new JSZip(); z.file('manifest.json', JSON.stringify(m)); return new Blob([await z.generateAsync({ type: 'uint8array' }) as BlobPart]); };
    for (const bad of [new Blob([]), new Blob(['nao sou zip'.repeat(5)])]) {
      let ok = false; try { await parseVideoProject(bad); } catch { ok = true; }
      assert(ok, 'recusa arquivo inválido');
    }
    let msg = ''; try { await parseVideoProject(await mk({ format: PROJECT_FORMAT, schemaVersion: 99, kind: 'video', video: {} })); } catch (e) { msg = (e as Error).message; }
    assert(msg.includes('mais nova'));
    const p = await parseVideoProject(await mk({
      format: PROJECT_FORMAT, schemaVersion: 2, kind: 'video',
      video: { media: [M], timeline: { clips: [{ id: 'x', mediaId: 'fantasma', inPoint: 0, outPoint: 2, volume: 1 }, { id: 'y', mediaId: 'mA', inPoint: 0, outPoint: 2, volume: 1 }] } }
    }));
    assertEqual(p.timeline.clips.length, 1); assertEqual(p.warnings.length, 1);
  });

  test('T6_F2_09_Match: reconectar por nome, tamanho e duração', () => {
    assert(matchesSaved(M, { name: 'a.mp4', size: 5000 }, 10.02));
    assert(!matchesSaved(M, { name: 'b.mp4', size: 5000 }, 10));
    assert(!matchesSaved(M, { name: 'a.mp4', size: 5001 }, 10));
    assert(!matchesSaved(M, { name: 'a.mp4', size: 5000 }, 12), 'mesma identidade, duração diferente = arquivo diferente');
    void ({} as MediaRef);
  });
});
