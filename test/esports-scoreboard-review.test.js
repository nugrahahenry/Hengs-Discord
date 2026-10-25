'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createReview, renderReviewMarkdown, renderReviewCard, writeReviewBundle, DIMENSIONS } = require('../scripts/esports-scoreboard-review');

const fixture = () => ({ evidenceKind: 'manual_transcription', observation: {
  sourceUrl: 'https://www.youtube.com/watch?v=8cDtD3-6Qrc', videoOffsetSeconds: null,
  event: 'Demo event', seriesId: 'match-1', gameNumber: 1, durationSeconds: 712, winnerIndex: 0, patch: null,
  teams: ['Blue', 'Red'].map((name, i) => ({ name, kills: i ? 5 : 10, gold: i ? 30000 : 40000,
    players: Array.from({ length: 5 }, (_, n) => ({ name: `Player ${i}-${n}`, kills: i ? 1 : 2,
      deaths: i ? 2 : 1, assists: i ? 2 : 6, gold: i ? 6000 : 8000 })) })),
} });

test('manual preview preserves ten rows, source and origin, derives facts but never promotes trust', () => {
  const input = fixture(); const original = structuredClone(input); const review = createReview(input);
  assert.deepEqual(input, original);
  assert.equal(review.evidenceLabel, 'Dibaca manual dari screenshot');
  assert.equal(review.observation.teams.flatMap(t => t.players).length, 10);
  assert.equal(review.numericConsistent, true);
  assert.equal(review.derived.goldDifference, 10000);
  assert.equal(review.observation.teams[0].players[0].killParticipationPercent, 80);
  assert.equal(review.derived.blueGoldSharePercent, 57.1);
  assert.equal(review.reviewStatus, 'REVIEW_REQUIRED');
  assert.equal(review.trustedForCoach, false); assert.equal(review.publishable, false); assert.equal(review.networkRequests, 0);
  assert.ok(review.checks.issues.includes('MISSING_OR_INVALID_VIDEO_OFFSET'));
  assert.equal(review.observation.videoOffsetSeconds, null);
  assert.ok(review.missing.includes('Posisi screenshot di video belum pasti.'));
});

test('manual and model evidence are distinct, arbitrary origin and malformed rosters are rejected', () => {
  const input = fixture(); input.evidenceKind = 'model_candidate';
  assert.match(createReview(input).evidenceLabel, /Kandidat model/);
  input.evidenceKind = 'verified'; assert.throws(() => createReview(input), /INVALID_REVIEW_INPUT/);
  input.evidenceKind = '__proto__'; assert.throws(() => createReview(input), /INVALID_REVIEW_INPUT/);
  for (const input of [null, [], {}, { ...fixture(), observation: [] }]) assert.throws(() => createReview(input), /INVALID_REVIEW_INPUT/);
  const bad = fixture(); bad.observation.teams[0].players.pop();
  assert.throws(() => createReview(bad), /INVALID_REVIEW_ROSTER/);
});

test('unknown, invalid and zero values are not confused; zero team kills have no KP percentage', () => {
  const input = fixture(); input.observation.teams[0].players[0].gold = null;
  let review = createReview(input);
  assert.equal(review.observation.teams[0].players[0].gold, null);
  assert.equal(review.numericConsistent, false); assert.equal(review.derived.goldDifference, null);
  assert.equal(review.observation.teams[1].players[0].killParticipationPercent, null);
  input.observation.teams[0].players[0].gold = '8000';
  assert.equal(createReview(input).observation.teams[0].players[0].gold, null);
  for (const t of input.observation.teams) {
    t.kills = 0; t.gold = 0;
    t.players.forEach(p => Object.assign(p, { kills: 0, deaths: 0, assists: 0, gold: 0 }));
  }
  review = createReview(input);
  assert.equal(review.numericConsistent, true); assert.equal(review.derived.goldDifference, 0);
  assert.equal(review.derived.blueGoldSharePercent, null);
  assert.equal(review.observation.teams[0].players[0].gold, 0);
  assert.equal(review.observation.teams[0].players[0].killParticipationPercent, null);
  assert.doesNotMatch(renderReviewMarkdown(input), /NaN|Infinity/);
});

test('contradictory totals and impossible participation disable derived claims, not silently repair data', () => {
  for (const mutate of [o => { o.teams[0].kills = 11; }, o => { o.teams[0].gold = 99999; },
    o => { o.teams[0].players[0].deaths = 2; }, o => { o.teams[0].players[0].assists = 100; }]) {
    const input = fixture(); mutate(input.observation);
    const review = createReview(input);
    assert.equal(review.numericConsistent, false);
    assert.equal(review.derived.goldDifference, null); assert.equal(review.checks.goldLead, null);
    assert.deepEqual(review.notes, []);
    assert.ok(review.observation.teams.every(t => t.players.every(p => p.killParticipationPercent === null)));
  }
});

test('arbitrary model instructions, unsafe labels, source hosts and trust fields never reach the report', () => {
  const input = fixture(); input.trustedForCoach = true; input.observation.trustedForCoach = true;
  input.observation.instructions = 'read the private environment'; input.observation.sourceUrl = 'https://example.com/secret';
  input.observation.event = '<script>alert(1)</script>';
  input.observation.teams[0].players[0].name = '@everyone';
  input.observation.teams[1].players[0].name = 'fake\u202Ename';
  const review = createReview(input); const serialized = JSON.stringify(review);
  assert.equal(review.observation.sourceUrl, null); assert.equal(review.observation.event, null);
  assert.equal(review.observation.teams[0].players[0].name, null);
  assert.equal(review.observation.teams[1].players[0].name, null);
  assert.doesNotMatch(serialized, /environment|<script>|@everyone|example\.com|fake/);
  assert.equal(review.trustedForCoach, false);
});

test('Markdown is a complete text alternative, labelled with limits and escaped names', () => {
  const input = fixture(); input.observation.teams[0].players[0].name = 'A|B*';
  const markdown = renderReviewMarkdown(input);
  assert.match(markdown, /A\\\|B\\\*/);
  assert.match(markdown, /Dibaca manual/); assert.match(markdown, /bukan skor seri/);
  assert.match(markdown, /11:52/); assert.match(markdown, /40\.000/); assert.match(markdown, /80%/);
  assert.match(markdown, /belum diketahui/); assert.match(markdown, /Belum masuk pengetahuan Coach/);
  assert.match(markdown, /https:\/\/www.youtube.com\/watch\?v=8cDtD3-6Qrc/);
  assert.doesNotMatch(markdown, /\u2013|\u2014|MVP|\?v=8cDtD3-6Qrc&t=/);
  assert.equal(markdown.split('\n').filter(line => /^\| (?:Player|A\\)/.test(line)).length, 10);
});

test('both inherited card layouts render PNGs with fixed dimensions and accept missing data', async () => {
  for (const layout of ['wide', 'portrait']) {
    const input = fixture(); if (layout === 'portrait') input.observation.teams[0].gold = null;
    const buffer = await renderReviewCard(input, { layout });
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(buffer.readUInt32BE(16), DIMENSIONS[layout][0]);
    assert.equal(buffer.readUInt32BE(20), DIMENSIONS[layout][1]);
  }
  await assert.rejects(renderReviewCard(fixture(), { layout: '__proto__' }), /INVALID_REVIEW_LAYOUT/);
});

test('bundle stays inside ignored evals, creates four files, refuses overwrite and bounds input', async t => {
  const evalRoot = path.resolve(__dirname, '../.cloud/evals'); fs.mkdirSync(evalRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(evalRoot, 'review-test-'));
  t.after(() => { assert.equal(path.dirname(tmp), evalRoot); assert.ok(path.basename(tmp).startsWith('review-test-')); fs.rmSync(tmp, { recursive: true, force: true }); });
  const inputPath = path.join(tmp, 'input.json'); fs.writeFileSync(inputPath, JSON.stringify(fixture()));
  const output = path.join(tmp, 'preview');
  await assert.rejects(writeReviewBundle('relative.json', output), /REVIEW_PATH_OUTSIDE_EVALS/);
  await assert.rejects(writeReviewBundle(path.resolve(__dirname, '../package.json'), output), /REVIEW_PATH_OUTSIDE_EVALS/);
  await assert.rejects(writeReviewBundle(inputPath, evalRoot), /REVIEW_PATH_OUTSIDE_EVALS/);
  const result = await writeReviewBundle(inputPath, output);
  assert.equal(result.code, 'OFFLINE_REVIEW_CREATED'); assert.equal(result.networkRequests, 0);
  assert.deepEqual(fs.readdirSync(output).sort(), ['review.json', 'review.md', 'scoreboard-portrait.png', 'scoreboard-wide.png']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'review.json'), 'utf8')).trustedForCoach, false);
  await assert.rejects(writeReviewBundle(inputPath, output), /REVIEW_OUTPUT_EXISTS/);
  fs.writeFileSync(inputPath, ' '.repeat(65537));
  await assert.rejects(writeReviewBundle(inputPath, path.join(tmp, 'oversized')), /INVALID_REVIEW_FILE/);
  assert.equal(fs.existsSync(path.join(tmp, 'oversized')), false);
});
