'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { todayScore, formatTeamRecap, formatPlayerStats } = require('../src/scrim/stats');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 21, 5, 0); // 21 Okt 2026, 12:00 WIB
const A = '323456789012345678', B = '423456789012345678';
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// Coach gaul is for kids: no swearing (anjay included), no blaming players, no taunting opponents.
const UNSAFE = /anjay|anjir|bjir|goblok|bego|tolol|beban|noob|feeder|cupu|ampas|kena mental/i;
let seq = 0;

function g(over = {}) {
  seq += 1;
  return { messageId: String(800000000000000000n + BigInt(seq)), at: NOW - DAY, submitterId: A, opponent: 'Tim Garuda',
    outcome: 'menang', reason: null, lineup: [A], note: '', ...over };
}
const loss = (reason, over = {}) => g({ outcome: 'kalah', reason, ...over });

test('under five games every number shows n, says it cannot be judged yet and never a percent', () => {
  const text = formatTeamRecap([g(), loss('teamfight'), g()], { now: NOW });
  assert.match(text, /^📒 \*\*Rekap scrim Hengs Family \(MLBB\)\*\*/);
  assert.match(text, /Semua: W 2 dari 3 game, datanya masih dikit, belum bisa dinilai\n/);
  assert.match(text, /Kalah \(1\): teamfight 1\. Belum cukup buat disimpulin\./);
  assert.doesNotMatch(text, /%/);
  assert.match(formatTeamRecap([g()], { now: NOW }), /Kalah: belum ada L, mantap/);
  assert.match(formatTeamRecap([], { now: NOW }), /Belum ada game yang kecatat\./);
});

test('from five games the percent appears and 7 and 30 day windows count only recent games', () => {
  const games = [g({ at: NOW - 40 * DAY }), g({ at: NOW - 20 * DAY }), loss('early', { at: NOW - 10 * DAY }),
    g({ at: NOW - 3 * DAY }), loss('draft', { at: NOW - DAY })];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Semua: W 3 dari 5 game \(60%\), lumayan gacor 🔥\n/);
  assert.match(text, /7 hari: W 1 dari 2 game, datanya masih dikit, belum bisa dinilai\n/);
  assert.match(text, /30 hari: W 2 dari 4 game, datanya masih dikit, belum bisa dinilai\n/);
  assert.match(text, /Form 5 terakhir \(kanan paling baru\): W W L W L/);
  assert.match(formatTeamRecap([g({ at: NOW - 40 * DAY })], { now: NOW }), /7 hari: belum ada game\n/);
});

test('the hype line sits only on the total and cheers on a losing run instead of mocking it', () => {
  const recent = [g(), g(), g(), loss('draft'), loss('early')];
  const text = formatTeamRecap(recent, { now: NOW });
  assert.match(text, /Semua: W 3 dari 5 game \(60%\), lumayan gacor 🔥\n7 hari: W 3 dari 5 game \(60%\)\n/);
  assert.match(formatTeamRecap([g(), g(), loss('draft'), loss('early'), loss('objective')], { now: NOW }),
    /Semua: W 2 dari 5 game \(40%\), masih naik turun, gas terus\n/);
  assert.match(formatTeamRecap([g(), loss('draft'), loss('early'), loss('objective'), loss('teamfight')], { now: NOW }),
    /Semua: W 1 dari 5 game \(20%\), lagi seret, santuy, gas latihan 💪\n/);
});

test('the most frequent loss reason is named only from five losses and never on a tie', () => {
  const clear = [loss('teamfight'), loss('objective'), loss('teamfight'), loss('early'), loss('teamfight')];
  assert.match(formatTeamRecap(clear, { now: NOW }),
    /Kalah \(5\): teamfight 3, early game 1, objective 1\. Paling sering: teamfight \(3 dari 5\), itu PR latihan berikutnya\./);
  const tie = [loss('teamfight'), loss('draft'), loss('teamfight'), loss('draft'), loss('early')];
  assert.match(formatTeamRecap(tie, { now: NOW }),
    /teamfight 2, draft 2, early game 1\. Alasannya masih rata, belum ada yang paling sering\./);
});

test('opponents group regardless of case and spacing under the newest spelling, top five only', () => {
  const games = [g({ opponent: 'tim  garuda' }), loss('draft', { opponent: 'Tim Garuda' }),
    ...['A', 'B', 'C', 'D', 'E'].map(name => g({ opponent: `Lawan ${name}` }))];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Per lawan:\n• Tim Garuda: W 1 dari 2 game\n• Lawan A: W 1 dari 1 game\n/);
  assert.match(text, /• dan 1 tim lain/);
  assert.doesNotMatch(text, /Lawan E/);
});

test('notes show the newest three, cut, escaped and dated in WIB', () => {
  const games = [g({ note: 'pertama' }), g({ note: 'kedua' }),
    loss('objective', { note: 'ketiga **tebal**', at: Date.UTC(2026, 9, 19, 17, 30) }), g({ note: 'x'.repeat(200) })];
  const text = formatTeamRecap(games, { now: NOW });
  assert.match(text, /Catatan terakhir:\n• 20 Okt vs Tim Garuda, W: x{117}\.\.\.\n/);
  assert.match(text, /• 20 Okt vs Tim Garuda, L \(objective\): ketiga \\\*\\\*tebal\\\*\\\*\n• 20 Okt vs Tim Garuda, W: kedua/);
  assert.doesNotMatch(text, /pertama/);
});

test('cut notes never end on half an emoji', () => {
  const emoji = String.fromCodePoint(0x1f600);
  const text = formatTeamRecap([g({ note: `${'x'.repeat(116)}${emoji}${'y'.repeat(10)}` })], { now: NOW });
  assert.match(text, /: x{116}\.\.\.\n/);
  assert.equal([...text].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff), false);
});

test('an opponent recap filters to that opponent and drops the per-opponent block', () => {
  const games = [g(), loss('draft', { opponent: 'Lawan Lain' }), loss('early', { opponent: 'tim garuda', note: 'mereka spam Fanny' })];
  const text = formatTeamRecap(games, { opponent: 'TIM  GARUDA', now: NOW });
  assert.match(text, /^📒 \*\*Rekap scrim vs tim garuda\*\*/);
  assert.match(text, /Semua: W 1 dari 2 game, datanya masih dikit, belum bisa dinilai\n/);
  assert.match(text, /mereka spam Fanny/);
  assert.doesNotMatch(text, /Per lawan|Lawan Lain/);
  assert.match(formatTeamRecap(games, { opponent: 'Tim Baru', now: NOW }), /Belum ada game vs tim ini yang kecatat\./);
});

test('player stats count only games with the player in the lineup and frame reasons as team labels', () => {
  const games = [g({ lineup: [A, B] }), loss('teamfight', { lineup: [B] }), loss('objective', { lineup: [A] })];
  const text = formatPlayerStats(games, A, { now: NOW });
  assert.match(text, /^📒 \*\*Stat scrim kamu, Hengs Family \(MLBB\)\*\*/);
  assert.match(text, /Semua: W 1 dari 2 game, datanya masih dikit, belum bisa dinilai\n/);
  assert.match(text, /Kalah \(1\): objective 1\./);
  assert.doesNotMatch(text, /teamfight/);
  assert.match(text, /label tim, bukan nilai kamu pribadi/);
  assert.match(formatPlayerStats(games, '523456789012345678', { now: NOW }), /Belum ada game yang ada kamu di lineup/);
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

test('every coach text stays kid-safe whatever the record looks like', () => {
  const losing = Array.from({ length: 8 }, (_, n) => loss(['early', 'objective', 'teamfight', 'draft', 'lainnya'][n % 5]));
  const winning = Array.from({ length: 6 }, () => g());
  for (const games of [[], [g()], losing, winning, [...winning, ...losing]]) {
    for (const text of [formatTeamRecap(games, { now: NOW }), formatPlayerStats(games, A, { now: NOW }),
      formatTeamRecap(games, { opponent: 'Tim Garuda', now: NOW })]) {
      assert.doesNotMatch(text, UNSAFE);
      assert.doesNotMatch(text, LONG_DASH);
    }
  }
});
