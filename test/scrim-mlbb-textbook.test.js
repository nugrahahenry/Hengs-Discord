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
});
