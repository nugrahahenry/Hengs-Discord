'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { check, createCommentator } = require('../src/esports/commentator');

const CARD = ['MPL ID S18 Playoffs · Upper Bracket', 'Rabu, 4 Nov 2026', '15:00 WIB · Bo5', 'ONIC vs RRQ Hoshi',
  'Musim ini: ONIC 2-0 RRQ (game 6-1)', 'Andalan ONIC: Chou (7 game), Claude (7 game)'].join('\n');
const TEAMS = ['ONIC', 'RRQ Hoshi', 'RRQ', 'EVOS Glory', 'EVOS'];

test('a caption may only name numbers, heroes and teams from the fact card', () => {
  assert.deepEqual(check('ONIC 2-0 di musim ini, Chou siap ngamuk jam 15:00!', CARD, { teams: TEAMS }), { ok: true, bad: [] });
  assert.deepEqual(check('ONIC menang 3-0 pakai Lancelot lawan EVOS', CARD, { teams: TEAMS }).bad, ['3', 'Lancelot', 'EVOS']);
  assert.deepEqual(check('Pasang taruhan buat ONIC', CARD, { teams: TEAMS }).bad, ['taruhan']);
  assert.deepEqual(check('x'.repeat(300), CARD, { max: 250 }).bad, ['terlalu panjang']);
});

test('the commentator retries once with the rejected tokens named, then gives up; JSON trouble gives up at once', async () => {
  const calls = [];
  const replies = ['{"text":"ONIC pakai Lancelot, 3-0!"}', '{"text":"ONIC — 2-0 musim ini, Chou siap!"}'];
  const c = createCommentator({ complete: async messages => { calls.push(messages); return replies.shift(); }, logger: { error() {} } });
  assert.equal(await c.caption('preview', CARD, { teams: TEAMS }), 'ONIC, 2-0 musim ini, Chou siap!');
  assert.match(calls[1][1].content, /ditolak karena menyebut hal di luar fakta: 3, Lancelot/);
  const stubborn = createCommentator({ complete: async () => '{"text":"Lancelot 9-0"}', logger: { error() {} } });
  assert.equal(await stubborn.caption('day', CARD, { teams: TEAMS }), null);
  const broken = createCommentator({ complete: async () => 'not json', logger: { error() {} } });
  assert.equal(await broken.caption('event', CARD), null);
  assert.equal(await createCommentator({ complete: null }).caption('preview', CARD), null);
});

test('an answer may also use what the member asked about', async () => {
  const c = createCommentator({ complete: async () => '{"text":"Lancelot belum dipick di data 7 hari terakhir."}', logger: { error() {} } });
  assert.equal(await c.answer('Lancelot kepake berapa kali?', CARD, { teams: TEAMS }), 'Lancelot belum dipick di data 7 hari terakhir.');
});
