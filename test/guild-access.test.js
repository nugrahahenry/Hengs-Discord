const assert = require('node:assert/strict');
const test = require('node:test');

const { createGuildAccess, parseBetaGuildIds } = require('../src/guilds/access');

const HOME = '123456789012345678';
const BETA = '223456789012345678';
const DENIED = '323456789012345678';

test('beta allowlist is bounded, deduplicated, and strict', () => {
  assert.deepEqual(parseBetaGuildIds(`${BETA}, ${BETA}`), [BETA]);
  assert.throws(() => parseBetaGuildIds('not-an-id'), /BETA_GUILD_IDS_INVALID/);
  assert.throws(
    () => parseBetaGuildIds(Array.from({ length: 11 }, (_, index) => `123456789012345${String(index).padStart(3, '0')}`).join(',')),
    /BETA_GUILD_LIMIT_EXCEEDED/,
  );
});

test('guild access separates home, pending beta, active beta, denied, and DM scopes', () => {
  const configs = new Map();
  const access = createGuildAccess({
    homeGuildId: HOME,
    betaGuildIds: [BETA],
    store: { get: guildId => configs.get(guildId) || null },
  });

  assert.equal(access.classify(HOME).kind, 'home');
  assert.equal(access.classify(BETA).kind, 'pending');
  assert.equal(access.classify(DENIED).kind, 'denied');
  assert.equal(access.classify(null).kind, 'dm');

  configs.set(BETA, { status: 'active', features: { mentionChat: true } });
  assert.equal(access.classify(BETA).kind, 'beta');
});
