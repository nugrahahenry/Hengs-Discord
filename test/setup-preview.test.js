'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSidebar, renderThemeBoard } = require('../src/guilds/setup-preview');
const { CATALOG, THEMES, customTheme } = require('../src/guilds/channel-style');

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const size = buffer => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

test('the sidebar preview is a PNG that grows with the channel list and marks new and renamed channels', async () => {
  const small = await renderSidebar({ sections: [{ category: '🤖 BOT CENTER', channels: [{ name: '🤖・bot-commands' },
    { name: '🤖┃tanya-hengs', isNew: true }] }] });
  const big = await renderSidebar({ sections: [{ category: '──── Hengs ────', channels: [{ name: '🤖・bot-commands' },
    { name: '╰┈➤tanya-hengs🤖', isNew: true }] }, { category: null, channels: [{ name: 'ˌ📊ˈhengs-analis', isNew: true },
    { name: '🔊・Lounge', kind: 'voice' }, { name: '꒰🦄꒱unknown-emoji', renamedFrom: '🦄・unknown-emoji' }] }] });
  assert.deepEqual([...small.subarray(0, 8)], PNG);
  assert.ok(size(big).height > size(small).height);
  assert.equal(size(small).width, size(big).width);
});

test('the theme board shows one column per theme with a category header and sample channels', async () => {
  const sample = CATALOG.slice(0, 2);
  const board = await renderThemeBoard({ sample, category: { emoji: '🤖', label: 'Hengs' } });
  const tall = await renderThemeBoard({ sample: CATALOG, category: { emoji: '🤖', label: 'Hengs' } });
  const withCustom = await renderThemeBoard({ sample, category: { emoji: '🤖', label: 'Hengs' },
    themes: [...THEMES, customTheme({ channel: '{emoji}✦{nama}', category: '✦ {nama} ✦' })] });
  assert.deepEqual([...board.subarray(0, 8)], PNG);
  assert.ok(size(board).width >= 1200);
  assert.ok(size(tall).height > size(board).height);
  assert.ok(size(withCustom).width > size(board).width);
});

test('every emoji a setup package, category or extra uses has a bundled Twemoji picture, so no preview shows a blank tile', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PACKAGES, CATEGORIES, EXTRAS } = require('../src/guilds/community-setup');
  const { nameParts } = require('../src/guilds/channel-style');
  const emoji = [...PACKAGES.flatMap(p => p.channels.map(([e]) => e)), ...Object.values(CATEGORIES).map(c => c.emoji),
    ...Object.values(EXTRAS).map(([e]) => e), ...CATALOG.map(c => c.emoji)];
  const missing = emoji.map(e => nameParts(e)[0].code).filter(code => !fs.existsSync(path.join(__dirname, '../assets/setup/twemoji', `${code}.png`)));
  assert.deepEqual(missing, []);
});
