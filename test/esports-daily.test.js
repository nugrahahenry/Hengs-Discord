'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/esports/daily');

const HOUR = 3_600_000;
const T = (key, ticker) => ({ key, name: key.toUpperCase(), ticker });
const g = (winner, length = '15:00') => ({ number: 1, winner, length, sides: ['blue', 'red'], vod: '', objective: null,
  picks: [['Lancelot', 'Chou', 'Mathilda', 'Grock', 'Floryn'], ['Joy', 'Fredrinn', 'Valentina', 'Hylos', 'Claude']], bans: [['Fanny'], ['Ling']] });
function match(id, teams, startAt, winners = [], extra = {}) {
  const score = [1, 2].map(t => winners.filter(w => w === t).length);
  const finished = Math.max(...score) === 2;
  return { id, page: 'MPL/Indonesia/Season 18/Playoffs', stage: 'Upper Bracket', league: 'MPL ID S18 Playoffs',
    family: 'MPL/Indonesia/Season 18', event: 'MPL ID S18 Playoffs', teams, startAt, bestof: 3, mvp: '',
    games: winners.map((w, i) => ({ ...g(w), number: i + 1 })), score, valid: true, finished, winner: finished ? (score[0] === 2 ? 1 : 2) : 0, ...extra };
}
const ONIC = T('onic', 'ONIC'); const RRQ = T('rrq hoshi', 'RRQ'); const EVOS = T('evos', 'EVOS');
const START = Date.UTC(2026, 10, 4, 8, 0); // 15:00 WIB

test('preview data shows the WIB time, best-of, season record and both hero pools', () => {
  const past = match('old', [RRQ, ONIC], START - 300 * HOUR, [2, 2]);
  const next = match('next', [ONIC, RRQ], START);
  const data = d.previewData(next, [past, next]);
  assert.deepEqual([data.title, data.date, data.time, data.bestof], ['MPL ID S18 Playoffs · Upper Bracket', 'Rabu, 4 Nov 2026', '15:00 WIB', 'Bo3']);
  assert.equal(data.record, 'Musim ini: ONIC 1-0 RRQ (game 2-0)');
  assert.deepEqual(data.heroes[0][0], { name: 'Claude', picks: 2 });
  assert.equal(d.previewData(match('x', [ONIC, EVOS], START), []).record, 'Belum pernah ketemu musim ini');
  assert.match(d.previewCaption(next), /^\*\*ONIC vs RRQ HOSHI\*\* · 15:00 WIB · Bo3\n/);
  assert.notEqual(d.previewHash(next), d.previewHash({ ...next, startAt: START + HOUR }));
});

test('night recap data lists results with vote shares, unfinished matches and the day numbers', () => {
  const a = match('a', [ONIC, RRQ], START, [1, 1], { mvp: 'Kairi' });
  const b = match('b', [EVOS, T('alter ego', 'AE')], START + 3 * HOUR, [2]);
  const data = d.dayRecapData([a, b], '2026-11-04', { a: { u1: 1, u2: 2, u3: 1 } });
  assert.equal(data.date, 'Rabu, 4 Nov 2026');
  assert.deepEqual(data.sections[0], { heading: 'Hasil', lines: ['ONIC 2-0 RRQ · 67% nebak bener (3 orang)', 'EVOS vs AE · belum selesai'] });
  assert.match(data.sections[1].lines[0], /^Hero terlaris: /);
  assert.deepEqual(data.sections[2], { heading: 'MVP', lines: ['Kairi (ONIC)'] });
  assert.equal(d.dayCaption([a, b], '2026-11-04'), '**Rekap Rabu, 4 Nov 2026**: ONIC menang 2-0.');
});

test('event recap data names the champion, the final, top heroes and the top guessers by display name', () => {
  const games = [match('a', [ONIC, RRQ], START, [1, 1]), match('b', [EVOS, RRQ], START + 3 * HOUR, [1, 1]),
    match('f', [ONIC, EVOS], START + 50 * HOUR, [2, 1, 2], { mvp: 'Branz' })];
  const state = { complete: true, matches: games, final: games[2] };
  const votes = { a: { u1: 1, u2: 2 }, b: { u1: 1, u2: 1 }, f: { u1: 2, u2: 1 } };
  const data = d.eventRecapData(state, 'MPL ID S18 Playoffs', votes, { u1: 'Henry' });
  assert.equal(data.headline, 'EVOS juara!');
  assert.equal(data.subline, 'Final: ONIC 1-2 EVOS · runner-up ONIC · MVP final Branz');
  assert.deepEqual(data.sections.at(-1), { heading: 'Penebak paling jitu', lines: ['1. Henry · 3 benar dari 3 tebakan', '2. Anggota · 1 benar dari 3 tebakan'] });
  assert.equal(d.eventCaption(state, 'MPL ID S18 Playoffs'), '**EVOS juara MPL ID S18 Playoffs!** Rekap lengkapnya ada di kartu.');
  assert.equal(d.cleanName('🔥 Henry ✨'), 'Henry');
  for (const text of [JSON.stringify(data), d.dayCaption(games, '2026-11-04')]) assert.doesNotMatch(text, /[\u2013\u2014]/);
});

test('the busy-day list shows every match and marks the ones with predictions', () => {
  const list = [match('a', [ONIC, RRQ], START), match('b', [EVOS, T('alter ego', 'AE')], START + HOUR)];
  const data = d.compactData(list, '2026-11-04', new Set(['a']));
  assert.deepEqual(data.sections[0].lines, ['15:00 WIB · ONIC vs RRQ · Bo3 · ada tebakan', '16:00 WIB · EVOS vs AE · Bo3']);
  assert.equal(d.compactCaption(list, '2026-11-04'), '**Jadwal Rabu, 4 Nov 2026**: 2 laga. Tombol tebakan ada di kartu laga unggulan di bawah.');
});
