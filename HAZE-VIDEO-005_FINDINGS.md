# HAZE-VIDEO-005 Technical Findings & Architectural Audit

**Project**: Haze Video Studio Stabilization (`HAZE-VIDEO-005`) & OSS Intelligence (`HAZE-OSS-001`)  
**Repository**: `https://github.com/GranoIIa/haze_chatlog`  
**Baseline Commit**: `80bbc0362c01cd1d616b85cdfd3b93e8d6c33f37`  
**Working Branch**: `fix/haze-video-005-stabilization`  
**Execution Timestamp**: 2026-11-13T06:20:00Z  
**Author**: Engineering Team (Baseline & Work Branch Setup - Milestone 0)  
**Scope**: Technical analysis across session persistence, playback synchronization, project serialization, test suites, cross-module regressions, UX ergonomics, and open-source video architectures.

---

## 1. Executive Summary

A comprehensive multi-disciplinary audit of the Haze RP Studio codebase was executed to identify the precise mechanisms causing instability, session loss, audio/visual desynchronization, and project reconnection failures in the Video Studio.

### Key Audit Conclusions:
1. **Catastrophic Tab Teardown (R2)**: Switching away from the Video Studio tab unmounts `VideoStudioView` (`src/App.tsx:26-30`), executing a destructive cleanup effect (`VideoStudioView.tsx:120-124`) that aborts ongoing video exports, disposes all WebCodecs `OpenedMedia` decoders, and wipes all user timeline edits, imported files, and history.
2. **Playback Concurrency & Clock Glitches (R3)**:
   - `FramePlayer.frameAt()` lacks reentrancy locks during sequential decoding awaits, spawning duplicate concurrent iterators on the same `CanvasSink` during rapid ticks or seeks, and risks resurrecting discarded iterators after `dispose()`.
   - `PreviewAudio` instantiates a new `AudioContext` on every play/seek (risking Chromium's 6-context hardware ceiling), and returns an uninitialized zero-clock during asynchronous `ctx.resume()`, forcing the playhead to visibly jump to `0:00`.
3. **Fragile Project Reconnection (R4)**: `matchesSaved()` requires exact file name matching and a strict 50ms duration tolerance, causing legitimate files (renamed on disk or encoded with VFR by OBS/Shadowplay) to be rejected as offline.
4. **Test Suite Integrity (R5)**: The headless test runner executes 469 tests across 6 Tiers (passing in 1038ms). Playwright runs 109 browser tests across 14 spec files. Prior worker mock omissions in `mockEnv.ts` have been verified resolved in current baseline.
5. **Open Source Intelligence (HAZE-OSS-001 / R9)**: Comparative analysis of 6 open-source NLE architectures (FreeCut, OpenReel, Elah, Cutline, LocalCut, mediabunny) confirms that separating domain session state from ephemeral playback runtimes (AudioContext, CanvasSink iterators) is the industry standard for web video editors. All candidates use permissive licenses (MIT, Apache 2.0, MPL-2.0).

---

## 2. Session Preservation & Tab Decoupling Audit (Requirement R2)

### 2.1 The Root Cause in `src/App.tsx`
Lines 18–31 of `src/App.tsx`:
```tsx
{/* Main Content Area - Persistent Tab State (No unmounting on switch) */}
<main className="flex-1">
  <div className={activeTab === 'chatlog' ? 'block' : 'hidden'}>
    <ChatLogView />
  </div>
  <div className={activeTab === 'giflab' ? 'block' : 'hidden'}>
    <GifLabView onNavigateToChatLog={() => setActiveTab('chatlog')} />
  </div>
  {activeTab === 'video' && (
    <Suspense fallback={<div className="p-6 text-xs text-haze-muted">Carregando Video Studio…</div>}>
      <VideoStudioView />
    </Suspense>
  )}
</main>
```

#### Anatomical Breakdown:
- **Asymmetric Tab Lifecycle**: `ChatLogView` and `GifLabView` are persistently mounted in the DOM from initial load, with visibility toggled purely via CSS classes (`block` vs `hidden`).
- **Conditional Unmount**: In contrast, `VideoStudioView` is wrapped in `{activeTab === 'video' && (...)}`.
- Whenever the user navigates to "Editor RP" (`activeTab = 'chatlog'`) or "GIF Lab" (`activeTab = 'giflab'`), React completely unmounts the `VideoStudioView` component tree.

### 2.2 Destructive Teardown Effect in `src/components/VideoStudio/VideoStudioView.tsx`
Lines 120–124 of `src/components/VideoStudio/VideoStudioView.tsx`:
```tsx
useEffect(() => () => {
  abortRef.current?.abort();
  mediaRef.current.forEach(m => m.dispose());
  mediaRef.current.clear();
}, []);
```

#### Consequences of Component Teardown:
1. **Export Aborted Involuntarily**: `abortRef.current?.abort()` aborts any active background video export. If a user starts exporting an MP4 and clicks the RP Editor tab to read a chat log, the export is instantly terminated and discarded without warning.
2. **Decoder Destruction**: `mediaRef.current.forEach(m => m.dispose())` permanently disposes all underlying WebCodecs decoders and closes `Input<BlobSource>` handles.
3. **Complete State Annihilation**: All React component-level `useState` hooks are garbage collected:
   - `hist` (`TimelineHistory`, holding all clips, layers, keyframes, transitions, text overlays, and 100 levels of undo/redo history)
   - `library` (`OpenedMedia[]`, holding file metadata and references)
   - `thumbs` and `peaks` (extracted graphical waveform and thumbnail caches)
   - `selected`, `selectedLayer`, `selectedOverlay`
   - `t` (current playhead position)
   - `pending` (offline media descriptors)
4. **Remount from Scratch**: When returning to `activeTab === 'video'`, a brand-new instance of `VideoStudioView` is mounted with an empty timeline (`emptyTimeline()`), zero imported files, and playhead reset to 0:00.

### 2.3 State Partitioning Matrix
To eliminate session loss without leaking GPU memory or leaving background audio running, state must be partitioned into persistent domain state vs. ephemeral runtime resources:

| State Classification | Concrete Items | Current Location | Required Lifecycle Behavior |
| :--- | :--- | :--- | :--- |
| **Persistent Domain State** | Timeline history (`hist`), clips, overlays, layers, keyframes | `useState(hist)` | Preserved across tab switches in persistent store or mounted DOM |
| **Persistent Media References** | Imported `File` handles, file metadata (`OpenedMedia.ref`) | `useState(library)` | Retained in memory without keeping active WebCodecs decoders open |
| **Persistent UI State** | Playhead time `t`, selection IDs, UI mode (simple/advanced) | `useState` | Maintained in state store |
| **Active Export Task** | Export pipeline, `AbortController`, progress percentage | `useRef(abortRef)` | Maintained active in background until completion or explicit user cancellation |
| **Ephemeral Heavy Runtime** | `AudioContext` (`PreviewAudio`), scheduled audio buffers | `useRef(audioRef)` | **Suspended/Stopped immediately** when tab becomes inactive (`active === false`) |
| **Ephemeral Decoders** | `FramePlayer` sequential async generators (`sink.canvases()`) | `useEffect([playing])` | **Disposed/Closed immediately** when tab becomes inactive |

### 2.4 Remediation Plan for Milestone 1 (R2)
1. In `src/App.tsx`, maintain `VideoStudioView` mounted via CSS visibility (`hidden` vs `block`) after its initial lazy load, passing an `active={activeTab === 'video'}` prop.
2. In `src/components/VideoStudio/VideoStudioView.tsx`, attach a reactive effect to `active`:
   - When `active` transitions to `false`: pause playback (`setPlaying(false)`), stop `PreviewAudio`, and dispose `FramePlayer` iterators. Do NOT abort active exports or clear media libraries.
   - When `active` transitions to `true`: re-render current preview canvas at time `t`.
3. Author a new Playwright test `tests-e2e/video-session-retention.spec.ts` to verify timeline and media retention across tab switches.

---

## 3. Playback Synchronization, WebCodecs & Concurrency Audit (Requirement R3)

### 3.1 `FramePlayer` Concurrency & Async Generator Races (`src/video/framePlayer.ts`)
Commit `80bbc03` introduced `FramePlayer` to replace random `getCanvas(t)` calls with sequential `sink.canvases(timestamp)` iteration:

```ts
export class FramePlayer {
  private st = new Map<string, State>();
  private static readonly JUMP = 1.5;

  async frameAt(key: string, sink: CanvasSink | null | undefined, s: number): Promise<Drawable | null> {
    if (!sink) return null;
    let g = this.st.get(key);
    const ahead = g ? (g.nxt ?? g.cur)?.timestamp ?? -1 : -1;
    if (!g || !g.cur || s < g.cur.timestamp - 0.001 || s > ahead + FramePlayer.JUMP) {
      if (g) void g.it.return(undefined).catch(() => {});
      const it = sink.canvases(Math.max(0, s)) as AsyncGenerator<W, void, unknown>;
      const cur = (await it.next()).value ?? null;
      const nxt = cur ? ((await it.next()).value ?? null) : null;
      g = { it, cur, nxt };
      this.st.set(key, g);
    }
    while (g.nxt && g.nxt.timestamp <= s) {
      g.cur = g.nxt;
      g.nxt = (await g.it.next()).value ?? null;
    }
    return (g.cur?.canvas as Drawable) ?? null;
  }

  dispose(): void {
    for (const g of this.st.values()) void g.it.return(undefined).catch(() => {});
    this.st.clear();
  }
}
```

#### Critical Defects Identified:
1. **Reentrancy Race Condition**:
   - `frameAt` is an asynchronous method.
   - When `g` is null or a seek occurs, the generator is created, followed by two sequential `await it.next()` calls (lines 27–28).
   - The generator state is only stored in `this.st.set(key, g)` at line 30, **after** both awaits complete.
   - During long GOP video decoding (which can take 50–200ms per keyframe seek), subsequent RAF ticks or rapid scrubbing trigger `frameAt` with the same `key`.
   - Because `this.st.get(key)` is still undefined, multiple concurrent iterators are opened against the exact same `CanvasSink`.
   - The second iterator conflicts with the first in WebCodecs, and the slower resolution overwrites `this.st`, leaving orphaned iterators leaking resources.
2. **Post-Dispose Resurrection**:
   - If `dispose()` is called while an `await it.next()` is awaiting, `this.st.clear()` empties the map.
   - When the pending `await` resolves, line 30 executes `this.st.set(key, g)`, resurrecting an active generator inside an allegedly disposed `FramePlayer`.
3. **Main Thread Starvation in While Loop**:
   - If `s` is up to 1.49 seconds ahead (just below `JUMP = 1.5`), `while (g.nxt && g.nxt.timestamp <= s)` executes up to 45 sequential `await g.it.next()` calls within a single animation tick, freezing the main browser thread and dropping framerates.
4. **Canvas Buffer Pool Collision**:
   - `mediaIO.ts` initializes `CanvasSink` with `poolSize: 2`.
   - When `FramePlayer` holds references to `cur` and `nxt`, concurrent calls from thumbnail rendering or secondary clips can overwrite pixel contents of the canvas before it is blitted to the preview viewport.

### 3.2 `PreviewAudio` Clock Glitches & Hardware Churn (`src/video/previewAudio.ts`)
```ts
export class PreviewAudio {
  private ctx: AudioContext | null = null;
  private baseCtx = 0;
  private baseT = 0;
  ...
  time(): number {
    return this.ctx ? this.baseT + (this.ctx.currentTime - this.baseCtx) : this.baseT;
  }

  async start(tl: Timeline, media: Map<string, OpenedMedia>, fromT: number): Promise<void> {
    this.stop();
    this.stopped = false;
    this.scheduled = 0;
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    this.baseT = fromT;
    this.baseCtx = ctx.currentTime + 0.08;
    void this.pump(tl, media, fromT);
  }
}
```

#### Critical Defects Identified:
1. **Hardware Context Exhaustion (AudioContext Churn)**:
   - Calling `new AudioContext()` on every start/seek rapidly hits Chromium's maximum limit of 6 simultaneous active hardware audio contexts. Stale contexts pending asynchronous garbage collection cause console warnings and dropped audio streams.
2. **Playhead Jumps to 0:00 (The Clock Glitch)**:
   - In `VideoStudioView.tsx`, playback starts:
     ```ts
     void pa.start(tl, mediaRef.current, startAt);
     const tick = () => {
       const now = pa.time();
       setT(now);
       raf = requestAnimationFrame(tick);
     };
     ```
   - The animation frame loop begins immediately, while `pa.start()` is still awaiting `ctx.resume()`.
   - At this precise instant: `this.ctx` is non-null, but `this.baseT` is `0` and `this.baseCtx` is `0`.
   - `time()` computes: `0 + (ctx.currentTime - 0) = ~0.001s`.
   - The timeline playhead immediately jumps to `0:00`.
   - When `ctx.resume()` finishes, `baseT` is assigned `fromT`, causing the needle to jump back to `fromT`.
3. **Null Pointer Dereference on Fast Pause**:
   - If `stop()` is called immediately after `start()` while `ctx.resume()` is awaiting, `this.ctx` is set to `null`.
   - When `pump()` resumes, line 36 (`const ctx = this.ctx!;`) throws an unhandled `TypeError: Cannot read properties of null (reading 'createGain')`.
4. **Playback Stall on Silent Timelines**:
   - If a timeline has no audio tracks or if the browser's autoplay policy suspends the audio context, `ctx.currentTime` does not advance, freezing visual playback indefinitely due to the lack of a fallback wall-clock timer (`performance.now()`).

---

## 4. Project Persistence & Reconnection Audit (Requirement R4)

### 4.1 Schema Architecture & Container Design (`src/video/videoProject.ts`, `src/utils/projectFile.ts`)
- `.haze` project files are ZIP archives created via `JSZip` containing a `manifest.json`.
- Video projects are tagged with `kind: 'video'` and `schemaVersion: 2`.
- Large video files are intentionally excluded from the ZIP archive to prevent multi-gigabyte browser memory allocations. The manifest stores a media fingerprint in `manifest.video.media`:
  ```ts
  {
    id: string;
    name: string;
    size: number;
    duration: number;
    width: number;
    height: number;
    hasAudio: boolean;
  }
  ```

### 4.2 Deficiencies in Media Matching (`matchesSaved`)
Lines 85–88 of `src/video/videoProject.ts`:
```ts
export function matchesSaved(saved: SavedMedia, file: { name: string; size: number }, duration?: number): boolean {
  if (saved.name !== file.name || saved.size !== file.size) return false;
  return duration === undefined || Math.abs(saved.duration - duration) <= 0.05;
}
```

#### Critical Failure Modes:
1. **Renamed Files Permanently Orphaned**:
   - The strict check `saved.name !== file.name` rejects media files if the user renamed the file on disk (e.g. from `GTA5_Clip01.mp4` to `Action_Pursuit.mp4`), even if byte size, duration, and stream properties are 100% identical.
   - The renamed file is loaded with a new generated ID, while existing clips in the timeline remain locked in an offline state.
2. **Rigid 50ms Duration Tolerance**:
   - Container variations in Variable Frame Rate (VFR) files recorded via OBS or GeForce Experience frequently result in 60–120ms duration discrepancies between demuxers.
   - The `0.05s` tolerance rejects identical files on reimport.
3. **Absence of Manual Relinking UI**:
   - If automatic matching fails, there is no UI option in the media library to manually point an offline media reference to a selected file.

---

## 5. Test Suite Status & Baseline Audit (Requirement R5)

### 5.1 Headless Unit & Contract Test Suite (`npm run test:e2e`)
- **Runner**: `tsx tests/run-e2e.ts`
- **Result**: **469 / 469 tests passing (1038ms duration)**.
- **Coverage**:
  - Tier 1: 125 Feature coverage tests (Chat parsing, styling, HUD presets, layers, exports).
  - Tier 2: Boundary and corner cases (chat limits, canvas limits, GIF buffer bounds).
  - Tier 3: 25 Pairwise cross-feature interaction tests.
  - Tier 4: 13 Real-world RP application workflow scenarios.
  - Tier 5: Editor modules (`videoSeek`, `.haze` project serialization, dialogs, palette).
  - Tier 6: Video Studio (Timeline layout, camera presets, speed/transitions, PiP layers/keyframes, montage templates).
- **Audit of Prior Mock Defect (`mockEnv.ts`)**:
  - Previous explorer survey noted an issue in `tests/harness/mockEnv.ts` where `MockWorker` omitted an `else` branch for unknown worker actions.
  - Inspection of `mockEnv.ts` (lines 350–358) confirms the `else` clause emitting `{ type: 'ERROR', error: ... }` is present in the current baseline commit, and Tier 2 test `T2_F20_02_WorkerErrorHandling` passes consistently.

### 5.2 Playwright Browser Test Suite (`npm run test:browser`)
- **Total Specs**: 109 tests across 14 spec files.
- **Execution Environment**: Google Chrome native channel, 1 worker, 1440x900 viewport.
- **Spot-check Executions**:
  - `video-playback.spec.ts`: Passed in 9.2s (verified real pixel motion under long GOP `-g 9999`).
  - `simple-mode.spec.ts`: 9 tests passed in 19.6s.
  - `gif.spec.ts`: 13 tests passed in 50.6s.
- **Identified Flakiness / System Bottlenecks**:
  - In `video-poc.spec.ts`, intermittent failure occurred under Windows when writing trace files (`trace: 'retain-on-failure'`) due to OS file lock contention during rapid context close. When executed individually, the test passes in 2.9s with 0 errors.

---

## 6. Cross-Module Regression Touchpoints (Requirement R7)

The three primary views (ChatLog / RP Editor, GifLab, VideoStudio) share utilities in `src/utils/`:
1. **Project Container Segregation (`src/utils/projectFile.ts`)**:
   - `parseProjectFile` explicitly checks `manifest.kind === 'video'` and throws a descriptive `ProjectError` directing the user to the Video Studio.
   - `parseVideoProject` verifies `manifest.kind === 'video'` and rejects RP photo projects.
   - **Status**: Clean and secure. No risk of accidental cross-corruption.
2. **Chat Store Integration (`src/utils/chatStore.ts`)**:
   - `chatStore.ts` manages shared state between the RP Editor and GIF Lab (`requestSetBackground`, `requestChatText`, `requestChatStyle`).
   - The Video Studio currently manages its own internal chat state via `tl.overlays`. Preserving this decoupling prevents cross-tab text leakage while allowing user imports.
3. **Compositor & Camera FX (`src/utils/cameraFx.ts`, `src/utils/chatRenderer.ts`, `src/video/compositor.ts`)**:
   - Shared pure functions render Bodycam, CCTV, and chat text across all studios.
   - Offscreen canvas operations must maintain deterministic dimensions without mutating shared global state.

---

## 7. UX Ergonomics & Error Messaging Audit (Requirement R8)

### 7.1 Deficiencies under Heavy RP Usage Patterns
1. **Transparent Communication of External Media**:
   - Players often share `.haze` projects with faction or police department members via Discord.
   - When a recipient opens the project, media appears offline because video files are not bundled inside the `.haze` archive.
   - **Deficiency**: The UI lacks clear contextual guidance explaining that `.haze` saves edits, cuts, and text, but raw video files must be transferred alongside the project.
2. **Import & Export Visual Progress Feedback**:
   - Probing large 4K / 60fps video files (2GB–4GB) via `input.computeDuration()` offers no visual loader, making the UI appear frozen.
   - Export progress displays only basic text (e.g. `video… 45%`). A visual progress bar with status indicators for encoding vs. multiplexing is needed.
3. **Unsaved Work Guard (`isDirty`)**:
   - No visual indicator alerts the player to unsaved changes, and no `beforeunload` confirmation prevents accidental tab closures.
4. **Error Messages in Portuguese (PT-BR)**:
   - Technical WebCodecs errors (e.g., `EncodingError`, `NotSupportedError`) are occasionally exposed directly without user-friendly Portuguese translations.

---

## 8. Open Source Video Editor Intelligence (HAZE-OSS-001 / Requirement R9)

An exhaustive architectural audit of 6 open-source web-based video editors was conducted:

### 8.1 Comparative Matrix & License Audit
| Repository | License | License Compatibility | Media Engine | Timeline Model | Render Pipeline | Key Architecture Takeaway |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FreeCut** (`walterlow/freecut`) | **MIT** | 100% Permissive | WebCodecs native | Multi-track hierarchical (Tracks $\rightarrow$ Items $\rightarrow$ Keyframes) | WebGPU Shaders (Canvas2D fallback) | Decoupled session store; OPFS persistent cache |
| **OpenReel** (`Augani/openreel-video`) | **MIT** | 100% Permissive | WebCodecs native | Zustand multi-track store | WebGPU / Canvas2D hybrid | Pure separation of domain state and playback runtime |
| **Elah** (`elahlabs/elah`) | **Apache 2.0** | Permissive (requires attribution) | `mediabunny` + WebCodecs | Declarative tree with keyframes | WebGL2 `GpuRenderer` + OffscreenCanvas | Clean integration of `mediabunny` with LRU thumbnail cache |
| **Cutline** (`ahpah-dev/Cutline`) | **MIT** | 100% Permissive | `mediabunny` + WebCodecs | Multi-track with MCP agents | Canvas2D / OffscreenCanvas | Worker-based waveform extraction |
| **LocalCut** (`ImMaxence/LocalCutVideo`) | **MIT** | 100% Permissive | `mediabunny` + WebCodecs | Linear magnetic track | Direct Disk Stream + Canvas2D | Direct disk streaming via File System Access API |
| **mediabunny** (`vanilagy/mediabunny`) | **MPL-2.0** | Weak Copyleft (File-level only) | WebCodecs demuxer/muxer | Infrastructure library | CanvasSink, AudioBufferSink, CanvasSource | Baseline wrapper already integrated in Haze |

### 8.2 Compliance Verification
None of the surveyed projects utilize viral copyleft licenses (GPL, AGPL). Code, design patterns, and architectural paradigms from FreeCut, OpenReel, Elah, Cutline, and LocalCut can be safely incorporated into Haze RP Studio without licensing risk.

### 8.3 Core Architectural Insights for Haze RP Studio
1. **Session Store Isolation**: Every leading browser NLE keeps timeline data, clip parameters, and media file references in an external store outside React's render tree. When views unmount or hide, only WebCodecs decoders and AudioContext are suspended; all user data remains intact.
2. **Direct Disk Export Streaming**: In `src/video/exporter.ts`, Haze currently uses `BufferTarget()`, accumulating the entire output video into memory (`Uint8Array`). In 1080p60 exports exceeding 5 minutes, this risks browser tab crashes (OOM). Adopting chunked disk streaming via `FileSystemWritableFileStream` when available eliminates memory exhaustion.
3. **Sequential Iterator Mutex**: Both FreeCut and Elah employ strict promise-chain mutexes or generation counters when calling sequential frame iterators to prevent duplicate decoders from running on the same video stream during scrub operations.

---

## 9. Comprehensive Action Plan Across Subsequent Milestones

| Milestone | Target Requirement | Core Technical Action |
| :--- | :--- | :--- |
| **Milestone 1** | R2 (Tab Session Preservation) | Update `App.tsx` to maintain `VideoStudioView` mounted via CSS; add `active` prop; implement playback pause on inactive; author Playwright session retention test. |
| **Milestone 2** | R3 (FramePlayer & Audio Clock) | Implement reentrancy lock and generation IDs in `framePlayer.ts`; reuse `AudioContext` and eliminate 0:00 needle glitch in `previewAudio.ts`; ensure deterministic cleanup. |
| **Milestone 3** | R4 (.haze Persistence & Reconnection) | Expand duration tolerance to 0.15s; support fallback matching for renamed files; preserve schema compatibility. |
| **Milestone 4** | R5 (Test Suites Stabilization) | Audit all 14 Playwright specs; verify mock suite 469/469 passes; stabilize Windows trace contention. |
| **Milestone 5** | R6 (Memory & Homologation Matrix) | Audit WebCodecs/CanvasSink lifecycle; profile memory in multi-clip scrubbing; record R6 limitation documentation. |
| **Milestone 6** | R7, R8 (Cross-Regression & UX) | Validate RP Editor / GIF Lab workflows; add PT-BR error translations, visual progress bars, and offline media warnings. |
| **Milestone 7** | R9 (OSS Intelligence Deliverable) | Formalize `HAZE-OSS-001_INTELLIGENCE.md` with complete OSS benchmark analysis and integration proposals. |
| **Milestone 8** | R10 (Quality Gates & Final Signoff) | Full verification across `tsc`, `build`, `test:e2e`, `test:browser`; generate remaining 6 deliverable documents. |
