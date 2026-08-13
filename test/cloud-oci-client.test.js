const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OCI_PREFIX = ['ocid', '1.'].join('');

const {
  launch,
  loadAcquisitionConfig,
  preflight,
  runOci,
} = require('../scripts/cloud/oci-client');
const { executeMode, safeStatus } = require('../scripts/cloud/oci-acquire');
const {
  createAcquisitionStore,
  createInitialState,
} = require('../scripts/cloud/acquisition-store');

function validConfig(dir) {
  const key = path.join(dir, 'hengs.pub');
  fs.writeFileSync(key, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestOnly hengs-test\n');
  return {
    schemaVersion: 1,
    profile: 'DEFAULT',
    regionAlias: 'home',
    region: 'ap-singapore-1',
    compartmentId: `${OCI_PREFIX}compartment.oc1..testonly`,
    subnetId: `${OCI_PREFIX}subnet.oc1.ap-singapore-1.testonly`,
    imageId: `${OCI_PREFIX}image.oc1.ap-singapore-1.testonly`,
    availabilityDomains: ['example:AP-SINGAPORE-1-AD-1'],
    shape: 'VM.Standard.A1.Flex',
    ocpus: 2,
    memoryInGBs: 12,
    sshPublicKeyPath: key,
  };
}

function validE2MicroConfig(dir) {
  const config = validConfig(dir);
  delete config.ocpus;
  delete config.memoryInGBs;
  return {
    ...config,
    shape: 'VM.Standard.E2.1.Micro',
  };
}

function writeConfig(dir, value) {
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

test('config loader accepts only the exact Always Free acquisition schema', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-config-'));
  const config = validConfig(dir);
  assert.deepEqual(loadAcquisitionConfig(writeConfig(dir, config)), config);

  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, tenancyId: `${OCI_PREFIX}tenancy.oc1..secret` })),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, subnetId: 'not-an-ocid' })),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, sshPublicKeyPath: path.join(dir, 'private.pem') })),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, shape: 'VM.Standard.E5.Flex' })),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, ocpus: 4 })),
    /CONFIG_INVALID/,
  );
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, memoryInGBs: 24 })),
    /CONFIG_INVALID/,
  );
});

test('config loader accepts the root tenancy as an OCI compartment target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-root-tenancy-'));
  const config = {
    ...validConfig(dir),
    compartmentId: `${OCI_PREFIX}tenancy.oc1..testonly`,
  };

  assert.deepEqual(loadAcquisitionConfig(writeConfig(dir, config)), config);
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, {
      ...config,
      compartmentId: `${OCI_PREFIX}user.oc1..testonly`,
    })),
    /CONFIG_INVALID/,
  );
});

test('OCI process uses a literal executable, argument array, no shell, and a timeout', () => {
  let captured;
  const spawnSync = (command, args, options) => {
    captured = { command, args, options };
    return { status: 0, stdout: '{"data":[]}', stderr: '' };
  };

  assert.deepEqual(runOci(['iam', 'region-subscription', 'list'], { spawnSync }), {
    ok: true,
    data: { data: [] },
    failure: null,
  });
  assert.equal(captured.command, 'oci');
  assert.deepEqual(captured.args, ['iam', 'region-subscription', 'list']);
  assert.deepEqual(captured.options, {
    shell: false,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });
});

test('OCI process trusts only structured JSON errors', () => {
  const structured = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: JSON.stringify({ code: 'OutOfHostCapacity', status: 500 }),
    }),
  });
  assert.deepEqual(structured.failure, { code: 'CAPACITY_UNAVAILABLE', retryable: true });

  const raw = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({ status: 1, stdout: '', stderr: 'Error: OutOfHostCapacity' }),
  });
  assert.deepEqual(raw.failure, { code: 'CLI_ERROR_UNSTRUCTURED', retryable: false });
  assert.equal(JSON.stringify(raw).includes('OutOfHostCapacity'), false);
});

test('config loader accepts E2 Micro only as a fixed Always Free shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-e2-config-'));
  const config = validE2MicroConfig(dir);

  assert.deepEqual(loadAcquisitionConfig(writeConfig(dir, config)), config);
  assert.throws(
    () => loadAcquisitionConfig(writeConfig(dir, { ...config, ocpus: 1, memoryInGBs: 1 })),
    /CONFIG_INVALID/,
  );
});

test('OCI process gives unmapped structured provider failures a safe actionable bucket', () => {
  const unavailable = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: JSON.stringify({
        code: 'SyntheticUnmappedProviderCode',
        status: 503,
        message: 'sentinel-provider-private-message',
      }),
    }),
  });
  const other = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: JSON.stringify({
        code: 'SyntheticUnmappedProviderCode',
        status: 409,
        message: 'sentinel-provider-private-message',
      }),
    }),
  });

  assert.deepEqual(unavailable.failure, { code: 'PROVIDER_UNAVAILABLE', retryable: false });
  assert.deepEqual(other.failure, { code: 'PROVIDER_ERROR', retryable: false });
  assert.equal(JSON.stringify({ unavailable, other }).includes('sentinel-provider-private-message'), false);
});

test('OCI process distinguishes timeout, unstructured stderr, and invalid stdout without leaking raw output', () => {
  const timeout = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('timed out with sentinel-timeout-secret'), { code: 'ETIMEDOUT' }),
    }),
  });
  const unstructured = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: 'provider rejected ocid1.instance.sentinel and sentinel-stderr-secret',
    }),
  });
  const invalidOutput = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 0,
      stdout: 'not-json sentinel-stdout-secret',
      stderr: '',
    }),
  });

  assert.deepEqual(timeout.failure, { code: 'TIMEOUT', retryable: false });
  assert.deepEqual(unstructured.failure, { code: 'CLI_ERROR_UNSTRUCTURED', retryable: false });
  assert.deepEqual(invalidOutput.failure, { code: 'CLI_OUTPUT_INVALID', retryable: false });
  const serialized = JSON.stringify({ timeout, unstructured, invalidOutput });
  for (const sentinel of [
    'sentinel-timeout-secret',
    'ocid1.instance.sentinel',
    'sentinel-stderr-secret',
    'sentinel-stdout-secret',
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
});

test('OCI process maps a thrown timeout to a safe fixed code', () => {
  const result = runOci(['compute', 'instance', 'launch'], {
    spawnSync() {
      const error = new Error('sentinel-thrown-timeout-secret');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  });

  assert.deepEqual(result.failure, { code: 'TIMEOUT', retryable: false });
  assert.equal(JSON.stringify(result).includes('sentinel-thrown-timeout-secret'), false);
});

test('preflight performs read-only checks and accepts matching resources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-preflight-'));
  const config = validConfig(dir);
  const commands = [];
  const runOciImpl = args => {
    commands.push(args);
    if (args.includes('availability-domain')) {
      return { ok: true, data: { data: [{ name: config.availabilityDomains[0] }] }, failure: null };
    }
    if (args.includes('shape')) {
      return { ok: true, data: { data: [{ shape: config.shape }] }, failure: null };
    }
    return { ok: true, data: { data: {} }, failure: null };
  };

  assert.deepEqual(await preflight(config, { runOciImpl }), { ok: true, code: 'SUCCESS' });
  assert.equal(commands.some(args => args.includes('launch')), false);
  assert.equal(commands.some(args => args.slice(0, 3).join(' ') === 'iam region-subscription list'), true);
  assert.equal(commands.some(args => args.slice(0, 3).join(' ') === 'network subnet get'), true);
  const shapeCheck = commands.find(args => args.slice(0, 3).join(' ') === 'compute shape list');
  assert.equal(shapeCheck.includes('--image-id'), true);
  assert.equal(shapeCheck.includes(config.imageId), true);
  assert.equal(shapeCheck.includes('--shape'), true);
  assert.equal(shapeCheck.includes(config.shape), true);
});

test('launch uses direct compute launch and returns only a fixed failure code', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-launch-'));
  const config = validConfig(dir);
  let command;
  const result = await launch(config, config.availabilityDomains[0], {
    runOciImpl(args) {
      command = args;
      return {
        ok: false,
        data: null,
        failure: { code: 'CAPACITY_UNAVAILABLE', retryable: true },
      };
    },
  });

  assert.deepEqual(result, { ok: false, code: 'CAPACITY_UNAVAILABLE', retryable: true });
  assert.deepEqual(command.slice(0, 3), ['compute', 'instance', 'launch']);
  assert.equal(command.includes('resource-manager'), false);
  assert.equal(command.includes(config.compartmentId), true);
  assert.equal(command.filter(value => value === '--no-retry').length, 1);
});

test('E2 Micro launch omits flexible shape configuration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-e2-launch-'));
  const config = validE2MicroConfig(dir);
  let command;

  const result = await launch(config, config.availabilityDomains[0], {
    runOciImpl(args) {
      command = args;
      return { ok: true, data: { data: {} }, failure: null };
    },
  });

  assert.deepEqual(result, { ok: true, code: 'SUCCESS', retryable: false });
  assert.equal(command.includes('--shape-config'), false);
  assert.equal(command.filter(value => value === '--no-retry').length, 1);
});

test('one attempt records capacity safely and rotates the availability domain', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-attempt-'));
  const nowMs = Date.UTC(2026, 7, 12, 0, 0, 0);
  const store = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => nowMs,
    pid: 4321,
    isPidAlive: () => false,
  });
  const config = validConfig(dir);
  let selectedDomain;
  const output = [];

  const result = await executeMode({
    mode: 'attempt',
    config,
    store,
    now: () => nowMs,
    random: () => 0,
    preflightImpl: async () => ({ ok: true, code: 'SUCCESS' }),
    launchImpl: async (_config, domain) => {
      selectedDomain = domain;
      return { ok: false, code: 'CAPACITY_UNAVAILABLE', retryable: true };
    },
    output: value => output.push(value),
  });

  assert.equal(result.code, 'CAPACITY_UNAVAILABLE');
  assert.equal(selectedDomain, config.availabilityDomains[0]);
  assert.equal(store.read().attempts.length, 1);
  assert.equal(store.read().nextEligibleAt, '2026-08-12T01:30:00.000Z');
  assert.equal(JSON.stringify(output).includes(OCI_PREFIX), false);
});

test('the first E2 Micro attempt persists its own shape alias', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-e2-state-'));
  const nowMs = Date.UTC(2026, 7, 13, 0, 0, 0);
  const store = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => nowMs,
    pid: 5432,
    isPidAlive: () => false,
  });

  await executeMode({
    mode: 'attempt',
    config: validE2MicroConfig(dir),
    store,
    now: () => nowMs,
    random: () => 0,
    preflightImpl: async () => ({ ok: true, code: 'SUCCESS' }),
    launchImpl: async () => ({ ok: false, code: 'CAPACITY_UNAVAILABLE', retryable: true }),
    output: () => {},
  });

  assert.equal(store.read().shapeAlias, 'e2-micro');
});

test('an E2 Micro attempt refuses an existing A1 acquisition state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-shape-mismatch-'));
  const nowMs = Date.UTC(2026, 7, 13, 0, 0, 0);
  const store = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => nowMs,
    pid: 6543,
    isPidAlive: () => false,
  });
  const original = createInitialState(new Date(nowMs).toISOString(), 'home', 'a1-flex');
  store.write(original);

  const result = await executeMode({
    mode: 'attempt',
    config: validE2MicroConfig(dir),
    store,
    now: () => nowMs,
    preflightImpl: async () => assert.fail('preflight must not run for mismatched state'),
    launchImpl: async () => assert.fail('launch must not run for mismatched state'),
    output: () => {},
  });

  assert.deepEqual(result, { ok: false, code: 'STATE_CONFIG_MISMATCH' });
  assert.deepEqual(store.read(), original);
});

test('authentication failure stops acquisition and a live lock denies a second process', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-oci-auth-'));
  const nowMs = Date.UTC(2026, 7, 12, 0, 0, 0);
  const store = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => nowMs,
    pid: 111,
    isPidAlive: pid => pid === 111,
  });
  const config = validConfig(dir);

  const result = await executeMode({
    mode: 'attempt',
    config,
    store,
    now: () => nowMs,
    random: () => 0,
    preflightImpl: async () => ({ ok: false, code: 'AUTH_FAILED' }),
    launchImpl: async () => assert.fail('launch must not run'),
    output: () => {},
  });
  assert.equal(result.code, 'AUTH_FAILED');
  assert.equal(store.read().status, 'STOPPED');

  assert.deepEqual(store.acquireLock(), { acquired: true, reason: 'ACQUIRED' });
  const denied = await executeMode({
    mode: 'attempt',
    config,
    store,
    now: () => nowMs,
    output: () => {},
  });
  assert.deepEqual(denied, { ok: false, code: 'LOCKED' });
  store.releaseLock();
});

test('status output exposes aliases and fixed counters only', () => {
  const state = createInitialState('2026-08-12T00:00:00.000Z', 'home', 'a1-flex');
  state.attempts.push({ at: '2026-08-12T00:00:00.000Z', code: 'CAPACITY_UNAVAILABLE' });
  const status = safeStatus(state);
  assert.deepEqual(Object.keys(status).sort(), [
    'attemptCount',
    'nextEligibleAt',
    'regionAlias',
    'shapeAlias',
    'startedAt',
    'status',
    'succeededAt',
  ]);
  assert.equal(JSON.stringify(status).includes(OCI_PREFIX), false);
});


test('OCI process accepts the CLI ServiceError wrapper as structured data', () => {
  const result = runOci(['compute', 'instance', 'launch'], {
    spawnSync: () => ({
      status: 1,
      stdout: '',
      stderr: 'ServiceError:\n{"code":"OutOfHostCapacity","status":500,"message":"redacted by client"}\n',
    }),
  });

  assert.deepEqual(result.failure, { code: 'CAPACITY_UNAVAILABLE', retryable: true });
  assert.equal(JSON.stringify(result).includes('redacted by client'), false);
});
