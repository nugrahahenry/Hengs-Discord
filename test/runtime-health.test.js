const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const {
  assessRuntimeHealth,
  bindDiscordClientHealth,
  createRuntimeHealth,
} = require('../src/runtime/health');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-runtime-health-'));
  const filePath = path.join(directory, 'runtime-health.json');
  let clock = Date.parse('2026-08-09T00:00:00.000Z');
  const errors = [];
  const health = createRuntimeHealth({
    filePath,
    version: '1.9.0',
    now: () => clock,
    logger: { error: message => errors.push(message) },
  });
  return {
    directory,
    errors,
    filePath,
    health,
    advance(ms) { clock += ms; },
    now() { return clock; },
    cleanup() { health.stop(); fs.rmSync(directory, { recursive: true, force: true }); },
  };
}

test('writes an atomic privacy-safe lifecycle snapshot', () => {
  const f = fixture();
  try {
    assert.equal(f.health.start(), true);
    assert.equal(f.health.start(), false);
    f.advance(2_500);
    assert.equal(f.health.setConnection('CONNECTED'), true);

    const raw = fs.readFileSync(f.filePath, 'utf8');
    const payload = JSON.parse(raw);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.service, 'hengs-discord');
    assert.equal(payload.version, '1.9.0');
    assert.equal(payload.status, 'connected');
    assert.equal(payload.online, true);
    assert.equal(payload.uptimeSeconds, 2);
    assert.equal(payload.connection.status, 'CONNECTED');
    assert.equal(payload.heartbeat.status, 'ALIVE');
    assert.equal(payload.lastIssue, null);
    assert.equal(f.errors.length, 0);
    assert.equal(fs.readdirSync(f.directory).some(name => name.endsWith('.tmp')), false);

    const serialized = JSON.stringify(payload);
    for (const forbidden of ['token', 'guildId', 'userId', 'message', 'exception', 'stack', process.cwd()]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    f.cleanup();
  }
});

test('records only allowlisted issue codes and preserves failure on stop', () => {
  const f = fixture();
  try {
    f.health.start();
    assert.equal(f.health.recordIssue('contains-secret-token'), false);
    assert.equal(f.health.setConnection('FAILED', 'LOGIN_FAILED'), true);
    f.health.stop();

    const payload = JSON.parse(fs.readFileSync(f.filePath, 'utf8'));
    assert.equal(payload.connection.status, 'FAILED');
    assert.deepEqual(payload.lastIssue, {
      code: 'LOGIN_FAILED',
      at: '2026-08-09T00:00:00.000Z',
    });
    assert.equal(JSON.stringify(payload).includes('contains-secret-token'), false);
  } finally {
    f.cleanup();
  }
});

test('consumer assessment fails closed for stale, future, and malformed snapshots', () => {
  const f = fixture();
  try {
    f.health.start();
    f.health.setConnection('CONNECTED');
    const payload = JSON.parse(fs.readFileSync(f.filePath, 'utf8'));

    assert.deepEqual(assessRuntimeHealth(payload, f.now()), {
      available: true,
      online: true,
      stale: false,
      connection: 'CONNECTED',
      ageMs: 0,
    });
    assert.equal(assessRuntimeHealth(payload, f.now() + 90_001).online, false);
    assert.equal(assessRuntimeHealth(payload, f.now() + 90_001).stale, true);
    assert.equal(assessRuntimeHealth(payload, f.now() - 300_001).stale, true);
    assert.equal(assessRuntimeHealth({ schemaVersion: 99 }, f.now()).available, false);
  } finally {
    f.cleanup();
  }
});

test('snapshot write failure is isolated and reports only an OS error code', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-runtime-health-fail-'));
  const blocker = path.join(directory, 'not-a-directory');
  fs.writeFileSync(blocker, 'x', 'utf8');
  const errors = [];
  const health = createRuntimeHealth({
    filePath: path.join(blocker, 'runtime-health.json'),
    version: '1.9.0',
    logger: { error: message => errors.push(message) },
  });

  try {
    assert.doesNotThrow(() => assert.equal(health.write(), false));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /EEXIST|ENOTDIR/);
    assert.equal(errors[0].includes(blocker), false);
  } finally {
    health.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Discord lifecycle mapping reports disconnect, reconnect, recovery, and invalidation', () => {
  const client = new EventEmitter();
  const calls = [];
  let stopping = false;
  const health = {
    setConnection: (...args) => calls.push(['connection', ...args]),
    recordIssue: (...args) => calls.push(['issue', ...args]),
  };
  const events = {
    ClientReady: 'ready',
    Error: 'clientError',
    ShardError: 'shardError',
    ShardDisconnect: 'disconnect',
    ShardReconnecting: 'reconnecting',
    ShardResume: 'resume',
    ShardReady: 'shardReady',
    Invalidated: 'invalidated',
  };
  bindDiscordClientHealth(client, health, events, { isStopping: () => stopping });

  client.emit('shardReady');
  assert.equal(calls.length, 0, 'initial shardReady must wait for ClientReady');
  client.emit('ready');
  client.emit('disconnect');
  client.emit('reconnecting');
  client.emit('resume');
  client.emit('clientError', new Error('private raw error'));
  client.emit('shardError', new Error('private raw gateway error'));
  client.emit('invalidated');

  assert.deepEqual(calls, [
    ['connection', 'CONNECTED'],
    ['connection', 'DISCONNECTED'],
    ['connection', 'RECONNECTING'],
    ['connection', 'CONNECTED'],
    ['issue', 'CLIENT_ERROR'],
    ['connection', 'DEGRADED', 'GATEWAY_ERROR'],
    ['connection', 'INVALIDATED', 'SESSION_INVALIDATED'],
  ]);
  assert.equal(JSON.stringify(calls).includes('private raw'), false);

  stopping = true;
  client.emit('disconnect');
  client.emit('reconnecting');
  assert.equal(calls.length, 7, 'shutdown-generated gateway events must be ignored');
});
