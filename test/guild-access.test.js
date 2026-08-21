const assert = require('node:assert/strict');
const test = require('node:test');

const { createGuildAccess } = require('../src/guilds/access');

const HOME = '123456789012345678';
const PUBLIC = '223456789012345678';
const OTHER = '323456789012345678';

test('guild access separates home, pending public, active public, invalid, and DM scopes', () => {
  const configs = new Map();
  const access = createGuildAccess({
    homeGuildId: HOME,
    store: { get: guildId => configs.get(guildId) || null },
  });

  assert.equal(access.classify(HOME).kind, 'home');
  assert.equal(access.classify(PUBLIC).kind, 'pending');
  assert.equal(access.classify(OTHER).kind, 'pending');
  assert.equal(access.classify('invalid').kind, 'denied');
  assert.equal(access.classify(null).kind, 'dm');

  configs.set(PUBLIC, { status: 'active', features: { mentionChat: true } });
  assert.equal(access.classify(PUBLIC).kind, 'public');
});

test('guild access fails closed when public config cannot be validated', () => {
  const access = createGuildAccess({
    homeGuildId: HOME,
    store: { get: () => { throw new Error('GUILD_CONFIG_INVALID'); } },
  });
  assert.deepEqual(access.classify(PUBLIC), { kind: 'denied', code: 'CONFIG_INVALID' });
});
