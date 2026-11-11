/**
 * Master E2E Test Suite Orchestrator
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Runs all 5 test tiers:
 * - Tier 1: 125 Feature Coverage Tests (5 per feature across features 1-25)
 * - Tier 2: 125 Boundary & Corner Case Tests
 * - Tier 3: 25 Cross-Feature Pairwise Interaction Tests
 * - Tier 4: 13 Real-World RP Application Scenarios
 * - Tier 5: Unified Editor modules (lighting, camera, layers, chat renderer, store)
 *
 * Exits with code 0 on complete pass, or code 1 on any failure.
 */

import { setupMockEnv } from './harness/mockEnv';
import { runSuite, RunOptions } from './harness/testRunner';

// 1. Initialize Headless Browser & Canvas Mock Environment
setupMockEnv();

// 2. Parse CLI Options
const args = process.argv.slice(2);
const options: RunOptions = {};

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    options.tierFilter = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--filter=')) {
    options.nameFilter = arg.split('=')[1];
  } else if (arg === '--verbose') {
    options.verbose = true;
  }
}

// 3. Dynamically or Statically Import All Test Tiers
async function loadTestSuites() {
  const shouldLoadTier = (tier: number) => !options.tierFilter || options.tierFilter === tier;

  if (shouldLoadTier(1)) {
    await import('./tier1-features/test_features_01_05');
    await import('./tier1-features/test_features_06_10');
    await import('./tier1-features/test_features_11_15');
    await import('./tier1-features/test_features_16_20');
    await import('./tier1-features/test_features_21_25');
  }

  if (shouldLoadTier(2)) {
    await import('./tier2-boundaries/test_tier2_chat');
    await import('./tier2-boundaries/test_tier2_canvas');
    await import('./tier2-boundaries/test_tier2_gif');
  }

  if (shouldLoadTier(3)) {
    await import('./tier3-crossfeature/test_tier3_pairwise');
  }

  if (shouldLoadTier(4)) {
    await import('./tier4-scenarios/test_tier4_scenarios');
  }

  if (shouldLoadTier(5)) {
    await import('./tier5-editor/test_editor_modules');
    await import('./tier5-editor/test_video_seek');
    await import('./tier5-editor/test_project_file');
  }
}

// 4. Execute Suite and Enforce Process Exit Codes
async function main() {
  try {
    await loadTestSuites();
    const result = await runSuite(options);

    if (result.failed > 0) {
      console.error(`\x1b[31m[FAILED] Test suite exited with ${result.failed} failures.\x1b[0m\n`);
      process.exit(1);
    } else {
      console.log(`\x1b[32m[SUCCESS] All ${result.total} tests passed successfully.\x1b[0m\n`);
      process.exit(0);
    }
  } catch (err: any) {
    console.error(`\x1b[31m[FATAL] Uncaught error during test suite execution:\x1b[0m`, err);
    process.exit(1);
  }
}

main();
