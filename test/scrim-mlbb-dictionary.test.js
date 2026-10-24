'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { heroCard } = require('../src/scrim/mlbb-dictionary');
const dictionary = require('../src/scrim/mlbb-heroes.json');

test('the hero dictionary is a dated Liquipedia snapshot with roles and lanes for every hero', () => {
  assert.match(dictionary.source, /Liquipedia/);
  assert.match(dictionary.source, /CC-BY-SA/);
  assert.match(dictionary.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dictionary.patch, /^\d+\.\d+\.\d+[a-z]?$/);
  assert.ok(dictionary.heroes.length >= 130);
  const lanes = new Set(['Gold', 'Exp', 'Mid', 'Jungle', 'Roam']);
  const roles = new Set(['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support']);
  for (const hero of dictionary.heroes) {
    assert.ok(hero.name && hero.roles.length && hero.lanes.length, hero.name);
    assert.ok(hero.lanes.every(lane => lanes.has(lane)), hero.name);
    assert.ok(hero.roles.every(role => roles.has(role)), hero.name);
  }
  assert.equal(new Set(dictionary.heroes.map(hero => hero.name)).size, dictionary.heroes.length);
});

test('a named hero gets its role, lane and specialties; lane or role words get the lane list', () => {
  const card = heroCard('Fanny sama Lolita cocoknya lane apa?');
  // Henry 2026-10-24: an answer without the number should say which patch the data is from.
  assert.ok(card.startsWith(`KAMUS MLBB (Liquipedia, dicek ${dictionary.retrieved}, patch ${dictionary.patch})\n`), card);
  // Exam v7: "spesialis" came back as "skill", and the lane names invited invented lane mechanics.
  assert.match(card, /\nFanny \(Blade Dancer\): role Assassin, lane versi Liquipedia Jungle, keahlian \(bukan nama skill\) Chase dan Finisher\./);
  assert.match(card, /\nLolita \(Steel Elf\): role Support dan Tank, lane versi Liquipedia Roam, keahlian \(bukan nama skill\) Guard dan Crowd Control\./);
  // Henry 2026-10-24: Chou is listed EXP Lane but plays Roam in the meta, so the card says its lanes can flex.
  assert.match(card, /\nLane versi Liquipedia itu lane utama hero; di meta hero bisa flex ke lane lain tergantung draft\./);
  assert.match(card, /\nLane di MLBB: Gold Lane, EXP Lane, Mid Lane, Jungle, Roam\. Role hero: Tank, Fighter, Assassin, Mage, Marksman, Support\. /);
  assert.match(heroCard('obsidia main di mana sih'), /Obsidia \(Sovereign of Dark's End\): role Marksman, lane versi Liquipedia Gold Lane/);
  assert.equal(heroCard('kita kalah mulu, latihan apa?'), '');
  const many = heroCard('Fanny Ling Lolita Chou Claude');
  assert.equal(many.split('\n').length, 5);
});

// Exam v9 (K2): with only the lane names the coach made up lane positions. Who fills each lane is a fact it can count.
test('lane questions get who fills each lane, counted from the snapshot, and no lane mechanics', () => {
  const card = heroCard('Bedanya gold lane sama exp lane apa?');
  const all = lane => dictionary.heroes.filter(hero => hero.lanes.includes(lane));
  const fill = (lane, role) => `${all(lane).filter(hero => hero.roles[0] === role).length} ${role}`;
  assert.ok(card.includes(`Isi lane di kamus (role utama hero): Gold Lane ${fill('Gold', 'Marksman')} dari ${all('Gold').length} hero; `
    + `EXP Lane ${fill('Exp', 'Fighter')} dari ${all('Exp').length} hero; Mid Lane ${fill('Mid', 'Mage')} dari ${all('Mid').length} hero; `
    + `Jungle ${fill('Jungle', 'Assassin')} dan ${fill('Jungle', 'Fighter')} dari ${all('Jungle').length} hero; Roam `), card);
  assert.match(card, /; Roam \d+ \w+ dan \d+ \w+ dari \d+ hero\. Posisi lane di map dan mekanik lane nggak ada di kamus: jangan ditebak\./);
  assert.doesNotMatch(card, /nggak tahu/);
});
