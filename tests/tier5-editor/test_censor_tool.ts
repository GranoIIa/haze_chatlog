/**
 * Tier 5: Testes da ferramenta de Censura e Borrão de Imagem (censorTool)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  sanitizeCensorRegions,
  DEFAULT_CENSOR_SETTINGS,
  drawCensorRegion,
  drawAllCensorRegions,
  drawCensorGizmo,
  type CensorRegion
} from '../../src/utils/censorTool';
import { normalizeScene } from '../../src/utils/projectFile';

describe('Tier 5: Ferramenta de Censura e Borrão (censorTool)', () => {

  test('T5_CENSOR_01_SanitizeRegions: valida e sanitiza arrays e objetos inválidos com segurança', () => {
    assert.deepEqual(sanitizeCensorRegions(null), []);
    assert.deepEqual(sanitizeCensorRegions(undefined), []);
    assert.deepEqual(sanitizeCensorRegions('string-invalida'), []);
    assert.deepEqual(sanitizeCensorRegions([null, 123, 'teste']), []);

    const input = [
      {
        id: 'spot-1',
        cx: 0.3,
        cy: 0.4,
        width: 0.1,
        height: 0.1,
        type: 'blur',
        shape: 'circle',
        intensity: 30
      },
      {
        id: 'spot-overflow',
        cx: 2.5, // deve sofrer clamp para 1
        cy: -1,  // deve sofrer clamp para 0
        width: 5, // deve sofrer clamp para 1
        height: -0.5, // deve sofrer clamp para mínimo
        type: 'invalido', // deve virar 'blur'
        shape: 'desconhecido', // deve virar 'circle'
        intensity: 999 // deve sofrer clamp para 60
      }
    ];

    const sanitized = sanitizeCensorRegions(input);
    assertEqual(sanitized.length, 2);

    // spot-1
    assertEqual(sanitized[0].id, 'spot-1');
    assertEqual(sanitized[0].cx, 0.3);
    assertEqual(sanitized[0].type, 'blur');
    assertEqual(sanitized[0].shape, 'circle');

    // spot-overflow
    assertEqual(sanitized[1].cx, 1);
    assertEqual(sanitized[1].cy, 0);
    assertEqual(sanitized[1].width, 1);
    assertEqual(sanitized[1].type, 'blur');
    assertEqual(sanitized[1].shape, 'circle');
    assertEqual(sanitized[1].intensity, 60);
  });

  test('T5_CENSOR_02_DefaultSettings: padrões de pincel consistentes', () => {
    assertEqual(DEFAULT_CENSOR_SETTINGS.type, 'blur');
    assertEqual(DEFAULT_CENSOR_SETTINGS.shape, 'circle');
    assert(DEFAULT_CENSOR_SETTINGS.size >= 20 && DEFAULT_CENSOR_SETTINGS.size <= 200);
    assert(DEFAULT_CENSOR_SETTINGS.intensity >= 10 && DEFAULT_CENSOR_SETTINGS.intensity <= 50);
  });

  test('T5_CENSOR_03_DrawSafetyHeadless: renderizadores não explodem sem contexto gráfico real', () => {
    // Cria um mock mínimo de CanvasRenderingContext2D
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      drawImage: () => {},
      setLineDash: () => {},
      canvas: {} as HTMLCanvasElement
    } as unknown as CanvasRenderingContext2D;

    const region: CensorRegion = {
      id: 'test-draw',
      cx: 0.5,
      cy: 0.5,
      width: 0.2,
      height: 0.2,
      type: 'solid',
      shape: 'rect',
      intensity: 25
    };

    // Não deve lançar erro
    drawCensorRegion(mockCtx, region, 800, 600);
    drawAllCensorRegions(mockCtx, [region], 800, 600);
    drawCensorGizmo(mockCtx, 100, 100, 'circle', 50, 50);
    assert(true, 'desenho executado com sucesso');
  });

  test('T5_CENSOR_04_ProjectPersistence: normalizeScene preserva regiões censuradas no projeto .haze', () => {
    const rawScene = {
      rawText: 'Oliver Walker diz: Olá!',
      censorSpots: [
        {
          id: 'censor-rostos',
          cx: 0.5,
          cy: 0.3,
          width: 0.15,
          height: 0.15,
          type: 'pixelate',
          shape: 'circle',
          intensity: 35
        }
      ]
    };

    const scene = normalizeScene(rawScene);
    assert(Array.isArray(scene.censorSpots), 'censorSpots deve ser um array');
    assertEqual(scene.censorSpots?.length, 1);
    assertEqual(scene.censorSpots?.[0].type, 'pixelate');
    assertEqual(scene.censorSpots?.[0].shape, 'circle');
  });

});
