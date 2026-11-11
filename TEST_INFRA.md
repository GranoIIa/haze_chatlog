# E2E Test Infra: Haze RP Studio v2.0 Emerald Edition

## Test Philosophy
- **Requirement-Driven**: Derived strictly from `ORIGINAL_REQUEST.md` and user requirements, not from internal implementation details.
- **Opaque-Box**: Exercises the platform's contracts, parsers, state transformations, canvas composition engines, and video/GIF pipeline as an external consumer.
- **Progressive Testability**: Verification mechanisms do not depend on features more complex than the functionality under test.
- **4-Tier Methodology**:
  - **Tier 1 — Feature Coverage**: ≥5 test cases per feature (happy-path & functional verification in isolation).
  - **Tier 2 — Boundary & Corner Cases**: ≥5 test cases per feature at domain-specific limits, zero-values, overflows, and malformed inputs.
  - **Tier 3 — Cross-Feature Interactions**: Pairwise combinatorial testing across modules and state handoffs.
  - **Tier 4 — Real-World RP Application Scenarios**: Comprehensive end-to-end workflows modeled after real GTA RP content creation.

---

## Feature Inventory & Test Coverage Matrix
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|----------------------|:------:|:------:|:------:|:------:|
| 1 | Centralized Type Contracts & Presets Alignment | ORIGINAL_REQUEST §R1, §R3 | 5 | 5 | ✓ | ✓ |
| 2 | Tab State Persistence & Unmount Protection | ORIGINAL_REQUEST §R1, §R2 | 5 | 5 | ✓ | ✓ |
| 3 | Dead Code & Dependency Hygiene | ORIGINAL_REQUEST §R1, §R3 | 5 | 5 | ✓ | ✓ |
| 4 | RP Command Parser Engine | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 5 | Timestamp Parsing & Display Toggle | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 6 | Accurate Character State & Speaker Tagging | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 7 | Canvas Text Wrapping (`wrapText`) | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 8 | Authentic GTA Text Outline Stroke | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 9 | Procedural Mosaic Censorship Rendering | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 10 | Chat Log Typography & Styling UI Controls | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 11 | Chat Log Drag-and-Drop & Memory Safety | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ | ✓ |
| 12 | Direct Canvas Layer Hit-Testing | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 13 | Layer Property Inspector | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 14 | Floating Image & Watermark Layers | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 15 | Layer Transform Handles (Scale & Rotation) | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 16 | Background Filter Buffer Caching | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 17 | Canvas Studio Drag-and-Drop & Pointer Capture | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ | ✓ |
| 18 | High-Performance O(1) LZW GIF Encoding | ORIGINAL_REQUEST §R1, §R2 | 5 | 5 | ✓ | ✓ |
| 19 | Memory-Safe Buffer Management (`Uint8Array`) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 20 | Web Worker GIF Pipeline & Abort Controller | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 21 | Resource Lifecycle & Blob URL Revocation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 22 | Video Seek Timeout & Playback Controls | ORIGINAL_REQUEST §R1, §R2 | 5 | 5 | ✓ | ✓ |
| 23 | Discord Presets with 1:1 Aspect Ratio Cropping | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ | ✓ |
| 24 | Unified Emerald UI/UX & Responsive Layouts | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 25 | Full Quality Gate & E2E Validation | ORIGINAL_REQUEST §R1-§R4 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture
- **Location**: `tests/` directory at project root.
- **Invocation**: `npm run test:e2e` or `node tests/run-e2e.mjs` / `npx tsx tests/run-e2e.ts`.
- **Pass/Fail Semantics**: All test cases must report status. Exit code 0 if all tests pass; non-zero if any test fails.
- **Directory Layout**:
  ```
  tests/
  ├── harness/
  │   ├── testRunner.ts           # Test runner, assertion utilities & structured report emitter
  │   └── mockEnv.ts              # Mock browser canvas, Web Worker, and DOM context
  ├── tier1-features/             # Tier 1: 125 tests (5 per feature across features 1-25)
  │   ├── test_features_01_05.ts
  │   ├── test_features_06_10.ts
  │   ├── test_features_11_15.ts
  │   ├── test_features_16_20.ts
  │   └── test_features_21_25.ts
  ├── tier2-boundaries/           # Tier 2: 125 tests (5 boundary/corner tests per feature)
  │   ├── test_tier2_chat.ts
  │   ├── test_tier2_canvas.ts
  │   └── test_tier2_gif.ts
  ├── tier3-crossfeature/         # Tier 3: 25 pairwise cross-feature interaction tests
  │   └── test_tier3_pairwise.ts
  ├── tier4-scenarios/            # Tier 4: 13 comprehensive RP workflows
  │   └── test_tier4_scenarios.ts
  └── run-e2e.ts                  # Master runner entry point
  ```

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | PD Shootout Report Composite | F4, F5, F6, F7, F8, F12, F13, F14, F24 | High |
| 2 | Weazel News Live Breaking Broadcast | F1, F4, F7, F12, F13, F16, F24 | High |
| 3 | Forensic Crime Scene Evidence Folder | F9, F11, F12, F14, F15, F16, F17 | High |
| 4 | Undercover Narcotics Wiretap Transcript | F4, F5, F6, F7, F9, F10, F24 | Medium |
| 5 | Discord Nitro Action Clip GIF Export | F18, F19, F20, F21, F22, F23, F24 | High |
| 6 | Animated Server Reaction Emoji Optimization | F18, F19, F20, F21, F23, F25 | Medium |
| 7 | Police Bodycam Axon Evidence Overlay | F1, F5, F12, F13, F15, F16, F24 | High |
| 8 | High-Speed Pursuit Dashcam Archive | F1, F12, F13, F14, F15, F24 | Medium |
| 9 | Mugshot Booking Sheet Generation | F1, F4, F5, F10, F12, F13, F14 | Medium |
| 10 | Thermal FLIR Aerial Reconnaissance | F1, F12, F13, F15, F16, F24 | High |
| 11 | Multi-Tab Cross-Studio Production Workflow | F2, F11, F12, F17, F21, F24 | High |
| 12 | Long Multi-Speaker Courtroom Trial Log | F4, F5, F6, F7, F8, F9, F10 | High |
| 13 | Full Studio Stress Test (Heavy Assets & Batching) | F2, F7, F11, F16, F19, F20, F21 | Extreme |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: 25 features × 5 cases = **125 test cases**
- **Tier 2 (Boundary & Corner Cases)**: 25 features × 5 cases = **125 test cases**
- **Tier 3 (Cross-Feature Combinations)**: **25 pairwise test cases**
- **Tier 4 (Real-World Scenarios)**: **13 workflow test cases**
- **Total Minimum Test Cases**: **288 test cases**
