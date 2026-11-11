# Project: Haze RP Studio v2.0 Emerald Edition

## Architecture
- Modern single-page web suite built with Vite + React 18 + TypeScript + Tailwind CSS.
- **Three Core Modules**:
  1. **Chat Log Creator**: Parses GTA RP chat logs, formats commands, applies GTA-style text outlines, supports procedural mosaic censorship, super-samples canvas rendering, and exports high-resolution images.
  2. **RP Canvas Studio**: Layer-based graphics editor for RP evidence, crime scene stickers, dashcam/bodycam/news presets, photo filters, rotation/scaling, and composite exports.
  3. **Video to GIF Lab**: Client-side video-to-GIF converter with high-speed LZW encoding, Web Worker offloading, trimming controls, Discord presets (Nitro, Avatar, Emoji), and memory-safe buffer management.
- **Shared Infrastructure**:
  - Centralized TypeScript contracts in `src/types/index.ts`.
  - Consistent Emerald Edition palette (`#0B0E14`, `#121722`, `#10B981`) configured in `tailwind.config.js`.
  - Persistent state across tab switching to prevent user data loss.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Centralized Type Contracts & Presets Alignment | Align `CanvasLayer.presetType` with `'flir' \| 'dashcam'`, define full `ParsedLine`, `CanvasLayer`, and `GifExportSettings` types | M1 | Survey 1, 2, 3 |
| 2 | Tab State Persistence & Unmount Protection | Maintain state across navigation tabs so uploaded photos, chat text, canvas layers, and video trims survive tab switching | M1 | Survey 1 |
| 3 | Dead Code & Dependency Hygiene | Eliminate unused variables (`noUnusedLocals`/`noUnusedParameters`), remove dead `jszip` dependency and orphaned scripts | M1 | Survey 1 |
| 4 | RP Command Parser Engine | Support full suite of RP commands: `/me`, `/do`, `/ame`, `/ooc`, `/b`, `/s`, `/w`, `/low`, `/c`, `/r`, `/radio`, `/dep`, `/f`, `/phone`, `/sms`, `/dispatch`, `/911` | M2 | Survey 2 |
| 5 | Timestamp Parsing & Display Toggle | Robust extraction and formatting of RP timestamps `[HH:MM:SS]` or `(HH:MM)` with toggle controls | M2 | Survey 2 |
| 6 | Accurate Character State & Speaker Tagging | Match characters across speech/whisper/action contexts, separate speaker tag styling from message text | M2 | Survey 2 |
| 7 | Canvas Text Wrapping (`wrapText`) | Automatic line wrapping when text exceeds max width to eliminate glyph compression bug | M2 | Survey 2 |
| 8 | Authentic GTA Text Outline Stroke | Render solid black outline stroke (`ctx.strokeText`) around chat text for authentic game readability | M2 | Survey 2 |
| 9 | Procedural Mosaic Censorship Rendering | Render censored segments (`||...||`, `[censor]`) with deterministic pixelated mosaic or solid black bars | M2 | Survey 2 |
| 10 | Chat Log Typography & Styling UI Controls | Expose full UI controls for font size, font family, line height, text stroke, background opacity, and color | M2 | Survey 2 |
| 11 | Chat Log Drag-and-Drop & Memory Safety | Native HTML5 drag-and-drop file upload, pointer capture during dragging, and blob URL cleanup | M2 | Survey 2, 3 |
| 12 | Direct Canvas Layer Hit-Testing | Click any layer directly on the canvas to select it immediately | M3 | Survey 2 |
| 13 | Layer Property Inspector | Form controls to edit text content, font styling, layer opacity, blend mode, and preset metadata (officer name, department, speed, headline) | M3 | Survey 2 |
| 14 | Floating Image & Watermark Layers | Add custom badge, polaroid, watermark, or evidence image layers with transparency and blend modes | M3 | Survey 2 |
| 15 | Layer Transform Handles (Scale & Rotation) | Visual handles to resize and rotate layers with exact trigonometric rendering (`ctx.rotate`, `ctx.scale`) | M3 | Survey 2 |
| 16 | Background Filter Buffer Caching | Cache 3x3 convolution and photo filter adjustments in an offscreen buffer to achieve 60fps layer dragging | M3 | Survey 2 |
| 17 | Canvas Studio Drag-and-Drop & Pointer Capture | Prevent accidental browser navigation on drag-and-drop, maintain pointer capture outside canvas boundaries | M3 | Survey 2, 3 |
| 18 | High-Performance O(1) LZW GIF Encoding | Replace O(N) array search with O(1) hash map dictionary in `gifEncoder.ts` to eliminate CPU freeze | M4 | Survey 1, 3 |
| 19 | Memory-Safe Buffer Management (`Uint8Array`) | Replace JavaScript `number[]` array with preallocated `Uint8Array` chunks to eliminate 8x heap inflation | M4 | Survey 3 |
| 20 | Web Worker GIF Pipeline & Abort Controller | Offload frame capture and LZW encoding to a background Web Worker with live progress and cancel button | M4 | Survey 3 |
| 21 | Resource Lifecycle & Blob URL Revocation | Revoke all allocated object URLs on upload, re-encode, and unmount (`URL.revokeObjectURL`) | M4 | Survey 1, 3 |
| 22 | Video Seek Timeout & Playback Controls | Add seeking timeout fallback to prevent stalls, provide interactive timeline scrubber and play/pause controls | M4 | Survey 3 |
| 23 | Discord Presets with 1:1 Aspect Ratio Cropping | Implement 1:1 square cropping for Avatar/Emoji presets and target file size constraints (<256 KB for Emoji) | M4 | Survey 3 |
| 24 | Unified Emerald UI/UX & Responsive Layouts | Clean Tailwind styling using semantic `#0B0E14` / `#121722` / `#10B981` tokens, accessible contrast, and responsive layout | M5 | Survey 3 |
| 25 | Full Quality Gate & E2E Validation | Pass `npm run build` and `npx tsc --noEmit` with zero errors, verify clean browser runtime across all features | M5 | Survey 1, 2, 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Shared Infrastructure & Type Contracts | Features 1, 2, 3: `types/index.ts`, `App.tsx`, `package.json`, `tsconfig.json` | none | DONE |
| 2 | Chat Log Creator Polish & Text Engine | Features 4, 5, 6, 7, 8, 9, 10, 11: `chatParser.ts`, `ChatLogView.tsx` | M1 | DONE |
| 3 | RP Canvas Studio Ergonomics & Performance | Features 12, 13, 14, 15, 16, 17: `CanvasEditorView.tsx`, `rpPresets.ts`, `photoFilters.ts` | M1 | DONE |
| 4 | Video to GIF High-Performance Engine | Features 18, 19, 20, 21, 22, 23: `gifEncoder.ts`, `GifLabView.tsx`, worker | M1 | DONE |
| 5 | Full-Suite UI/UX Polish, E2E & Quality Gate | Features 24, 25: Styling harmonization, verification builds, and E2E acceptance | M2, M3, M4 | DONE |

## Interface Contracts
### `src/types/index.ts` ↔ All Modules
- `CanvasLayer`:
  ```ts
  export type PresetType = 'bodycam' | 'weazel' | 'cctv' | 'mugshot' | 'flir' | 'dashcam';
  export type LayerType = 'text' | 'sticker' | 'preset' | 'image' | 'shape';
  export interface CanvasLayer {
    id: string;
    type: LayerType;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    visible: boolean;
    locked?: boolean;
    blendMode?: GlobalCompositeOperation;
    text?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    stickerUrl?: string;
    imageUrl?: string;
    presetType?: PresetType;
    presetData?: Record<string, any>;
  }
  ```
- `ParsedLine`:
  ```ts
  export interface ParsedLine {
    id: string;
    rawText: string;
    type: ChatLineType;
    timestamp?: string;
    speaker?: string;
    messageText?: string;
    colorOverride?: string;
    segments: ChatLineSegment[];
  }
  ```
- `GifEncoder` / Web Worker Message Protocol:
  ```ts
  // To Worker
  export interface GifEncodeJob {
    type: 'START' | 'ADD_FRAME' | 'FINISH' | 'ABORT';
    width?: number;
    height?: number;
    delay?: number;
    frameData?: ImageData; // Transferable
  }
  // From Worker
  export interface GifWorkerMessage {
    type: 'PROGRESS' | 'DONE' | 'ERROR';
    progress?: number;
    blob?: Blob;
    error?: string;
  }
  ```

## Code Layout
```
src/
├── types/
│   └── index.ts               # Master type definitions and contracts
├── components/
│   ├── ChatLog/
│   │   └── ChatLogView.tsx    # Chat log creator UI and canvas renderer
│   ├── CanvasEditor/
│   │   └── CanvasEditorView.tsx # RP Canvas Studio UI and layer compositor
│   └── GifLab/
│       ├── GifLabView.tsx     # Video to GIF Lab UI and video controls
│       └── gifWorker.ts       # Background Web Worker for GIF encoding
├── utils/
│   ├── chatParser.ts          # RP command, timestamp, and censorship parsing
│   ├── rpPresets.ts           # Bodycam, Weazel, CCTV, FLIR, Dashcam presets
│   ├── photoFilters.ts        # Photo grading, vignette, sharpness, DOF
│   └── gifEncoder.ts          # High-speed O(1) LZW encoder & Uint8Array buffer
├── App.tsx                    # Root application layout and persistent tab state
└── index.css                  # Global styles, fonts, and Tailwind utilities
```
