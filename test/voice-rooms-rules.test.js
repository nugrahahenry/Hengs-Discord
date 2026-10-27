'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TYPES, typeOf } = require('../src/voice-rooms/types');
const { doorType, roomName, renamed, renameAllowed, nextOwner, postText } = require('../src/voice-rooms/rules');

const MIN = 60_000;

test('the seven types keep the approved slots and specials', () => {
  assert.deepEqual(TYPES.map(t => [t.key, t.emoji, t.limit]), [['mabar', '🎮', 5], ['scrim', '⚔️', 10], ['diskusi', '💬', 0],
    ['belajar', '📚', 0], ['nobar', '🎬', 0], ['karaoke', '🎵', 0], ['privat', '🔒', 0]]);
  assert.equal(typeOf('belajar').pushToTalk, true); assert.equal(typeOf('privat').locked, true);
  assert.deepEqual(TYPES.filter(t => t.announce).map(t => [t.key, t.postSlugs || null]),
    [['mabar', null], ['scrim', null], ['belajar', ['belajar-bareng']]]);
  assert.deepEqual(TYPES.filter(t => t.pomodoro).map(t => t.key), ['belajar']);
  assert.equal(typeOf('nope'), null);
});

test('doors are found by name, decorated or not', () => {
  assert.equal(doorType('🎮・Bikin Mabar').key, 'mabar');
  assert.equal(doorType('ˌ⚔️ˈbikin-scrim').key, 'scrim');
  assert.equal(doorType('📚 BIKIN BELAJAR').key, 'belajar');
  for (const name of ['Bikin Room', '🎮 Mabar · Raka', 'Lounge', undefined]) assert.equal(doorType(name), null);
});

test('room names use the type and the cleaned display name, cut to 100 characters', () => {
  const mabar = typeOf('mabar');
  assert.equal(roomName(mabar, 'Raka'), '🎮 Mabar · Raka');
  assert.equal(roomName(mabar, '<@123> ✨'), '🎮 Mabar · 123');
  assert.equal(roomName(mabar, ''), '🎮 Mabar · Anggota');
  assert.equal(roomName(mabar, 'x'.repeat(200)).length, 100);
});

test('a rename keeps the emoji and refuses mentions, links and long names', () => {
  const mabar = typeOf('mabar');
  assert.equal(renamed(mabar, '  Push   rank '), '🎮 Push rank');
  for (const bad of ['', '   ', 'x'.repeat(41), 'cek https://x.y', 'discord.gg/abc', '@everyone', '<@1>']) assert.equal(renamed(mabar, bad), null, bad);
});

test('a room can be renamed twice per 10 minutes', () => {
  const now = 100 * MIN;
  assert.equal(renameAllowed([], now), true);
  assert.equal(renameAllowed([now - MIN], now), true);
  assert.equal(renameAllowed([now - MIN, now - 2 * MIN], now), false);
  assert.equal(renameAllowed([now - 11 * MIN, now - 12 * MIN], now), true);
});

test('the next owner is whoever has been inside longest', () => {
  assert.equal(nextOwner({ u2: 5, u3: 3, u4: 9 }), 'u3');
  assert.equal(nextOwner({}), null);
});

test('the #mabar post shows open slots, full and locked rooms, without em dashes', () => {
  const mabar = typeOf('mabar'); const base = { type: mabar, ownerName: 'Raka', channelId: '42', limit: 5 };
  assert.equal(postText({ ...base, count: 2 }), '🎮 **Raka** buka room Mabar · 2/5 · gas join: <#42>');
  assert.equal(postText({ ...base, count: 5 }), '🎮 **Raka** buka room Mabar · penuh 5/5');
  assert.equal(postText({ ...base, count: 2, locked: true }), '🎮 **Raka** buka room Mabar · 🔒 dikunci');
  assert.equal(postText({ ...base, limit: 0, count: 7 }), '🎮 **Raka** buka room Mabar · 7 orang · gas join: <#42>');
  assert.equal(postText({ ...base, ownerName: '**x**', count: 1 }), '🎮 **\\*\\*x\\*\\*** buka room Mabar · 1/5 · gas join: <#42>');
  assert.equal(postText({ ...base, limit: 0, count: 3, status: '☕ istirahat' }), '🎮 **Raka** buka room Mabar · 3 orang · ☕ istirahat · gas join: <#42>');
});
