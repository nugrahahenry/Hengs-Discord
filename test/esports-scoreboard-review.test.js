'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReview, renderReviewMarkdown, renderReviewCard, writeReviewBundle, cardGeometry, DIMENSIONS, ITEM_DIMENSIONS } = require('../scripts/esports-scoreboard-review');
const { decodeItemSource } = require('../scripts/esports-item-evidence');
const { decodeLogoSource } = require('../scripts/esports-team-logos');

// The bundle writes into the workspace's ignored .cloud/evals. Release archives do not carry it and the VM test sandbox
// is read-only, so these run in a git workspace only, like the repository checks in cloud-release.test.js (the first
// v1.87.0 deploy QA failed here with ENOENT).
const workspaceOnly = { skip: !fs.existsSync(path.resolve(__dirname, '../.git')) && 'workspace only: needs the ignored .cloud/evals' };

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

test('bundle stays inside ignored evals, creates four files, refuses overwrite and bounds input', workspaceOnly, async t => {
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

function itemFixture() {
  const input = fixture();
  const source = require('@napi-rs/canvas').createCanvas(384, 192); const ctx = source.getContext('2d');
  const rows = input.observation.teams.map((team, t) => team.players.map((player, p) => ({ playerName: player.name,
    slots: Array.from({ length: 6 }, (_, s) => {
      const rect = { x: t * 192 + s * 28, y: p * 32, width: 24, height: 24 };
      ctx.fillStyle = `rgb(${60 + t * 100},${20 + p * 40},${20 + s * 30})`;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height); return rect;
    }) })));
  const bytes = source.toBuffer('image/png');
  input.itemEvidence = { kind: 'manual_screenshot_crops', manuallyReviewed: true, imageFile: 'source.png',
    imageSha256: createHash('sha256').update(bytes).digest('hex'), width: 384, height: 192, rows };
  return { input, bytes };
}

test('item evidence is explicit manual provenance and never identifies names or purchase order', () => {
  const { input } = itemFixture(); const original = structuredClone(input);
  input.itemEvidence.rows[0][0].slots[0].name = 'invented item';
  const review = createReview(input);
  assert.equal(review.itemEvidence.identification, 'UNVERIFIED');
  assert.equal(review.itemEvidence.layout, 'SOURCE_TOP_ROW_THEN_BOTTOM_ROW');
  assert.equal(review.itemEvidence.rows.flat().flatMap(row => row.slots).length, 60);
  assert.doesNotMatch(JSON.stringify(review), /invented item/);
  assert.equal(review.trustedForCoach, false);
  delete input.itemEvidence.rows[0][0].slots[0].name; assert.deepEqual(input, original);
  assert.match(renderReviewMarkdown(input), /bukan urutan pembelian/);
  assert.match(renderReviewMarkdown(input), /Nama item belum diverifikasi/);
});

test('item manifests reject unreviewed sources, paths, oversized frames and wrong player associations', () => {
  const { input } = itemFixture();
  for (const patch of [{ kind: 'model_guess' }, { manuallyReviewed: false }, { imageFile: '../source.png' },
    { imageFile: 'https://example.com/source.png' }, { imageFile: 'secret.env' }, { imageSha256: 'guess' },
    { width: 99999 }, { width: 4096, height: 4096 }, { rows: [] }]) {
    assert.throws(() => createReview({ ...input, itemEvidence: { ...input.itemEvidence, ...patch } }), /INVALID_ITEM_EVIDENCE/);
  }
  input.itemEvidence.rows[0][0].playerName = input.observation.teams[1].players[0].name;
  assert.throws(() => createReview(input), /ITEM_PLAYER_MISMATCH/);
});

test('item regions stay inside the reviewed frame; unknown slots stay unknown rather than invented empty items', () => {
  for (const patch of [{ x: -1 }, { y: 0.2 }, { width: 0 }, { height: 100 }, { x: 380 }, { y: 190 }]) {
    const { input } = itemFixture(); Object.assign(input.itemEvidence.rows[0][0].slots[0], patch);
    assert.throws(() => createReview(input), /INVALID_ITEM_REGION/);
  }
  const { input } = itemFixture(); input.itemEvidence.rows[0][0].slots[0] = null;
  assert.equal(createReview(input).itemEvidence.rows[0][0].slots[0], null);
  input.itemEvidence.rows[0][0].slots.pop();
  assert.throws(() => createReview(input), /INVALID_ITEM_ROWS/);
});

test('item decoding pins exact PNG bytes and dimensions before decoding', async () => {
  const { input, bytes } = itemFixture(); const evidence = createReview(input).itemEvidence;
  for (const bad of [undefined, Buffer.alloc(0), Buffer.alloc(4194305), Buffer.from('not image bytes')]) {
    await assert.rejects(decodeItemSource(bad, evidence), /INVALID_ITEM_IMAGE/);
  }
  await assert.rejects(decodeItemSource(bytes, { ...evidence, width: 383 }), /ITEM_SOURCE_MISMATCH/);
  await assert.rejects(decodeItemSource(bytes, { ...evidence, imageSha256: '0'.repeat(64) }), /ITEM_SOURCE_MISMATCH/);
  await assert.rejects(renderReviewCard(input), /INVALID_ITEM_IMAGE/); // No silent omission when evidence is declared.
});

test('rendered item slots preserve source pixels and player/slot order in both layouts', async () => {
  const { input, bytes } = itemFixture(); const { createCanvas, loadImage } = require('@napi-rs/canvas');
  for (const layout of ['wide', 'portrait']) {
    const rendered = await renderReviewCard(input, { layout, itemSourceBytes: bytes });
    const [w, h] = ITEM_DIMENSIONS[layout];
    assert.equal(rendered.readUInt32BE(16), w); assert.equal(rendered.readUInt32BE(20), h);
    const image = await loadImage(rendered); const canvas = createCanvas(w, h); const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const g = cardGeometry(layout, true);
    assert.deepEqual([...ctx.getImageData(g.tableX[0] + g.iconStart + 21,
      g.tableY[0] + g.rowStart + g.iconY + 21, 1, 1).data], [60, 20, 20, 255]);
    assert.deepEqual([...ctx.getImageData(g.tableX[1] + g.iconStart + 5 * g.iconStep + 21,
      g.tableY[1] + g.rowStart + 4 * g.rowHeight + g.iconY + 21, 1, 1).data], [160, 180, 170, 255]);
  }
});

test('bundle reads only the pinned local item source; a hash mismatch writes no output', workspaceOnly, async t => {
  const evalRoot = path.resolve(__dirname, '../.cloud/evals'); fs.mkdirSync(evalRoot, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(evalRoot, 'review-items-test-'));
  t.after(() => { assert.equal(path.dirname(tmp), evalRoot); assert.ok(path.basename(tmp).startsWith('review-items-test-')); fs.rmSync(tmp, { recursive: true, force: true }); });
  const { input, bytes } = itemFixture(); const inputPath = path.join(tmp, 'input.json');
  input.teamLogoEvidence = { ...input.itemEvidence, teams: input.observation.teams.map((team, index) =>
    ({ teamName: team.name, region: input.itemEvidence.rows[index][0].slots[0] })) };
  const imagePath = path.join(tmp, 'source.png'); fs.writeFileSync(inputPath, JSON.stringify(input)); fs.writeFileSync(imagePath, bytes);
  const output = path.join(tmp, 'preview');
  await writeReviewBundle(inputPath, output);
  const report = JSON.parse(fs.readFileSync(path.join(output, 'review.json'), 'utf8'));
  assert.equal(report.itemEvidence.identification, 'UNVERIFIED');
  assert.equal(report.teamLogoEvidence.association, 'OPERATOR_MARKED');
  assert.equal(report.networkRequests, 0);
  input.itemEvidence.imageSha256 = '0'.repeat(64); fs.writeFileSync(inputPath, JSON.stringify(input));
  const bad = path.join(tmp, 'bad');
  await assert.rejects(writeReviewBundle(inputPath, bad), /ITEM_SOURCE_MISMATCH/);
  assert.equal(fs.existsSync(bad), false);
  input.itemEvidence.imageSha256 = createHash('sha256').update(bytes).digest('hex');
  input.teamLogoEvidence.imageSha256 = '0'.repeat(64); fs.writeFileSync(inputPath, JSON.stringify(input));
  await assert.rejects(writeReviewBundle(inputPath, bad), /LOGO_SOURCE_MISMATCH/);
  assert.equal(fs.existsSync(bad), false);
});

function logoFixture() {
  const input = fixture(); const { createCanvas } = require('@napi-rs/canvas');
  const image = createCanvas(100, 50); const ctx = image.getContext('2d');
  ctx.fillStyle = 'rgb(60,120,220)'; ctx.fillRect(0, 0, 40, 20);
  ctx.fillStyle = 'rgb(200,160,80)'; ctx.fillRect(50, 0, 40, 20);
  const bytes = image.toBuffer('image/png');
  input.teamLogoEvidence = { kind: 'manual_screenshot_crops', manuallyReviewed: true,
    imageFile: 'logos.png', imageSha256: createHash('sha256').update(bytes).digest('hex'), width: 100, height: 50,
    teams: input.observation.teams.map((team, index) => ({ teamName: team.name,
      region: { x: index * 50, y: 0, width: 40, height: 20 } })) };
  return { input, bytes };
}

test('team logos are optional, explicitly paired evidence, never a claim of current branding or affiliation', () => {
  assert.equal(createReview(fixture()).teamLogoEvidence, null);
  const { input } = logoFixture(); const original = structuredClone(input);
  input.teamLogoEvidence.officialSponsor = true;
  const review = createReview(input);
  assert.equal(review.teamLogoEvidence.association, 'OPERATOR_MARKED');
  assert.equal(review.teamLogoEvidence.brandVersion, 'SOURCE_MATCH_ONLY');
  assert.doesNotMatch(JSON.stringify(review), /officialSponsor/);
  assert.equal(review.publishable, false); assert.equal(review.trustedForCoach, false);
  assert.match(renderReviewMarkdown(input), /Bukan klaim logo terbaru/);
  delete input.teamLogoEvidence.officialSponsor; assert.deepEqual(input, original);
  input.teamLogoEvidence.teams[1].region = null;
  assert.equal(createReview(input).teamLogoEvidence.teams[1].region, null);
});

test('logo manifests reject unsafe sources, mismatched teams and rectangles outside the reviewed image', () => {
  for (const patch of [{ manuallyReviewed: false }, { imageFile: '../logos.png' },
    { imageFile: 'https://example.com/logo.png' }, { width: 99999 }, { width: 4096, height: 4096 },
    { imageSha256: 'wrong' }, { teams: [] }]) {
    const { input } = logoFixture(); Object.assign(input.teamLogoEvidence, patch);
    assert.throws(() => createReview(input), /INVALID_LOGO_EVIDENCE/);
  }
  const { input } = logoFixture(); input.teamLogoEvidence.teams.reverse();
  assert.throws(() => createReview(input), /LOGO_TEAM_MISMATCH/);
  for (const region of [undefined, {}, { x: -1, y: 0, width: 40, height: 20 },
    { x: 0, y: 0, width: 101, height: 20 }, { x: 0, y: 49, width: 40, height: 20 }]) {
    const { input } = logoFixture(); input.teamLogoEvidence.teams[0].region = region;
    assert.throws(() => createReview(input), /INVALID_LOGO_REGION/);
  }
});

test('declared logos fail on missing or changed pixels rather than silently falling back to initials', async () => {
  const { input, bytes } = logoFixture(); const evidence = createReview(input).teamLogoEvidence;
  input.teamCatalog = 'mpl-ph-s18'; // Even a catalog cannot silently override a broken explicit source.
  await assert.rejects(renderReviewCard(input), /INVALID_LOGO_IMAGE/);
  await assert.rejects(decodeLogoSource(Buffer.from('invalid'), evidence), /INVALID_LOGO_IMAGE/);
  await assert.rejects(decodeLogoSource(bytes, { ...evidence, imageSha256: '0'.repeat(64) }), /LOGO_SOURCE_MISMATCH/);
  await assert.rejects(decodeLogoSource(bytes, { ...evidence, width: 99 }), /LOGO_SOURCE_MISMATCH/);
});

test('team logo placement preserves source aspect ratio and correct side in both card layouts', async () => {
  const { input, bytes } = logoFixture(); const { createCanvas, loadImage } = require('@napi-rs/canvas');
  for (const layout of ['wide', 'portrait']) {
    const buffer = await renderReviewCard(input, { layout, logoSourceBytes: bytes });
    const [w, h] = DIMENSIONS[layout]; const canvas = createCanvas(w, h); const ctx = canvas.getContext('2d');
    ctx.drawImage(await loadImage(buffer), 0, 0);
    const g = cardGeometry(layout, false);
    const size = g.markSize; const margin = g.margin; const y = g.markY;
    assert.deepEqual([...ctx.getImageData(margin + size / 2, y + size / 2, 1, 1).data], [60, 120, 220, 255]);
    assert.deepEqual([...ctx.getImageData(w - margin - size / 2, y + size / 2, 1, 1).data], [200, 160, 80, 255]);
    // A 2:1 mark is contained, not stretched to fill the square plaque.
    assert.deepEqual([...ctx.getImageData(margin + size / 2, y + 8, 1, 1).data], [241, 245, 244, 255]);
  }
  input.teamLogoEvidence.teams[1].region = null;
  const mixed = await renderReviewCard(input, { layout: 'portrait', logoSourceBytes: bytes });
  assert.equal(mixed.readUInt32BE(16), 900);
});
