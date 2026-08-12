const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveInstanceLockFile } = require('../src/runtime/instance-lock');
const {
  createWaRecoveryAlertConsumer,
  isWaRecoveryEnabled,
} = require('../src/runtime/wa-recovery-alerts');

test('instance lock path keeps the local default and requires absolute overrides', () => {
  const expected = path.resolve(__dirname, '..', '.dc-bot.lock');
  assert.equal(resolveInstanceLockFile({}), expected);
  assert.equal(resolveInstanceLockFile({ HENGS_INSTANCE_LOCK_FILE: '   ' }), expected);

  const absolute = path.resolve('C:\\runtime\\hengs-discord.lock');
  assert.equal(resolveInstanceLockFile({ HENGS_INSTANCE_LOCK_FILE: absolute }), absolute);
  assert.throws(
    () => resolveInstanceLockFile({ HENGS_INSTANCE_LOCK_FILE: 'runtime/instance.lock' }),
    error => error.code === 'LOCK_PATH_INVALID',
  );
});

test('WA recovery is locally enabled and invalid explicit values fail closed', () => {
  assert.equal(isWaRecoveryEnabled({}), true);
  assert.equal(isWaRecoveryEnabled({ HENGS_WA_RECOVERY_ALERTS_ENABLED: '' }), true);
  assert.equal(isWaRecoveryEnabled({ HENGS_WA_RECOVERY_ALERTS_ENABLED: 'true' }), true);
  assert.equal(isWaRecoveryEnabled({ HENGS_WA_RECOVERY_ALERTS_ENABLED: 'false' }), false);
  assert.equal(isWaRecoveryEnabled({ HENGS_WA_RECOVERY_ALERTS_ENABLED: 'invalid' }), false);
});

test('disabled WA recovery performs no filesystem, Discord, timer, or logging work', async () => {
  const forbidden = new Proxy({}, {
    get() {
      throw new Error('disabled consumer accessed a dependency');
    },
  });
  const logs = [];
  const consumer = createWaRecoveryAlertConsumer({
    enabled: false,
    client: forbidden,
    fsImpl: forbidden,
    logger: {
      error: value => logs.push(value),
      warn: value => logs.push(value),
    },
  });

  consumer.start();
  await consumer.pollOnce();
  consumer.stop();
  assert.deepEqual(logs, []);
});

test('runtime index resolves cloud switches once and passes them to consumers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.equal(source.match(/resolveInstanceLockFile\(process\.env\)/g)?.length, 1);
  assert.equal(source.match(/isWaRecoveryEnabled\(process\.env\)/g)?.length, 1);
  assert.match(source, /createWaRecoveryAlertConsumer\(\{\s*client,\s*enabled:\s*waRecoveryEnabled,?\s*\}\)/);
  assert.match(source, /WA_RECOVERY_CONFIG_INVALID/);
});

