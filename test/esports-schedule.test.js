'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/esports/schedule');

const HOUR = 3_600_000;
const T = (key, ticker = key.toUpperCase()) => ({ key, name: key.toUpperCase(), ticker });
const FIVE = n => [1, 2, 3, 4, 5].map(i => `${n}${i}`);
const game = (winner, { picks = [['Lancelot', 'Chou', 'Mathilda', 'Grock', 'Floryn'], FIVE('B')], bans = [['Joy'], ['Fanny']],
  sides = ['blue', 'red'], length = '15:00' } = {}) => ({ number: 1, winner, picks, bans, sides, length, vod: '', objective: null });
function match(id, teams, startAt, winners = [], extra = {}) {
  const score = [1, 2].map(t => winners.filter(w => w === t).length);
  const need = 2;
  const finished = Math.max(...score) === need;
  return { id, page: 'P', key: 'R1M1', stage: '', league: 'MPL ID S18 Playoffs', family: 'MPL/Indonesia/Season 18', event: 'MPL ID S18 Playoffs',
    teams, startAt, bestof: 3, mvp: '', games: winners.map((w, i) => ({ ...game(w), number: i + 1 })), score, valid: true, finished,
    winner: finished ? (score[0] === need ? 1 : 2) : 0, ...extra };
}
const DAY4 = Date.UTC(2026, 10, 4, 8, 0); // 15:00 WIB, 4 Nov

test('WIB days and minutes; day lists keep known teams only, by start time', () => {
  assert.equal(s.wibDay(Date.UTC(2026, 10, 3, 17, 30)), '2026-11-04');
  assert.equal(s.wibMinutes(Date.UTC(2026, 10, 4, 1, 0)), 8 * 60);
  assert.equal(s.previousDay('2026-11-01'), '2026-10-31');
  const all = [match('b', [T('evos'), T('ae')], DAY4 + 3 * HOUR), match('a', [T('onic'), T('rrq')], DAY4),
    match('tbd', [T('onic'), { key: 'TBD', name: 'TBD', ticker: '' }], DAY4), match('other', [T('btr'), T('geek')], DAY4 + 30 * HOUR)];
  assert.deepEqual(s.dayMatches(all, '2026-11-04').map(m => m.id), ['a', 'b']);
});

test('matchesOf tags matches with their page league, family and event; pages without a family stay out', () => {
  const pages = { A: { matches: [{ id: 'x', teams: [] }] }, B: { matches: [{ id: 'y', teams: [] }] } };
  const all = s.matchesOf(pages, [{ title: 'A', league: 'L', family: 'F', event: 'E' }, { title: 'B', league: 'Old' }]);
  assert.deepEqual(all.map(m => [m.id, m.league, m.family, m.event]), [['x', 'L', 'F', 'E']]);
});

test('head-to-head counts series and games in the family from the asked side; hero pools rank picks', () => {
  const onic = T('onic'); const rrq = T('rrq');
  const all = [match('1', [onic, rrq], DAY4 - 400 * HOUR, [1, 2, 1]), match('2', [rrq, onic], DAY4 - 300 * HOUR, [2, 2]),
    match('3', [onic, rrq], DAY4 - 200 * HOUR, [1, 1], { family: 'Other' }), match('4', [onic, T('evos')], DAY4)];
  assert.deepEqual(s.record(all, 'MPL/Indonesia/Season 18', onic, rrq), { series: [2, 0], games: [4, 1] });
  assert.deepEqual(s.record(all, 'MPL/Indonesia/Season 18', rrq, onic), { series: [0, 2], games: [1, 4] });
  assert.deepEqual(s.heroPool(all, 'MPL/Indonesia/Season 18', onic), [{ name: 'Chou', picks: 3 }, { name: 'Floryn', picks: 3 },
    { name: 'Grock', picks: 3 }]);
  assert.deepEqual(s.heroPool(all, 'MPL/Indonesia/Season 18', T('evos')), []);
});

test('busy days feature four matches: Indonesian or Philippine teams first, shown by start time', () => {
  const day = [1, 2, 3, 4, 5, 6].map(n => match(`m${n}`, [T(`t${n}a`), T(`t${n}b`)], DAY4 + n * HOUR));
  assert.equal(s.featured(day.slice(0, 4)).length, 4);
  day[5].teams[0] = { key: 'indonesia', name: 'Indonesia', ticker: 'IDN' };
  assert.deepEqual(s.featured(day).map(m => m.id), ['m1', 'm2', 'm3', 'm6']);
});

test('stats count picks, bans, the best win rate from three picks, sides, longest and shortest games and MVPs', () => {
  const quick = { ...game(1), length: '9:58', number: 2 };
  const m1 = match('1', [T('onic'), T('rrq')], DAY4, [1, 1], { mvp: 'Kairi' });
  m1.games[1] = quick;
  const m2 = match('2', [T('evos'), T('ae')], DAY4 + 3 * HOUR, [2, 1, 2]);
  m2.games[2] = { ...m2.games[2], length: '24:10' };
  const unfinished = match('3', [T('btr'), T('geek')], DAY4 + 5 * HOUR, [1]);
  const st = s.statsOf([m1, m2, unfinished], { top: 2 });
  assert.equal(st.series, 2); assert.equal(st.games, 5);
  assert.deepEqual(st.picks, [{ name: 'B1', count: 5 }, { name: 'B2', count: 5 }]);
  assert.deepEqual(st.bans[0], { name: 'Fanny', count: 5 });
  assert.deepEqual(st.best, { name: 'Chou', wins: 3, picks: 5 });
  assert.deepEqual(st.sides, { blue: 3, red: 2, decided: 5 });
  assert.equal(st.longest.length, '24:10'); assert.equal(st.shortest.length, '9:58');
  assert.deepEqual(st.mvps.map(x => x.mvp), ['Kairi']);
});

test('an event is complete only when every match on its pages is finished; the final is the last one', () => {
  const a = match('a', [T('onic'), T('rrq')], DAY4, [1, 1]);
  const f = match('f', [T('onic'), T('evos')], DAY4 + 50 * HOUR, [2, 2]);
  const open = match('o', [T('evos'), { key: '', name: '', ticker: '' }], null);
  assert.equal(s.eventState([a, f, open], 'MPL ID S18 Playoffs').complete, false);
  const done = s.eventState([a, f, { ...a, id: 'r', event: null }], 'MPL ID S18 Playoffs');
  assert.equal(done.complete, true); assert.equal(done.final.id, 'f'); assert.equal(done.matches.length, 2);
  assert.equal(s.eventState([], 'X').complete, false);
});
