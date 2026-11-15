'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/esports/daily');
const { standings } = require('../src/esports/league');

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

test('event recap data names the champion, the final, top heroes and the Liga Tebak table by display name', () => {
  const games = [match('a', [ONIC, RRQ], START, [1, 1]), match('b', [EVOS, RRQ], START + 3 * HOUR, [1, 1]),
    match('f', [ONIC, EVOS], START + 50 * HOUR, [2, 1, 2], { mvp: 'Branz' })];
  const state = { complete: true, matches: games, final: games[2] };
  const table = standings({ u1: { points: 5, right: 3, votes: 3, hot: 2 }, u2: { points: 1, right: 1, votes: 3, hot: 0 } });
  const data = d.eventRecapData(state, 'MPL ID S18 Playoffs', { table, names: { u1: 'Henry' } });
  assert.equal(data.headline, 'EVOS juara!');
  assert.equal(data.subline, 'Final: ONIC 1-2 EVOS · runner-up ONIC · MVP final Branz');
  assert.deepEqual(data.sections.at(-1), { heading: 'Klasemen final Liga Tebak',
    lines: ['Juara Liga Tebak: Henry', '1. Henry · 5 poin (3 benar dari 3)', '2. Anggota · 1 poin (1 benar dari 3)'] });
  assert.equal(d.eventRecapData(state, 'MPL ID S18 Playoffs').sections.length, 1); // no table: no Liga section
  assert.equal(d.eventCaption(state, 'MPL ID S18 Playoffs'), '**EVOS juara MPL ID S18 Playoffs!** Rekap lengkapnya ada di kartu.');
  assert.equal(d.eventCaption(state, 'MPL ID S18 Playoffs', null, ['Henry', 'Dara']),
    '**EVOS juara MPL ID S18 Playoffs!** Rekap lengkapnya ada di kartu.\nJuara Liga Tebak: Henry dan Dara 🏆');
  assert.equal(d.cleanName('🔥 Henry ✨'), 'Henry');
  for (const text of [JSON.stringify(data), d.dayCaption(games, '2026-11-04')]) assert.doesNotMatch(text, /[\u2013\u2014]/);
});

test('the busy-day list shows every match and marks the ones with predictions', () => {
  const list = [match('a', [ONIC, RRQ], START), match('b', [EVOS, T('alter ego', 'AE')], START + HOUR)];
  const data = d.compactData(list, '2026-11-04', new Set(['a']));
  assert.deepEqual(data.sections[0].lines, ['15:00 WIB · ONIC vs RRQ · Bo3 · ada tebakan', '16:00 WIB · EVOS vs AE · Bo3']);
  assert.equal(d.compactCaption(list, '2026-11-04'), '**Jadwal Rabu, 4 Nov 2026**: 2 laga. Tombol tebakan ada di kartu laga unggulan di bawah.');
});

test('fact cards list exactly what the card shows, and the Analis card covers 7 days, today and what comes next', () => {
  const data = d.previewData(match('next', [ONIC, RRQ], START), []);
  assert.deepEqual(d.factsOf(data).split('\n').slice(0, 4), ['MPL ID S18 Playoffs · Upper Bracket', 'Rabu, 4 Nov 2026', '15:00 WIB · Bo3', 'ONIC vs RRQ HOSHI']);
  const recap = d.factsOf({ title: 'Rekap', date: 'Rabu', headline: 'EVOS juara!', sections: [{ heading: 'Hasil', lines: ['ONIC 2-0 RRQ'] }] });
  assert.equal(recap, 'Rekap\nRabu\nEVOS juara!\nHasil: ONIC 2-0 RRQ');
  const now = START + 5 * HOUR;
  const card = d.analisCard([match('old', [ONIC, RRQ], START - 9 * 24 * HOUR, [1, 1]), match('a', [ONIC, RRQ], START - 24 * HOUR, [1, 1], { mvp: 'Kairi' }),
    match('t', [EVOS, ONIC], START + 6 * HOUR), match('n', [EVOS, RRQ], START + 30 * HOUR)], now);
  assert.match(card, /Hasil 7 hari terakhir:\n- Selasa, 3 Nov 2026 · MPL ID S18 Playoffs · ONIC 2-0 RRQ HOSHI · MVP Kairi/);
  assert.match(card, /Jadwal hari ini:\n- 21:00 WIB · EVOS vs ONIC/);
  assert.match(card, /Jadwal berikutnya:\n- Kamis, 5 Nov 2026 21:00 WIB · EVOS vs RRQ HOSHI/);
  assert.match(card, /Hero terlaris 7 hari: /);
  assert.doesNotMatch(card, /26 Okt/); // the match from 9 days ago is out
  const asked = d.analisCard([match('a', [ONIC, RRQ], START - 24 * HOUR, [1, 1])], now, 'Lancelot sama Fanny gimana?');
  assert.match(asked, /Hero yang ditanya:\nLancelot: dipick 2 kali \(menang 2\), diban 0 kali dalam 7 hari terakhir\nFanny: dipick 0 kali \(menang 0\), diban 2 kali/);
  assert.doesNotMatch(card, /Hero yang ditanya/);
  assert.equal(d.analisCard([], now), '');
});

test('the night recap marks the Laga Panas and shows the Liga Tebak standings so far, top 5', () => {
  const a = match('a', [ONIC, RRQ], START, [1, 1]);
  const votes = { a: { u1: 1, u2: 2, u3: 1, u4: 1 } };
  const rows = standings(Object.fromEntries(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((u, i) => [u, { points: 10 - i, right: 3, votes: 3, hot: 0 }])));
  const data = d.dayRecapData([a], '2026-11-04', votes, { hot: new Set(['a']), tables: [{ event: 'MPL ID S18 Playoffs', key: 'k', rows }],
    names: { u1: 'Henry' } });
  assert.deepEqual(data.sections[0].lines, ['ONIC 2-0 RRQ · 75% nebak bener (4 orang)', 'Laga Panas: ONIC vs RRQ (4 penebak, poin dobel)']);
  const table = data.sections.find(section => section.heading === 'Klasemen sementara MPL ID S18 Playoffs');
  assert.equal(table.heading, 'Klasemen sementara MPL ID S18 Playoffs');
  assert.deepEqual(table.lines, ['1. Henry · 10 poin (3 benar dari 3)', '2. Anggota · 9 poin (3 benar dari 3)', '3. Anggota · 8 poin (3 benar dari 3)',
    '4. Anggota · 7 poin (3 benar dari 3)', '5. Anggota · 6 poin (3 benar dari 3)']);
  assert.match(data.sections.find(section => section.heading === 'Tebakan member').lines[0], /Henry → ONIC/);
});

test('the recap reveals each finished pick and members who have not reached ranking yet', () => {
  const a = match('a', [ONIC, RRQ], START, [1, 1]);
  const votes = { a: { u1: 1, u2: 2 } };
  const data = d.dayRecapData([a], '2026-11-04', votes, {
    tables: [{ event: 'MPL ID S18 Playoffs', rows: [], participants: [
      { user: 'u1', votes: 2, right: 2, points: 2 },
      { user: 'u2', votes: 1, right: 0, points: 0 },
    ] }], names: { u1: 'Henry', u2: 'Asako' },
  });
  assert.deepEqual(data.sections.at(-2), {
    heading: 'Yang sudah nebak · MPL ID S18 Playoffs',
    lines: ['Henry · 2 tebakan · 2 benar · 2 poin', 'Asako · 1 tebakan · 0 benar · 0 poin'],
  });
  assert.deepEqual(data.sections.at(-1), {
    heading: 'Tebakan member',
    lines: ['ONIC vs RRQ · Henry → ONIC ✅', 'ONIC vs RRQ · Asako → RRQ ❌'],
  });
});

// Pekan Playoff H-1 (owner request, 2026-10-31).
test('the week card lists the event by day with Indonesian slot names, at most 12 matches', () => {
  assert.equal(d.slotName({ key: 'round 1a winner', name: 'Round 1A Winner', ticker: '' }), 'Pemenang Round 1A');
  assert.equal(d.slotName({ key: 'ub final loser', name: 'UB Final Loser' }), 'Kalah UB Final');
  assert.equal(d.slotName(ONIC), 'ONIC'); assert.equal(d.slotName({}), 'TBD');
  const slot = { key: 'round 1a winner', name: 'Round 1A Winner', ticker: '' };
  const data = d.weekData([match('b', [EVOS, slot], START + 24 * HOUR, [], { stage: 'Round 2', bestof: 5 }),
    match('a', [ONIC, RRQ], START, [], { stage: 'Round 1', bestof: 5 })], 'MPL ID S18 Playoffs');
  assert.equal(data.title, 'Jadwal lengkap · MPL ID S18 Playoffs');
  assert.equal(data.date, 'Rabu, 4 Nov 2026 sampai Kamis, 5 Nov 2026');
  assert.deepEqual(data.sections, [{ heading: 'Rabu, 4 Nov 2026', lines: ['15:00 WIB · ONIC vs RRQ · Bo5 · Round 1'] },
    { heading: 'Kamis, 5 Nov 2026', lines: ['15:00 WIB · EVOS vs Pemenang Round 1A · Bo5 · Round 2'] }]);
  const many = d.weekData(Array.from({ length: 13 }, (_, i) => match(`m${i}`, [ONIC, RRQ], START + i * HOUR / 6, [], { stage: '' })), 'E');
  assert.equal(many.date, 'Rabu, 4 Nov 2026');
  assert.equal(many.sections[0].lines.length, 13); // 12 matches and the rest line
  assert.equal(many.sections[0].lines.at(-1), '+1 laga lagi, jadwal lengkap di Liquipedia');
  assert.equal(many.sections[0].lines[0], '15:00 WIB · ONIC vs RRQ · Bo3');
});

test('the week caption says besok or hari ini, explains guesses, Nobar and 🔔, and the live link only when known', () => {
  const evening = d.weekCaption('MPL ID S18 Playoffs', { stream: 'https://www.youtube.com/@MPLIndonesia' });
  assert.match(evening, /^\*\*MPL ID S18 Playoffs mulai besok!\*\*/);
  assert.match(evening, /08:00 WIB/); assert.match(evening, /Liga Tebak/); assert.match(evening, /Bikin Nobar/);
  assert.match(evening, /Mode siaran/); assert.match(evening, /🔔 Ingetin aku/);
  assert.match(evening, /Live: <https:\/\/www\.youtube\.com\/@MPLIndonesia>/);
  const morning = d.weekCaption('M8 World Championship', { today: true });
  assert.match(morning, /mulai hari ini/); assert.doesNotMatch(morning, /Live:/); assert.doesNotMatch(morning, /—/);
});
