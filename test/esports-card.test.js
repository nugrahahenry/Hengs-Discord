'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cardContent, notesFor, renderSeriesCard, wibDate } = require('../src/esports/card');

const FIVE = ['Hylos', 'Hirara', 'Zhuxin', 'Paquito', 'Mathilda'];
const OTHER = ['Atlas', 'Nolan', 'Yve', 'Cici', 'Marcel'];
function match(winners, extra = {}) {
  const sides = i => i % 2 ? ['red', 'blue'] : ['blue', 'red'];
  const score = [1, 2].map(t => winners.filter(w => w === t).length);
  return { id: 'P#R3M1#0', page: 'MPL/Philippines/Season 18/Playoffs', key: 'R3M1', stage: 'Upper Bracket Final', bestof: 5,
    mvp: 'KyleTzy', startAt: Date.UTC(2026, 9, 23, 7, 0), valid: true, finished: true, score,
    winner: score[0] > score[1] ? 1 : 2,
    teams: [{ key: 'team falcons ph', name: 'Team Falcons PH', ticker: 'FLCP' }, { key: 'aurora gaming ph', name: 'Aurora Gaming PH', ticker: 'RORA' }],
    games: winners.map((w, i) => ({ number: i + 1, winner: w, sides: sides(i), length: ['19:47', '13:32', '15:05', '26:42', '11:52'][i],
      vod: '', objective: { team: 1, name: 'Healing Turtle' }, picks: [FIVE, OTHER], bans: [OTHER, FIVE] })),
    ...extra };
}
const META = { league: 'MPL PH S18 Playoffs' };

test('card content shows league, stage, WIB time, score, every game and the MVP', () => {
  const content = cardContent(match([2, 1, 2, 1, 1]), META);
  assert.equal(content.title, 'MPL PH S18 Playoffs · Upper Bracket Final');
  assert.equal(content.date, 'Jumat, 23 Okt 2026 · 14:00 WIB');
  assert.deepEqual(content.teams.map(t => [t.name, t.score, t.won]), [['Team Falcons PH', 3, true], ['Aurora Gaming PH', 2, false]]);
  assert.equal(content.games.length, 5);
  assert.deepEqual(content.games[0], { label: 'Game 1 · 19:47 · RORA menang', sides: 'FLCP biru · RORA merah',
    objective: 'Objektif: Healing Turtle (FLCP)', picks: ['FLCP: Hylos, Hirara, Zhuxin, Paquito, Mathilda', 'RORA: Atlas, Nolan, Yve, Cici, Marcel'],
    bans: 'Ban FLCP: Atlas, Nolan, Yve, Cici, Marcel · RORA: Hylos, Hirara, Zhuxin, Paquito, Mathilda' });
  assert.equal(content.mvp, 'MVP: KyleTzy');
  assert.equal(cardContent(match([1, 1, 1], { mvp: '' }), META).mvp, 'MVP: belum ada di data Liquipedia');
  assert.match(content.footer, /Data: Liquipedia \(CC-BY-SA 3\.0\)/);
  assert.doesNotMatch(JSON.stringify(content), /—/); // no em dash in card copy
});

test('missing drafts and unknown times say so instead of inventing them', () => {
  const m = match([1, 1, 1], { startAt: null });
  m.games[1] = { ...m.games[1], picks: [[], []], bans: [[], []], length: '', objective: null, sides: ['', ''] };
  const content = cardContent(m, META);
  assert.equal(content.date, '');
  assert.deepEqual(content.games[1], { label: 'Game 2 · FLCP menang', sides: '', objective: '', picks: ['Draft belum ada di data Liquipedia'], bans: '' });
  assert.equal(wibDate(Date.UTC(2026, 9, 25, 9, 0)), 'Minggu, 25 Okt 2026 · 16:00 WIB');
});

test('notes come from the numbers: comeback first, then sweep, decider, a hero every game, side, longest game', () => {
  assert.deepEqual(notesFor(match([2, 2, 1, 1, 1])), ['Comeback: Team Falcons PH sempat tertinggal 0-2 lalu menang 3 game beruntun.',
    'Ditentukan di game terakhir (game 5).']);
  assert.deepEqual(notesFor(match([1, 1, 1])), ['Team Falcons PH menang bersih 3-0.', 'FLCP pakai Hylos, Hirara, Zhuxin, Paquito dan Mathilda di semua 3 game.']);
  const mixed = match([2, 1, 2, 1, 1]);
  mixed.games.forEach((g, i) => { g.picks = [[...FIVE.slice(1), `H${i}`], [...OTHER.slice(0, 4), `X${i}`]]; });
  assert.deepEqual(notesFor(mixed), ['Ditentukan di game terakhir (game 5).', 'FLCP pakai Hirara, Zhuxin, Paquito dan Mathilda di semua 5 game.']);
  const plain = match([1, 2, 1, 1]);
  plain.games.forEach((g, i) => { g.picks = [[`A${i}`], [`B${i}`]]; g.sides = ['blue', 'red']; });
  assert.deepEqual(notesFor(plain), ['FLCP menang 3 dari 4 game di sisi biru.', 'Game terlama: game 4 (26:42).']);
});

test('the rendered card is a PNG that grows with the number of games and works without a background asset', async () => {
  const short = await renderSeriesCard(match([1, 1, 1]), META, { background: null });
  const long = await renderSeriesCard(match([2, 1, 2, 1, 1]), META, { background: null });
  assert.deepEqual([...short.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(long.readUInt32BE(20) > short.readUInt32BE(20)); // PNG IHDR height
  assert.equal(short.readUInt32BE(16), 1600); // width
});
