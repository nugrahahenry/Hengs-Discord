#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  MAX_JITTER_MS,
  MIN_INTERVAL_MS,
  createInitialState,
  evaluateAttemptWindow,
} = require('./acquisition-policy');
const { createAcquisitionStore } = require('./acquisition-store');
const { launch, loadAcquisitionConfig, preflight } = require('./oci-client');

function safeStatus(state) {
  if (!state) {
    return {
      status: 'NOT_STARTED', startedAt: null, regionAlias: null, shapeAlias: null,
      attemptCount: 0, nextEligibleAt: null, succeededAt: null,
    };
  }
  return {
    status: state.status,
    startedAt: state.startedAt,
    regionAlias: state.regionAlias,
    shapeAlias: state.shapeAlias,
    attemptCount: state.attempts.length,
    nextEligibleAt: state.nextEligibleAt,
    succeededAt: state.succeededAt,
  };
}

function emit(output, value) {
  output(JSON.stringify(value));
}

async function performAttempt(context, state) {
  const { config, store, now, random, preflightImpl, launchImpl, output } = context;
  const decision = evaluateAttemptWindow(state, now(), random());
  if (!decision.allowed) {
    const result = { ok: false, code: decision.reason, waitMs: decision.waitMs };
    emit(output, result);
    return result;
  }

  const preflightResult = await preflightImpl(config);
  if (!preflightResult.ok) {
    store.recordAttempt({ code: preflightResult.code });
    const result = { ok: false, code: preflightResult.code };
    emit(output, result);
    return result;
  }

  const domainIndex = state.attempts.length % config.availabilityDomains.length;
  const launchResult = await launchImpl(config, config.availabilityDomains[domainIndex]);
  const result = { ok: launchResult.ok, code: launchResult.code };
  if (launchResult.code === 'CAPACITY_UNAVAILABLE') {
    const jitterMs = Math.floor(random() * MAX_JITTER_MS);
    store.recordAttempt({
      code: launchResult.code,
      nextEligibleAt: new Date(now() + MIN_INTERVAL_MS + jitterMs).toISOString(),
    });
  } else {
    store.recordAttempt({ code: launchResult.code });
  }
  emit(output, result);
  return result;
}

async function executeMode(options) {
  const mode = options.mode;
  const config = options.config;
  const store = options.store;
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const output = options.output || console.log;
  const preflightImpl = options.preflightImpl || preflight;
  const launchImpl = options.launchImpl || launch;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

  if (mode === 'status') {
    const result = safeStatus(store.read());
    emit(output, result);
    return { ok: true, code: 'SUCCESS', status: result };
  }
  if (mode === 'preflight') {
    const result = await preflightImpl(config);
    emit(output, result);
    return result;
  }
  if (mode !== 'attempt' && mode !== 'run') {
    return { ok: false, code: 'CONFIG_INVALID' };
  }

  const lock = store.acquireLock();
  if (!lock.acquired) {
    const result = { ok: false, code: 'LOCKED' };
    emit(output, result);
    return result;
  }

  try {
    let state = store.read();
    if (!state) {
      state = createInitialState(new Date(now()).toISOString(), config.regionAlias, 'a1-flex');
      store.write(state);
    }

    if (mode === 'attempt') {
      return await performAttempt({
        config, store, now, random, preflightImpl, launchImpl, output,
      }, state);
    }

    while (true) {
      state = store.read();
      const decision = evaluateAttemptWindow(state, now(), random());
      if (!decision.allowed) {
        if (decision.reason === 'WAIT_INTERVAL' || decision.reason === 'DAILY_LIMIT') {
          emit(output, { ok: false, code: decision.reason, waitMs: decision.waitMs });
          await sleep(decision.waitMs);
          continue;
        }
        const result = { ok: false, code: decision.reason };
        emit(output, result);
        return result;
      }

      const result = await performAttempt({
        config, store, now, random, preflightImpl, launchImpl, output,
      }, state);
      if (result.code !== 'CAPACITY_UNAVAILABLE') return result;
    }
  } finally {
    store.releaseLock();
  }
}

function parseCliArgs(argv) {
  const [mode, flag, configFile, ...rest] = argv;
  if (!['preflight', 'attempt', 'run', 'status'].includes(mode)
      || flag !== '--config'
      || typeof configFile !== 'string'
      || rest.length) {
    throw new Error('CONFIG_INVALID');
  }
  return { mode, configFile: path.resolve(configFile) };
}

async function main(argv = process.argv.slice(2)) {
  let parsed;
  let config;
  try {
    parsed = parseCliArgs(argv);
    config = loadAcquisitionConfig(parsed.configFile);
  } catch {
    console.log(JSON.stringify({ ok: false, code: 'CONFIG_INVALID' }));
    return 2;
  }

  const cloudDir = path.dirname(parsed.configFile);
  const store = createAcquisitionStore({
    stateFile: path.join(cloudDir, 'oci-acquisition-state.json'),
    lockFile: path.join(cloudDir, 'oci-acquisition.lock'),
  });
  const releaseAndExit = signal => {
    store.releaseLock();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', releaseAndExit);
  process.once('SIGTERM', releaseAndExit);
  try {
    const result = await executeMode({ mode: parsed.mode, config, store });
    return result.ok || result.code === 'CAPACITY_UNAVAILABLE' ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', releaseAndExit);
    process.removeListener('SIGTERM', releaseAndExit);
  }
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  }).catch(() => {
    console.log(JSON.stringify({ ok: false, code: 'UNKNOWN' }));
    process.exitCode = 1;
  });
}

module.exports = { executeMode, main, parseCliArgs, safeStatus };

