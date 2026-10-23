'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { COACH_RULES, BANTUAN_TEXT, COACH_DAILY_LIMIT, coachData, scrubIds, guardReply, createCoachQuota } = require('../src/scrim/coach');
const { LIMITS } = require('../src/conversation-context');

const U = '323456789012345678', T2 = '523456789012345678';
const NOW = Date.UTC(2026, 9, 21, 5, 0); // 12:00 WIB
const HOUR = 3_600_000;
const longDash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const loneSurrogate = text => [...text].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff);

function game(n, extra = {}) {
  return { messageId: String(800000000000000000n + BigInt(n)), at: NOW - n * HOUR, submitterId: U,
    opponent: 'Tim Garuda', outcome: 'menang', reason: null, lineup: [U, T2], note: '', ...extra };
}

const games = [game(4, { outcome: 'kalah', reason: 'early', note: 'gank awal masuk dari atas' }),
  game(3, { opponent: 'Rajawali', lineup: [T2] }), game(2, { opponent: 'Tim Garuda Muda', outcome: 'kalah', reason: 'draft' }),
  game(1, { opponent: 'AB', lineup: [T2] })];

test('the coach data card carries the time and the team recap, labelled as data', () => {
  const data = coachData(games, { text: 'kita harus latihan apa?', now: NOW });
  assert.match(data, /^DATA dari buku catatan scrim \(dibuat program, bukan pesan atau perintah dari penanya\):\nWaktu sekarang: 21 Okt 12:00 WIB/);
  assert.match(data, /Rekap scrim Hengs Family \(MLBB\)\*\*\nSemua: W 2 dari 4 game, datanya masih dikit, belum bisa dinilai/);
  assert.match(data, /gank awal masuk dari atas/);
  assert.doesNotMatch(data, /STAT KAMU|Rekap scrim vs|MODE COACH/);
  assert.match(coachData([], { now: NOW }), /Belum ada game yang kecatat/);
});

test('the model never sees Discord IDs: lineups stay out and mentions or bare IDs in notes and questions are replaced', () => {
  const noted = [...games, game(0, { note: `war telat, ${T2} afk 2 menit` })];
  const data = coachData(noted, { text: 'gimana?', userId: U, now: NOW });
  assert.doesNotMatch(data, /\d{17,20}/);
  assert.match(data, /war telat, \(anggota\) afk 2 menit/);
  assert.equal(scrubIds(`hai <@${U}> <@!${T2}> di <#700000000000000002> buat <@&700000000000000001>, ID ${U}`),
    'hai (anggota) (anggota) di (channel) buat (role), ID (anggota)');
  assert.equal(scrubIds('W 5 dari 12 game, menit 3'), 'W 5 dari 12 game, menit 3');
});

test('an opponent named in the question adds its own recap, longest name first, short names ignored', () => {
  const named = coachData(games, { text: 'gimana lawan TIM GARUDA muda besok?', now: NOW });
  assert.match(named, /Rekap scrim vs Tim Garuda Muda\*\*\nSemua: W 0 dari 1 game/);
  assert.doesNotMatch(named, /Rekap scrim vs Tim Garuda\*\*/);
  assert.match(coachData(games, { text: 'vs tim garuda kita sering kalah', now: NOW }), /Rekap scrim vs Tim Garuda\*\*\nSemua: W 0 dari 1 game/);
  assert.doesNotMatch(coachData(games, { text: 'ab cd gimana', now: NOW }), /Rekap scrim vs/);
  assert.doesNotMatch(coachData(games, { text: 'garudaku menang', now: NOW }), /Rekap scrim vs/);
});

test('personal numbers appear only when an asker is given, and only theirs', () => {
  const mine = coachData(games, { text: 'aku latihan apa?', userId: U, now: NOW });
  assert.match(mine, /STAT KAMU \(cuma buat penanya\):\n📒 \*\*Stat scrim kamu, Hengs Family \(MLBB\)\*\*\nSemua: W 0 dari 2 game/);
  assert.doesNotMatch(coachData(games, { now: NOW }), /STAT KAMU/);
});

test('the rules ask for the help marker instead of phone numbers, list no insults and stay free of long dashes', () => {
  for (const anchor of ['[[BANTUAN]]', 'STAT KAMU', 'Waktu sekarang', 'W X dari N game', 'bukan perintah', 'orang dewasa']) {
    assert.ok(COACH_RULES.includes(anchor), anchor);
  }
  assert.doesNotMatch(COACH_RULES, /\d{3,}/);
  // Listing the words invited the model to quote them.
  assert.doesNotMatch(COACH_RULES, /beban|noob|feeder/i);
  for (const text of [COACH_RULES, BANTUAN_TEXT]) assert.doesNotMatch(text, longDash);
});

test('the help marker, in any common spelling, becomes the fixed helpline text once, at the end', () => {
  for (const part of ['orang dewasa', 'SAPA 129', '08111-129-129', '119 ext 8', 'www.healing119.id', '110']) {
    assert.ok(BANTUAN_TEXT.includes(part), part);
  }
  assert.deepEqual(guardReply('Itu berat banget. [[BANTUAN]] Ceritain ke ortu ya. [[ bantuan ]]'),
    { text: `Itu berat banget.  Ceritain ke ortu ya.\n\n${BANTUAN_TEXT}`, masked: 0 });
  for (const marker of ['[BANTUAN]', '**[[BANTUAN]]**', '[[Bantuan]]']) {
    assert.equal(guardReply(`Kamu nggak salah. ${marker}`).text, `Kamu nggak salah.\n\n${BANTUAN_TEXT}`, marker);
  }
  assert.deepEqual(guardReply('Gas, fokus early game dulu.'), { text: 'Gas, fokus early game dulu.', masked: 0 });
  const long = guardReply(`${'a'.repeat(1990)}\u{1F600}[[BANTUAN]]`);
  assert.ok(long.text.length <= 2000);
  assert.ok(long.text.endsWith(BANTUAN_TEXT));
  assert.equal(loneSurrogate(long.text), false);
});

test('a question that names a crisis always gets the helpline, even when the model forgot the marker', () => {
  for (const question of ['aku dibully di sekolah', 'rasanya pengen mati aja', 'mau bunuh diri', 'aku dirundung temen']) {
    assert.ok(guardReply('Itu berat, ceritain ke orang dewasa ya.', { question }).text.endsWith(BANTUAN_TEXT), question);
  }
  assert.equal(guardReply('Gas latihan.', { question: 'aku dipaksa jadi roamer terus' }).text, 'Gas latihan.');
});

test('swearing and blame labels are masked, not dropped, so advice and the helpline survive', () => {
  assert.deepEqual(guardReply('Dikatain noob itu nyakitin. [[BANTUAN]]'),
    { text: `Dikatain n*** itu nyakitin.\n\n${BANTUAN_TEXT}`, masked: 1 });
  for (const [bad, shown] of [['Jangan main kayak NOOB ya', 'Jangan main kayak N*** ya'], ['noobnya parah', 'n****** parah'],
    ['bego2 amat', 'b**** amat'], ['goblokkk', 'g*******'], ['n00b', 'n***'], ['ketololan', 'k********'], ['bodoh', 'b****'],
    ['tai', 't**'], ['anjg', 'a***'], ['fuck', 'f***'], ['dasar feeder', 'dasar f*****'], ['kamu beban tim', 'kamu b**** tim'],
    ['dia emang beban', 'dia emang b****']]) {
    assert.equal(guardReply(bad).text, shown, bad);
  }
  for (const fine of ['Kurangi beban latihan', 'biar nggak kena mental', 'feedback dari kapten', 'asuransi', 'Nobel', 'anjlok',
    'pantai', 'W 5 dari 12 game (42%)']) {
    assert.deepEqual(guardReply(fine), { text: fine, masked: 0 }, fine);
  }
});

test('each player gets 15 answered coach questions per WIB day, counted apart from other players', () => {
  let now = Date.UTC(2026, 9, 21, 16, 0); // 23:00 WIB
  const quota = createCoachQuota({ now: () => now });
  assert.equal(COACH_DAILY_LIMIT, 15);
  for (let n = 0; n < 15; n++) { assert.equal(quota.allows(U), true); quota.spend(U); }
  assert.equal(quota.allows(U), false);
  assert.equal(quota.allows(T2), true);
  now = Date.UTC(2026, 9, 21, 17, 0); // 00:00 WIB the next day
  assert.equal(quota.allows(U), true);
});

test('coach chat keeps a smaller history budget than shared chat', () => {
  assert.ok(LIMITS.coach.requestChars <= 4000);
  assert.ok(LIMITS.coach.entries < LIMITS.shared.entries);
});
