'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { heroCard } = require('../src/scrim/mlbb-dictionary');
const dictionary = require('../src/scrim/mlbb-heroes.json');

test('the hero dictionary is a dated Liquipedia snapshot with roles and lanes for every hero', () => {
  assert.match(dictionary.source, /Liquipedia/);
  assert.match(dictionary.source, /CC-BY-SA/);
  assert.match(dictionary.retrieved, /^\d{4}-\d{2}-\d{2}$/);
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
  assert.match(card, new RegExp(`^KAMUS MLBB \\(Liquipedia, dicek ${dictionary.retrieved}\\)`));
  assert.match(card, /\nFanny \(Blade Dancer\): role Assassin, lane Jungle, spesialis Chase dan Finisher\./);
  assert.match(card, /\nLolita \(Steel Elf\): role Support dan Tank, lane Roam, spesialis Guard dan Crowd Control\./);
  assert.match(card, /\nLane di MLBB: Gold Lane, EXP Lane, Mid Lane, Jungle, Roam\. Role hero: Tank, Fighter, Assassin, Mage, Marksman, Support\./);
  assert.match(heroCard('obsidia main di mana sih'), /Obsidia \(Sovereign of Dark's End\): role Marksman, lane Gold Lane/);
  assert.equal(heroCard('kita kalah mulu, latihan apa?'), '');
  const many = heroCard('Fanny Ling Lolita Chou Claude');
  assert.equal(many.split('\n').length, 4);
});
