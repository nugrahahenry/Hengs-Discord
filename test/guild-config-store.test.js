const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createGuildConfigStore } = require('../src/guilds/config-store');

const GUILD_A = '123456789012345678';
const GUILD_B = '223456789012345678';
const OWNER = '323456789012345678';
const ADMIN = '423456789012345678';

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-guild-config-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  let tick = 0;
  const store = createGuildConfigStore({
    rootDir,
    now: () => new Date(Date.UTC(2026, 7, 21, 12, 0, tick++)).toISOString(),
  });
  return { rootDir, store };
}

test('guild config activation is atomic, strict, and idempotent', t => {
  const { rootDir, store } = fixture(t);
  const first = store.activate({
    guildId: GUILD_A,
    ownerId: OWNER,
    setupBy: ADMIN,
  });

  assert.equal(first.created, true);
  assert.equal(first.config.schemaVersion, 1);
  assert.equal(first.config.revision, 1);
  assert.equal(first.config.status, 'active');
  assert.equal(first.config.features.mentionChat, true);
  assert.equal(first.config.guildId, GUILD_A);

  const repeated = store.activate({
    guildId: GUILD_A,
    ownerId: OWNER,
    setupBy: ADMIN,
  });
  assert.equal(repeated.created, false);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.config, first.config);

  assert.deepEqual(store.get(GUILD_A), first.config);
  assert.equal(store.get(GUILD_B), null);
  assert.deepEqual(
    fs.readdirSync(path.join(rootDir, GUILD_A)),
    ['config.json'],
  );
});

test('guild config refresh keeps creation time and increments revision only on change', t => {
  const { store } = fixture(t);
  const first = store.activate({
    guildId: GUILD_A,
    ownerId: OWNER,
    setupBy: OWNER,
  }).config;
  const refreshed = store.activate({
    guildId: GUILD_A,
    ownerId: OWNER,
    setupBy: ADMIN,
  });

  assert.equal(refreshed.created, false);
  assert.equal(refreshed.changed, true);
  assert.equal(refreshed.config.revision, 2);
  assert.equal(refreshed.config.createdAt, first.createdAt);
  assert.notEqual(refreshed.config.updatedAt, first.updatedAt);
  assert.equal(refreshed.config.setupBy, ADMIN);
});

test('guild config rejects unsafe IDs, malformed data, and cross-guild content', t => {
  const { rootDir, store } = fixture(t);
  assert.throws(() => store.get('../outside'), /GUILD_ID_INVALID/);
  assert.throws(() => store.activate({
    guildId: GUILD_A,
    ownerId: 'owner',
    setupBy: ADMIN,
  }), /OWNER_ID_INVALID/);

  const directory = path.join(rootDir, GUILD_A);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ guildId: GUILD_B }));
  assert.throws(() => store.get(GUILD_A), /GUILD_CONFIG_INVALID/);
});

test('guild config fails closed when a managed path is a symlink', t => {
  const { rootDir, store } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-guild-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

  try {
    fs.symlinkSync(outside, path.join(rootDir, GUILD_A), 'junction');
  } catch (error) {
    t.skip(`Symlink tidak tersedia di host test: ${error.code}`);
    return;
  }

  assert.throws(() => store.activate({
    guildId: GUILD_A,
    ownerId: OWNER,
    setupBy: ADMIN,
  }), /GUILD_PATH_UNSAFE/);
});
