'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareScoreboards } = require('../scripts/esports-scoreboard-benchmark');

const fixture = () => ({ gameNumber: 1, durationSeconds: 600, winnerIndex: 0,
  teams: ['Alpha', 'Beta'].map(name => ({ name, kills: 5, gold: 30000,
    players: Array.from({ length: 5 }, (_, i) => ({ name: `${name}${i}`, kills: 1, deaths: 1, assists: 0, gold: 6000 })) })) });

test('59 fields are compared without source timestamps or operator metadata inflating the score', () => {
  const ref = fixture(), candidate = structuredClone(ref), before = structuredClone(candidate);
  candidate.sourceUrl = 'ignored operator metadata'; candidate.trustedForCoach = true;
  const result = compareScoreboards(candidate, ref);
  assert.equal(result.overall.total, 59); assert.equal(result.overall.correct, 59);
  assert.equal(result.overall.exactMatchPercent, 100); assert.equal(result.trustedForCoach, false);
  assert.equal(result.groups.identity.total, 12); assert.equal(result.groups.playerNumbers.total, 40);
  assert.deepEqual(candidate.teams, before.teams); assert.equal(result.numericTolerance, 0);
  assert.equal(result.fields.some(f => /sourceUrl|event|seriesId/.test(f.path)), false);
});

test('missing identities count as missing and are never borrowed from the reference', () => {
  const ref = fixture(), candidate = structuredClone(ref);
  candidate.teams.forEach(t => t.players.forEach(p => { p.name = null; }));
  const result = compareScoreboards(candidate, ref);
  assert.equal(result.overall.missing, 10); assert.equal(result.overall.correct, 49);
  assert.equal(result.overall.exactMatchPercent, 83.1);
  assert.equal(result.overall.filledValuePrecisionPercent, 100);
  assert.equal(candidate.teams[0].players[0].name, null);
});

test('small plausible numeric errors are wrong even inside a scoreboard rounding tolerance', () => {
  const ref = fixture(), candidate = structuredClone(ref);
  candidate.teams[0].players[0].gold -= 20;
  candidate.teams[1].players[0].gold -= 590;
  const result = compareScoreboards(candidate, ref);
  assert.equal(result.overall.wrong, 2); assert.equal(result.overall.correct, 57);
  assert.equal(result.groups.playerNumbers.wrong, 2);
});

test('trim and case-fold are allowed but fuzzy names, swapped rows and swapped sides are not repaired', () => {
  const ref = fixture(), candidate = structuredClone(ref);
  candidate.teams[0].name = ' alpha ';
  candidate.teams[0].players[0].name = 'Alphao';
  [candidate.teams[1].players[0], candidate.teams[1].players[1]] = [candidate.teams[1].players[1], candidate.teams[1].players[0]];
  assert.equal(compareScoreboards(candidate, ref).overall.wrong, 3);
  candidate.teams.reverse();
  assert.equal(compareScoreboards(candidate, ref).groups.identity.wrong, 12);
});

test('unknown, zero and malformed values remain different, with no values leaked by the comparator', () => {
  const ref = fixture(), candidate = structuredClone(ref);
  candidate.durationSeconds = null;
  candidate.teams[0].kills = '5';
  candidate.teams[0].players[0].assists = 0;
  candidate.teams[1].players[0].name = '@everyone <script>';
  const result = compareScoreboards(candidate, ref);
  assert.equal(result.overall.missing, 1); assert.equal(result.overall.wrong, 2);
  assert.doesNotMatch(JSON.stringify(result), /everyone|script|Alpha|Beta/);
});

test('invalid shapes and incomplete references fail instead of shrinking the denominator', () => {
  assert.throws(() => compareScoreboards({}, fixture()), /INVALID_BENCHMARK_SHAPE/);
  const ref = fixture(); ref.teams[0].players[0].gold = null;
  assert.throws(() => compareScoreboards(fixture(), ref), /INCOMPLETE_BENCHMARK_REFERENCE/);
  ref.teams[0].players.pop();
  assert.throws(() => compareScoreboards(fixture(), ref), /INVALID_BENCHMARK_SHAPE/);
});
