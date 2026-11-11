/**
 * Test Runner Harness for Haze RP Studio v2.0 Emerald Edition
 * Provides test registration, robust assertions, hierarchical suites, ANSI formatted output, and exit code handling.
 */

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  durationMs?: number;
  error?: Error;
  status: 'passed' | 'failed' | 'skipped';
}

export interface TestSuite {
  name: string;
  beforeAllFns: Array<() => void | Promise<void>>;
  afterAllFns: Array<() => void | Promise<void>>;
  beforeEachFns: Array<() => void | Promise<void>>;
  afterEachFns: Array<() => void | Promise<void>>;
  tests: TestCase[];
  subSuites: TestSuite[];
}

class TestContext {
  public rootSuites: TestSuite[] = [];
  public currentSuiteStack: TestSuite[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.rootSuites = [];
    this.currentSuiteStack = [];
    const root: TestSuite = {
      name: 'Root',
      beforeAllFns: [],
      afterAllFns: [],
      beforeEachFns: [],
      afterEachFns: [],
      tests: [],
      subSuites: []
    };
    this.rootSuites.push(root);
    this.currentSuiteStack.push(root);
  }

  getCurrentSuite(): TestSuite {
    return this.currentSuiteStack[this.currentSuiteStack.length - 1];
  }
}

const context = new TestContext();

export function describe(name: string, fn: () => void) {
  const current = context.getCurrentSuite();
  const newSuite: TestSuite = {
    name,
    beforeAllFns: [],
    afterAllFns: [],
    beforeEachFns: [],
    afterEachFns: [],
    tests: [],
    subSuites: []
  };
  current.subSuites.push(newSuite);
  context.currentSuiteStack.push(newSuite);
  try {
    fn();
  } finally {
    context.currentSuiteStack.pop();
  }
}

export function test(name: string, fn: () => void | Promise<void>) {
  const suite = context.getCurrentSuite();
  suite.tests.push({
    name,
    fn,
    status: 'skipped'
  });
}

export const it = test;

export function beforeAll(fn: () => void | Promise<void>) {
  context.getCurrentSuite().beforeAllFns.push(fn);
}

export function afterAll(fn: () => void | Promise<void>) {
  context.getCurrentSuite().afterAllFns.push(fn);
}

export function beforeEach(fn: () => void | Promise<void>) {
  context.getCurrentSuite().beforeEachFns.push(fn);
}

export function afterEach(fn: () => void | Promise<void>) {
  context.getCurrentSuite().afterEachFns.push(fn);
}

// ==========================================
// Assertions Library
// ==========================================

export class AssertionError extends Error {
  constructor(message: string, public actual?: any, public expected?: any) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message || `Assertion failed: expected truthy value, got ${condition}`);
  }
}

// Attach Chai / Node assert style aliases onto `assert`
assert.equal = function<T>(actual: T, expected: T, message?: string) {
  assertEquals(actual, expected, message);
};
assert.deepEqual = function<T>(actual: T, expected: T, message?: string) {
  assertDeepEquals(actual, expected, message);
};
assert.ok = function(condition: any, message?: string) {
  assert(condition, message);
};
assert.isTrue = function(condition: any, message?: string) {
  assertEquals(condition, true, message || `Expected true, got ${condition}`);
};
assert.throws = function(fn: () => any, expectedMatch?: RegExp | string, message?: string) {
  assertThrows(fn, expectedMatch, message);
};
assert.greaterThanOrEqual = function(actual: number, min: number, message?: string) {
  if (actual < min) {
    throw new AssertionError(message || `Expected ${actual} >= ${min}`);
  }
};

export function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      message || `assertEquals failed:\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`,
      actual,
      expected
    );
  }
}
export const assertEqual = assertEquals;

export function assertNotEquals<T>(actual: T, expected: T, message?: string) {
  if (Object.is(actual, expected)) {
    throw new AssertionError(
      message || `assertNotEquals failed: values are identical (${JSON.stringify(actual)})`,
      actual,
      expected
    );
  }
}
export const assertNotEqual = assertNotEquals;

export function assertDeepEquals<T>(actual: T, expected: T, message?: string) {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      message || `assertDeepEquals failed:\n  Expected: ${JSON.stringify(expected, null, 2)}\n  Actual:   ${JSON.stringify(actual, null, 2)}`,
      actual,
      expected
    );
  }
}
export const assertDeepEqual = assertDeepEquals;

export function assertApprox(actual: number, expected: number, epsilon: number = 0.01, message?: string) {
  const diff = Math.abs(actual - expected);
  if (diff > epsilon) {
    throw new AssertionError(
      message || `assertApprox failed:\n  Expected: ${expected} ± ${epsilon}\n  Actual:   ${actual} (diff: ${diff})`,
      actual,
      expected
    );
  }
}

export function assertIncludes(container: string | any[], item: any, message?: string) {
  if (typeof container === 'string') {
    if (!container.includes(item)) {
      throw new AssertionError(
        message || `assertIncludes failed: string does not contain "${item}"\n  Haystack: "${container}"`
      );
    }
  } else if (Array.isArray(container)) {
    if (!container.some(el => deepEqual(el, item))) {
      throw new AssertionError(
        message || `assertIncludes failed: array does not contain item ${JSON.stringify(item)}`
      );
    }
  } else {
    throw new AssertionError(`assertIncludes received non-iterable container: ${typeof container}`);
  }
}

export function assertThrows(fn: () => any, expectedMatch?: RegExp | string, message?: string) {
  let threw = false;
  let errorCaught: any = null;
  try {
    fn();
  } catch (err: any) {
    threw = true;
    errorCaught = err;
  }
  if (!threw) {
    throw new AssertionError(message || 'assertThrows failed: function did not throw any error');
  }
  if (expectedMatch) {
    const errMsg = String(errorCaught?.message || errorCaught);
    if (expectedMatch instanceof RegExp) {
      if (!expectedMatch.test(errMsg)) {
        throw new AssertionError(`assertThrows error message "${errMsg}" did not match pattern ${expectedMatch}`);
      }
    } else if (typeof expectedMatch === 'string') {
      if (!errMsg.includes(expectedMatch)) {
        throw new AssertionError(`assertThrows error message "${errMsg}" did not include "${expectedMatch}"`);
      }
    }
  }
}

export function assertBetween(actual: number, min: number, max: number, message?: string) {
  if (actual < min || actual > max) {
    throw new AssertionError(
      message || `assertBetween failed: expected ${actual} to be between [${min}, ${max}]`
    );
  }
}

function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  // Handle TypedArrays
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.constructor !== b.constructor) return false;
    const viewA = a as Uint8Array;
    const viewB = b as Uint8Array;
    if (viewA.byteLength !== viewB.byteLength) return false;
    for (let i = 0; i < viewA.byteLength; i++) {
      if (viewA[i] !== viewB[i]) return false;
    }
    return true;
  }

  // Handle Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle Objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// ==========================================
// Suite Runner & ANSI Formatter
// ==========================================

export interface RunOptions {
  tierFilter?: number;
  nameFilter?: string;
  verbose?: boolean;
}

export async function runSuite(options: RunOptions = {}): Promise<{ total: number; passed: number; failed: number; durationMs: number }> {
  const startTime = Date.now();
  let total = 0;
  let passed = 0;
  let failed = 0;

  console.log('\n\x1b[32m\x1b[1m=== HAZE RP STUDIO v2.0 EMERALD EDITION E2E TEST RUNNER ===\x1b[0m\n');

  async function executeSuite(suite: TestSuite, prefix: string = '') {
    if (suite.name !== 'Root') {
      console.log(`\x1b[36m\x1b[1m${prefix}► Suite: ${suite.name}\x1b[0m`);
    }

    for (const hook of suite.beforeAllFns) await hook();

    for (const t of suite.tests) {
      if (options.nameFilter && !t.name.toLowerCase().includes(options.nameFilter.toLowerCase())) {
        continue;
      }

      total++;
      for (const hook of suite.beforeEachFns) await hook();

      const tStart = Date.now();
      try {
        await t.fn();
        t.durationMs = Date.now() - tStart;
        t.status = 'passed';
        passed++;
        if (options.verbose || suite.tests.length <= 15) {
          console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${t.name} \x1b[90m(${t.durationMs}ms)\x1b[0m`);
        }
      } catch (err: any) {
        t.durationMs = Date.now() - tStart;
        t.status = 'failed';
        t.error = err;
        failed++;
        console.log(`  \x1b[31m✗ [FAIL]\x1b[0m ${t.name} \x1b[90m(${t.durationMs}ms)\x1b[0m`);
        console.log(`    \x1b[31mError:\x1b[0m ${err.message}`);
        if (err.stack && options.verbose) {
          console.log(`    \x1b[90m${err.stack.split('\n').slice(1, 4).join('\n    ')}\x1b[0m`);
        }
      }

      for (const hook of suite.afterEachFns) await hook();
    }

    for (const sub of suite.subSuites) {
      await executeSuite(sub, prefix + '  ');
    }

    for (const hook of suite.afterAllFns) await hook();
  }

  for (const root of context.rootSuites) {
    await executeSuite(root);
  }

  const durationMs = Date.now() - startTime;
  console.log('\n\x1b[1m------------------------------------------------------------\x1b[0m');
  console.log(`\x1b[1mTest Execution Summary:\x1b[0m`);
  console.log(`  Total Tests:  \x1b[37m${total}\x1b[0m`);
  console.log(`  Passed:       \x1b[32m${passed}\x1b[0m`);
  console.log(`  Failed:       ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log(`  Duration:     \x1b[90m${durationMs}ms\x1b[0m`);
  console.log('\x1b[1m------------------------------------------------------------\x1b[0m\n');

  return { total, passed, failed, durationMs };
}
