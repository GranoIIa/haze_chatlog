/**
 * Tier 5: "Visuais" do Modo Simples (combinam câmera, iluminação e retoque já existentes)
 */
import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { VISUAL_PRESETS, applyVisual, findVisual, inferVisual } from '../../src/utils/visualPresets';
import { DEFAULT_CAMERA, CAMERA_PRESET_EFFECTS } from '../../src/utils/cameraFx';
import { DEFAULT_LIGHTING, LIGHTING_PRESETS } from '../../src/utils/lighting';
import { DEFAULT_ADJUSTMENTS } from '../../src/utils/photoFilters';

const cur = { camera: { ...DEFAULT_CAMERA, custom: { ...DEFAULT_CAMERA.custom, bodycamOfficer: 'J. Silva' } }, lighting: DEFAULT_LIGHTING };

describe('Tier 5: Visuais (Modo Simples)', () => {
  test('T5_VIS_01_AllReferenceExistingPresets: cada visual aponta para presets que existem', () => {
    assert(VISUAL_PRESETS.length >= 6);
    const ids = new Set(VISUAL_PRESETS.map(v => v.id));
    assertEqual(ids.size, VISUAL_PRESETS.length);
    for (const v of VISUAL_PRESETS) {
      assert(v.camera in CAMERA_PRESET_EFFECTS, `${v.id}: câmera`);
      if (v.light) assert(LIGHTING_PRESETS.some(p => p.label === v.light), `${v.id}: luz "${v.light}"`);
    }
    assert(!!findVisual('bodycam') && !!findVisual('cctv') && findVisual('nao-existe') === undefined);
  });

  test('T5_VIS_02_BodycamKeepsUserFields: aplicar um visual preserva os campos que o jogador preencheu', () => {
    const r = applyVisual(findVisual('bodycam')!, cur);
    assertEqual(r.camera.preset, 'bodycam');
    assertEqual(r.camera.custom.bodycamOfficer, 'J. Silva');
    assertEqual(r.camera.effects.brush, true);
    assertEqual(r.lighting.enabled, false);
  });

  test('T5_VIS_03_LightVisualEnablesLight: visual com luz liga a iluminação com os valores do preset', () => {
    const r = applyVisual(findVisual('sunset')!, cur);
    const gold = LIGHTING_PRESETS.find(p => p.label === 'Golden Hour')!.patch;
    assertEqual(r.lighting.enabled, true);
    assertEqual(r.lighting.color, gold.color);
    assertEqual(r.camera.preset, 'none');
  });

  test('T5_VIS_04_OriginalResetsEverything: "Original" desliga câmera, luz e retoque', () => {
    const on = applyVisual(findVisual('noir')!, cur);
    assertEqual(on.camera.preset, 'noir');
    assertEqual(on.lighting.enabled, true);
    const off = applyVisual(findVisual('original')!, { camera: on.camera, lighting: on.lighting });
    assertEqual(off.camera.preset, 'none');
    assertEqual(Object.values(off.camera.effects).some(Boolean), false);
    assertEqual(off.lighting.enabled, false);
    assertEqual(JSON.stringify(off.adjustments), JSON.stringify(DEFAULT_ADJUSTMENTS));
  });

  test('T5_VIS_05_AdjustmentsReplaceNotStack: aplicar dois visuais seguidos não acumula retoque', () => {
    const a = applyVisual(findVisual('vintage')!, cur);
    assertEqual(a.adjustments.colorPreset, 'vintage-90s');
    const b = applyVisual(findVisual('crime')!, { camera: a.camera, lighting: a.lighting });
    assertEqual(b.adjustments.colorPreset, 'grit-crime');
    assertEqual(b.adjustments.grain, 0);
  });

  test('T5_VIS_06_InferVisual: o visual ativo é derivado do estado (abrir projeto, desfazer, edição manual)', () => {
    const base = { camera: cur.camera, lighting: cur.lighting, adjustments: DEFAULT_ADJUSTMENTS };
    assertEqual(inferVisual(base)?.id, 'original');
    for (const v of VISUAL_PRESETS) assertEqual(inferVisual(applyVisual(v, cur))?.id, v.id, v.id);
    // ajuste manual depois do visual → personalizado (nenhum botão marcado)
    const crime = applyVisual(findVisual('crime')!, cur);
    assertEqual(inferVisual({ ...crime, adjustments: { ...crime.adjustments, vignette: 31 } }), null);
    assertEqual(inferVisual({ ...crime, lighting: { ...crime.lighting, enabled: true } }), null);
  });
});
