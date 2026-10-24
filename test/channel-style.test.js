'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, CATALOG, themeById, customTheme, slugOf, nameParts } = require('../src/guilds/channel-style');

test('the five themes name channels and categories from one emoji, slug and label', () => {
  assert.deepEqual(THEMES.map(t => t.id), ['dot', 'garis', 'pohon', 'kurung', 'plain']);
  const names = id => [themeById(id).channel('🤖', 'tanya-hengs'), themeById(id).category('🤖', 'Hengs')];
  assert.deepEqual(names('dot'), ['🤖・tanya-hengs', '🤖 Hengs']);
  assert.deepEqual(names('garis'), ['🤖︱tanya-hengs', '──── Hengs ────']);
  assert.deepEqual(names('pohon'), ['╰┈➤tanya-hengs🤖', 'Hengs 🤖']);
  assert.deepEqual(names('kurung'), ['ˌ🤖ˈtanya-hengs', '【🤖 Hengs 🤖】']);
  assert.deepEqual(names('plain'), ['tanya-hengs', 'Hengs']);
  assert.throws(() => themeById('neon'), /THEME_UNKNOWN/);
});

test('a custom theme follows the owner patterns and stores what Discord would: lower case, no spaces, 100 chars', () => {
  const theme = customTheme({ channel: '{emoji}✦{nama}', category: '✦ {emoji} {nama} ✦' });
  assert.equal(theme.id, 'custom');
  assert.equal(theme.channel('🤖', 'tanya-hengs'), '🤖✦tanya-hengs');
  assert.equal(theme.category('🤖', 'Hengs'), '✦ 🤖 Hengs ✦');
  assert.equal(customTheme({ channel: '{emoji} | {NAMA}', category: '{nama}' }).channel('🤖', 'tanya-hengs'), '🤖-|-tanya-hengs');
  for (const bad of [{ channel: '{emoji}', category: '{nama}' }, { channel: '{nama}', category: '' }, { channel: 'x'.repeat(95) + '{nama}', category: '{nama}' }])
    assert.throws(() => customTheme(bad), /THEME_PATTERN_INVALID/);
});

test('the catalog holds the Hengs channels with their emoji and slug', () => {
  assert.deepEqual(CATALOG.map(c => [c.key, c.emoji, c.slug]), [
    ['tanya', '🤖', 'tanya-hengs'], ['analis', '📊', 'hengs-analis'], ['scrim', '📸', 'hasil-scrim'],
    ['news', '📰', 'hengs-news'], ['memes', '😂', 'hengs-memes']]);
});

test('a decorated name in any theme reduces to its slug, front and back', () => {
  for (const name of ['🤖・tanya-hengs', '🤖┃tanya-hengs', '🤖︱tanya-hengs', '【🤖】tanya-hengs', 'ˌ🤖ˈtanya-hengs',
    '╰┈➤tanya-hengs🤖', 'tanya-hengs', 'Tanya-Hengs'])
    assert.equal(slugOf(name), 'tanya-hengs', name);
  assert.equal(slugOf('──── Get Started ────'), 'get started');
  assert.equal(slugOf('x・tanya-hengs'), 'x・tanya-hengs');
  assert.equal(slugOf(''), '');
});

test('names split into drawable parts: emoji, drawn separators and text runs', () => {
  assert.deepEqual(nameParts('🤖┃tanya-hengs'), [{ kind: 'emoji', code: '1f916' }, { kind: 'sep', mark: '┃' }, { kind: 'text', text: 'tanya-hengs' }]);
  assert.deepEqual(nameParts('【📊】hengs-analis'), [{ kind: 'sep', mark: '【' }, { kind: 'emoji', code: '1f4ca' }, { kind: 'sep', mark: '】' },
    { kind: 'text', text: 'hengs-analis' }]);
  assert.deepEqual(nameParts('⚙️・settings'), [{ kind: 'emoji', code: '2699' }, { kind: 'sep', mark: '・' }, { kind: 'text', text: 'settings' }]);
  assert.deepEqual(nameParts('╰┈➤welcome😋'), [{ kind: 'text', text: '╰┈➤welcome' }, { kind: 'emoji', code: '1f60b' }]);
  assert.deepEqual(nameParts('ˌ🤖ˈtanya-hengs'), [{ kind: 'text', text: 'ˌ' }, { kind: 'emoji', code: '1f916' }, { kind: 'text', text: 'ˈtanya-hengs' }]);
  assert.deepEqual(nameParts('🤖︱tanya-hengs')[1], { kind: 'sep', mark: '︱' });
  assert.deepEqual(nameParts('general'), [{ kind: 'text', text: 'general' }]);
});

test('voice names keep their case in every theme, the custom one included; emoji and labels come back out of names', () => {
  const { THEMES: all, customTheme: custom, firstEmoji, labelOf } = require('../src/guilds/channel-style');
  assert.deepEqual(all.map(t => t.voice('🔊', 'Lounge')), ['🔊・Lounge', '🔊︱Lounge', '╰┈➤Lounge🔊', 'ˌ🔊ˈLounge', 'Lounge']);
  assert.equal(custom({ channel: '{emoji} {nama}', category: '{nama}' }).voice('🔊', 'Lounge AFK'), '🔊 Lounge AFK');
  assert.equal(firstEmoji('⚙️・settings'), '⚙️'); assert.equal(firstEmoji('╰┈➤welcome😋'), '😋');
  assert.equal(firstEmoji('general'), null);
  assert.equal(labelOf('──── Get Started ────'), 'Get Started'); assert.equal(labelOf('【📌 LIQUIDxPOCO INFO 📌】'), 'LIQUIDxPOCO INFO');
  assert.equal(labelOf('🔊・Lounge'), 'Lounge'); assert.equal(labelOf('🎮 GAMING'), 'GAMING');
});
