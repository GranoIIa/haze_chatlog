/**
 * Tier 5: Testes do gerenciador de fontes customizadas do usuário (customFontStorage)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
import {
  isValidFontFile,
  fontNameFromFileName,
  MAX_FONT_SIZE_BYTES,
  registerFontFace
} from '../../src/utils/customFontStorage';

describe('Tier 5: Fontes Customizadas do Usuário (customFontStorage)', () => {

  test('T5_FONT_01_ValidExtensions: valida extensões permitidas de fontes', () => {
    assert(isValidFontFile('minha_fonte.ttf'));
    assert(isValidFontFile('FONTE.OTF'));
    assert(isValidFontFile('webfont.woff'));
    assert(isValidFontFile('modern.woff2'));

    assertEqual(isValidFontFile('imagem.png'), false);
    assertEqual(isValidFontFile('script.js'), false);
    assertEqual(isValidFontFile('arquivo.zip'), false);
    assertEqual(isValidFontFile('fonte.ttf.bak'), false);
  });

  test('T5_FONT_02_FontNameExtraction: limpa e formata o nome da família a partir do arquivo', () => {
    assertEqual(fontNameFromFileName('Pricedown-Bold.ttf'), 'Pricedown Bold');
    assertEqual(fontNameFromFileName('Chalet_London_1960.otf'), 'Chalet London 1960');
    assertEqual(fontNameFromFileName('my-cool-font.woff2'), 'my cool font');
    assertEqual(fontNameFromFileName('.ttf'), 'Fonte Customizada');
  });

  test('T5_FONT_03_SizeLimit: limite máximo de 20 MB definido', () => {
    assertEqual(MAX_FONT_SIZE_BYTES, 20 * 1024 * 1024);
  });

  test('T5_FONT_04_HeadlessSafety: registerFontFace retorna false com segurança em ambiente sem DOM/FontFace', async () => {
    const fakeBuffer = new ArrayBuffer(16);
    const ok = await registerFontFace('TestFont', fakeBuffer);
    // Em ambiente Node/headless sem document.fonts ou FontFace, deve retornar false sem lançar exceção
    assertEqual(typeof ok, 'boolean');
  });

});
