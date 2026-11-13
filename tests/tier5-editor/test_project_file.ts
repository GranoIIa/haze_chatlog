/**
 * Tier 5: arquivo de projeto .haze (validação da cena, ida e volta, entradas hostis)
 */

import JSZip from 'jszip';
import { describe, test, assert, assertEqual, assertThrows } from '../harness/testRunner';
import {
  normalizeScene, buildProjectBlob, parseProjectFile, sniffImageMime, ProjectError,
  PROJECT_FORMAT, PROJECT_SCHEMA_VERSION, SCENE_SCHEMA_VERSION, ProjectData, ProjectAsset
} from '../../src/utils/projectFile';

// PNG mínimo válido (1x1)
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

const asset = (id: string, name = id): ProjectAsset => ({
  id, name, mime: 'image/png', blob: new Blob([PNG as BlobPart], { type: 'image/png' })
});

const sampleProject = (): Omit<ProjectData, 'warnings'> => {
  const scene = normalizeScene({
    rawText: 'Mike Johnson diz: Olá', fontSize: 28, chatPos: { x: 100, y: 120 },
    lighting: { enabled: true, color: '#ff0000' },
    camera: { preset: 'cctv', effects: { grain: true } },
    canvasLayers: [{ id: 'sticker-1', type: 'sticker', content: 'censored-bar', x: 10, y: 20, width: 100, height: 40 }],
    outputRes: { w: 1920, h: 1080 }
  });
  return {
    scene,
    background: { assetId: 'BG1', name: 'fundo.png' },
    imageLayers: [{
      id: 'L1', blobId: 'B1', name: 'selo.png', cx: 0.3, cy: 0.4, widthPct: 25, rotation: 10,
      opacity: 0.8, aboveChat: true, visible: true
    }],
    assets: new Map([['BG1', asset('BG1', 'fundo.png')], ['B1', asset('B1', 'selo.png')]])
  };
};

const rebuild = async (blob: Blob, tweak: (zip: JSZip, manifest: any) => void | Promise<void>): Promise<Blob> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  await tweak(zip, manifest);
  return new Blob([await zip.generateAsync({ type: 'uint8array' }) as BlobPart]);
};

describe('Tier 5: Projeto .haze', () => {

  test('T5_PROJ_01_NormalizeHostileScene: limita faixas, tamanhos e tipos', () => {
    const s = normalizeScene({
      fontSize: 9999, darkening: -5, lineHeightFactor: 'x', rawText: 'a'.repeat(500_000),
      strokeColor: 'javascript:alert(1)', censorStyle: 'hack', fitMode: 'zoom',
      zoom: 99999, panX: 'abc', outputRes: { w: 1, h: 999999 },
      characters: [{ id: 1, name: 'x' }, { id: 'ok', name: 'N'.repeat(500), color: 'vermelho' }],
      adjustments: { brightness: 9999, colorPreset: 'virus', letterbox: 'sim' },
      canvasLayers: [{ id: 'p', type: 'preset', presetType: 'inexistente' }]
    });
    assertEqual(s.fontSize, 72);
    assertEqual(s.darkening, 0);
    assertEqual(s.lineHeightFactor, 1.55);
    assertEqual(s.rawText.length, 200_000);
    assertEqual(s.strokeColor, '#000000');
    assertEqual(s.censorStyle, 'mosaic');
    assertEqual(s.fitMode, 'cover');
    assertEqual(s.zoom, 400);
    assertEqual(s.panX, 0);
    assertEqual(s.outputRes?.w, 64);
    assertEqual(s.outputRes?.h, 7680);
    assertEqual(s.characters.length, 1);
    assertEqual(s.characters[0].name.length, 60);
    assertEqual(s.characters[0].color, '#38bdf8');
    assertEqual(s.adjustments.brightness, 100);
    assertEqual(s.adjustments.colorPreset, 'none');
    assertEqual(s.adjustments.letterbox, false);
    assertEqual(s.canvasLayers.length, 0);
  });

  test('T5_PROJ_02_NormalizeNullish: entrada vazia ou inválida vira cena padrão', () => {
    for (const bad of [null, undefined, 'x', 5, []]) {
      const s = normalizeScene(bad as any);
      assertEqual(s.fontSize, 20);
      assertEqual(s.lighting.enabled, false);
      assertEqual(s.camera.preset, 'none');
      assertEqual(s.canvasLayers.length, 0);
    }
  });

  test('T5_PROJ_03_SniffImage: reconhece imagens pelos bytes, recusa o resto', () => {
    assertEqual(sniffImageMime(PNG)?.ext, 'png');
    assertEqual(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))?.ext, 'jpg');
    assertEqual(sniffImageMime(new TextEncoder().encode('GIF89a......'))?.ext, 'gif');
    assertEqual(sniffImageMime(new TextEncoder().encode('RIFF....WEBPVP8 '))?.ext, 'webp');
    assertEqual(sniffImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')), null);
    assertEqual(sniffImageMime(new TextEncoder().encode('<script>alert(1)</script>')), null);
    assertEqual(sniffImageMime(new Uint8Array(0)), null);
  });

  test('T5_PROJ_04_RoundTrip: salvar e reabrir preserva cena, camadas e imagens', async () => {
    const original = sampleProject();
    const blob = await buildProjectBlob(original);
    const data = await parseProjectFile(blob);

    assertEqual(data.warnings.length, 0);
    assertEqual(data.scene.rawText, 'Mike Johnson diz: Olá');
    assertEqual(data.scene.fontSize, 28);
    assertEqual(data.scene.lighting.enabled, true);
    assertEqual(data.scene.lighting.color, '#ff0000');
    assertEqual(data.scene.camera.preset, 'cctv');
    assertEqual(data.scene.camera.effects.grain, true);
    assertEqual(data.scene.outputRes?.w, 1920);
    assertEqual(data.scene.canvasLayers.length, 1);
    assertEqual(data.scene.canvasLayers[0].content, 'censored-bar');
    assertEqual(data.background?.assetId, 'BG1');
    assertEqual(data.imageLayers.length, 1);
    assertEqual(data.imageLayers[0].cx, 0.3);
    assertEqual(data.imageLayers[0].opacity, 0.8);
    assertEqual(data.assets.size, 2);
    assertEqual(data.assets.get('B1')!.blob.size, PNG.length);
    assertEqual(data.assets.get('B1')!.mime, 'image/png');
  });

  test('T5_PROJ_05_ManifestFormat: o manifesto declara formato e versão', async () => {
    const blob = await buildProjectBlob(sampleProject());
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const m = JSON.parse(await zip.file('manifest.json')!.async('string'));
    assertEqual(m.format, PROJECT_FORMAT);
    assertEqual(m.schemaVersion, SCENE_SCHEMA_VERSION);
    assert(Object.keys(zip.files).every(n => n === 'manifest.json' || n.startsWith('assets/')), 'só manifest e assets/');
  });

  test('T5_PROJ_06_RejectsNotZip: lixo e arquivo vazio dão erro claro', async () => {
    let err: any;
    try { await parseProjectFile(new Blob([new TextEncoder().encode('isto não é um zip de verdade, claro que não')])); } catch (e) { err = e; }
    assert(err instanceof ProjectError, 'deve ser ProjectError');
    try { await parseProjectFile(new Blob([])); } catch (e) { err = e; }
    assert(err instanceof ProjectError && /vazio|corrompido/.test(err.message));
  });

  test('T5_PROJ_07_RejectsWrongFormatAndFuture: formato alheio e versão futura', async () => {
    const good = await buildProjectBlob(sampleProject());
    const other = await rebuild(good, (_z, m) => { m.format = 'outro-app'; (_z as any).file('manifest.json', JSON.stringify(m)); });
    let err: any;
    try { await parseProjectFile(other); } catch (e) { err = e; }
    assert(err instanceof ProjectError && /não é um projeto/.test(err.message));

    const future = await rebuild(good, (z, m) => { m.schemaVersion = PROJECT_SCHEMA_VERSION + 1; z.file('manifest.json', JSON.stringify(m)); });
    try { await parseProjectFile(future); } catch (e) { err = e; }
    assert(err instanceof ProjectError && /mais nova/.test(err.message));

    const noManifest = await rebuild(good, (z) => { z.remove('manifest.json'); });
    try { await parseProjectFile(noManifest); } catch (e) { err = e; }
    assert(err instanceof ProjectError && /manifest/.test(err.message));
  });

  test('T5_PROJ_08_RejectsFakeImage: arquivo que não é imagem (HTML/SVG) é recusado', async () => {
    const good = await buildProjectBlob(sampleProject());
    const evil = await rebuild(good, (z, m) => { z.file(m.assets[0].file, '<svg><script>alert(1)</script></svg>'); });
    let err: any;
    try { await parseProjectFile(evil); } catch (e) { err = e; }
    assert(err instanceof ProjectError && /não é uma imagem válida/.test(err.message));
  });

  test('T5_PROJ_09_IgnoresUnsafePaths: caminhos fora de assets/ são descartados COM aviso', async () => {
    const good = await buildProjectBlob(sampleProject());
    const evil = await rebuild(good, (z, m) => {
      m.assets[0].file = '../../etc/passwd';
      m.assets[1].file = 'assets/../../x.png';
      z.file('manifest.json', JSON.stringify(m));
    });
    const data = await parseProjectFile(evil);
    assertEqual(data.assets.size, 0);
    assertEqual(data.background, null);
    assertEqual(data.imageLayers.length, 0);
    assert(data.warnings.length >= 2, 'o usuário precisa ser avisado do que foi descartado');
  });

  test('T5_PROJ_10_LayersNeedAssets: camada sem imagem é descartada e avisada', async () => {
    const good = await buildProjectBlob(sampleProject());
    const broken = await rebuild(good, (z, m) => {
      m.imageLayers.push({ id: 'L2', blobId: 'NAOEXISTE', name: 'x' });
      m.imageLayers.push({ id: '../x', blobId: 'B1', name: 'y' });
      z.file('manifest.json', JSON.stringify(m));
    });
    const data = await parseProjectFile(broken);
    assertEqual(data.imageLayers.length, 1);
    assert(data.warnings.some(w => /camada/.test(w)));
  });

  test('T5_PROJ_11_OnlyValidImagesExported: ao salvar, arquivo inválido não entra no pacote', async () => {
    const p = sampleProject();
    p.assets.set('B1', { id: 'B1', name: 'ruim', mime: 'image/png', blob: new Blob(['não sou imagem']) });
    const data = await parseProjectFile(await buildProjectBlob(p));
    assertEqual(data.assets.size, 1);
    assert(data.warnings.length > 0, 'a camada ficou sem imagem e foi avisada');
  });
});
