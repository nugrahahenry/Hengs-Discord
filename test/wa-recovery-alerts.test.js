const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AlertContractError,
  createDefaultState,
  reduceBatch,
  resolveBridgeDir,
  validateEvent,
} = require('../src/runtime/wa-recovery-alerts');

const projectRoot = path.join(__dirname, '..');
const isHengsWorkspace = /\/HenryLabs\/Hengs\/discord-bot$/i.test(projectRoot.replaceAll('\\', '/'));

test('Discord lifecycle starts one WA recovery consumer and stops it before destroying the client', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const factoryImport = source.indexOf("require('./runtime/wa-recovery-alerts')");
  const clientCreation = source.indexOf('const client = new Client({');
  const consumerCreation = source.indexOf('const waRecoveryAlerts = createWaRecoveryAlertConsumer({ client, enabled: waRecoveryEnabled });');
  const readyHandler = source.indexOf('client.once(Events.ClientReady');
  const readyStart = source.indexOf('waRecoveryAlerts.start();', readyHandler);
  const gracefulStart = source.indexOf('function gracefulShutdown');
  const fatalStart = source.indexOf('function fatalExit');
  const gracefulStop = source.indexOf('waRecoveryAlerts.stop();', gracefulStart);
  const fatalStop = source.indexOf('waRecoveryAlerts.stop();', fatalStart);
  const gracefulDestroy = source.indexOf('client.destroy();', gracefulStart);
  const fatalDestroy = source.indexOf('client.destroy();', fatalStart);

  assert.ok(factoryImport >= 0, 'recovery consumer factory must be imported');
  assert.ok(consumerCreation > clientCreation, 'consumer must be created after the Discord client');
  assert.equal(source.match(/createWaRecoveryAlertConsumer\(\{ client, enabled: waRecoveryEnabled \}\)/g)?.length, 1);
  assert.ok(readyStart > readyHandler, 'consumer must start inside ClientReady');
  assert.ok(gracefulStop > gracefulStart && gracefulStop < gracefulDestroy);
  assert.ok(fatalStop > fatalStart && fatalStop < fatalDestroy);
});

const NOW = Date.parse('2026-08-11T05:00:00.000Z');
const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

function event(code, { id = IDS[0], at = NOW } = {}) {
  return {
    schemaVersion: 1,
    id,
    service: 'hengs-wa',
    code,
    occurredAt: new Date(at).toISOString(),
  };
}

function deliveredState(status, lastDeliveredAt = NOW - 60_000) {
  return {
    ...createDefaultState(),
    status,
    problemDelivered: true,
    lastDeliveredAt,
  };
}

test('validator accepts only the exact bounded lifecycle contract', () => {
  assert.deepEqual(validateEvent(event('QR_REQUIRED'), { now: NOW, sizeBytes: 180 }), {
    ...event('QR_REQUIRED'),
    occurredAtMs: NOW,
  });

  const invalid = [
    [{ ...event('QR_REQUIRED'), body: 'private message' }, 'UNKNOWN_KEYS'],
    [{ ...event('QR_REQUIRED'), id: 'not-a-uuid' }, 'INVALID_ID'],
    [{ ...event('QR_REQUIRED'), service: 'other' }, 'INVALID_SERVICE'],
    [{ ...event('QR_REQUIRED'), code: 'MESSAGE_FROM_ANYU' }, 'INVALID_CODE'],
    [event('QR_REQUIRED', { at: NOW + 5 * 60_000 + 1 }), 'FUTURE_EVENT'],
    [event('QR_REQUIRED', { at: NOW - 24 * 60 * 60_000 - 1 }), 'STALE_EVENT'],
  ];
  for (const [value, code] of invalid) {
    assert.throws(
      () => validateEvent(value, { now: NOW, sizeBytes: 180 }),
      error => error instanceof AlertContractError && error.code === code,
    );
  }
  assert.throws(
    () => validateEvent(event('QR_REQUIRED'), { now: NOW, sizeBytes: 4097 }),
    error => error.code === 'EVENT_TOO_LARGE',
  );
});

test('state machine suppresses healthy startup and offline-resolved incidents', () => {
  const healthy = createDefaultState();
  assert.equal(reduceBatch([event('CONNECTED')], healthy, NOW).notification, null);
  assert.equal(
    reduceBatch([
      event('QR_REQUIRED'),
      event('CONNECTED', { id: IDS[1], at: NOW + 1_000 }),
    ], healthy, NOW + 1_000).notification,
    null,
  );
});

test('state machine selects the strongest actionable problem without duplicate spam', () => {
  const healthy = createDefaultState();
  const qr = event('QR_REQUIRED');
  const duplicateQr = event('QR_REQUIRED', { id: IDS[1], at: NOW + 1_000 });
  const auth = event('AUTH_FAILED');

  assert.equal(reduceBatch([qr, duplicateQr], healthy, NOW + 1_000).notification.code, 'QR_REQUIRED');
  assert.equal(reduceBatch([auth, duplicateQr], healthy, NOW + 1_000).notification.code, 'QR_REQUIRED');
  assert.equal(reduceBatch([qr], deliveredState('QR_REQUIRED'), NOW).notification, null);
  assert.equal(reduceBatch([auth], deliveredState('QR_REQUIRED'), NOW).notification, null);
  assert.equal(reduceBatch([qr], deliveredState('AUTH_FAILED'), NOW).notification.code, 'QR_REQUIRED');
});

test('state machine announces recovery only after a delivered problem', () => {
  const connected = event('CONNECTED');
  assert.equal(
    reduceBatch([connected], deliveredState('QR_REQUIRED'), NOW).notification.code,
    'CONNECTED',
  );
  assert.equal(reduceBatch([connected], createDefaultState(), NOW).notification, null);
});

test('restart reminders use cooldown and never override QR or auth states', () => {
  const restart = event('RECOVERY_RESTART');
  const recent = deliveredState('RESTARTING', NOW - 29 * 60_000);
  const old = deliveredState('RESTARTING', NOW - 31 * 60_000);

  assert.equal(reduceBatch([restart], recent, NOW).notification, null);
  assert.equal(reduceBatch([restart], old, NOW).notification.code, 'RECOVERY_RESTART');
  assert.equal(reduceBatch([restart], deliveredState('AUTH_FAILED'), NOW).notification, null);
  assert.equal(reduceBatch([restart], deliveredState('QR_REQUIRED'), NOW).notification, null);
});

test('Discord and WhatsApp local checkout resolve the same shared runtime directory', {
  skip: !isHengsWorkspace,
}, () => {
  assert.match(
    resolveBridgeDir({}).replaceAll('\\', '/'),
    /\/HenryLabs\/Hengs\/\.runtime\/wa-recovery-alerts$/,
  );
});

test('Discord recovery bridge accepts an explicit portable runtime directory', () => {
  assert.equal(
    resolveBridgeDir({ HENGS_ALERT_BRIDGE_DIR: 'C:\\custom\\alerts' }),
    path.resolve('C:\\custom\\alerts'),
  );
});
