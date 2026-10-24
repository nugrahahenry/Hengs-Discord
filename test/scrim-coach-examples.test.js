'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EXAMPLES, pickExamples, examplesBlock } = require('../src/scrim/coach-examples');
const { heroes } = require('../src/scrim/mlbb-heroes.json');

const LANE = { Gold: 'Gold Lane', Exp: 'EXP Lane', Mid: 'Mid Lane', Jungle: 'Jungle', Roam: 'Roam' };
const ROLES = ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'];
const named = text => heroes.filter(hero => new RegExp(`\\b${hero.name}\\b`).test(text));

test('each question gets its three closest examples, distinct, hero-free ones when nothing matches', () => {
  assert.match(pickExamples('build item paling gacor buat Miya apa?')[0].q, /^Build paling gacor/);
  assert.match(pickExamples('gimana cara pakai cheat drone view')[0].q, /cheat/);
  assert.match(pickExamples('cooldown skill Gusion berapa lama?')[0].q, /^Cooldown/);
  for (const question of ['build item paling gacor buat Miya apa?', 'xyz qwerty', '']) {
    const picked = pickExamples(question);
    assert.equal(picked.length, 3, question);
    assert.equal(new Set(picked).size, 3, question);
  }
  for (const example of pickExamples('xyz qwerty')) assert.deepEqual(named(`${example.q} ${example.a}`), [], example.q);
});

// Research (Anthropic prompting guide, OpenAI accuracy guide): examples steer tone best, but the model copies what is in
// them, so they carry no numbers, no maaf openers, no generic closers, and only facts the hero dictionary holds.
test('the examples follow the coach rules they teach', () => {
  assert.ok(EXAMPLES.length >= 8);
  for (const { q, a, data = '' } of EXAMPLES) {
    assert.doesNotMatch(`${q} ${a} ${data}`, /\d/, q);
    assert.doesNotMatch(a.split(/(?<=[.!?])\s+/)[0], /\bmaaf\b|nggak (yakin|tahu)|belum dapat data/i, q);
    assert.doesNotMatch(a, /hal lain|pertanyaan lain/i, q);
    assert.ok(a.split(/[.!?](?:\s|$)/).filter(part => part.trim()).length <= 4, q);
    const owners = named(`${q} ${a}`);
    for (const role of ROLES.filter(role => new RegExp(`\\b${role}\\b`).test(a))) {
      assert.ok(owners.some(hero => hero.roles.includes(role)), `${q}: ${role}`);
    }
    for (const lane of Object.entries(LANE).filter(([, label]) => a.includes(label))) {
      assert.ok(owners.some(hero => hero.lanes.includes(lane[0])), `${q}: ${lane[1]}`);
    }
    for (const hero of owners.filter(() => a.includes('keahlian'))) {
      for (const specialty of hero.specialties) assert.ok(a.includes(specialty), `${q}: ${specialty}`);
    }
  }
});

test('the example block says it is style only and wraps each example', () => {
  const block = examplesBlock('build item paling gacor buat Miya apa?');
  assert.match(block, /^CONTOH JAWABAN \(cuma contoh gaya; hero dan data di contoh bukan data tim kamu, jangan disalin\):\n<contoh>\nPertanyaan: Build paling gacor/);
  assert.equal(block.match(/<contoh>/g).length, 3);
  assert.equal(block.match(/<\/contoh>/g).length, 3);
  assert.match(examplesBlock('kita lemahnya di mana'), /Pertanyaan: Kita lemahnya di mana sih\? \(DATA contoh: /);
});
