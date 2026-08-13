'use strict';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WINDOW_MS = 7 * DAY_MS;
const MIN_INTERVAL_MS = 90 * MINUTE_MS;
const MAX_JITTER_MS = 15 * MINUTE_MS;
const CLOCK_SKEW_MS = 5 * MINUTE_MS;

const FIXED_CODES = new Set([
  'CAPACITY_UNAVAILABLE',
  'AUTH_FAILED',
  'FORBIDDEN',
  'LIMIT_EXCEEDED',
  'THROTTLED',
  'CONFIG_INVALID',
  'CLI_UNAVAILABLE',
  'TIMEOUT',
  'CLI_ERROR_UNSTRUCTURED',
  'CLI_OUTPUT_INVALID',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'UNKNOWN',
  'SUCCESS',
]);

const OCI_CODE_MAP = new Map([
  ['NotAuthenticated', 'AUTH_FAILED'],
  ['NotAuthorizedOrNotFound', 'FORBIDDEN'],
  ['LimitExceeded', 'LIMIT_EXCEEDED'],
  ['TooManyRequests', 'THROTTLED'],
  ['InvalidParameter', 'CONFIG_INVALID'],
  ['InvalidParameterValue', 'CONFIG_INVALID'],
  ['InvalidRequest', 'CONFIG_INVALID'],
]);

function classifyOciFailure(input = {}) {
  if (input.ok === true) return { code: 'SUCCESS', retryable: false };
  if (input.timedOut === true) return { code: 'TIMEOUT', retryable: false };
  if (input.spawnCode === 'ENOENT') return { code: 'CLI_UNAVAILABLE', retryable: false };
  if (input.code === 'OutOfHostCapacity') {
    return { code: 'CAPACITY_UNAVAILABLE', retryable: true };
  }

  const mappedCode = OCI_CODE_MAP.get(input.code);
  if (mappedCode) return { code: mappedCode, retryable: false };
  if (typeof input.code === 'string' && input.code) {
    return {
      code: Number.isInteger(input.status) && input.status >= 500
        ? 'PROVIDER_UNAVAILABLE'
        : 'PROVIDER_ERROR',
      retryable: false,
    };
  }

  return {
    code: 'UNKNOWN',
    retryable: false,
  };
}

function toIso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('STATE_SCHEMA_INVALID');
  return date.toISOString();
}

function assertAlias(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(value)) {
    throw new Error('STATE_SCHEMA_INVALID');
  }
  return value;
}

function createInitialState(startedAt, regionAlias, shapeAlias) {
  return {
    schemaVersion: 1,
    startedAt: toIso(startedAt),
    regionAlias: assertAlias(regionAlias),
    shapeAlias: assertAlias(shapeAlias),
    status: 'PENDING',
    attempts: [],
    nextEligibleAt: null,
    succeededAt: null,
  };
}

function localDayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function nextLocalMidnight(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

function evaluateAttemptWindow(state, nowMs, randomValue = 0) {
  const startedAt = new Date(state.startedAt).getTime();
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  const lastAttemptAt = attempts.length
    ? new Date(attempts[attempts.length - 1].at).getTime()
    : startedAt;

  if (![startedAt, lastAttemptAt, nowMs].every(Number.isFinite)) {
    return { allowed: false, reason: 'CLOCK_INVALID', waitMs: 0 };
  }
  if (nowMs + CLOCK_SKEW_MS < Math.max(startedAt, lastAttemptAt)) {
    return { allowed: false, reason: 'CLOCK_INVALID', waitMs: 0 };
  }
  if (nowMs >= startedAt + WINDOW_MS) {
    return { allowed: false, reason: 'WINDOW_EXPIRED', waitMs: 0 };
  }
  if (state.status === 'SUCCEEDED') {
    return { allowed: false, reason: 'COMPLETED', waitMs: 0 };
  }
  if (state.status === 'STOPPED') {
    return { allowed: false, reason: 'STOPPED', waitMs: 0 };
  }

  const today = localDayKey(nowMs);
  const attemptsToday = attempts.filter(entry => localDayKey(new Date(entry.at).getTime()) === today);
  if (attemptsToday.length >= 8) {
    return {
      allowed: false,
      reason: 'DAILY_LIMIT',
      waitMs: Math.max(0, nextLocalMidnight(nowMs) - nowMs),
    };
  }

  if (attempts.length) {
    const persistedNext = state.nextEligibleAt === null
      ? NaN
      : new Date(state.nextEligibleAt).getTime();
    const safeRandom = Number.isFinite(randomValue)
      ? Math.min(0.999999999, Math.max(0, randomValue))
      : 0;
    const computedNext = lastAttemptAt + MIN_INTERVAL_MS
      + Math.floor(safeRandom * MAX_JITTER_MS);
    const nextEligibleAt = Number.isFinite(persistedNext) ? persistedNext : computedNext;
    if (nowMs < nextEligibleAt) {
      return {
        allowed: false,
        reason: 'WAIT_INTERVAL',
        waitMs: nextEligibleAt - nowMs,
      };
    }
  }

  return { allowed: true, reason: 'ELIGIBLE', waitMs: 0 };
}

module.exports = {
  FIXED_CODES,
  MAX_JITTER_MS,
  MIN_INTERVAL_MS,
  classifyOciFailure,
  createInitialState,
  evaluateAttemptWindow,
};

