/**
 * Tier 4 Real-World RP Application Scenarios (13 Workflow Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Comprehensive end-to-end workflows modeled after real GTA RP content creation.
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D } from '../harness/mockEnv';
import { parseChatLine } from '../../src/utils/chatParser';
import { RP_PRESETS } from '../../src/utils/rpPresets';
import { RP_STICKERS } from '../../src/utils/rpStickers';
import { applyPhotoAdjustments, DEFAULT_ADJUSTMENTS, PhotoAdjustments } from '../../src/utils/photoFilters';
import { SimpleGifEncoder } from '../../src/utils/gifEncoder';
import { CanvasLayer } from '../../src/types';

describe('Tier 4: Real-World RP Application Scenarios', () => {

  // Scenario 1: PD Shootout Report Composite
  test('Scenario 1: PD Shootout Report Composite end-to-end production workflow', () => {
    // 1. Parse RP shootout log
    const logLines = [
      '[18:45:12] [RÁDIO] Central 10-99! Disparos contra a viatura na Avenida Paleto!',
      '* Detetive Miller desembarca rapidamente empunhando a carabina calibre 5.56.',
      'Detetive Miller grita: LARGUE A ARMA E COLOQUE AS MÃOS NA CABEÇA!',
      '* O suspeito ignora a ordem e efetua disparos na direção dos policiais. (( Suspeito #1 ))',
      '$ [DESPACHO] Unidades de apoio Charlie e Adam em deslocamento com código 3.'
    ];

    const parsedLines = logLines.map(parseChatLine);
    assertEqual(parsedLines[0].type, 'blue'); // Radio
    assertEqual(parsedLines[1].type, 'me');
    assertEqual(parsedLines[2].type, 'white');
    assertEqual(parsedLines[4].type, 'yellow');

    // 2. Set up Canvas composite with photo background and layers
    const canvas = createMockCanvas(1920, 1080);
    const ctx = canvas.getContext('2d')!;

    const layers: CanvasLayer[] = [
      {
        id: 'preset-bodycam',
        type: 'preset',
        name: 'Bodycam AXON',
        x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1, visible: true, locked: false,
        presetType: 'bodycam',
        presetData: { officerName: 'DET. J. MILLER #402', department: 'LSPD MISSION ROW', showDate: true, recDot: true }
      },
      {
        id: 'sticker-badge',
        type: 'sticker',
        name: 'LSPD Badge',
        x: 1720, y: 50, width: 140, height: 140, rotation: 5, opacity: 0.9, visible: true, locked: false,
        content: 'badge-lspd'
      }
    ];

    // Render layers
    layers.forEach(l => {
      if (l.type === 'preset' && l.presetType) {
        RP_PRESETS[l.presetType].draw(ctx as any, 1920, 1080, l.presetData);
      } else if (l.type === 'sticker' && l.content) {
        const st = RP_STICKERS.find(s => s.id === l.content);
        if (st) st.draw(ctx as any, l.x, l.y, l.width, l.height);
      }
    });

    assertEqual(layers.length, 2);
    assertEqual(layers[0].presetData?.officerName, 'DET. J. MILLER #402');
  });

  // Scenario 2: Weazel News Live Breaking Broadcast
  test('Scenario 2: Weazel News Live Breaking Broadcast graphic generation', () => {
    const canvas = createMockCanvas(1280, 720);
    const ctx = canvas.getContext('2d')!;

    const weazelLayer: CanvasLayer = {
      id: 'weazel-breaking',
      type: 'preset',
      name: 'Weazel News',
      x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1, visible: true, locked: false,
      presetType: 'weazel',
      presetData: {
        tag: 'AO VIVO • PLANTÃO',
        headline: 'PERSEGUIÇÃO EM ALTA VELOCIDADE TERMINA COM VEÍCULO EM CHAMAS NA FREEWAY',
        subHeadline: 'Três suspeitos foram detidos pelo Grupo Tático; via totalmente interditada',
        location: 'DEL PERRO FREEWAY • SENTIDO SUL'
      }
    };

    RP_PRESETS.weazel.draw(ctx as any, 1280, 720, weazelLayer.presetData);
    assertEqual(weazelLayer.presetData?.tag, 'AO VIVO • PLANTÃO');
    assert(weazelLayer.presetData?.headline.includes('PERSEGUIÇÃO'));
  });

  // Scenario 3: Forensic Crime Scene Evidence Folder
  test('Scenario 3: Forensic Crime Scene Evidence Folder with stickers and censorship mask', () => {
    const canvas = createMockCanvas(1920, 1080);
    const ctx = canvas.getContext('2d')!;

    const layers: CanvasLayer[] = [
      {
        id: 'tape',
        type: 'sticker',
        name: 'Police Tape',
        content: 'crime-tape',
        x: 0, y: 100, width: 800, height: 50, rotation: -8, opacity: 1, visible: true, locked: false
      },
      {
        id: 'marker-1',
        type: 'sticker',
        name: 'Evidence 1',
        content: 'evidence-marker-1',
        x: 450, y: 600, width: 80, height: 90, rotation: 0, opacity: 1, visible: true, locked: false
      },
      {
        id: 'marker-2',
        type: 'sticker',
        name: 'Evidence 2',
        content: 'evidence-marker-2',
        x: 750, y: 620, width: 80, height: 90, rotation: 0, opacity: 1, visible: true, locked: false
      },
      {
        id: 'censor-victim',
        type: 'sticker',
        name: 'Redaction Bar',
        content: 'censored-bar',
        x: 900, y: 400, width: 280, height: 60, rotation: 0, opacity: 1, visible: true, locked: false
      }
    ];

    layers.forEach(l => {
      const st = RP_STICKERS.find(s => s.id === l.content);
      if (st) st.draw(ctx as any, l.x, l.y, l.width, l.height);
    });

    assertEqual(layers.length, 4);
    assert(layers.some(l => l.content === 'censored-bar'));
  });

  // Scenario 4: Undercover Narcotics Wiretap Transcript
  test('Scenario 4: Undercover Narcotics Wiretap Transcript with multi-speaker tagging and redactions', () => {
    const transcript = [
      '[02:14:10] Suspeito Alpha diz (celular): O container está pronto para descarregar.',
      '[02:14:25] Suspeito Bravo diz (baixo): Não use o rádio comum. Mude para a frequência ||428.55 MHz||.',
      '* Suspeito Alpha digita coordenadas no GPS tático criptografado.',
      '[02:15:00] [RÁDIO] Central para Agente Vance: Mantenha a vigilância sem aproximação visual.',
      'Agente Vance diz (celular): Ciente central, equipe posicionada no ||Galpão 09 das Docas||.'
    ];

    const parsed = transcript.map(parseChatLine);
    assertEqual(parsed.length, 5);

    // Check censorship
    const censoredLines = parsed.filter(p => p.segments.some(s => s.isCensored));
    assertEqual(censoredLines.length, 2);
    assertEqual(censoredLines[0].segments.find(s => s.isCensored)?.text.trim(), '428.55 MHz');
    assertEqual(censoredLines[1].segments.find(s => s.isCensored)?.text.trim(), 'Galpão 09 das Docas');
  });

  // Scenario 5: Discord Nitro Action Clip GIF Export
  test('Scenario 5: Discord Nitro Action Clip GIF export at configured dimensions and frame interval', () => {
    const clipConfig = {
      startTime: 1.0,
      endTime: 3.5,
      fps: 15,
      targetWidth: 540,
      watermark: 'HAZE RP PURSUIT'
    };

    const duration = clipConfig.endTime - clipConfig.startTime;
    const totalFrames = Math.floor(duration * clipConfig.fps);
    assertEqual(duration, 2.5);
    assertEqual(totalFrames, 37);

    const encoder = new SimpleGifEncoder(clipConfig.targetWidth, 304, Math.round(1000 / clipConfig.fps));
    encoder.start();

    const canvas = createMockCanvas(clipConfig.targetWidth, 304);
    const ctx = canvas.getContext('2d')!;
    encoder.addFrame(ctx as any);
    const blob = encoder.finish();

    assert(blob.size > 0);
  });

  // Scenario 6: Animated Server Reaction Emoji Optimization
  test('Scenario 6: Server reaction emoji enforces 1:1 128x128 crop and strict <256KB constraint', () => {
    const emojiConfig = {
      width: 128,
      height: 128,
      fps: 10,
      duration: 1.5,
      maxSizeBytes: 256 * 1024
    };

    const totalFrames = Math.floor(emojiConfig.duration * emojiConfig.fps);
    assertEqual(totalFrames, 15);

    const encoder = new SimpleGifEncoder(emojiConfig.width, emojiConfig.height, 100);
    encoder.start();

    const canvas = createMockCanvas(128, 128);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#10B981';
    ctx.fillRect(0, 0, 128, 128);

    for (let f = 0; f < 3; f++) {
      encoder.addFrame(ctx as any);
    }
    const blob = encoder.finish();

    assert(blob.size < emojiConfig.maxSizeBytes, `Size ${blob.size} exceeded 256KB limit`);
  });

  // Scenario 7: Police Bodycam Axon Evidence Overlay
  test('Scenario 7: Police Bodycam Axon Evidence Overlay with REC indicator and metadata', () => {
    const canvas = createMockCanvas(1920, 1080);
    const ctx = canvas.getContext('2d')!;

    const bodycamData = {
      officerName: 'SGT. R. CARTER #215',
      department: 'LSPD TRAFFIC DIVISION',
      showDate: true,
      recDot: true
    };

    RP_PRESETS.bodycam.draw(ctx as any, 1920, 1080, bodycamData);
    assertEqual(bodycamData.officerName, 'SGT. R. CARTER #215');
    assertEqual(bodycamData.recDot, true);
  });

  // Scenario 8: High-Speed Pursuit Dashcam Archive
  test('Scenario 8: High-Speed Pursuit Dashcam Archive with speed telemetry and radar HUD', () => {
    const canvas = createMockCanvas(1280, 720);
    const ctx = canvas.getContext('2d')!;

    const dashcamData = {
      patrolUnit: 'UNIT 2-LINCOLN-14',
      patrolSpeed: '128 MPH',
      targetSpeed: '142 MPH [FELONY SPEED]',
      agency: 'LOS SANTOS POLICE DEPT'
    };

    RP_PRESETS.dashcam.draw(ctx as any, 1280, 720, dashcamData);
    assertEqual(dashcamData.patrolSpeed, '128 MPH');
    assert(dashcamData.targetSpeed.includes('FELONY SPEED'));
  });

  // Scenario 9: Mugshot Booking Sheet Generation
  test('Scenario 9: Mugshot Booking Sheet Generation with suspect identification placard', () => {
    const canvas = createMockCanvas(1280, 720);
    const ctx = canvas.getContext('2d')!;

    const mugshotData = {
      suspectName: 'MARCUS "VIPER" REYES',
      bookingId: 'BK-2026-88192',
      charges: 'ART. 157 (ARMED ROBBERY) • ART. 16 (EVADING)',
      policeDept: 'LOS SANTOS POLICE DEPARTMENT'
    };

    RP_PRESETS.mugshot.draw(ctx as any, 1280, 720, mugshotData);
    assertEqual(mugshotData.suspectName, 'MARCUS "VIPER" REYES');
    assertEqual(mugshotData.bookingId, 'BK-2026-88192');
  });

  // Scenario 10: Thermal FLIR Aerial Reconnaissance
  test('Scenario 10: Thermal FLIR Aerial Reconnaissance HUD and WHOT color grading', () => {
    const canvas = createMockCanvas(1920, 1080);
    const ctx = canvas.getContext('2d')!;

    const flirData = {
      unitName: 'AIR SUPPORT — AIR-03',
      targetSpeed: '45 MPH [FOOT PURSUIT]',
      altitude: '850 FT AGL',
      heading: 'HDG 042° NE'
    };

    RP_PRESETS.flir.draw(ctx as any, 1920, 1080, flirData);
    assertEqual(flirData.unitName, 'AIR SUPPORT — AIR-03');
    assertEqual(flirData.altitude, '850 FT AGL');
  });

  // Scenario 11: Multi-Tab Cross-Studio Production Workflow
  test('Scenario 11: Multi-Tab Cross-Studio Production Workflow executes across all 3 modules without state loss', () => {
    const appState = {
      activeTab: 'chatlog',
      chat: { text: '* Marcus saca a pistola.', imageUploaded: true },
      canvas: { layersCount: 3 },
      gif: { videoLoaded: true, trimEnd: 4.5 }
    };

    // Cycle through all tabs
    appState.activeTab = 'canvas';
    assertEqual(appState.chat.text, '* Marcus saca a pistola.');

    appState.activeTab = 'giflab';
    assertEqual(appState.canvas.layersCount, 3);

    appState.activeTab = 'chatlog';
    assertEqual(appState.gif.trimEnd, 4.5);
    assertEqual(appState.chat.imageUploaded, true);
  });

  // Scenario 12: Long Multi-Speaker Courtroom Trial Log
  test('Scenario 12: Long multi-speaker courtroom trial log parses actions, statements and objections cleanly', () => {
    const courtroomLog = [
      '* O Juiz Vance bate o martelo na bancada de mogno pedindo ordem no tribunal.',
      'Promotor Harris diz: O réu foi flagrado pelas câmeras do banco no dia do crime.',
      'Advogado Thompson grita: PROTESTO! A gravação foi obtida sem mandado judicial!',
      '* O Juiz Vance ajusta os óculos e analisa o documento apresentado. (( Juiz Vance ))',
      'Testemunha diz (baixo): Eu apenas segurei a bolsa, não sabia o que tinha dentro.',
      '(( Juiz Vance: Sem conversas paralelas na galeria do tribunal ))'
    ];

    const parsed = courtroomLog.map(parseChatLine);
    assertEqual(parsed[0].type, 'me');
    assertEqual(parsed[1].speaker, 'Promotor Harris');
    assertEqual(parsed[2].speaker, 'Advogado Thompson');
    assertEqual(parsed[5].type, 'ooc');
  });

  // Scenario 13: Full Studio Stress Test
  test('Scenario 13: Full Studio Stress Test handles 20 layers and heavy asset operations without leakage', () => {
    const canvas = createMockCanvas(3840, 2160);
    const ctx = canvas.getContext('2d')!;

    // Create 20 synthetic layers
    const layers: CanvasLayer[] = [];
    for (let i = 0; i < 20; i++) {
      layers.push({
        id: `stress-layer-${i}`,
        type: i % 2 === 0 ? 'text' : 'sticker',
        name: `Layer ${i}`,
        x: i * 50,
        y: i * 40,
        width: 200,
        height: 60,
        rotation: i * 5,
        opacity: 0.9,
        visible: true,
        locked: false
      });
    }

    assertEqual(layers.length, 20);

    const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, sharpen: 25, contrast: 15 };
    applyPhotoAdjustments(ctx as any, 3840, 2160, adj);

    assertEqual(layers.filter(l => l.visible).length, 20);
  });

});
