'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../assets/esports/teams/catalog.json');
const { resolveTeamBrands, loadCatalogLogo } = require('../scripts/esports-team-catalog');
const { createReview, renderReviewMarkdown, renderReviewCard, cardGeometry } = require('../scripts/esports-scoreboard-review');
const input = () => ({ evidenceKind: 'manual_transcription', teamCatalog: 'mpl-ph-s18', observation: {
  teams: ['FLCN', 'RORA'].map(name => ({ name, kills: 5, gold: 25000,
    players: Array.from({ length: 5 }, (_, i) => ({ name: 'Player ' + i, kills: 1, deaths: 1, assists: 1, gold: 5000 })) })),
} });

test('all eight PH assets match pinned PNG bytes/dimensions; collection aliases have no cross-team collisions', async () => {
  const collection = catalog.collections.find(c => c.id === 'mpl-ph-s18');
  assert.equal(collection.teams.length, 8);
  const seen = new Map();
  for (const team of collection.teams) {
    const image = await loadCatalogLogo(collection.id, team.id);
    assert.equal(image.width, team.width); assert.equal(image.height, team.height);
    for (const alias of team.aliases) {
      const key = alias.toUpperCase().replace(/[.\s-]+/g, ' ');
      assert.ok(!seen.has(key) || seen.get(key) === team.id);
      seen.set(key, team.id);
      assert.equal(resolveTeamBrands(collection.id, [{ name: alias }]).teams[0].id, team.id);
    }
  }
});

test('logo lookup is optional and exact within an explicit region/season, with no fuzzy cross-region fallback', async () => {
  assert.equal(resolveTeamBrands(undefined, []), null);
  assert.equal(resolveTeamBrands(null, []), null);
  for (const id of ['', '__proto__', '../mpl-ph-s18', 'mpl-id-s18', 'https://example.com/logos', {}]) {
    assert.throws(() => resolveTeamBrands(id, []), /TEAM_CATALOG_UNAVAILABLE/);
    await assert.rejects(loadCatalogLogo(id, 'team-falcons'), /TEAM_CATALOG_UNAVAILABLE/);
  }
  await assert.rejects(loadCatalogLogo('mpl-ph-s18', '../secret'), /TEAM_CATALOG_UNAVAILABLE/);
  const result = resolveTeamBrands('mpl-ph-s18', [' falcon ', 'Aurora', 'ONIC PH', 'ONIC ID', 'Fake FLCN', null].map(name => ({ name })));
  assert.deepEqual(result.teams.map(t => t?.id || null), ['team-falcons', 'aurora-gaming', 'onic-ph', null, null, null]);
});

test('catalog metadata is provenance only, never changes numbers or promotes evidence to Coach knowledge', () => {
  const raw = input(); const original = structuredClone(raw); const review = createReview(raw);
  const without = createReview({ ...raw, teamCatalog: undefined });
  assert.deepEqual(raw, original);
  assert.deepEqual(review.observation, without.observation); assert.deepEqual(review.derived, without.derived);
  assert.equal(review.teamBranding.region, 'PH'); assert.equal(review.teamBranding.season, 18);
  assert.equal(review.teamBranding.verifiedAt, '2026-10-25');
  assert.equal(review.teamBranding.teams[0].ticker, 'FLCN');
  assert.equal(review.trustedForCoach, false); assert.equal(review.publishable, false); assert.equal(review.networkRequests, 0);
  const markdown = renderReviewMarkdown(raw);
  assert.match(markdown, /https:\/\/ph-mpl.com\/teams/);
  assert.match(markdown, /bukan bukti branding historis pertandingan, afiliasi resmi, atau izin publikasi/);
});

test('catalog logos render offline in both layouts and unknown names remain an honest initial fallback', async () => {
  for (const layout of ['wide', 'portrait']) {
    const raw = input(); if (layout === 'portrait') raw.observation.teams[1].name = 'Unknown club';
    const buffer = await renderReviewCard(raw, { layout });
    const g = cardGeometry(layout, false);
    assert.equal(buffer.readUInt32BE(16), g.width); assert.equal(buffer.readUInt32BE(20), g.height);
    if (layout === 'portrait') assert.equal(createReview(raw).teamBranding.teams[1], null);
  }
});

test('comparison column, both rosters and six item slots remain within independent layout bounds', () => {
  for (const layout of ['wide', 'portrait']) for (const items of [false, true]) {
    const g = cardGeometry(layout, items);
    assert.ok(g.margin >= 48);
    assert.ok(g.iconStart + 5 * g.iconStep + g.iconSize < g.tableWidth);
    for (let side = 0; side < 2; side++) {
      assert.ok(g.tableX[side] + g.tableWidth <= g.width - g.margin);
      assert.ok(g.tableY[side] + g.rowStart + 5 * g.rowHeight < g.footerY - 14);
    }
    if (layout === 'wide') {
      assert.ok(g.tableX[0] + g.tableWidth + 32 <= g.centre.x);
      assert.ok(g.centre.x + g.centre.width + 32 <= g.tableX[1]);
    } else {
      assert.ok(g.centre.y + g.centre.height + 24 <= g.tableY[0]);
      assert.ok(g.tableY[0] + g.rowStart + 5 * g.rowHeight + 24 <= g.tableY[1]);
    }
    assert.ok(g.footerY + 125 < g.height - 20);
  }
});

test('dark official marks have a light surrounding plate without recoloring their source pixels', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const raw = input(); raw.observation.teams[0].name = 'ONIC PH';
  assert.equal(createReview(raw).teamBranding.teams[0].plate, 'light');
  const buffer = await renderReviewCard(raw); const g = cardGeometry('wide', false);
  const canvas = createCanvas(g.width, g.height); const ctx = canvas.getContext('2d');
  ctx.drawImage(await loadImage(buffer), 0, 0);
  assert.deepEqual([...ctx.getImageData(g.margin + 2, g.markY + 2, 1, 1).data], [241, 245, 244, 255]);
});
