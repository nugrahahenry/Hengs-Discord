'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { todayScore, formatTeamRecap, formatPlayerStats } = require('../src/scrim/stats');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 21, 5, 0); // 21 Okt 2026, 12:00 WIB
const A = '323456789012345678', B = '423456789012345678';
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
let seq = 0;

function g(over = {}) {
  seq += 1;
  return { messageId: String(800000000000000000n + BigInt(seq)), at: NOW - DAY, submitterId: A, opponent: 'Tim Garuda',
    outcome: 'menang', reason: null, lineup: [A], note: '', ...over };
}
const loss = (reason, over = {}) => g({ outcome: 'kalah', reason, ...over });

test('under five games every number shows n, says belum cukup data and never a percent', () => {
  const text = formatTeamRecap([g(), loss('teamfight'), g()], { now: NOW });
  assert.match(text, /^📒 \*\*Rekap scrim Hengs Family \(MLBB\)\*\*/);
  assert.match(text, /Semua: menang 2 dari 3 game, belum cukup data\./);
  assert.match(text, /Alasan kalah \(1 kalah\): teamfight 1\. Belum cukup data buat kesimpulan\./);
  assert.doesNotMatch(text, /%/);
  assert.match(formatTeamRecap([g()], { now: NOW }), /Alasan kalah: belum ada kekalahan\./);
  assert.match(formatTeamRecap([], { now: NOW }), /Belum ada game tercatat\./);
});

test('from five games the percent appears and 7 and 30 day windows count only recent games', () => {
  const games = [g({ at: NOW - 40 * DAY }), g({ at: NOW - 20 * DAY }), loss('early', { at: NOW - 10 * DAY }),
    g({ at: NOW - 3 * DAY }), loss('draft', { at: NOW - DAY })];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Semua: menang 3 dari 5 game \(60%\)\./);
  assert.match(text, /7 hari: menang 1 dari 2 game, belum cukup data\./);
  assert.match(text, /30 hari: menang 2 dari 4 game, belum cukup data\./);
  assert.match(text, /Form 5 game terakhir \(terbaru di kanan\): M M K M K/);
  assert.match(formatTeamRecap([g({ at: NOW - 40 * DAY })], { now: NOW }), /7 hari: belum ada game\./);
});

test('the most frequent loss reason is named only from five losses and never on a tie', () => {
  const clear = [loss('teamfight'), loss('objective'), loss('teamfight'), loss('early'), loss('teamfight')];
  assert.match(formatTeamRecap(clear, { now: NOW }),
    /Alasan kalah \(5 kalah\): teamfight 3, early game 1, objective 1\. Paling sering: teamfight \(3 dari 5\)\./);
  const tie = [loss('teamfight'), loss('draft'), loss('teamfight'), loss('draft'), loss('early')];
  assert.match(formatTeamRecap(tie, { now: NOW }),
    /teamfight 2, draft 2, early game 1\. Belum ada satu alasan yang paling sering\./);
});

test('opponents group regardless of case and spacing under the newest spelling, top five only', () => {
  const games = [g({ opponent: 'tim  garuda' }), loss('draft', { opponent: 'Tim Garuda' }),
    ...['A', 'B', 'C', 'D', 'E'].map(name => g({ opponent: `Lawan ${name}` }))];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Per lawan:\n• Tim Garuda: menang 1 dari 2 game\n• Lawan A: menang 1 dari 1 game\n/);
  assert.match(text, /• dan 1 lawan lain/);
  assert.doesNotMatch(text, /Lawan E/);
});

test('notes show the newest three, cut, escaped and dated in WIB', () => {
  const games = [g({ note: 'pertama' }), g({ note: 'kedua' }),
    loss('objective', { note: 'ketiga **tebal**', at: Date.UTC(2026, 9, 19, 17, 30) }), g({ note: 'x'.repeat(200) })];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Catatan terakhir:\n• 20 Okt vs Tim Garuda, menang: x{117}\.\.\.\n/);
  assert.match(text, /• 20 Okt vs Tim Garuda, kalah \(objective\): ketiga \\\*\\\*tebal\\\*\\\*\n• 20 Okt vs Tim Garuda, menang: kedua/);
  assert.doesNotMatch(text, /pertama/);
});

test('an opponent recap filters to that opponent and drops the per-opponent block', () => {
  const games = [g(), loss('draft', { opponent: 'Lawan Lain' }), loss('early', { opponent: 'tim garuda', note: 'mereka spam Fanny' })];
  const text = formatTeamRecap(games, { opponent: 'TIM  GARUDA', now: NOW });
  assert.match(text, /^📒 \*\*Rekap scrim vs tim garuda\*\*/);
  assert.match(text, /Semua: menang 1 dari 2 game, belum cukup data\./);
  assert.match(text, /mereka spam Fanny/);
  assert.doesNotMatch(text, /Per lawan|Lawan Lain/);
  assert.match(formatTeamRecap(games, { opponent: 'Tim Baru', now: NOW }), /Belum ada game vs lawan ini yang tercatat\./);
});

test('player stats count only games with the player in the lineup and frame reasons as team labels', () => {
  const games = [g({ lineup: [A, B] }), loss('teamfight', { lineup: [B] }), loss('objective', { lineup: [A] })];
  const text = formatPlayerStats(games, A, { now: NOW });
  assert.match(text, /^📒 \*\*Statistik scrim kamu/);
  assert.match(text, /Semua: menang 1 dari 2 game, belum cukup data\./);
  assert.match(text, /Alasan kalah \(1 kalah\): objective 1\./);
  assert.doesNotMatch(text, /teamfight/);
  assert.match(text, /label tim, bukan nilai pribadi/);
  assert.match(formatPlayerStats(games, '523456789012345678', { now: NOW }), /Belum ada game dengan kamu di lineup/);
});

test('today score counts one opponent on one WIB day', () => {
  const late = Date.UTC(2026, 9, 20, 16, 30); // 23:30 WIB, 20 Okt
  const early = Date.UTC(2026, 9, 20, 17, 30); // 00:30 WIB, 21 Okt
  const games = [g({ at: late }), loss('draft', { at: early, opponent: 'TIM GARUDA' }), g({ at: early + 3_600_000 }),
    g({ at: early, opponent: 'Lawan Lain' })];
  assert.deepEqual(todayScore(games, 'tim  garuda', early + 7_200_000), { won: 1, lost: 1 });
  assert.deepEqual(todayScore(games, 'Tim Garuda', late), { won: 1, lost: 0 });
});

test('worst-case recaps stay within the Discord limit without long dashes', () => {
  const games = Array.from({ length: 12 }, (_, n) => loss('teamfight', {
    opponent: `${'_'.repeat(58)}${String(n).padStart(2, '0')}`, note: '*'.repeat(300) }));
  for (const text of [formatTeamRecap(games, { now: NOW }), formatPlayerStats(games, A, { now: NOW })]) {
    assert.ok(text.length <= 2000, String(text.length));
    assert.doesNotMatch(text, LONG_DASH);
  }
  assert.doesNotMatch(formatTeamRecap([g(), loss('lainnya', { note: 'DC' })], { now: NOW }), LONG_DASH);
});
