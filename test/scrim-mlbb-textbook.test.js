'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { textbookCard } = require('../src/scrim/mlbb-textbook');

// Henry 2026-10-24 (ex competitive player): MM item cores, item counters, jungle buff rotation, Chou's meta lanes, emblems.
test('the textbook adds the entries a question needs, with source and date, and nothing for other questions', () => {
  const build = textbookCard('build mm yang paling gacor apa?');
  // Henry 2026-10-24: patch 2.2.16a, season 42 (Liquipedia: released 2026-10-14, newest patch page).
  assert.match(build, /^BUKU PINTAR MLBB \(ilmu dari Henry, eks pemain kompetitif; patch 2\.2\.16a rilis 14 Okt 2026, season 42; dicek 24 Okt 2026\)\n- /);
  assert.match(build, /Haas's Claws, Berserker's Fury, Windtalker/);
  assert.match(build, /Corrosion Scythe, Demon Hunter Sword, Golden Staff/);
  assert.doesNotMatch(build, /Blade Armor/);
  const counter = textbookCard('counter mm crit pakai item apa?');
  assert.match(counter, /trinity critical: Blade Armor/);
  assert.match(counter, /trinity biasa: Chastise Pauldron/);
  assert.match(textbookCard('jungler lawan mulai dari buff biru, rotasinya ke mana?'), /buff biru biasanya rotasi ke bawah/);
  assert.match(textbookCard('Gimana cara biar nggak kena gank?'), /Buff awal jungler/);
  assert.match(textbookCard('Chou main di lane apa?'), /lebih sering dipakai Roam dan bisa flex ke Gold Lane/);
  assert.match(textbookCard('emblem apa yang bagus buat roamer?'), /tergantung hero-nya/);
  assert.equal(textbookCard('kita kalah mulu, latihan apa?'), '');
  assert.equal(textbookCard(''), '');
});

// Henry 2026-10-24, answer 3: jungle timers for patch 2.2.16a, and reading the enemy jungler's start from its gold.
test('jungle questions get the timers and the gold trick for reading the enemy jungler start', () => {
  const timers = textbookCard('buff merah respawn berapa lama?');
  assert.match(timers, /Buff biru dan buff merah pertama muncul di 00:25; buff dan monster jungle respawn 75 detik/);
  assert.doesNotMatch(timers, /angka waktu buff belum ada/);
  assert.match(textbookCard('Turtle pertama muncul menit berapa sih?'), /Turtle pertama muncul di 02:00 dan respawn 180 detik/);
  const start = textbookCard('gimana cara tau jungler lawan start dari mana?');
  assert.match(start, /semua mulai 300/);
  assert.match(start, /380 berarti mulai buff merah, 379 buff biru, 430 kumbang yang beranak di bawah, 407-413 kadal \(lizard\) di atas/);
  assert.match(start, /start ijo bisa mencegah EXP Laner atau Gold Laner buat cut lane/);
  assert.doesNotMatch(textbookCard('hero apa yang sering muncul di MPL?'), /Turtle/);
});

// Henry 2026-10-27, answer 4 (macro), plus positions from a community guide (pos 1 Gold Laner matches Henry).
test('macro questions get Henry\'s objective calls, early game plan, missing-enemy call and positions', () => {
  const turtle = textbookCard('Kapan sebaiknya ambil turtle?');
  assert.match(turtle, /Turtle dan Lord itu bukan tujuan utama; yang utama orangnya/);
  assert.match(turtle, /pas EXP lawan lagi bonyok dan lawan kurang orang/);
  const early = textbookCard('makro early game yang penting apa?');
  assert.match(early, /Kuatin trio mid/);
  assert.match(early, /EXP Laner ke mid dulu buat cepat dapat level 4/);
  assert.match(textbookCard('musuh hilang dari map harus ngapain?'), /Musuh hilang dari map \(enemy missing\)/);
  const pos = textbookCard('pos 2 itu siapa sih?');
  assert.match(pos, /Pos 1 Gold Laner/);
  assert.match(pos, /pos 2 biasanya jungler/);
  assert.match(pos, /sumber: panduan komunitas AFK Gaming/);
  assert.equal(textbookCard('semangatku hilang nih'), '');
});

// Henry 2026-10-24, answer 1: buy order per trinity, Sky Piercer timing, and which Marksmen use which trinity.
test('build questions get the buy order for both trinity types and who uses which', () => {
  const crit = textbookCard('urutan build trinity critical gimana?');
  assert.match(crit, /Windtalker dulu/);
  assert.match(crit, /lalu Berserker's Fury, kecuali MM yang butuh Sky Piercer seperti Obsidia/);
  assert.match(crit, /Bruno biasanya Haas's Claws duluan/);
  const karrie = textbookCard('build Karrie apa?');
  assert.match(karrie, /Corrosion Scythe dulu, lalu Golden Staff atau Demon Hunter Sword/);
  assert.match(karrie, /Karrie, Moskov, Hanabi, Wanwan, Melissa, Claude/);
  assert.match(textbookCard('sky piercer kapan dibeli?'), /setelah Corrosion Scythe kalau lagi menang/);
  assert.doesNotMatch(textbookCard('build mm yang paling gacor apa?'), /belum ada di buku/);
  // Exam v12 (N8): "beli" was not a build word, the card stayed out and the model invented a crit build for Karrie.
  assert.match(textbookCard('Lawan banyak tank tebel, Karrie mending beli apa dulu?'), /Demon Hunter Sword dulu baru Golden Staff/);
  assert.match(textbookCard('MM beliin item apa duluan?'), /Urutan trinity critical/);
});
