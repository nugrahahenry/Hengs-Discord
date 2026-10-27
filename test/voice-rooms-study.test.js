'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStudyStats, weekOf } = require('../src/voice-rooms/study-stats');
const { ranked, duration, weekLabel, boardText, myMinutesText } = require('../src/voice-rooms/study-board');

const G = '223456789012345678';
const DAY = 86_400_000;
const wib = (day, time) => Date.parse(`${day}T${time}:00+07:00`);

function stats(t, clock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-study-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createStudyStats({ filePath: path.join(dir, 'study.json'), now: () => clock.now });
}

test('weeks run Monday 00:00 to Sunday 23:59 WIB, keyed by the Monday', () => {
  assert.equal(weekOf(wib('2026-11-01', '23:59')), '2026-10-26');
  assert.equal(weekOf(wib('2026-11-02', '00:00')), '2026-11-02');
  assert.equal(weekOf(wib('2026-11-04', '12:00')), '2026-11-02');
});

test('the store adds focus seconds per week, claims each board once, keeps role holders and 12 weeks', t => {
  const clock = { now: wib('2026-11-03', '20:00') };
  const s = stats(t, clock);
  s.add(G, { a: 1500, b: 0 }, clock.now); s.add(G, { a: 300, c: 60 }, clock.now);
  assert.deepEqual(s.week(G, '2026-11-02'), { a: 1800, c: 60 });
  assert.deepEqual(s.week(G, '2026-10-26'), {}); assert.deepEqual(s.week('other', '2026-11-02'), {});
  assert.equal(s.claimBoard(G, '2026-10-26'), true); assert.equal(s.claimBoard(G, '2026-10-26'), false);
  assert.equal(s.role(G), null); s.setRole(G, { roleId: 'r1', holders: ['a'] }); assert.deepEqual(s.role(G), { roleId: 'r1', holders: ['a'] });
  clock.now += 12 * 7 * DAY; s.add(G, { a: 60 }, clock.now);
  assert.deepEqual(s.week(G, '2026-11-02'), {}); // older than 12 weeks: pruned on the next write
  assert.equal(s.claimBoard(G, '2026-10-26'), true);
  assert.deepEqual(s.week(G, weekOf(clock.now)), { a: 60 });
});

test('ranks keep the 25-minute floor, share a rank on equal minutes, and the board shows the top 10', () => {
  const rows = ranked({ a: 9000, b: 9000, c: 4000, d: 1500, e: 1499 });
  assert.deepEqual(rows, [{ user: 'a', seconds: 9000, rank: 1 }, { user: 'b', seconds: 9000, rank: 1 },
    { user: 'c', seconds: 4000, rank: 3 }, { user: 'd', seconds: 1500, rank: 4 }]);
  const text = boardText({ monday: '2026-10-26', rows, total: 25000, roleTo: ['a', 'b'] });
  assert.equal(text, ['📚 **Rajin Belajar** · 26 Okt-1 Nov', '🥇 <@a> · 2 jam 30 menit', '🥇 <@b> · 2 jam 30 menit',
    '🥉 <@c> · 1 jam 6 menit', '4. <@d> · 25 menit', 'Total server: 6 jam 56 menit fokus bareng.',
    'Role **Rajin Belajar** pindah ke <@a> dan <@b>.'].join('\n'));
  const many = ranked(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u${String(i).padStart(2, '0')}`, 2000 + i * 100])));
  const lines = boardText({ monday: '2026-10-19', rows: many, total: 1, roleTo: [] }).split('\n');
  assert.equal(lines[0], '📚 **Rajin Belajar** · 19-25 Okt');
  assert.equal(lines.filter(line => line.includes('<@')).length, 10); // top 10, no role line without a holder
  assert.doesNotMatch(lines.join('\n'), /—/);
});

test('durations, week labels and the Menitku replies', () => {
  assert.deepEqual([0, 59, 2700, 7200, 22500].map(duration), ['0 menit', '0 menit', '45 menit', '2 jam', '6 jam 15 menit']);
  assert.equal(weekLabel('2026-12-28'), '28 Des-3 Jan');
  assert.equal(myMinutesText({ seconds: 4500, rank: 3, count: 8, lastSeconds: 7200 }),
    'Minggu ini: 1 jam 15 menit fokus (peringkat 3 dari 8). Minggu lalu: 2 jam.');
  assert.equal(myMinutesText({ seconds: 600, rank: null, count: 2, lastSeconds: 0 }),
    'Minggu ini: 10 menit fokus. Belum masuk papan, minimal 25 menit.');
  assert.equal(myMinutesText({ seconds: 0, rank: null, count: 0, lastSeconds: 1500 }),
    'Minggu ini belum ada menit fokus. Masuk 📚・Bikin Belajar, terus mulai Pomodoro dari panel room. Minggu lalu: 25 menit.');
});
