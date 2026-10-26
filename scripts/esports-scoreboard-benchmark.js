'use strict';

// Offline comparison only. Consistent arithmetic does not establish extraction accuracy or trust.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80
  && !/[\p{Cc}\p{Cf}<>@]/u.test(value);
const normalized = value => value.trim().toLowerCase();
const percentage = (part, total) => total ? Math.round(part / total * 1000) / 10 : null;
const counts = () => ({ total: 0, correct: 0, wrong: 0, missing: 0 });

function validateShape(observation) {
  if (!record(observation) || !Array.isArray(observation.teams) || observation.teams.length !== 2
    || observation.teams.some(team => !record(team) || !Array.isArray(team.players)
      || team.players.length !== 5 || team.players.some(player => !record(player)))) {
    throw new Error('INVALID_BENCHMARK_SHAPE');
  }
}

function summarize(count) {
  return { ...count, exactMatchPercent: percentage(count.correct, count.total),
    coveragePercent: percentage(count.correct + count.wrong, count.total),
    filledValuePrecisionPercent: percentage(count.correct, count.correct + count.wrong) };
}

function compareScoreboards(candidate, reference) {
  validateShape(candidate); validateShape(reference);
  const fields = [];
  const add = (path, group, expected, actual, max) => {
    const text = max === undefined;
    if (text ? !label(expected) : !Number.isSafeInteger(expected) || expected < 0 || expected > max) {
      throw new Error('INCOMPLETE_BENCHMARK_REFERENCE');
    }
    const missing = actual === null || actual === undefined || (typeof actual === 'string' && actual.trim() === '');
    const equal = text ? label(actual) && normalized(actual) === normalized(expected)
      : Number.isSafeInteger(actual) && actual === expected;
    fields.push({ path, group, status: missing ? 'missing' : equal ? 'correct' : 'wrong' });
  };
  add('gameNumber', 'game', reference.gameNumber, candidate.gameNumber, 99);
  add('durationSeconds', 'game', reference.durationSeconds, candidate.durationSeconds, 10800);
  add('winnerIndex', 'game', reference.winnerIndex, candidate.winnerIndex, 1);
  for (let side = 0; side < 2; side++) {
    const expected = reference.teams[side], actual = candidate.teams[side];
    const base = `teams.${side}`;
    add(`${base}.name`, 'identity', expected.name, actual.name);
    add(`${base}.kills`, 'teamNumbers', expected.kills, actual.kills, 200);
    add(`${base}.gold`, 'teamNumbers', expected.gold, actual.gold, 1000000);
    for (let row = 0; row < 5; row++) {
      const e = expected.players[row], a = actual.players[row], p = `${base}.players.${row}`;
      add(`${p}.name`, 'identity', e.name, a.name);
      for (const field of ['kills', 'deaths', 'assists', 'gold']) {
        add(`${p}.${field}`, 'playerNumbers', e[field], a[field], field === 'gold' ? 200000 : 200);
      }
    }
  }
  const total = counts(), groups = {};
  for (const field of fields) {
    groups[field.group] ||= counts();
    for (const counter of [total, groups[field.group]]) { counter.total++; counter[field.status]++; }
  }
  return { schemaVersion: 1, method: 'EXACT_FIELDS_BY_SOURCE_SIDE_AND_ROW',
    referenceStatus: 'OPERATOR_REFERENCE_NOT_INDEPENDENT_GROUND_TRUTH',
    labelNormalization: 'trim and case-fold only, no fuzzy roster matching',
    numericTolerance: 0, overall: summarize(total),
    groups: Object.fromEntries(Object.entries(groups).map(([group, count]) => [group, summarize(count)])), fields,
    trustedForCoach: false, publishable: false, networkRequests: 0,
    boundary: 'A reference match is not proof of gameplay understanding, generalization or safe automatic ingestion.' };
}

module.exports = { compareScoreboards };
