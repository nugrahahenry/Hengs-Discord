const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWaRecoveryAlertConsumer,
} = require('../src/runtime/wa-recovery-alerts');

const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const START = Date.parse('2026-08-11T05:00:00.000Z');

function lifecycle(code, id = IDS[0], at = START) {
  return {
    schemaVersion: 1,
    id,
    service: 'hengs-wa',
    code,
    occurredAt: new Date(at).toISOString(),
  };
}

function setup(t, { dmFails = false, fallbackFails = false, channelGuild = 'guild-1' } = {}) {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-dc-wa-alert-'));
  t.after(() => fs.rmSync(queueDir, { recursive: true, force: true }));
  let now = START;
  const sent = { dm: [], channel: [] };
  const logs = [];
  let rejectDm = dmFails;
  let rejectFallback = fallbackFails;
  const client = {
    users: {
      async fetch(id) {
        assert.equal(id, 'owner-1');
        return {
          async send(payload) {
            if (rejectDm) throw new Error('private DM detail');
            sent.dm.push(payload);
          },
        };
      },
    },
    channels: {
      async fetch(id) {
        assert.equal(id, 'settings-1');
        return {
          guildId: channelGuild,
          isTextBased: () => true,
          async send(payload) {
            if (rejectFallback) throw new Error('private channel detail');
            sent.channel.push(payload);
          },
        };
      },
    },
  };
  const consumer = createWaRecoveryAlertConsumer({
    client,
    queueDir,
    ownerId: 'owner-1',
    settingsChannelId: 'settings-1',
    guildId: 'guild-1',
    now: () => now,
    logger: { error(value) { logs.push(value); }, warn(value) { logs.push(value); } },
  });
  return {
    consumer,
    queueDir,
    sent,
    logs,
    advance(ms) { now += ms; },
    allowDm() { rejectDm = false; },
    allowFallback() { rejectFallback = false; },
    write(value, at = Date.parse(value.occurredAt)) {
      const file = path.join(queueDir, `event-${at}-${value.id}.json`);
      fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      return file;
    },
    pending() {
      return fs.readdirSync(queueDir).filter(name => /^event-.*\.json$/.test(name));
    },
    state() {
      return JSON.parse(fs.readFileSync(path.join(queueDir, 'consumer-state.json'), 'utf8'));
    },
  };
}

test('consumer sends fixed QR alert to owner DM and persists handled state', async (t) => {
  const f = setup(t);
  f.write(lifecycle('QR_REQUIRED'));

  await f.consumer.pollOnce();

  assert.equal(f.sent.dm.length, 1);
  assert.equal(f.sent.channel.length, 0);
  assert.match(f.sent.dm[0].content, /scan QR/i);
  assert.match(f.sent.dm[0].content, /tidak dikirim ke Discord/i);
  assert.deepEqual(f.sent.dm[0].allowedMentions, { parse: [] });
  assert.deepEqual(f.pending(), []);
  assert.equal(f.state().status, 'QR_REQUIRED');
  assert.equal(f.state().problemDelivered, true);
  assert.deepEqual(f.state().handledIds, [IDS[0]]);
  assert.doesNotMatch(JSON.stringify(f.state()), /message|contact|session|private DM detail/i);
});

test('DM failure falls back only to the exact configured private channel', async (t) => {
  const f = setup(t, { dmFails: true });
  f.write(lifecycle('AUTH_FAILED'));

  await f.consumer.pollOnce();

  assert.equal(f.sent.dm.length, 0);
  assert.equal(f.sent.channel.length, 1);
  assert.deepEqual(f.sent.channel[0].allowedMentions, { parse: [] });
  assert.deepEqual(f.pending(), []);
});

test('wrong-guild fallback fails closed and retries with bounded backoff', async (t) => {
  const f = setup(t, { dmFails: true, channelGuild: 'other-guild' });
  f.write(lifecycle('QR_REQUIRED'));

  await f.consumer.pollOnce();
  assert.equal(f.pending().length, 1);
  assert.equal(f.state().retries[IDS[0]].attempts, 1);
  assert.deepEqual(f.state().handledIds, []);
  assert.deepEqual(f.logs, ['[wa-alert] DELIVERY_FAILED']);

  f.allowDm();
  await f.consumer.pollOnce();
  assert.equal(f.sent.dm.length, 0, 'retry backoff must prevent an immediate second send');
  f.advance(30_000);
  await f.consumer.pollOnce();
  assert.equal(f.sent.dm.length, 1);
  assert.deepEqual(f.pending(), []);
});

test('offline problem followed by connected is collapsed without a stale warning', async (t) => {
  const f = setup(t);
  f.write(lifecycle('QR_REQUIRED', IDS[0], START));
  f.write(lifecycle('CONNECTED', IDS[1], START + 1_000));

  await f.consumer.pollOnce();

  assert.equal(f.sent.dm.length, 0);
  assert.equal(f.sent.channel.length, 0);
  assert.deepEqual(f.pending(), []);
  assert.equal(f.state().status, 'HEALTHY');
  assert.deepEqual(f.state().handledIds, [IDS[0], IDS[1]]);
});

test('consumer announces recovery after a previously delivered problem', async (t) => {
  const f = setup(t);
  f.write(lifecycle('QR_REQUIRED', IDS[0], START));
  await f.consumer.pollOnce();
  f.advance(1_000);
  f.write(lifecycle('CONNECTED', IDS[1], START + 1_000));

  await f.consumer.pollOnce();

  assert.equal(f.sent.dm.length, 2);
  assert.match(f.sent.dm[1].content, /terhubung kembali/i);
  assert.equal(f.state().status, 'HEALTHY');
  assert.equal(f.state().problemDelivered, false);
});

test('retry metadata is validated and bounded in persisted state', async (t) => {
  const f = setup(t);
  const retries = {};
  for (let index = 0; index < 600; index += 1) {
    const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
    retries[id] = { attempts: 1, nextAt: START + index };
  }
  fs.writeFileSync(path.join(f.queueDir, 'consumer-state.json'), JSON.stringify({
    schemaVersion: 1,
    status: 'HEALTHY',
    problemDelivered: false,
    lastDeliveredAt: null,
    handledIds: [],
    retries,
  }), 'utf8');
  f.write(lifecycle('CONNECTED'));

  await f.consumer.pollOnce();

  assert.equal(Object.keys(f.state().retries).length, 500);

  const invalid = f.state();
  invalid.retries = { 'not-a-uuid': { attempts: 0, nextAt: 'later' } };
  fs.writeFileSync(path.join(f.queueDir, 'consumer-state.json'), JSON.stringify(invalid), 'utf8');
  f.write(lifecycle('QR_REQUIRED', IDS[1], START + 1));
  await f.consumer.pollOnce();
  assert.equal(f.pending().length, 1);
  assert.equal(f.logs.at(-1), '[wa-alert] STATE_CORRUPT');
});

test('corrupt state leaves queue untouched and logs only a fixed code', async (t) => {
  const f = setup(t);
  f.write(lifecycle('QR_REQUIRED'));
  fs.writeFileSync(path.join(f.queueDir, 'consumer-state.json'), '{secret broken', 'utf8');

  await f.consumer.pollOnce();

  assert.equal(f.pending().length, 1);
  assert.deepEqual(f.logs, ['[wa-alert] STATE_CORRUPT']);
  assert.doesNotMatch(JSON.stringify(f.logs), /secret|broken/);
});

test('oversized event is rejected before its payload is read into memory', async (t) => {
  const f = setup(t);
  const eventFile = f.write(lifecycle('QR_REQUIRED'));
  fs.writeFileSync(eventFile, 'x'.repeat(4097), 'utf8');
  let eventPayloadRead = false;
  const guardedFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'readFileSync') return target[property];
      return (targetFile, ...args) => {
        if (String(targetFile).includes('.processing-')) eventPayloadRead = true;
        return target.readFileSync(targetFile, ...args);
      };
    },
  });
  const consumer = createWaRecoveryAlertConsumer({
    client: {
      users: { async fetch() { throw new Error('must not deliver'); } },
      channels: { async fetch() { throw new Error('must not deliver'); } },
    },
    queueDir: f.queueDir,
    ownerId: 'owner-1',
    settingsChannelId: 'settings-1',
    guildId: 'guild-1',
    fsImpl: guardedFs,
    now: () => START,
    logger: { error(value) { f.logs.push(value); }, warn(value) { f.logs.push(value); } },
  });

  await consumer.pollOnce();

  assert.equal(eventPayloadRead, false);
  assert.equal(fs.readdirSync(path.join(f.queueDir, 'rejected')).length, 1);
  assert.deepEqual(f.logs, ['[wa-alert] INVALID_EVENT']);
});

test('startup recovers stale processing files and rejects malformed payloads privately', async (t) => {
  const f = setup(t);
  const original = f.write(lifecycle('QR_REQUIRED'));
  const processing = `${original}.processing-999`;
  fs.renameSync(original, processing);
  const old = new Date(START - 10 * 60_000);
  fs.utimesSync(processing, old, old);

  f.consumer.start();
  f.consumer.stop();
  assert.equal(fs.existsSync(original), true);

  fs.writeFileSync(original, JSON.stringify({ body: 'secret payload' }), 'utf8');
  await f.consumer.pollOnce();
  const rejected = path.join(f.queueDir, 'rejected');
  assert.equal(fs.readdirSync(rejected).length, 1);
  assert.deepEqual(f.logs, ['[wa-alert] INVALID_EVENT']);
  assert.doesNotMatch(JSON.stringify(f.logs), /secret|payload/);
});
