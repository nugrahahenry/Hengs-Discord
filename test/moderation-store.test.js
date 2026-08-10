const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const STORE_PATH = path.resolve(__dirname, '../src/moderation/store.js');
const STATE_FILE = 'moderation-state.json';
const ACTOR_ID = '900000000000001';

function testDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-moderation-store-'));
}

function loadStore(directory, mode = 'active') {
  process.env.MODERATION_DATA_DIR = directory;
  process.env.ANTI_RAID_MODE = mode;
  delete require.cache[STORE_PATH];
  return require(STORE_PATH);
}

function validIncidentInput(index = 1, extra = {}) {
  return {
    guildId: '100000000000001',
    memberId: '200000000000001',
    detectionWindowStartMs: 1_700_000_000_000 + index,
    trigger: 'CROSS_CHANNEL_REPEAT',
    messageCount: 3,
    channelCount: 3,
    ...extra,
  };
}

function statePath(directory) {
  return path.join(directory, STATE_FILE);
}

function withDirectory(fn) {
  const directory = testDirectory();
  try {
    return fn(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function finalize(store, incident) {
  const claim = store.claimEnforcement(incident.id, incident.revision);
  assert.equal(claim.ok, true);
  const result = store.finalizeIncident(incident.id, {
    status: 'banned',
    banSucceeded: true,
    deletionSucceeded: true,
    deletedCount: 3,
    issueCode: null,
  }, claim.incident.revision);
  assert.equal(result.ok, true);
  return result.incident;
}

function persistedIncident(index, { status = 'banned', panel = true } = {}) {
  const guildId = '100000000000001';
  const memberId = '200000000000001';
  const detectionWindowStartMs = 1_700_000_000_000 + index;
  const finalized = status !== 'detected' && status !== 'enforcing';
  return {
    id: index.toString(16).padStart(16, '0'),
    externalKey: guildId + ':' + memberId + ':' + detectionWindowStartMs,
    guildId,
    memberId,
    detectionWindowStartMs,
    revision: panel ? 3 : finalized ? 2 : status === 'enforcing' ? 1 : 0,
    status,
    trigger: 'CROSS_CHANNEL_REPEAT',
    messageCount: 3,
    channelCount: 3,
    createdAt: new Date(1_700_000_000_000 + index).toISOString(),
    finalizedAt: finalized ? new Date(1_700_001_000_000 + index).toISOString() : null,
    panel: panel ? {
      channelId: '300000000000001',
      messageId: String(400000000000000 + index),
    } : null,
    result: finalized ? {
      status,
      banSucceeded: status === 'banned',
      deletionSucceeded: status === 'banned',
      deletedCount: status === 'banned' ? 3 : 0,
      issueCode: null,
    } : null,
  };
}

function writeCapacityState(directory, incidents) {
  fs.writeFileSync(statePath(directory), JSON.stringify({
    schemaVersion: 1,
    revision: 0,
    mode: 'active',
    allowlist: { roleIds: [], channelIds: [], domains: [] },
    incidents,
    audit: [],
  }), 'utf8');
}

test('creates an in-memory default and persists it only after the first mutation', () => withDirectory(directory => {
  const store = loadStore(directory, 'active');

  assert.deepEqual(store.getMode(), { mode: 'active', revision: 0 });
  assert.deepEqual(store.getState(), {
    schemaVersion: 1,
    revision: 0,
    mode: 'active',
    allowlist: { roleIds: [], channelIds: [], domains: [] },
    incidents: [],
    audit: [],
  });
  assert.equal(fs.existsSync(statePath(directory)), false);

  assert.equal(store.setMode('monitor', ACTOR_ID, 0).ok, true);
  assert.equal(fs.existsSync(statePath(directory)), true);
}));

test('legacy schema state is validated, migrated, and rewritten with schemaVersion', () => withDirectory(directory => {
  fs.writeFileSync(statePath(directory), JSON.stringify({
    schema: 1,
    revision: 4,
    mode: 'monitor',
    allowlist: { roleIds: [], channelIds: [], domains: [] },
    incidents: [],
    audit: [],
  }), 'utf8');

  const store = loadStore(directory);
  assert.deepEqual(store.getMode(), { mode: 'monitor', revision: 4 });
  const persisted = JSON.parse(fs.readFileSync(statePath(directory), 'utf8'));
  assert.equal(persisted.schemaVersion, 1);
  assert.equal(Object.hasOwn(persisted, 'schema'), false);
}));

test('creates one deterministic incident, gives it a random public id, and claims it exactly once', () => withDirectory(directory => {
  const store = loadStore(directory);
  const created = store.createOrGetIncident(validIncidentInput());
  const duplicate = store.createOrGetIncident(validIncidentInput());

  assert.equal(created.created, true);
  assert.match(created.incident.id, /^[a-f0-9]{16}$/);
  assert.equal(created.incident.status, 'detected');
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.incident.id, created.incident.id);
  assert.equal(store.claimEnforcement(created.incident.id, 0).ok, true);
  assert.equal(store.claimEnforcement(created.incident.id, 0).reason, 'stale');
}));

test('adjacent detection windows for one member reuse the same incident', () => withDirectory(directory => {
  const store = loadStore(directory);
  const first = store.createOrGetIncident(validIncidentInput(1)).incident;
  const adjacent = store.createOrGetIncident(validIncidentInput(1, {
    detectionWindowStartMs: first.detectionWindowStartMs + 60_000,
    trigger: 'SINGLE_CHANNEL_BURST',
    messageCount: 5,
    channelCount: 1,
  }));

  assert.equal(adjacent.created, false);
  assert.equal(adjacent.incident.id, first.id);
  assert.equal(store.listIncidents().length, 1);
}));

test('separate store instances racing the same claim have exactly one winner', () => withDirectory(directory => {
  const firstStore = loadStore(directory);
  const incident = firstStore.createOrGetIncident(validIncidentInput()).incident;
  const secondStore = loadStore(directory);

  const first = firstStore.claimEnforcement(incident.id, 0);
  const second = secondStore.claimEnforcement(incident.id, 0);

  assert.deepEqual([first.ok, second.ok].sort(), [false, true]);
  assert.equal([first, second].find(result => !result.ok).reason, 'stale');
}));

test('enforcement finalization and panel delivery are revision-safe recovery transitions', () => withDirectory(directory => {
  const store = loadStore(directory);
  const created = store.createOrGetIncident(validIncidentInput()).incident;
  const claimed = store.claimEnforcement(created.id, created.revision);

  assert.equal(store.listRecoverableIncidents().map(item => item.id).includes(created.id), true);
  assert.equal(claimed.ok, true);
  assert.equal(store.listRecoverableIncidents().map(item => item.id).includes(created.id), true);

  const finalized = store.finalizeIncident(created.id, {
    status: 'partial',
    banSucceeded: false,
    deletionSucceeded: true,
    deletedCount: 2,
    issueCode: 'BAN_FAILED',
  }, claimed.incident.revision);
  assert.equal(finalized.ok, true);
  assert.equal(finalized.incident.status, 'partial');
  assert.equal(store.listRecoverableIncidents().map(item => item.id).includes(created.id), true);

  assert.throws(() => store.setIncidentPanel(created.id, null, finalized.incident.revision), /panel/i);

  const panel = { channelId: '300000000000001', messageId: '400000000000001' };
  const storedPanel = store.setIncidentPanel(created.id, panel, finalized.incident.revision);
  assert.equal(storedPanel.ok, true);
  assert.deepEqual(storedPanel.incident.panel, panel);
  assert.equal(store.setIncidentPanel(created.id, panel, finalized.incident.revision).reason, 'stale');
  assert.equal(store.listRecoverableIncidents().length, 0);
}));

test('mode and allowlist mutations reject invalid values and stale revisions', () => withDirectory(directory => {
  const store = loadStore(directory, 'unexpected');

  assert.deepEqual(store.getMode(), { mode: 'monitor', revision: 0 });
  assert.throws(() => store.setMode('unexpected', ACTOR_ID, 0), /mode/i);
  assert.throws(() => store.mutateAllowlist('role', 'add', 'not-a-discord-id', ACTOR_ID, 0), /allowlist|identitas/i);
  assert.throws(() => store.mutateAllowlist('domain', 'add', 'https://bad.example/path', ACTOR_ID, 0), /allowlist|domain/i);

  const mutation = store.mutateAllowlist('role', 'add', '500000000000001', ACTOR_ID, 0);
  assert.equal(mutation.ok, true);
  assert.deepEqual(mutation.state.allowlist.roleIds, ['500000000000001']);
  assert.equal(store.mutateAllowlist('role', 'remove', '500000000000001', ACTOR_ID, 0).reason, 'stale');
}));

test('serialized state and audit never retain raw messages, URLs, domains, filenames, or exceptions', () => withDirectory(directory => {
  const store = loadStore(directory);
  const sentinels = {
    message: 'PRIVATE-MESSAGE-SENTINEL',
    url: 'https://private-sentinel.example/secret',
    domain: 'private-sentinel.example',
    filename: 'private-sentinel-file.png',
    exception: 'PRIVATE-RAW-EXCEPTION-SENTINEL',
  };
  const incident = store.createOrGetIncident(validIncidentInput(1, {
    messageText: sentinels.message,
    messageUrl: sentinels.url,
    domain: sentinels.domain,
    filename: sentinels.filename,
    rawException: new Error(sentinels.exception),
  })).incident;
  const claimed = store.claimEnforcement(incident.id, incident.revision).incident;
  assert.equal(store.finalizeIncident(incident.id, {
    status: 'failed',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode: 'BAN_FAILED',
    rawException: sentinels.exception,
  }, claimed.revision).ok, true);

  const serialized = fs.readFileSync(statePath(directory), 'utf8');
  for (const sentinel of Object.values(sentinels)) {
    assert.doesNotMatch(serialized, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
}));

test('corrupt and partial persisted data fail closed with a fixed store error', () => withDirectory(directory => {
  for (const content of ['{', JSON.stringify({ schema: 1, revision: 0, mode: 'active' })]) {
    fs.writeFileSync(statePath(directory), content, 'utf8');
    const store = loadStore(directory);
    assert.throws(
      () => store.getState(),
      error => error.name === 'ModerationStoreError'
        && error.code === 'STATE_CORRUPT'
        && error.userMessage === 'Data moderasi sedang tidak tersedia. Hubungi owner.',
    );
  }
}));

test('persisted audit rejects actions outside the fixed allowlist', () => withDirectory(directory => {
  const store = loadStore(directory);
  assert.equal(store.setMode('monitor', ACTOR_ID, 0).ok, true);
  const state = JSON.parse(fs.readFileSync(statePath(directory), 'utf8'));
  state.audit[0].action = 'operator_note';
  fs.writeFileSync(statePath(directory), JSON.stringify(state), 'utf8');

  assert.throws(
    () => loadStore(directory).getState(),
    error => error.name === 'ModerationStoreError' && error.code === 'STATE_CORRUPT',
  );
}));

test('persisted audit rejects unknown raw URL and error fields', () => withDirectory(directory => {
  const store = loadStore(directory);
  assert.equal(store.setMode('monitor', ACTOR_ID, 0).ok, true);
  const state = JSON.parse(fs.readFileSync(statePath(directory), 'utf8'));
  state.audit[0].rawUrl = 'https://private-sentinel.example/secret';
  state.audit[0].rawError = 'PRIVATE-RAW-ERROR-SENTINEL';
  fs.writeFileSync(statePath(directory), JSON.stringify(state), 'utf8');

  assert.throws(
    () => loadStore(directory).getState(),
    error => error.name === 'ModerationStoreError' && error.code === 'STATE_CORRUPT',
  );
}));
test('a failed atomic rename leaves the prior persisted state untouched', () => withDirectory(directory => {
  const store = loadStore(directory);
  assert.equal(store.setMode('monitor', ACTOR_ID, 0).ok, true);
  const before = fs.readFileSync(statePath(directory), 'utf8');
  const originalRename = fs.renameSync;
  fs.renameSync = () => {
    const error = new Error('simulated rename failure');
    error.code = 'EIO';
    throw error;
  };
  try {
    assert.throws(() => store.setMode('off', ACTOR_ID, 1), /simulated rename failure/);
  } finally {
    fs.renameSync = originalRename;
  }

  assert.equal(fs.readFileSync(statePath(directory), 'utf8'), before);
  assert.deepEqual(loadStore(directory).getMode(), { mode: 'monitor', revision: 1 });
}));

test('capacity evicts only the oldest finalized incident with a persisted panel', () => withDirectory(directory => {
  const active = persistedIncident(1, { status: 'detected', panel: false });
  const finalized = Array.from({ length: 499 }, (_unused, index) => persistedIncident(index + 2));
  writeCapacityState(directory, [active, ...finalized]);
  const store = loadStore(directory);

  const overflow = store.createOrGetIncident(validIncidentInput(501));
  assert.equal(overflow.created, true);
  const incidents = store.listIncidents();
  assert.equal(incidents.length, 500);
  assert.equal(incidents.some(item => item.id === active.id), true);
  assert.equal(incidents.some(item => item.id === finalized[0].id), false);
}));

test('capacity preserves finalized incidents without panels and fails closed', () => withDirectory(directory => {
  const incidents = Array.from({ length: 500 }, (_unused, index) => persistedIncident(index + 1, {
    panel: false,
  }));
  writeCapacityState(directory, incidents);
  const store = loadStore(directory);

  assert.throws(
    () => store.createOrGetIncident(validIncidentInput(501)),
    error => error.name === 'ModerationStoreError' && error.code === 'INCIDENT_CAPACITY',
  );
  assert.equal(store.listIncidents().length, 500);
}));
