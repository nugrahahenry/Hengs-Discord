'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EXAMPLES, pickExamples, examplesBlock } = require('../src/scrim/coach-examples');
const { heroes, retrieved } = require('../src/scrim/mlbb-heroes.json');
const { dayLabel } = require('../src/scrim/stats');

const LANE = { Gold: 'Gold Lane', Exp: 'EXP Lane', Mid: 'Mid Lane', Jungle: 'Jungle', Roam: 'Roam' };
const ROLES = ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'];
const named = text => heroes.filter(hero => new RegExp(`\\b${hero.name}\\b`).test(text));

test('each question gets its three closest examples, distinct, hero-free ones when nothing matches', () => {
  assert.match(pickExamples('build item paling gacor buat Miya apa?')[0].q, /^Build MM yang paling gacor/);
  assert.match(pickExamples('gimana cara pakai cheat drone view')[0].q, /cheat/);
  assert.match(pickExamples('cooldown skill Gusion berapa lama?')[0].q, /^Cooldown/);
  for (const question of ['build item paling gacor buat Miya apa?', 'xyz qwerty', '']) {
    const picked = pickExamples(question);
    assert.equal(picked.length, 3, question);
    assert.equal(new Set(picked).size, 3, question);
  }
  for (const example of pickExamples('xyz qwerty')) {
    assert.deepEqual(named(`${example.q} ${example.a}`), [], example.q);
    assert.doesNotMatch(example.a, /\bpea\b|badplay/, example.q);
  }
});

// Henry 2026-10-24: light teasing in his own words, while the numbers stay private.
test('the teammate-stats example teases lightly in Henry\'s style and keeps the stats private', () => {
  const tease = pickExamples('si Kevin badplay mulu, stat dia jelek ya?')[0];
  assert.match(tease.a, /pea lagi badplay/);
  assert.match(tease.a, /jangan begadang/);
  assert.match(tease.a, /\/scrim statku/);
});

// Research (Anthropic prompting guide, OpenAI accuracy guide): examples steer tone best, but the model copies what is in
// them, so they carry no numbers (only the dictionary's check date), no maaf openers, no generic closers, and only facts
// from the hero dictionary or the example's own data line.
test('the examples follow the coach rules they teach', () => {
  assert.ok(EXAMPLES.length >= 8);
  const checked = dayLabel(retrieved);
  for (const { q, a, data = '' } of EXAMPLES) {
    assert.doesNotMatch(`${q} ${a} ${data}`.replaceAll(checked, ''), /\d/, q);
    assert.doesNotMatch(a.split(/(?<=[.!?])\s+/)[0], /\bmaaf\b|nggak (yakin|tahu)|belum dapat data/i, q);
    assert.doesNotMatch(a, /hal lain|pertanyaan lain/i, q);
    assert.ok(a.split(/[.!?](?:\s|$)/).filter(part => part.trim()).length <= 4, q);
    const owners = named(`${q} ${a}`);
    for (const role of ROLES.filter(role => new RegExp(`\\b${role}\\b`).test(a))) {
      assert.ok(owners.some(hero => hero.roles.includes(role)) || data.includes(role), `${q}: ${role}`);
    }
    for (const lane of Object.entries(LANE).filter(([, label]) => a.includes(label))) {
      assert.ok(owners.some(hero => hero.lanes.includes(lane[0])) || data.includes(lane[1]), `${q}: ${lane[1]}`);
    }
    for (const hero of owners.filter(() => a.includes('keahlian'))) {
      for (const specialty of hero.specialties) assert.ok(a.includes(specialty), `${q}: ${specialty}`);
    }
  }
});

// Henry 2026-10-24: an unknown skill number says how old the data is, so members know it needs an update.
test('the number example names the dictionary check date and the buff rotation instead of a guess', () => {
  const cooldown = pickExamples('cooldown skill Gusion berapa lama?')[0];
  assert.ok(cooldown.a.includes(`dicek ${dayLabel(retrieved)}`), cooldown.a);
  assert.match(cooldown.a, /minta admin update/);
  assert.match(cooldown.a, /buff/);
  assert.ok(!EXAMPLES.some(example => /dihapus/.test(example.q)), 'premise example dropped: rarely asked');
  assert.match(pickExamples('counter crit pakai item apa?')[0].a, /Blade Armor/);
  // Henry 2026-10-24, answer 1: the buy order is known now, so the build example uses it.
  assert.match(pickExamples('build item paling gacor buat Miya apa?')[0].a, /Windtalker dulu/);
});

test('the example block says it is style only and wraps each example', () => {
  const block = examplesBlock('build item paling gacor buat Miya apa?');
  assert.match(block, /^CONTOH JAWABAN \(cuma contoh gaya; hero dan data di contoh bukan data tim kamu, jangan disalin\):\n<contoh>\nPertanyaan: Build MM yang paling gacor/);
  assert.equal(block.match(/<contoh>/g).length, 3);
  assert.equal(block.match(/<\/contoh>/g).length, 3);
  assert.match(examplesBlock('kita lemahnya di mana'), /Pertanyaan: Kita lemahnya di mana sih\? \(DATA contoh: /);
});
