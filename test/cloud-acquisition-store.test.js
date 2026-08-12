const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OCI_PREFIX = ['ocid', '1.'].join('');

const {
  createAcquisitionStore,
  createInitialState,
  defaultIsPidAlive,
} = require('../scripts/cloud/acquisition-store');

function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-acquisition-'));
  const clock = { value: Date.UTC(2026, 7, 12, 0, 0, 0) };
  const store = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => clock.value,
    pid: options.pid || 1234,
    isPidAlive: options.isPidAlive || (() => false),
    fsImpl: options.fsImpl || fs,
  });
  return { dir, clock, store };
}

test('exclusive lock rejects a live owner', () => {
  const { dir, store } = fixture({ pid: 111, isPidAlive: pid => pid === 111 });
  assert.deepEqual(store.acquireLock(), { acquired: true, reason: 'ACQUIRED' });

  const contender = createAcquisitionStore({
    stateFile: path.join(dir, 'state.json'),
    lockFile: path.join(dir, 'state.lock'),
    now: () => Date.UTC(2026, 7, 12, 0, 1, 0),
    pid: 222,
    isPidAlive: pid => pid === 111,
  });

  assert.deepEqual(contender.acquireLock(), { acquired: false, reason: 'LOCKED' });
  store.releaseLock();
});

test('a stale lock owned by a dead process is reclaimed', () => {
  const { dir, store } = fixture({ pid: 111 });
  fs.writeFileSync(path.join(dir, 'state.lock'), JSON.stringify({
    schemaVersion: 1,
    pid: 999,
    createdAt: '2026-08-11T00:00:00.000Z',
  }));

  assert.deepEqual(store.acquireLock(), { acquired: true, reason: 'RECLAIMED' });
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'state.lock'), 'utf8'));
  assert.equal(lock.pid, 111);
  store.releaseLock();
});

test('state schema rejects unknown fields and unsafe aliases', () => {
  const { store } = fixture();
  const state = createInitialState('2026-08-12T00:00:00.000Z', 'home', 'a1-flex');
  assert.throws(() => store.write({ ...state, tenancyId: `${OCI_PREFIX}tenancy.sentinel` }), /STATE_SCHEMA_INVALID/);
  assert.throws(
    () => store.write({ ...state, regionAlias: 'C:\\private\\path' }),
    /STATE_SCHEMA_INVALID/,
  );
});

test('recorded attempts are bounded and discard sensitive input', () => {
  const { store, clock } = fixture();
  store.write(createInitialState(new Date(clock.value).toISOString(), 'home', 'a1-flex'));

  for (let index = 0; index < 60; index += 1) {
    clock.value += 1000;
    store.recordAttempt({
      code: 'CAPACITY_UNAVAILABLE',
      retryable: true,
      nextEligibleAt: new Date(clock.value + 5_400_000).toISOString(),
      rawError: `request ${OCI_PREFIX}instance.sentinel 203.0.113.9 C:\\private\\key.pem`,
      requestId: 'sentinel-request-id',
    });
  }

  const state = store.read();
  assert.equal(state.attempts.length, 56);
  const raw = fs.readFileSync(path.join(path.dirname(store.stateFile), 'state.json'), 'utf8');
  for (const sentinel of [OCI_PREFIX, '203.0.113.9', 'private\\key.pem', 'sentinel-request-id', 'rawError']) {
    assert.equal(raw.includes(sentinel), false, sentinel);
  }
});

test('atomic rename failure cleans its temporary file and preserves current state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-acquisition-'));
  const stateFile = path.join(dir, 'state.json');
  const initial = createInitialState('2026-08-12T00:00:00.000Z', 'home', 'a1-flex');
  fs.writeFileSync(stateFile, `${JSON.stringify(initial)}\n`);
  const failingFs = {
    ...fs,
    renameSync() {
      throw new Error('simulated rename failure');
    },
  };
  const store = createAcquisitionStore({
    stateFile,
    lockFile: path.join(dir, 'state.lock'),
    now: () => Date.UTC(2026, 7, 12, 0, 0, 0),
    pid: 1234,
    isPidAlive: () => false,
    fsImpl: failingFs,
  });

  assert.throws(() => store.write({ ...initial, status: 'STOPPED' }), /simulated rename failure/);
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).status, 'PENDING');
  assert.deepEqual(fs.readdirSync(dir).filter(name => name.includes('.tmp-')), []);
});


test('EPERM during PID probing is treated as a live lock owner', () => {
  const kill = () => {
    const error = new Error('access denied');
    error.code = 'EPERM';
    throw error;
  };
  assert.equal(defaultIsPidAlive(1234, kill), true);
});
