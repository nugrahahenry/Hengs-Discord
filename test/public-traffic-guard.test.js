const assert = require('node:assert/strict');
const test = require('node:test');

const { createPublicTrafficGuard } = require('../src/guilds/public-traffic-guard');

const GUILD_A = '123456789012345678';
const GUILD_B = '223456789012345678';

test('public traffic guard allows one concurrent request per guild', () => {
  const guard = createPublicTrafficGuard();
  const first = guard.acquire(GUILD_A);
  assert.equal(first.ok, true);
  assert.deepEqual(guard.acquire(GUILD_A), { ok: false, code: 'PUBLIC_GUILD_BUSY' });
  const other = guard.acquire(GUILD_B);
  assert.equal(other.ok, true);
  first.release();
  assert.equal(guard.acquire(GUILD_A).ok, true);
  other.release();
});

test('public traffic guard release is idempotent', () => {
  const guard = createPublicTrafficGuard();
  const lease = guard.acquire(GUILD_A);
  lease.release();
  lease.release();
  assert.equal(guard.acquire(GUILD_A).ok, true);
});

test('public traffic guard applies a rolling request limit per guild', () => {
  let clock = 0;
  const guard = createPublicTrafficGuard({ maxRequests: 2, windowMs: 1000, now: () => clock });
  const first = guard.acquire(GUILD_A);
  first.release();
  clock = 1;
  const second = guard.acquire(GUILD_A);
  second.release();
  assert.deepEqual(guard.acquire(GUILD_A), { ok: false, code: 'PUBLIC_GUILD_RATE_LIMITED' });
  assert.equal(guard.acquire(GUILD_B).ok, true);
  clock = 1001;
  assert.equal(guard.acquire(GUILD_A).ok, true);
});

test('public traffic guard rejects invalid configuration and guild IDs', () => {
  assert.throws(() => createPublicTrafficGuard({ maxRequests: 0 }), /PUBLIC_TRAFFIC_CONFIG_INVALID/);
  assert.throws(() => createPublicTrafficGuard({ windowMs: 0 }), /PUBLIC_TRAFFIC_CONFIG_INVALID/);
  const guard = createPublicTrafficGuard();
  assert.throws(() => guard.acquire('../unsafe'), /GUILD_ID_INVALID/);
});
