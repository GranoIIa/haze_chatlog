import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { checkImportLimits, checkExportLimits, audioMixBytes, MAX_FILE_BYTES, MAX_MEDIA_SECONDS, MAX_TIMELINE_SECONDS } from '../../src/video/limits';

describe('Tier 6: Video Studio, limites', () => {
  test('T6_LIM_01_Import: aceita dentro do limite e recusa arquivo ou duração acima', () => {
    assertEqual(checkImportLimits('a.mp4', 1000, 60), null);
    assert(checkImportLimits('grande.mp4', MAX_FILE_BYTES + 1)!.includes('grande.mp4'));
    assert(checkImportLimits('longo.mp4', 1000, MAX_MEDIA_SECONDS + 1)!.includes('longo.mp4'));
    assertEqual(checkImportLimits('a.mp4', MAX_FILE_BYTES), null, 'o limite exato é aceito');
  });
  test('T6_LIM_02_Export: memória do mix de áudio e duração máxima', () => {
    assertEqual(audioMixBytes(60), 48000 * 60 * 8);
    assertEqual(checkExportLimits(600), null, '10 min (medido na F0) passa');
    assert(checkExportLimits(MAX_TIMELINE_SECONDS + 1) !== null);
    assert(checkExportLimits(2 * 3600) !== null || audioMixBytes(2 * 3600) <= 1.5 * 1024 ** 3);
    assert(checkExportLimits(1.5 * 3600 + 1) !== null, 'acima de ~1,5 h o mix passa de 1,5 GB');
  });
});
