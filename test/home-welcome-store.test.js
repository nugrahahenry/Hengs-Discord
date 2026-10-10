const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createHomeWelcomeStore,
  normalizeWelcomeCopy,
  validateHomeWelcomeState,
} = require('../src/guilds/home-welcome-store');

const GUILD = '223456789012345678';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-home-welcome-'));
  return { root, file: path.join(root, 'home-welcome.json') };
}

test('home welcome copy is bounded, atomic, and restart-readable', () => {
  const { file } = fixture();
  const store = createHomeWelcomeStore({
    filePath: file,
    now: () => '2026-10-10T12:00:00.000Z',
  });
  const saved = store.set({ guildId: GUILD, welcomeCopy: 'Halo gaes, selamat datang!' });
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(store.get(GUILD), saved);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), saved);
});

test('home welcome copy rejects mentions, links, controls, and overflow', () => {
  for (const value of [
    '@everyone masuk sini',
    'https://discord.gg/example',
    'baris\nbaru',
    'x'.repeat(181),
  ]) assert.throws(() => normalizeWelcomeCopy(value), /HOME_WELCOME_COPY_INVALID/);
});

test('home welcome state rejects unknown keys and wrong guilds', () => {
  const valid = {
    guildId: GUILD,
    schemaVersion: 1,
    updatedAt: '2026-10-10T12:00:00.000Z',
    welcomeCopy: 'Halo',
  };
  assert.deepEqual(validateHomeWelcomeState(valid, GUILD), valid);
  assert.throws(() => validateHomeWelcomeState({ ...valid, extra: true }, GUILD), /HOME_WELCOME_STATE_INVALID/);
  assert.throws(() => validateHomeWelcomeState(valid, '323456789012345678'), /HOME_WELCOME_STATE_INVALID/);
});

test('home welcome clear removes only a valid regular state file', () => {
  const { file } = fixture();
  const store = createHomeWelcomeStore({
    filePath: file,
    now: () => '2026-10-10T12:00:00.000Z',
  });
  store.set({ guildId: GUILD, welcomeCopy: 'Halo' });
  assert.deepEqual(store.clear({ guildId: GUILD }), { removed: true });
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(store.clear({ guildId: GUILD }), { removed: false });
});
