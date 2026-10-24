'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { textbookCard } = require('../src/scrim/mlbb-textbook');

// Henry 2026-10-24 (ex competitive player): MM item cores, item counters, jungle buff rotation, Chou's meta lanes, emblems.
test('the textbook adds the entries a question needs, with source and date, and nothing for other questions', () => {
  const build = textbookCard('build mm yang paling gacor apa?');
  assert.match(build, /^BUKU PINTAR MLBB \(ilmu dari Henry, eks pemain kompetitif; dicek 24 Okt 2026, patch belum dicatat\)\n- /);
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
