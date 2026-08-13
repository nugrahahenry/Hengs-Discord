const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyOciFailure,
  createInitialState,
  evaluateAttemptWindow,
} = require('../scripts/cloud/acquisition-policy');

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function attempt(at, code = 'CAPACITY_UNAVAILABLE') {
  return { at: new Date(at).toISOString(), code };
}

test('only trusted structured host capacity failures are retryable', () => {
  assert.deepEqual(classifyOciFailure({ code: 'OutOfHostCapacity', status: 500 }), {
    code: 'CAPACITY_UNAVAILABLE',
    retryable: true,
  });

  for (const code of [
    'NotAuthenticated',
    'NotAuthorizedOrNotFound',
    'LimitExceeded',
    'TooManyRequests',
    'InvalidParameter',
  ]) {
    assert.equal(classifyOciFailure({ code }).retryable, false, code);
  }

  assert.deepEqual(classifyOciFailure({ message: 'OutOfHostCapacity' }), {
    code: 'UNKNOWN',
    retryable: false,
  });
});

test('classification maps process and OCI failures to fixed safe codes', () => {
  assert.equal(classifyOciFailure({ ok: true }).code, 'SUCCESS');
  assert.equal(classifyOciFailure({ spawnCode: 'ENOENT' }).code, 'CLI_UNAVAILABLE');
  assert.equal(classifyOciFailure({ timedOut: true }).code, 'TIMEOUT');
  assert.equal(classifyOciFailure({ code: 'NotAuthenticated' }).code, 'AUTH_FAILED');
  assert.equal(classifyOciFailure({ code: 'NotAuthorizedOrNotFound' }).code, 'FORBIDDEN');
  assert.equal(classifyOciFailure({ code: 'LimitExceeded' }).code, 'LIMIT_EXCEEDED');
  assert.equal(classifyOciFailure({ code: 'TooManyRequests' }).code, 'THROTTLED');
  assert.equal(classifyOciFailure({ code: 'InvalidParameter' }).code, 'CONFIG_INVALID');
  assert.equal(classifyOciFailure({ code: 'SyntheticUnmappedProviderCode', status: 503 }).code, 'PROVIDER_UNAVAILABLE');
  assert.equal(classifyOciFailure({ code: 'SyntheticUnmappedProviderCode', status: 409 }).code, 'PROVIDER_ERROR');
});

test('initial state contains only safe acquisition metadata', () => {
  const state = createInitialState('2026-08-12T00:00:00.000Z', 'home', 'a1-flex');

  assert.deepEqual(state, {
    schemaVersion: 1,
    startedAt: '2026-08-12T00:00:00.000Z',
    regionAlias: 'home',
    shapeAlias: 'a1-flex',
    status: 'PENDING',
    attempts: [],
    nextEligibleAt: null,
    succeededAt: null,
  });
});

test('attempt nine in one local day is blocked', () => {
  const base = new Date(2026, 7, 12, 0, 0, 0, 0).getTime();
  const state = createInitialState(new Date(base).toISOString(), 'home', 'a1-flex');
  state.attempts = Array.from({ length: 8 }, (_, index) => attempt(base + index * 100 * MINUTE_MS));
  state.nextEligibleAt = new Date(base + 8 * 100 * MINUTE_MS).toISOString();

  assert.deepEqual(evaluateAttemptWindow(state, base + 13 * 60 * MINUTE_MS, 0), {
    allowed: false,
    reason: 'DAILY_LIMIT',
    waitMs: 11 * 60 * MINUTE_MS,
  });
});

test('minimum interval and jitter are enforced', () => {
  const base = Date.UTC(2026, 7, 12, 0, 0, 0);
  const state = createInitialState(new Date(base).toISOString(), 'home', 'a1-flex');
  state.attempts = [attempt(base)];

  assert.deepEqual(evaluateAttemptWindow(state, base + 89 * MINUTE_MS, 0), {
    allowed: false,
    reason: 'WAIT_INTERVAL',
    waitMs: MINUTE_MS,
  });
  assert.deepEqual(evaluateAttemptWindow(state, base + 95 * MINUTE_MS, 0.5), {
    allowed: false,
    reason: 'WAIT_INTERVAL',
    waitMs: 150_000,
  });
  assert.equal(evaluateAttemptWindow(state, base + 98 * MINUTE_MS, 0.5).allowed, true);
});

test('the acquisition window expires on day eight', () => {
  const base = Date.UTC(2026, 7, 12, 0, 0, 0);
  const state = createInitialState(new Date(base).toISOString(), 'home', 'a1-flex');

  assert.deepEqual(evaluateAttemptWindow(state, base + 7 * DAY_MS, 0), {
    allowed: false,
    reason: 'WINDOW_EXPIRED',
    waitMs: 0,
  });
});

test('clock rollback beyond five minutes fails closed', () => {
  const base = Date.UTC(2026, 7, 12, 12, 0, 0);
  const state = createInitialState(new Date(base - DAY_MS).toISOString(), 'home', 'a1-flex');
  state.attempts = [attempt(base)];

  assert.deepEqual(evaluateAttemptWindow(state, base - 6 * MINUTE_MS, 0), {
    allowed: false,
    reason: 'CLOCK_INVALID',
    waitMs: 0,
  });
});
