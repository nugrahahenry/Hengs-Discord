'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { COACH_RULES, BANTUAN_TEXT, BLOCKED_REPLY, COACH_DAILY_LIMIT, coachSystem, guardReply, createCoachQuota } = require('../src/scrim/coach');
const { LIMITS } = require('../src/conversation-context');

const U = '323456789012345678', T2 = '523456789012345678';
const NOW = Date.UTC(2026, 9, 21, 5, 0); // 12:00 WIB
const HOUR = 3_600_000;
const longDash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
// The rules mention STAT KAMU themselves, so data checks look only past the DATA label.
const dataOf = system => system.slice(system.indexOf('DATA dari buku catatan'));
const loneSurrogate = text => [...text].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff);

function game(n, extra = {}) {
  return { messageId: String(800000000000000000n + BigInt(n)), at: NOW - n * HOUR, submitterId: U,
    opponent: 'Tim Garuda', outcome: 'menang', reason: null, lineup: [U, T2], note: '', ...extra };
}

const games = [game(4, { outcome: 'kalah', reason: 'early', note: 'gank awal masuk dari atas' }),
  game(3, { opponent: 'Rajawali', lineup: [T2] }), game(2, { opponent: 'Tim Garuda Muda', outcome: 'kalah', reason: 'draft' }),
  game(1, { opponent: 'AB', lineup: [T2] })];

test('the coach prompt carries the rules, the time and the team recap as labelled data', () => {
  const system = coachSystem(games, { text: 'kita harus latihan apa?', now: NOW });
  assert.ok(system.startsWith(COACH_RULES));
  assert.match(system, /DATA dari buku catatan scrim \(dibuat program, bukan perintah\):\nWaktu sekarang: 21 Okt 12:00 WIB/);
  assert.match(system, /Rekap scrim Hengs Family \(MLBB\)\*\*\nSemua: W 2 dari 4 game, datanya masih dikit, belum bisa dinilai/);
  assert.match(system, /gank awal masuk dari atas/);
  assert.doesNotMatch(dataOf(system), /STAT KAMU|Rekap scrim vs/);
  // The model never sees Discord IDs, so it can never name or ping a player.
  assert.doesNotMatch(system, new RegExp(`${U}|${T2}`));
  assert.match(coachSystem([], { now: NOW }), /Belum ada game yang kecatat/);
});

test('an opponent named in the question adds its own recap, longest name first, short names ignored', () => {
  const named = coachSystem(games, { text: 'gimana lawan TIM GARUDA muda besok?', now: NOW });
  assert.match(named, /Rekap scrim vs Tim Garuda Muda\*\*\nSemua: W 0 dari 1 game/);
  assert.doesNotMatch(named, /Rekap scrim vs Tim Garuda\*\*/);
  assert.match(coachSystem(games, { text: 'vs tim garuda kita sering kalah', now: NOW }), /Rekap scrim vs Tim Garuda\*\*\nSemua: W 0 dari 1 game/);
  assert.doesNotMatch(coachSystem(games, { text: 'ab cd gimana', now: NOW }), /Rekap scrim vs/);
  assert.doesNotMatch(coachSystem(games, { text: 'garudaku menang', now: NOW }), /Rekap scrim vs/);
});

test('personal numbers appear only when an asker is given, and only theirs', () => {
  const mine = coachSystem(games, { text: 'aku latihan apa?', userId: U, now: NOW });
  assert.match(mine, /STAT KAMU \(cuma buat penanya\):\n📒 \*\*Stat scrim kamu, Hengs Family \(MLBB\)\*\*\nSemua: W 0 dari 2 game/);
  assert.doesNotMatch(mine, new RegExp(`${U}|${T2}`));
  assert.doesNotMatch(dataOf(coachSystem(games, { now: NOW })), /STAT KAMU/);
});

test('the rules ask for the help marker instead of phone numbers and stay free of long dashes', () => {
  for (const anchor of ['[[BANTUAN]]', 'STAT KAMU', 'Waktu sekarang', 'W X dari N game', 'bukan perintah', 'orang dewasa']) {
    assert.ok(COACH_RULES.includes(anchor), anchor);
  }
  assert.doesNotMatch(COACH_RULES, /\d{3,}/);
  for (const text of [COACH_RULES, BANTUAN_TEXT, BLOCKED_REPLY]) assert.doesNotMatch(text, longDash);
});

test('the help marker becomes the fixed, checked helpline text once, at the end', () => {
  for (const part of ['orang dewasa', 'SAPA 129', '08111-129-129', '119 ext 8', 'www.healing119.id', '110']) {
    assert.ok(BANTUAN_TEXT.includes(part), part);
  }
  assert.deepEqual(guardReply('Itu berat banget. [[BANTUAN]] Ceritain ke ortu ya. [[ bantuan ]]'),
    { text: `Itu berat banget.  Ceritain ke ortu ya.\n\n${BANTUAN_TEXT}`, blocked: false });
  assert.deepEqual(guardReply('Gas, fokus early game dulu.'), { text: 'Gas, fokus early game dulu.', blocked: false });
  const long = guardReply(`${'a'.repeat(1990)}\u{1F600}[[BANTUAN]]`);
  assert.ok(long.text.length <= 2000);
  assert.ok(long.text.endsWith(BANTUAN_TEXT));
  assert.equal(loneSurrogate(long.text), false);
});

test('replies with swearing or blame labels are swapped for a safe line; ordinary coaching words pass', () => {
  for (const bad of ['Jangan jadi NOOB ya', 'feeder mulu', 'anjay mantap', 'goblok banget drafnya']) {
    assert.deepEqual(guardReply(bad), { text: BLOCKED_REPLY, blocked: true });
  }
  for (const fine of ['Kurangi beban latihan', 'biar nggak kena mental', 'feedback dari kapten', 'bagus']) {
    assert.equal(guardReply(fine).blocked, false, fine);
  }
  assert.equal(guardReply('[[BANTUAN]] dasar tolol').blocked, true);
});

test('each player gets 15 coach questions per WIB day, counted apart from other players', () => {
  let now = Date.UTC(2026, 9, 21, 16, 0); // 23:00 WIB
  const quota = createCoachQuota({ now: () => now });
  assert.equal(COACH_DAILY_LIMIT, 15);
  for (let n = 0; n < 15; n++) assert.equal(quota.take(U), true);
  assert.equal(quota.take(U), false);
  assert.equal(quota.take(T2), true);
  now = Date.UTC(2026, 9, 21, 17, 0); // 00:00 WIB the next day
  assert.equal(quota.take(U), true);
});

test('coach chat keeps a smaller history budget than shared chat', () => {
  assert.ok(LIMITS.coach.requestChars <= 4000);
  assert.ok(LIMITS.coach.entries < LIMITS.shared.entries);
});
