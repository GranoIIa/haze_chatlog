/**
 * Challenger M7 Empirical Verification & Stress Test (HAZE-OSS-001)
 *
 * Covers:
 * 1. License Tree & Contagion Audit (node_modules, package.json, jszip, mediabunny, lucide, timeline)
 * 2. MPL-2.0 Section 3.3 and 1.7 verbatim verification in mediabunny
 * 3. Backward Compatibility & Schema Invariant stress-tests (.haze v1, .haze v2, matchesSaved)
 * 4. Contract Discrepancy Stress-Test: Section 5.3 Streaming POC vs VideoStudioView.tsx consumers
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  parseVideoProject,
  buildVideoProjectBlob,
  matchesSaved,
  SavedMedia
} from '../src/video/videoProject';
import {
  parseProjectFile,
  buildProjectBlob,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  SCENE_SCHEMA_VERSION,
  ProjectError
} from '../src/utils/projectFile';
import { Timeline } from '../src/video/timeline';
import { StreamTarget, BufferTarget, Target } from 'mediabunny';

let passed = 0;
let failed = 0;

function assert(cond: boolean, desc: string) {
  if (cond) {
    console.log(`[PASS] ${desc}`);
    passed++;
  } else {
    console.error(`[FAIL] ${desc}`);
    failed++;
    throw new Error(`Assertion failed: ${desc}`);
  }
}

async function runAudit() {
  console.log('===============================================================');
  console.log('   HAZE-OSS-001 CHALLENGER EMPIRICAL VERIFICATION AUDIT       ');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // PART 1: DEPENDENCY TREE & LICENSE CONTAGION
  // -------------------------------------------------------------
  console.log('--- 1. DEPENDENCY TREE & LICENSE CONTAGION AUDIT ---');

  const pkgJsonPath = path.resolve('package.json');
  const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const prodDeps = Object.keys(pkgData.dependencies || {});
  console.log(`Declared production dependencies (${prodDeps.length}):`, prodDeps.join(', '));

  assert(prodDeps.includes('mediabunny'), 'mediabunny is in dependencies');
  assert(prodDeps.includes('jszip'), 'jszip is in dependencies');
  assert(prodDeps.includes('@xzdarcy/react-timeline-editor'), '@xzdarcy/react-timeline-editor is in dependencies');
  assert(prodDeps.includes('lucide-react'), 'lucide-react is in dependencies');

  // Verify jszip dual license
  const jszipPkg = JSON.parse(fs.readFileSync('node_modules/jszip/package.json', 'utf8'));
  assert(
    jszipPkg.license === '(MIT OR GPL-3.0-or-later)',
    `jszip SPDX license is '(MIT OR GPL-3.0-or-later)' (got '${jszipPkg.license}')`
  );

  const jszipLicenseText = fs.readFileSync('node_modules/jszip/LICENSE.markdown', 'utf8');
  assert(
    jszipLicenseText.includes('JSZip is dual licensed. At your choice you may use it under the MIT license'),
    'jszip LICENSE.markdown explicitly confirms choice of MIT license without GPL contagion'
  );

  // Scan all packages in node_modules
  const nmDir = path.resolve('node_modules');
  const scannedLicenses: Record<string, string> = {};
  const copyleftViolations: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('@')) {
          scanDir(full);
        } else {
          const pjson = path.join(full, 'package.json');
          if (fs.existsSync(pjson)) {
            try {
              const p = JSON.parse(fs.readFileSync(pjson, 'utf8'));
              const lic = p.license || (p.licenses ? JSON.stringify(p.licenses) : 'UNKNOWN');
              scannedLicenses[p.name || ent.name] = lic;

              const upper = String(lic).toUpperCase();
              if (
                (upper.includes('GPL') || upper.includes('AGPL')) &&
                !upper.includes('MIT OR') && // allow dual-license where MIT is option
                !upper.includes('APACHE')
              ) {
                copyleftViolations.push(`${p.name} (${lic})`);
              }
            } catch (e) {}
          }
          const subNm = path.join(full, 'node_modules');
          if (fs.existsSync(subNm)) scanDir(subNm);
        }
      }
    }
  }
  scanDir(nmDir);

  console.log(`Audited ${Object.keys(scannedLicenses).length} total packages in node_modules.`);
  console.log('Unshielded Viral Copyleft Violations (GPL/AGPL without permissive alternative):', copyleftViolations);
  assert(copyleftViolations.length === 0, 'Zero unshielded viral copyleft (GPL/AGPL) packages found in node_modules');

  // -------------------------------------------------------------
  // PART 2: MEDIABUNNY MPL-2.0 SECTION 3.3 AND 1.7 VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 2. MEDIABUNNY MPL-2.0 SECTION 3.3 VERIFICATION ---');

  const mbLicensePath = path.resolve('node_modules/mediabunny/LICENSE');
  assert(fs.existsSync(mbLicensePath), 'node_modules/mediabunny/LICENSE exists');

  const mbLicense = fs.readFileSync(mbLicensePath, 'utf8');

  // Verify Title
  assert(mbLicense.includes('Mozilla Public License Version 2.0'), 'License title is MPL 2.0');

  // Verify Section 1.7 definition of Larger Work
  assert(
    mbLicense.includes('1.7. "Larger Work"\n    means a work that combines Covered Software with other material, in\n    a separate file or files, that is not Covered Software.'),
    'Section 1.7 verbatim matches definition of Larger Work (separate files)'
  );

  // Verify Section 1.10 definition of Modifications
  assert(
    mbLicense.includes('1.10. "Modifications"'),
    'Section 1.10 defines Modifications'
  );

  // Verify Section 3.3 Distribution of a Larger Work
  assert(
    mbLicense.includes('3.3. Distribution of a Larger Work\n\nYou may create and distribute a Larger Work under terms of Your choice'),
    'Section 3.3 permits distribution of Larger Work under terms of Your choice'
  );

  // Verify Exhibit B absence
  const mbPkgJson = JSON.parse(fs.readFileSync('node_modules/mediabunny/package.json', 'utf8'));
  assert(mbPkgJson.license === 'MPL-2.0', 'mediabunny package.json declares MPL-2.0');

  // Check whether mediabunny has any secondary licenses or Exhibit B
  let foundExhibitB = false;
  function searchMB(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) searchMB(full);
      else if (ent.name.endsWith('.js') || ent.name.endsWith('.d.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('Incompatible With Secondary Licenses')) foundExhibitB = true;
      }
    }
  }
  searchMB('node_modules/mediabunny');
  assert(!foundExhibitB, 'No Exhibit B ("Incompatible With Secondary Licenses") found in mediabunny files');

  // -------------------------------------------------------------
  // PART 3: BACKWARD COMPATIBILITY & .HAZE SCHEMA STRESS-TEST
  // -------------------------------------------------------------
  console.log('\n--- 3. BACKWARD COMPATIBILITY & .HAZE SCHEMA STRESS-TEST ---');

  // Test 3.1: Rejecting Scene Project (v1) in Video Studio
  const sceneBlob = await buildProjectBlob({
    scene: {
      darkening: 0.15,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, depthOfField: 0, vignette: 0, grain: 0, letterbox: false, colorPreset: 'none' },
      rawText: 'Test RP text',
      fontSize: 20,
      fontFamily: 'Arial',
      lineHeightFactor: 1.5,
      strokeEnabled: true,
      strokeWidth: 2,
      strokeColor: '#000000',
      bgEnabled: false,
      bgColor: '#000000',
      bgOpacity: 0.6,
      maxWidthPercent: 85,
      shadowEnabled: false,
      censorStyle: 'mosaic',
      showTimestamps: true,
      chatPos: { x: 40, y: 50 },
      characters: [],
      outputRes: null,
      fitMode: 'cover',
      panX: 0,
      panY: 0,
      zoom: 100,
      lighting: { enabled: false, color: '#ffffff', intensity: 1, angle: 0, distance: 0 },
      camera: { enabled: false, fov: 60, blur: 0 },
      canvasLayers: []
    },
    background: null,
    imageLayers: [],
    assets: new Map()
  });

  let caughtSceneInVideo = false;
  let sceneErrMsg = '';
  try {
    await parseVideoProject(sceneBlob);
  } catch (e: any) {
    caughtSceneInVideo = true;
    sceneErrMsg = e.message;
  }
  assert(caughtSceneInVideo, 'Opening Schema 1 Scene project in parseVideoProject is safely rejected');
  assert(
    sceneErrMsg === 'Este é um projeto do Editor RP (foto e chat), sem vídeo. Abra-o na aba Editor RP.',
    `Rejection message matches expected user-facing copy: "${sceneErrMsg}"`
  );

  // Test 3.2: Round-trip Schema 2 Video Project
  const sampleTimeline: Timeline = {
    version: 1,
    clips: [
      { id: 'c1', mediaId: 'm1', inPoint: 0, outPoint: 10, volume: 1.0, speed: 1.0 },
      { id: 'c2', mediaId: 'm2', inPoint: 5, outPoint: 12, volume: 0.8, speed: 1.5 }
    ],
    overlays: [
      { id: 'o1', start: 1, duration: 4, text: 'Polícia: Mãos na cabeça!', x: 50, y: 50, fontSize: 18 }
    ],
    layers: [
      { id: 'l1', mediaId: 'm2', start: 2, inPoint: 0, outPoint: 5, volume: 0.5, base: { x: 0.8, y: 0.8, scale: 0.3, opacity: 1 } }
    ]
  };

  const sampleMedia: SavedMedia[] = [
    { id: 'm1', name: 'patrol_capture.mp4', size: 104857600, duration: 60.0, width: 1920, height: 1080, hasAudio: true },
    { id: 'm2', name: 'cctv_bank.mp4', size: 52428800, duration: 30.0, width: 1280, height: 720, hasAudio: false }
  ];

  const videoBlob = await buildVideoProjectBlob(sampleTimeline, sampleMedia);
  assert(videoBlob.size > 100, `Video project ZIP blob generated (${videoBlob.size} bytes)`);

  const parsedVideo = await parseVideoProject(videoBlob);
  assert(parsedVideo.media.length === 2, `Parsed 2 media items (got ${parsedVideo.media.length})`);
  assert(parsedVideo.timeline.clips.length === 2, `Parsed 2 timeline clips (got ${parsedVideo.timeline.clips.length})`);
  assert(parsedVideo.timeline.layers?.length === 1, `Parsed 1 PiP layer (got ${parsedVideo.timeline.layers?.length})`);
  assert(parsedVideo.warnings.length === 0, 'Zero warnings on clean round-trip');

  // Test 3.3: matchesSaved Fingerprinting Logic (±0.05s threshold)
  const savedItem: SavedMedia = {
    id: 'm1',
    name: 'pursuit.mp4',
    size: 20000000,
    duration: 42.50,
    width: 1920,
    height: 1080,
    hasAudio: true
  };

  assert(matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.50), 'Exact match succeeds');
  assert(matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.54), 'Match within +0.04s succeeds');
  assert(matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.46), 'Match within -0.04s succeeds');
  assert(matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.55), 'Match exactly on +0.05s succeeds');
  assert(!matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.56), 'Delta +0.06s is rejected');
  assert(!matchesSaved(savedItem, { name: 'pursuit.mp4', size: 20000000 }, 42.44), 'Delta -0.06s is rejected');
  assert(!matchesSaved(savedItem, { name: 'other.mp4', size: 20000000 }, 42.50), 'Different name is rejected');
  assert(!matchesSaved(savedItem, { name: 'pursuit.mp4', size: 19999999 }, 42.50), 'Different size is rejected');

  // -------------------------------------------------------------
  // PART 4: CONTRACT BREAKING RISK OF SECTION 5.3 STREAMING POC
  // -------------------------------------------------------------
  console.log('\n--- 4. CONTRACT INTEGRATION CHALLENGE (Section 5.3 POC vs UI) ---');

  // Inspect caller in VideoStudioView.tsx
  const studioViewCode = fs.readFileSync('src/components/VideoStudio/VideoStudioView.tsx', 'utf8');

  // Vulnerability check: VideoStudioView calls URL.createObjectURL(r.blob)
  const hasCreateObjectURL = studioViewCode.includes('URL.createObjectURL(r.blob)');
  assert(hasCreateObjectURL, 'VideoStudioView.tsx line 403 assumes r.blob is non-null: `URL.createObjectURL(r.blob)`');

  const hasBlobSizeRead = studioViewCode.includes('r.blob.size');
  assert(hasBlobSizeRead, 'VideoStudioView.tsx line 404 & 738 assumes r.blob is non-null: `r.blob.size`');

  // Demonstrate failure if blob is null
  let threwOnNullBlob = false;
  try {
    const fakeResult: any = { blob: null, streamedToDisk: true };
    // Simulated line 403 execution:
    const url = URL.createObjectURL(fakeResult.blob);
  } catch (e: any) {
    threwOnNullBlob = e instanceof TypeError;
  }
  assert(threwOnNullBlob, 'Passing null blob to URL.createObjectURL throws TypeError');

  console.log('\n===============================================================');
  console.log(`   FINAL SUMMARY: ${passed + failed} assertions | ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) process.exit(1);
}

runAudit().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
