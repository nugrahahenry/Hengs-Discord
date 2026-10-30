'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NOBAR_ID, reminderDue, reminderText, pingIds, nobarRow, NOBAR_REPLIES } = require('../src/esports/nobar');

const MIN = 60_000;
const START = Date.parse('2026-11-04T13:00:00+07:00');
const match = { id: 'm1', startAt: START, teams: [{ name: 'Alter Ego', ticker: 'AE' }, { name: 'ONIC', ticker: 'ONIC' }] };

test('a reminder is due from 15 minutes before kick-off until the match starts', () => {
  const due = minutes => reminderDue(match, START - minutes * MIN);
  assert.deepEqual([16, 15, 10, 1].map(due), [false, true, true, true]);
  assert.equal(due(0), false); assert.equal(due(-5), false);
  assert.equal(reminderDue({ ...match, startAt: null }, START - MIN), false);
});

test('the reminder names the match, links the guess, lists open Nobar rooms, the live link and the pinged members', () => {
  const full = reminderText({ match, league: 'MPL ID S18 Playoffs', previewUrl: 'https://discord.com/channels/1/2/3',
    rooms: [{ id: '11', count: 4 }, { id: '12', count: 2 }, { id: '13', count: 1 }, { id: '14', count: 9 }],
    stream: 'https://www.youtube.com/@MPLIndonesia', ids: ['a', 'b'] });
  assert.equal(full, [
    `🔴 **Alter Ego vs ONIC** mulai 13:00 WIB (<t:${START / 1000}:R>) · MPL ID S18 Playoffs`,
    'Tebakan ditutup pas laga mulai: https://discord.com/channels/1/2/3',
    'Nobar bareng: <#11> (4 orang), <#12> (2 orang), <#13> (1 orang), atau buka sendiri lewat 🎬・Bikin Nobar',
    'Live: <https://www.youtube.com/@MPLIndonesia>',
    '<@a> <@b>',
  ].join('\n'));
  const bare = reminderText({ match, league: '', rooms: [], ids: [] });
  assert.equal(bare, [`🔴 **Alter Ego vs ONIC** mulai 13:00 WIB (<t:${START / 1000}:R>)`, 'Nobar bareng: buka room lewat 🎬・Bikin Nobar'].join('\n'));
  for (const text of [full, bare, ...Object.values(NOBAR_REPLIES)]) assert.doesNotMatch(text, /—/);
});

test('pings stop at 50 distinct members, and the 🔔 button carries the Nobar id', () => {
  const ids = Array.from({ length: 60 }, (_, i) => `u${i}`);
  assert.equal(pingIds([...ids, 'u1']).length, 50); assert.deepEqual(pingIds(['x', 'x', 'y']), ['x', 'y']);
  const button = nobarRow().toJSON().components[0];
  assert.deepEqual([button.custom_id, button.label, button.emoji.name], [NOBAR_ID, 'Ingetin aku', '🔔']);
});
