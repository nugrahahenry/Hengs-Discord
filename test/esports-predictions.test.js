'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { voteKey, shareRight, topGuessers } = require('../src/esports/predictions');

test('vote keys are short and stable, shares round, and top guessers need three votes', () => {
  assert.equal(voteKey('MPL/Indonesia/Season 18/Playoffs#R1M1#0').length, 12);
  assert.equal(voteKey('a'), voteKey('a')); assert.notEqual(voteKey('a'), voteKey('b'));
  assert.deepEqual(shareRight({ u1: 1, u2: 1, u3: 2 }, 1), { voters: 3, right: 2, share: 67 });
  assert.deepEqual(shareRight(undefined, 1), { voters: 0, right: 0, share: 0 });
  const matches = ['m1', 'm2', 'm3'].map((id, i) => ({ id, finished: true, valid: true, winner: i === 2 ? 2 : 1 }));
  matches.push({ id: 'm4', finished: false, valid: true, winner: 0 });
  const votes = { m1: { a: 1, b: 1, c: 2 }, m2: { a: 1, b: 2, c: 1 }, m3: { a: 2, b: 2, c: 2 }, m4: { a: 1, b: 1, c: 1, d: 1 } };
  assert.deepEqual(topGuessers(votes, matches), [{ user: 'a', right: 3, votes: 3 }, { user: 'b', right: 2, votes: 3 },
    { user: 'c', right: 2, votes: 3 }]);
  assert.deepEqual(topGuessers(votes, matches, { min: 4 }), []);
});
