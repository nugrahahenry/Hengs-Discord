'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FIXED_CODES,
  createInitialState,
} = require('./acquisition-policy');

const STATE_KEYS = [
  'schemaVersion',
  'startedAt',
  'regionAlias',
  'shapeAlias',
  'status',
  'attempts',
  'nextEligibleAt',
  'succeededAt',
];
const ATTEMPT_KEYS = ['at', 'code'];
const VALID_STATUSES = new Set(['PENDING', 'SUCCEEDED', 'STOPPED']);

function isIso(value) {
  if (typeof value !== 'string') return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function hasExactKeys(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const actual = Object.keys(object).sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isAlias(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(value);
}

function validateState(state) {
  const valid = hasExactKeys(state, STATE_KEYS)
    && state.schemaVersion === 1
    && isIso(state.startedAt)
    && isAlias(state.regionAlias)
    && isAlias(state.shapeAlias)
    && VALID_STATUSES.has(state.status)
    && Array.isArray(state.attempts)
    && state.attempts.length <= 56
    && state.attempts.every(entry => (
      hasExactKeys(entry, ATTEMPT_KEYS)
      && isIso(entry.at)
      && FIXED_CODES.has(entry.code)
    ))
    && (state.nextEligibleAt === null || isIso(state.nextEligibleAt))
    && (state.succeededAt === null || isIso(state.succeededAt));

  if (!valid) throw new Error('STATE_SCHEMA_INVALID');
  return state;
}

function defaultIsPidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'EPERM');
  }
}

function createAcquisitionStore(options) {
  const stateFile = path.resolve(options.stateFile);
  const lockFile = path.resolve(options.lockFile);
  const now = options.now || Date.now;
  const pid = options.pid || process.pid;
  const isPidAlive = options.isPidAlive || defaultIsPidAlive;
  const fsImpl = options.fsImpl || fs;

  function ensureParent(file) {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }

  function writeLock(reason) {
    ensureParent(lockFile);
    const fd = fsImpl.openSync(lockFile, 'wx', 0o600);
    try {
      fsImpl.writeFileSync(fd, `${JSON.stringify({
        schemaVersion: 1,
        pid,
        createdAt: new Date(now()).toISOString(),
      })}\n`, 'utf8');
      fsImpl.fsyncSync(fd);
    } finally {
      fsImpl.closeSync(fd);
    }
    return { acquired: true, reason };
  }

  function acquireLock() {
    try {
      return writeLock('ACQUIRED');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    let owner = null;
    try {
      owner = JSON.parse(fsImpl.readFileSync(lockFile, 'utf8'));
    } catch {
      owner = null;
    }
    if (owner && Number.isInteger(owner.pid) && isPidAlive(owner.pid)) {
      return { acquired: false, reason: 'LOCKED' };
    }

    try {
      fsImpl.unlinkSync(lockFile);
      return writeLock('RECLAIMED');
    } catch (error) {
      if (error.code === 'EEXIST' || error.code === 'ENOENT') {
        return { acquired: false, reason: 'LOCKED' };
      }
      throw error;
    }
  }

  function releaseLock() {
    try {
      const owner = JSON.parse(fsImpl.readFileSync(lockFile, 'utf8'));
      if (owner.pid === pid) fsImpl.unlinkSync(lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }

  function read() {
    try {
      return validateState(JSON.parse(fsImpl.readFileSync(stateFile, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) throw new Error('STATE_SCHEMA_INVALID');
      throw error;
    }
  }

  function write(state) {
    validateState(state);
    ensureParent(stateFile);
    const tempFile = `${stateFile}.tmp-${pid}-${Math.random().toString(16).slice(2)}`;
    let fd;
    try {
      fd = fsImpl.openSync(tempFile, 'wx', 0o600);
      fsImpl.writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd = undefined;
      fsImpl.renameSync(tempFile, stateFile);
    } catch (error) {
      if (fd !== undefined) {
        try { fsImpl.closeSync(fd); } catch {}
      }
      try { fsImpl.unlinkSync(tempFile); } catch {}
      throw error;
    }
    return state;
  }

  function recordAttempt(result) {
    const state = read();
    if (!state) throw new Error('STATE_MISSING');
    if (!FIXED_CODES.has(result.code)) throw new Error('RESULT_CODE_INVALID');

    const at = new Date(now()).toISOString();
    const attempts = [...state.attempts, { at, code: result.code }].slice(-56);
    let status = 'STOPPED';
    let nextEligibleAt = null;
    let succeededAt = null;
    if (result.code === 'CAPACITY_UNAVAILABLE') {
      status = 'PENDING';
      nextEligibleAt = result.nextEligibleAt || null;
    } else if (result.code === 'SUCCESS') {
      status = 'SUCCEEDED';
      succeededAt = at;
    }

    return write({
      ...state,
      status,
      attempts,
      nextEligibleAt,
      succeededAt,
    });
  }

  return {
    stateFile,
    lockFile,
    acquireLock,
    releaseLock,
    read,
    write,
    recordAttempt,
  };
}

module.exports = {
  createAcquisitionStore,
  createInitialState,
  defaultIsPidAlive,
  validateState,
};

