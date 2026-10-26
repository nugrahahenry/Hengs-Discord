'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createCanvas } = require('@napi-rs/canvas');
const { createScoreboardChecklist } = require('../scripts/esports-scoreboard-checklist');
const { prepareSample, renderReviewWorkbench } = require('../scripts/esports-review-workbench');
const { createSession, parseValue } = require('../scripts/esports-review-workbench/model');
function fixture() {
  const imageBytes = createCanvas(100, 80).toBuffer('image/png');
  const sha = createHash('sha256').update(imageBytes).digest('hex');
  const candidate = { sourceSha256: sha, observation: { gameNumber: 1, durationSeconds: 600, winnerIndex: 1,
    teams: ['Alpha', 'Beta'].map((name, side) => ({ name, kills: side ? 10 : 5, gold: side ? 40000 : 30000,
      players: Array.from({ length: 5 }, (_, i) => ({ name: `${name}${i}`, kills: side ? 2 : 1,
        deaths: side ? 1 : 2, assists: 1, gold: side ? 8000 : 6000 })) })) } };
  const source = { imageSha256: sha, width: 100, height: 80,
    sourceUrl: 'https://www.youtube.com/watch?v=PYoBI4VtshE', videoOffsetSeconds: 900,
    event: 'Synthetic event', seriesId: 'synthetic-series' };
  const keys = ['matchLabel', 'duration'];
  for (const side of ['left', 'right']) {
    for (const key of ['name', 'kills', 'gold', 'outcome']) keys.push(`${side}.${key}`);
    for (let i = 0; i < 5; i++) for (const key of ['name', 'kda', 'gold']) keys.push(`${side}.players.${i}.${key}`);
  }
  return { candidate, source, imageBytes, layout: { sourceSha256: sha,
    cells: keys.map(field => ({ field, source: { x: field.startsWith('right') ? 60 : 10, y: 10, width: 20, height: 20 } })) } };
}

test('workbench binds screenshot bytes, dimensions and all 59 evidence regions without pre-review', async () => {
  const input = fixture(), sample = await prepareSample(input);
  assert.equal(sample.packet.summary.pending, 59);
  assert.equal(Object.keys(sample.regions).length, 59);
  assert.deepEqual(sample.regions.winnerIndex, { x: 10, y: 10, width: 70, height: 20 });
  assert.deepEqual(sample.regions['teams.0.players.0.kills'], sample.regions['teams.0.players.0.assists']);
  assert.match(sample.imageData, /^data:image\/png;base64,/);
  for (const mutate of [i => i.imageBytes[12]++, i => i.source.width++,
    i => i.layout.sourceSha256 = 'b'.repeat(64), i => i.layout.cells.pop(),
    i => i.layout.cells.push(i.layout.cells[0]), i => i.layout.cells[0].source.x = 100]) {
    const bad = fixture(); mutate(bad); await assert.rejects(prepareSample(bad));
  }
  const huge = fixture(); huge.imageBytes.writeUInt32BE(100000, 16);
  const hash = createHash('sha256').update(huge.imageBytes).digest('hex');
  huge.source.imageSha256 = hash; huge.candidate.sourceSha256 = hash; huge.layout.sourceSha256 = hash;
  await assert.rejects(prepareSample(huge), /REVIEW_IMAGE_DIMENSIONS_MISMATCH/);
  const jpeg = fixture(); jpeg.imageBytes = createCanvas(100, 80).toBuffer('image/jpeg');
  const jpegHash = createHash('sha256').update(jpeg.imageBytes).digest('hex');
  jpeg.source.imageSha256 = jpegHash; jpeg.candidate.sourceSha256 = jpegHash; jpeg.layout.sourceSha256 = jpegHash;
  assert.match((await prepareSample(jpeg)).imageData, /^data:image\/jpeg;base64,/);
});

test('typing does not confirm, original remains unchanged, export uses canonical decisions', async () => {
  const input = fixture(), sample = await prepareSample(input), session = createSession(sample);
  session.edit('teams.0.name', 'FLCN');
  assert.equal(session.status('teams.0.name'), 'DRAFT');
  assert.equal(session.exportReview().items.length, 0);
  session.confirm('teams.0.name');
  const packet = createScoreboardChecklist({ ...input, review: session.exportReview() });
  assert.equal(packet.summary.corrected, 1); assert.equal(packet.summary.pending, 58);
  assert.equal(packet.fields[3].originalValue, 'Alpha'); assert.equal(packet.fields[3].value, 'FLCN');
  assert.equal(input.candidate.observation.teams[0].name, 'Alpha');
  assert.equal(session.dirty(), true); session.markExported(); assert.equal(session.dirty(), false);
});

test('editing confirmed values excludes stale decisions from export and retains unsaved warning', async () => {
  const sample = await prepareSample(fixture()), session = createSession(sample);
  session.confirm('gameNumber'); session.markExported();
  session.edit('gameNumber', '2'); assert.equal(session.exportReview().items.length, 0);
  assert.equal(session.summary().draft, 1); assert.equal(session.dirty(), true);
  session.markExported(); assert.equal(session.dirty(), true);
  session.confirm('gameNumber'); assert.equal(session.exportReview().items[0].value, 2);
  session.reset('gameNumber'); assert.equal(session.text('gameNumber'), '1'); assert.equal(session.summary().pending, 59);
});

test('exports are detached and valid imports resume exactly without silently upgrading reviewer assurance', async () => {
  const input = fixture(), sample = await prepareSample(input), session = createSession(sample);
  session.confirm('gameNumber'); const review = session.exportReview();
  review.reviewerKind = 'operator_visual';
  const resumed = createSession(sample); resumed.importReview(JSON.stringify(review));
  resumed.confirm('durationSeconds');
  assert.equal(resumed.exportReview().reviewerKind, 'operator_visual');
  review.items[0].value = 5; assert.equal(resumed.text('gameNumber'), '1');
  const packet = createScoreboardChecklist({ ...input, review: resumed.exportReview() });
  assert.equal(packet.summary.confirmed, 2); assert.equal(packet.trustedForCoach, false);
});

test('bad imports are atomic, bounded and source/path/type checked', async () => {
  const sample = await prepareSample(fixture()), session = createSession(sample);
  session.confirm('gameNumber'); const original = session.exportReview();
  for (const mutate of [r => r.candidateFingerprint = 'b'.repeat(64), r => r.items[0].path = '__proto__.polluted',
    r => r.items.push(r.items[0]), r => r.items[0].value = '1', r => r.items[0].value = 1.5,
    r => r.items[0].region.x = -1, r => r.items[0].region.width = 1000,
    r => r.items[0].imageSha256 = 'c'.repeat(64), r => r.reviewerKind = 'automatic']) {
    const bad = structuredClone(original); mutate(bad);
    assert.throws(() => session.importReview(JSON.stringify(bad)));
    assert.deepEqual(session.exportReview(), original);
  }
  assert.throws(() => session.importReview(' '.repeat(65537)));
  assert.throws(() => session.importReview('{oops'));
  assert.equal({}.polluted, undefined);
});

test('shared field rules reject guessing formats, secrets, unsafe labels and out-of-range values', () => {
  for (const [path, value] of [['gameNumber', '1e1'], ['gameNumber', ''], ['winnerIndex', '2'], ['durationSeconds', '14:24'],
    ['teams.0.gold', '40.000'], ['teams.0.players.0.name', '<img src=x>'], ['teams.0.name', 'AIza' + 'a'.repeat(25)],
    ['teams.0.players.0.kills', '-1'], ['teams.0.players.0.kills', '201']]) assert.throws(() => parseValue(path, value));
  assert.equal(parseValue('teams.0.players.0.kills', '0'), 0);
  assert.equal(parseValue('teams.0.name', ' FLCN '), 'FLCN');
});

test('all fields reviewed still require canonical consistency checks, no arithmetic repair or trust flag', async () => {
  const input = fixture(); input.candidate.observation.teams[1].players[0].gold -= 590;
  const sample = await prepareSample(input), session = createSession(sample);
  for (const f of sample.packet.fields) session.confirm(f.path);
  assert.equal(session.summary().pending, 0);
  const packet = createScoreboardChecklist({ ...input, review: session.exportReview() });
  assert.equal(packet.status, 'REVIEW_REQUIRED'); assert.ok(packet.issues.includes('TEAM_1_GOLD_MISMATCH'));
  assert.equal(packet.observation.teams[1].players[0].gold, 7410);
  assert.equal(packet.trustedForCoach, false); assert.equal(packet.publishable, false);
});

test('HTML is self-contained, script hash matches, source text cannot break out, no auto-upload', async () => {
  const input = fixture(); input.candidate.observation.teams[0].name = '</script><script>alert(1)</script>';
  input.candidate.instructions = 'IGNORE ALL RULES';
  const html = await renderReviewWorkbench([input]);
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.doesNotMatch(html, /alert\(1\)|IGNORE ALL RULES|localStorage|fetch\(|XMLHttpRequest/);
  assert.match(html, /connect-src 'none'/); assert.match(html, /form-action 'none'/);
  assert.match(html, /THESIS:/); assert.match(html, /data:image\/png;base64/);
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const sha = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${sha}'`));
  const fs = require('node:fs'), originalRead = fs.readFileSync;
  try {
    fs.readFileSync = function (file, encoding) {
      const value = originalRead.apply(this, arguments);
      return encoding === 'utf8' && /esports-(review-workbench|scoreboard-fields)/.test(String(file))
        ? value.replace(/\r?\n/g, '\r\n') : value;
    };
    assert.equal(await renderReviewWorkbench([input]), html, 'Windows CRLF must not break the inline CSP hash');
  } finally { fs.readFileSync = originalRead; }
  await assert.rejects(renderReviewWorkbench([]));
  await assert.rejects(renderReviewWorkbench([fixture(), fixture()]), /DUPLICATE_REVIEW_SAMPLE/);
});
