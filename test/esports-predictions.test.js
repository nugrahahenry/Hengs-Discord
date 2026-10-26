'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { voteKey, shareRight } = require('../src/esports/predictions');

// Who ranks where is Liga Tebak's job now (test/esports-league.test.js).
test('vote keys are short and stable, and shares round', () => {
  assert.equal(voteKey('MPL/Indonesia/Season 18/Playoffs#R1M1#0').length, 12);
  assert.equal(voteKey('a'), voteKey('a')); assert.notEqual(voteKey('a'), voteKey('b'));
  assert.deepEqual(shareRight({ u1: 1, u2: 1, u3: 2 }, 1), { voters: 3, right: 2, share: 67 });
  assert.deepEqual(shareRight(undefined, 1), { voters: 0, right: 0, share: 0 });
});
