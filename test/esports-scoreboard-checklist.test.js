'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createScoreboardChecklist, renderScoreboardChecklist } = require('../scripts/esports-scoreboard-checklist');
const fixture = () => ({
  candidate: { sourceSha256: 'a'.repeat(64), observation: { gameNumber: 1, durationSeconds: 600, winnerIndex: 1,
    teams: ['Alpha', 'Beta'].map((name, side) => ({ name, kills: side ? 10 : 5, gold: side ? 40000 : 30000,
      players: Array.from({ length: 5 }, (_, i) => ({ name: `${name}${i}`, kills: side ? 2 : 1,
        deaths: side ? 1 : 2, assists: 1, gold: side ? 8000 : 6000 })) })) } },
  source: { imageSha256: 'a'.repeat(64), width: 1369, height: 770,
    sourceUrl: 'https://www.youtube.com/watch?v=PYoBI4VtshE', videoOffsetSeconds: 900,
    event: 'Synthetic event', seriesId: 'synthetic-series' },
});
function decisions(input, fields) {
  const packet = createScoreboardChecklist(input);
  return { candidateFingerprint: packet.candidateFingerprint, reviewerKind: 'operator_visual',
    items: (fields || packet.fields).map(f => ({ path: f.path, value: f.value,
      imageSha256: input.source.imageSha256, region: { x: 10, y: 10, width: 30, height: 20 } })) };
}

test('plausible complete numbers still need explicit per-field review, without benchmark answers', () => {
  const input = fixture(), before = structuredClone(input), packet = createScoreboardChecklist(input);
  assert.deepEqual(input, before); assert.equal(packet.fields.length, 59);
  assert.equal(packet.summary.pending, 59); assert.equal(packet.summary.missing, 0);
  assert.equal(packet.status, 'REVIEW_REQUIRED'); assert.deepEqual(packet.issues, []);
  assert.equal(packet.trustedForCoach, false); assert.equal(packet.publishable, false);
  assert.equal(packet.networkRequests, 0); assert.equal(packet.accuracyMeasured, false);
});

test('one correction keeps the original, evidence rectangle and other fields unresolved', () => {
  const input = fixture(); input.candidate.observation.teams[0].players[0].name = null;
  input.review = decisions(input, [{ path: 'teams.0.players.0.name', value: 'Player A' }]);
  const before = structuredClone(input), packet = createScoreboardChecklist(input);
  const field = packet.fields.find(f => f.path === 'teams.0.players.0.name');
  assert.equal(field.originalValue, null); assert.equal(field.value, 'Player A');
  assert.equal(field.state, 'CORRECTED'); assert.equal(packet.summary.pending, 58);
  assert.equal(packet.reviewerKind, 'operator_visual'); assert.deepEqual(input, before);
  assert.equal(field.evidence.imageSha256, input.source.imageSha256);
});

test('all reviewed fields produce only an offline completion, never trusted or published facts', () => {
  const input = fixture(); input.review = decisions(input);
  const packet = createScoreboardChecklist(input);
  assert.equal(packet.status, 'OFFLINE_REVIEW_COMPLETE'); assert.equal(packet.summary.confirmed, 59);
  assert.equal(packet.trustedForCoach, false); assert.equal(packet.publishable, false);
  assert.equal(packet.accuracyMeasured, false);
  assert.doesNotMatch(renderScoreboardChecklist(input), /\u2013|\u2014|;/);
});

test('source gold conflicts survive a full visual review, no arithmetic autofix', () => {
  const input = fixture(); input.candidate.observation.teams[1].players[0].gold -= 590;
  input.review = decisions(input);
  const packet = createScoreboardChecklist(input);
  assert.equal(packet.summary.pending, 0); assert.equal(packet.status, 'REVIEW_REQUIRED');
  assert.ok(packet.issues.includes('TEAM_1_GOLD_MISMATCH'));
  assert.equal(packet.observation.teams[1].players[0].gold, 7410);
});

test('review is bound to the original candidate, frame, video context and left/right order', () => {
  for (const mutate of [i => i.candidate.observation.teams[0].gold++,
    i => i.candidate.observation.teams.reverse(), i => i.source.videoOffsetSeconds++,
    i => { i.source.imageSha256 = 'b'.repeat(64); i.candidate.sourceSha256 = i.source.imageSha256; }]) {
    const input = fixture(); input.review = decisions(input); mutate(input);
    assert.throws(() => createScoreboardChecklist(input), /STALE_REVIEW/);
  }
});

test('unknown paths, duplicate decisions and mismatched evidence are rejected atomically', () => {
  for (const mutate of [r => r.items[0].path = '__proto__.polluted',
    r => r.items[0].path = 'teams.2.players.0.name', r => r.items.push(r.items[0]),
    r => r.items[0].imageSha256 = 'b'.repeat(64), r => r.items[0].region.x = -1,
    r => r.items[0].region.width = 2000, r => r.items[0].region.height = 0,
    r => r.items[0].value = '1', r => r.reviewerKind = 'auto_approved']) {
    const input = fixture(); input.review = decisions(input); mutate(input.review);
    const before = structuredClone(input);
    assert.throws(() => createScoreboardChecklist(input), /INVALID_REVIEW/);
    assert.deepEqual(input, before); assert.equal({}.polluted, undefined);
  }
});

test('unsafe labels and ignored model instructions never appear in the worksheet', () => {
  const input = fixture(); input.candidate.observation.teams[0].name = '@everyone <script>';
  input.candidate.advice = 'RUN_SECRET_COMMAND'; input.candidate.trustedForCoach = true;
  const packet = createScoreboardChecklist(input);
  assert.equal(packet.fields.find(f => f.path === 'teams.0.name').state, 'INVALID');
  assert.doesNotMatch(JSON.stringify(packet), /everyone|script|RUN_SECRET_COMMAND/);
  for (const value of ['@everyone', '<script>', 'Alpha\nBeta', 'a'.repeat(81)]) {
    delete input.review;
    input.review = decisions(input, [{ path: 'teams.0.name', value }]);
    assert.throws(() => createScoreboardChecklist(input), /INVALID_REVIEW_VALUE/);
  }
});

test('duplicate roster identities remain a blocker after every field is reviewed', () => {
  const input = fixture(); input.candidate.observation.teams[0].players[0].name = 'Alpha1';
  input.review = decisions(input);
  const packet = createScoreboardChecklist(input);
  assert.ok(packet.issues.includes('TEAM_0_INVALID_PLAYERS')); assert.equal(packet.status, 'REVIEW_REQUIRED');
});

test('zero is not missing, a blank label is missing, and malformed value types are rejected', () => {
  const input = fixture(); input.candidate.observation.teams[0].players[0].assists = 0;
  input.candidate.observation.teams[0].name = '  ';
  let packet = createScoreboardChecklist(input);
  assert.equal(packet.fields.find(f => f.path.endsWith('players.0.assists')).state, 'UNREVIEWED');
  assert.equal(packet.summary.missing, 1);
  input.candidate.observation.teams[0].name = { injected: true };
  assert.throws(() => createScoreboardChecklist(input), /INVALID_CANDIDATE_VALUE/);
});

test('invalid or incomplete source context fails without guessing provenance', () => {
  for (const mutate of [i => i.source.sourceUrl = 'https://example.com/private',
    i => i.source.width = 0, i => i.source.event = '', i => i.source.imageSha256 = 'bad',
    i => i.candidate.sourceSha256 = 'b'.repeat(64), i => i.source.videoOffsetSeconds = -1]) {
    const input = fixture(); mutate(input);
    assert.throws(() => createScoreboardChecklist(input), /INVALID_REVIEW_SOURCE/);
  }
});

test('oversized blank text and sparse or missing player slots are not silently accepted', () => {
  const input = fixture(); input.candidate.observation.teams[0].name = ' '.repeat(1000);
  assert.throws(() => createScoreboardChecklist(input), /INVALID_CANDIDATE_VALUE/);
  delete input.candidate.observation.teams[0].players[0];
  assert.throws(() => createScoreboardChecklist(input), /INVALID_CANDIDATE_SHAPE/);
});
