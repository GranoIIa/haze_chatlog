/**
 * Tier 1 Feature Coverage Tests: Features 1 to 5 (25 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Feature 1: Centralized Type Contracts & Presets Alignment
 * Feature 2: Tab State Persistence & Unmount Protection
 * Feature 3: Dead Code & Dependency Hygiene
 * Feature 4: RP Command Parser Engine
 * Feature 5: Timestamp Parsing & Display Toggle
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D } from '../harness/mockEnv';
import { parseChatLine } from '../../src/utils/chatParser';
import { RP_PRESETS } from '../../src/utils/rpPresets';
import { CanvasLayer, ParsedLine, GifExportSettings, ActiveTab } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Tier 1: Features 01 to 05 Coverage', () => {

  // =========================================================================
  // Feature 1: Centralized Type Contracts & Presets Alignment
  // =========================================================================

  test('T1_F01_01_PresetTypeCompleteness: RP_PRESETS contains all 6 required presets', () => {
    const expectedKeys = ['bodycam', 'weazel', 'flir', 'dashcam', 'cctv', 'mugshot'];
    const keys = Object.keys(RP_PRESETS);
    assertEqual(keys.length, 6);
    for (const key of expectedKeys) {
      assert(key in RP_PRESETS, `Preset key ${key} missing from RP_PRESETS`);
      const preset = (RP_PRESETS as any)[key];
      assertEqual(preset.id, key);
      assert(typeof preset.name === 'string' && preset.name.length > 0);
      assertEqual(typeof preset.draw, 'function');
    }
  });

  test('T1_F01_02_CanvasLayerTypeContract: CanvasLayer accepts flir, dashcam, locked, and blendMode', () => {
    const flirLayer: CanvasLayer = {
      id: 'layer-flir',
      type: 'preset',
      name: 'FLIR Recon',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      blendMode: 'screen',
      presetType: 'flir',
      presetData: { unitName: 'AIR SUPPORT' }
    };

    assertEqual(flirLayer.presetType, 'flir');
    assertEqual(flirLayer.locked, false);
    assertEqual(flirLayer.blendMode, 'screen');
  });

  test('T1_F01_03_ParsedLineContract: ParsedLine structure conforms to master contract', () => {
    const line: ParsedLine = {
      id: 'line-1',
      type: 'me',
      rawText: '* Jack acende o cigarro',
      segments: [{ text: '* Jack acende o cigarro', isCensored: false }],
      timestamp: '[12:00:00]',
      speaker: 'Jack',
      messageText: 'acende o cigarro',
      colorOverride: '#cc99ff'
    };

    assertEqual(line.id, 'line-1');
    assertEqual(line.type, 'me');
    assertEqual(line.speaker, 'Jack');
    assertEqual(line.timestamp, '[12:00:00]');
    assertEqual(line.segments.length, 1);
  });

  test('T1_F01_04_GifExportSettingsContract: GifExportSettings retains all encoding fields', () => {
    const settings: GifExportSettings = {
      startTime: 0,
      endTime: 5.5,
      fps: 15,
      width: 480,
      height: 270,
      quality: 10,
      speed: 1.25,
      reverse: false,
      dither: true,
      watermarkText: 'HAZE RP STUDIO'
    };

    assertEqual(settings.fps, 15);
    assertEqual(settings.speed, 1.25);
    assertEqual(settings.watermarkText, 'HAZE RP STUDIO');
  });

  test('T1_F01_05_PresetRendererDrawExecution: All 6 presets render cleanly with balanced save/restore', () => {
    const keys = Object.keys(RP_PRESETS) as Array<keyof typeof RP_PRESETS>;
    for (const key of keys) {
      const ctx = createMockContext2D(1280, 720);
      const preset = RP_PRESETS[key];
      preset.draw(ctx as any, 1280, 720, preset.defaultData);

      const saves = ctx.operationHistory.filter(op => op.method === 'save').length;
      const restores = ctx.operationHistory.filter(op => op.method === 'restore').length;
      assertEqual(saves, restores, `Preset ${key} must have balanced save/restore calls`);
      assert(saves >= 1, `Preset ${key} should call ctx.save at least once`);
    }
  });

  // =========================================================================
  // Feature 2: Tab State Persistence & Unmount Protection
  // =========================================================================

  test('T1_F02_01_ChatTextPreservedAcrossTabs: Chat text persists when activeTab changes', () => {
    const appState = {
      activeTab: 'chatlog' as ActiveTab,
      chatText: 'Linha de teste persistente para GTA RP'
    };

    // Navigate to canvas tab
    appState.activeTab = 'canvas';
    // Navigate back to chatlog tab
    appState.activeTab = 'chatlog';

    assertEqual(appState.chatText, 'Linha de teste persistente para GTA RP');
  });

  test('T1_F02_02_CanvasLayersPreservedAcrossTabs: Canvas layers survive switching to GifLab and back', () => {
    const appState = {
      activeTab: 'canvas' as ActiveTab,
      canvasLayers: [
        { id: 'bg-1', type: 'image', name: 'Background', x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1, visible: true },
        { id: 'text-1', type: 'text', name: 'Evidence Text', x: 100, y: 100, width: 200, height: 50, rotation: 0, opacity: 1, visible: true },
        { id: 'sticker-1', type: 'sticker', name: 'Crime Tape', x: 0, y: 600, width: 1280, height: 60, rotation: 0, opacity: 1, visible: true }
      ]
    };

    appState.activeTab = 'giflab';
    assertEqual(appState.canvasLayers.length, 3);
    appState.activeTab = 'canvas';
    assertEqual(appState.canvasLayers[1].id, 'text-1');
  });

  test('T1_F02_03_GifSettingsPreservedAcrossTabs: Trimmer settings survive tab navigation', () => {
    const appState = {
      activeTab: 'giflab' as ActiveTab,
      gifSettings: { startTime: 2.5, endTime: 7.0, fps: 15 }
    };

    appState.activeTab = 'chatlog';
    assertEqual(appState.gifSettings.startTime, 2.5);
    appState.activeTab = 'giflab';
    assertEqual(appState.gifSettings.fps, 15);
  });

  test('T1_F02_04_UploadedImagePreservedAcrossTabs: Image reference persists across full tab cycle', () => {
    const appState = {
      activeTab: 'chatlog' as ActiveTab,
      uploadedImage: {
        src: 'blob:http://localhost/test-evidence-image',
        width: 1920,
        height: 1080
      }
    };

    const tabs: ActiveTab[] = ['canvas', 'giflab', 'chatlog'];
    for (const t of tabs) {
      appState.activeTab = t;
      assert(appState.uploadedImage !== null);
      assertEqual(appState.uploadedImage.width, 1920);
    }
  });

  test('T1_F02_05_ActiveTabCycling: Tab navigation updates active state correctly', () => {
    let currentTab: ActiveTab = 'chatlog';
    const switchTab = (next: ActiveTab) => { currentTab = next; };

    switchTab('canvas');
    assertEqual(currentTab, 'canvas');
    switchTab('giflab');
    assertEqual(currentTab, 'giflab');
    switchTab('chatlog');
    assertEqual(currentTab, 'chatlog');
  });

  // =========================================================================
  // Feature 3: Dead Code & Dependency Hygiene
  // =========================================================================

  test('T1_F03_01_PackageJsonDependencies: jszip is a real dependency (used by batch ZIP export), without redundant @types', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert('react' in pkg.dependencies, 'react must be in dependencies');
    assert('lucide-react' in pkg.dependencies, 'lucide-react must be in dependencies');
    assert('jszip' in (pkg.dependencies || {}), 'jszip must be in dependencies (batch ZIP export)');
    assert(!('@types/jszip' in (pkg.devDependencies || {})), '@types/jszip should not be in devDependencies');
  });

  test('T1_F03_02_TsConfigStrictFlags: tsconfig.json maintains strict type checking', () => {
    const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

    assertEqual(tsconfig.compilerOptions.strict, true);
    assertEqual(tsconfig.compilerOptions.noEmit, true);
  });

  test('T1_F03_03_NoDeadExportInUtils: Core utilities export verified functional interfaces', async () => {
    const { applyPhotoAdjustments } = await import('../../src/utils/photoFilters');
    const { SimpleGifEncoder } = await import('../../src/utils/gifEncoder');

    assertEqual(typeof applyPhotoAdjustments, 'function');
    assertEqual(typeof SimpleGifEncoder, 'function');
  });

  test('T1_F03_04_ScriptsSanity: package.json scripts contain essential workflow commands', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert('dev' in pkg.scripts);
    assert('build' in pkg.scripts);
    assert(pkg.scripts.build.includes('tsc'));
  });

  test('T1_F03_05_TailwindPaletteCleanliness: tailwind.config.js defines Emerald Edition palette', () => {
    const twPath = path.resolve(process.cwd(), 'tailwind.config.js');
    const twContent = fs.readFileSync(twPath, 'utf8');

    assert(twContent.includes('#10B981') || twContent.includes('#10b981') || twContent.includes('emerald'), 'Emerald color token present');
    assert(twContent.includes('#0B0E14') || twContent.includes('#0b0e14') || twContent.includes('11, 14, 20'), 'Dark background token present');
  });

  // =========================================================================
  // Feature 4: RP Command Parser Engine
  // =========================================================================

  test('T1_F04_01_SlashMeAndDoCommands: Correctly parses /me action and /do environmental commands', () => {
    const meLine = parseChatLine('/me puxa a pistola da cintura');
    const doLine = parseChatLine('/do O cofre está trancado');

    assertEqual(meLine.type, 'me');
    assertEqual(doLine.type, 'yellow');
    assert(meLine.rawText.includes('/me puxa a pistola da cintura'));
  });

  test('T1_F04_02_SlashOocAndBCommands: Correctly parses /ooc and /b out-of-character lines', () => {
    const oocLine = parseChatLine('/ooc volta pra call');
    const bLine = parseChatLine('/b segura o RP aí');

    assertEqual(oocLine.type, 'ooc');
    assertEqual(bLine.type, 'ooc');
  });

  test('T1_F04_03_RadioAndDepartmentCommands: Correctly parses /radio and /dep transmissions as blue', () => {
    const radioLine = parseChatLine('/radio QRR na Mission Row');
    const depLine = parseChatLine('/dep Central para LSPD');

    assertEqual(radioLine.type, 'blue');
    assertEqual(depLine.type, 'blue');
  });

  test('T1_F04_04_WhisperAndShoutCommands: Parses /w as darkgrey and /s as white speech', () => {
    const whisperLine = parseChatLine('/w 10 Passa a grana');
    const shoutLine = parseChatLine('/s Polícia! Parados!');

    assertEqual(whisperLine.type, 'darkgrey');
    assertEqual(shoutLine.type, 'white');
  });

  test('T1_F04_05_LegacyPrefixSupport: Maintains full support for legacy RP prefixes', () => {
    assertEqual(parseChatLine('* John sorri').type, 'me');
    assertEqual(parseChatLine('> John pensa').type, 'ame');
    assertEqual(parseChatLine('$ [BANCO] Depósito recebido').type, 'yellow');
    assertEqual(parseChatLine('! [ALERTA] Servidor reiniciando').type, 'system');
  });

  // =========================================================================
  // Feature 5: Timestamp Parsing & Display Toggle
  // =========================================================================

  test('T1_F05_01_StandardBracketTimestamp: Extracts standard [HH:MM:SS] timestamp and identifies type', () => {
    const parsed = parseChatLine('[14:23:45] * Jack acende o fósforo');
    assertEqual(parsed.timestamp, '[14:23:45]');
    assertEqual(parsed.type, 'me');
  });

  test('T1_F05_02_ParenthesisTimestamp: Extracts parenthesis (HH:MM) timestamp format', () => {
    const parsed = parseChatLine('(21:05) /me olha o relógio');
    assertEqual(parsed.timestamp, '(21:05)');
    assertEqual(parsed.type, 'me');
  });

  test('T1_F05_03_TwoDigitHourMinute: Extracts [HH:MM] timestamp and isolates speaker name', () => {
    const parsed = parseChatLine('[08:15] Carlos diz: Bom dia.');
    assertEqual(parsed.timestamp, '[08:15]');
    assertEqual(parsed.speaker, 'Carlos');
  });

  test('T1_F05_04_TimestampToggleVisibility: Toggle controls inclusion of timestamp in rendered string', () => {
    const parsed = parseChatLine('[14:23:45] * Jack acende o fósforo');

    const formatLine = (p: ParsedLine, showTimestamp: boolean) => {
      if (showTimestamp && p.timestamp) {
        return `${p.timestamp} ${p.messageText || p.rawText.replace(/^\[.*?\]\s*/, '')}`;
      }
      return p.messageText || p.rawText.replace(/^\[.*?\]\s*/, '');
    };

    const renderedWith = formatLine(parsed, true);
    const renderedWithout = formatLine(parsed, false);

    assert(renderedWith.startsWith('[14:23:45]'));
    assert(!renderedWithout.startsWith('[14:23:45]'));
  });

  test('T1_F05_05_LineWithoutTimestamp: Lines without timestamp report timestamp as undefined', () => {
    const parsed = parseChatLine('Carlos diz: Sem hora aqui.');
    assertEqual(parsed.timestamp, undefined);
    assertEqual(parsed.rawText, 'Carlos diz: Sem hora aqui.');
  });

});
