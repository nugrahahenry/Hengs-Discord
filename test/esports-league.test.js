'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hotMatchIds, pointsFor, standings, champions, rankOf, championCard } = require('../src/esports/league');

const voters = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`u${i}`, 1]));

test('the Laga Panas is the voted match with the most voters, at least 3, and ties all count', () => {
  const matches = ['a', 'b', 'c', 'd'].map(id => ({ id }));
  assert.deepEqual([...hotMatchIds(matches, { a: voters(4), b: voters(3), c: voters(4) })], ['a', 'c']);
  assert.deepEqual([...hotMatchIds(matches, { a: voters(2), b: voters(1) })], []);
  assert.deepEqual([...hotMatchIds(matches, {})], []);
});

test('a right guess is 1 point, 2 on a Laga Panas, and every pick counts as a guess', () => {
  assert.deepEqual(pointsFor({ u1: 1, u2: 2 }, 1, 2), { u1: { points: 2, right: 1, votes: 1, hot: 1 }, u2: { points: 0, right: 0, votes: 1, hot: 0 } });
  assert.deepEqual(pointsFor({ u1: 1 }, 1, 1), { u1: { points: 1, right: 1, votes: 1, hot: 0 } });
  assert.deepEqual(pointsFor(undefined, 1, 1), {});
});

test('standings need 3 guesses and go by points, then accuracy, then guesses; equal members share the rank', () => {
  const users = {
    raka: { points: 5, right: 3, votes: 3, hot: 2 },
    dara: { points: 4, right: 2, votes: 3, hot: 2 },
    sky: { points: 4, right: 2, votes: 4, hot: 2 }, // same points, lower accuracy than dara
    budi: { points: 4, right: 2, votes: 3, hot: 2 }, // equal to dara on everything
    eko: { points: 9, right: 5, votes: 2, hot: 4 }, // only 2 guesses: not ranked
  };
  assert.deepEqual(standings(users).map(r => [r.user, r.rank]), [['raka', 1], ['budi', 2], ['dara', 2], ['sky', 4]]);
  assert.deepEqual(champions(standings(users)).map(r => r.user), ['raka']);
  const tied = { a: { points: 3, right: 2, votes: 3, hot: 1 }, b: { points: 3, right: 2, votes: 3, hot: 1 } };
  assert.deepEqual(champions(standings(tied)).map(r => r.user), ['a', 'b']);
  assert.deepEqual(standings({}), []);
});

test('a member sees their rank, or that they are not ranked yet', () => {
  const users = { raka: { points: 5, right: 3, votes: 3, hot: 2 }, eko: { points: 2, right: 1, votes: 2, hot: 1 } };
  assert.deepEqual(rankOf(users, 'raka'), { rank: 1, of: 1, entry: users.raka });
  assert.deepEqual(rankOf(users, 'eko'), { rank: null, of: 1, entry: users.eko });
  assert.deepEqual(rankOf(users, 'nobody'), { rank: null, of: 1, entry: null });
});

test('the champion card names the champions safely, or gives up when no name is left', () => {
  const row = { points: 5, right: 3, votes: 3 };
  const one = championCard('MPL ID S18 Playoffs', [{ user: 'u1', ...row }], { u1: 'Raka@Sky' }, '2026-11-08');
  assert.deepEqual(one, { recipient: 'RakaSky', achievement: 'Juara Liga Tebak MPL ID S18 Playoffs dengan 5 poin (3 benar dari 3 tebakan)',
    occasion: 'MPL ID S18 Playoffs', date: 'Minggu, 8 Nov 2026' });
  const two = championCard('M8', [{ user: 'u1', ...row }, { user: 'u2', ...row }], { u1: 'Raka', u2: 'Dara' }, '2026-11-08');
  assert.equal(two.recipient, 'Raka dan Dara'); assert.equal(two.players, undefined);
  const long = 'Pemain Dengan Nama Panjang';
  const many = championCard('M8', ['a', 'b', 'c', 'd'].map(user => ({ user, ...row })),
    { a: `${long} A`, b: `${long} B`, c: `${long} C`, d: `${long} D` }, '2026-11-08');
  assert.equal(many.recipient, 'Juara bersama Liga Tebak');
  assert.equal(many.players, `${long} A; ${long} B; ${long} C; ${long} D`);
  assert.equal(championCard('M8', [{ user: 'u1', ...row }], {}, '2026-11-08'), null);
});

// commentator.js is left out: its caption check lists these words to reject them.
test('Analis copy never uses betting words', () => {
  const dir = path.join(__dirname, '..', 'src', 'esports');
  for (const file of ['league.js', 'daily.js', 'presentation.js', 'service.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /\b(taruhan|odds|judi|bandar|hadiah uang)\b/i, file);
  }
});
