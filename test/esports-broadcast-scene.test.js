'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { paintBroadcastScene, loadBroadcastArena } = require('../scripts/esports-broadcast-scene');
const { createReview, renderReviewCard, cardGeometry } = require('../scripts/esports-scoreboard-review');
const { compactLabel } = require('../scripts/esports-broadcast-card');
const { loadFonts } = require('../src/esports/card');
const demo = () => ({ evidenceKind: 'model_candidate', teamCatalog: 'mpl-ph-s18', observation: {
  event: 'SIMULASI LAYOUT, bukan hasil pertandingan', gameNumber: 1, durationSeconds: null, winnerIndex: null,
  teams: ['ONIC PH', 'Team Liquid PH'].map(name => ({ name, kills: null, gold: null,
    players: Array.from({ length: 5 }, (_, i) => ({ name: 'Pemain Demo Dengan Nama Panjang ' + i,
      kills: null, deaths: null, assists: null, gold: null })) })),
} });
const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('reusable arena layer is deterministic and bounded for both sizes, with and without item rows', async () => {
  const art = await loadBroadcastArena();
  assert.equal(await loadBroadcastArena(), art);
  for (const layout of ['wide', 'portrait']) for (const items of [false, true]) {
    const g = cardGeometry(layout, items); const images = [];
    for (let n = 0; n < 2; n++) {
      const canvas = createCanvas(g.width, g.height);
      const ctx = canvas.getContext('2d');
      paintBroadcastScene(ctx, g, art); assert.equal(ctx.globalAlpha, 1);
      images.push(canvas.toBuffer('image/png'));
    }
    assert.deepEqual(images[0], images[1]);
  }
});

test('arena reading mats retain muted-text contrast on every supported canvas size', async () => {
  const art = await loadBroadcastArena();
  for (const layout of ['wide', 'portrait']) for (const items of [false, true]) {
    const g = cardGeometry(layout, items); const canvas = createCanvas(g.width, g.height); const ctx = canvas.getContext('2d');
    paintBroadcastScene(ctx, g, art);
    // Sample the transparent table heading mats and the footer. Numeric row/centre fills remain opaque.
    const zones = [
      ...[0, 1].map(side => ({ x: g.tableX[side] + 16, y: g.tableY[side] + 54, w: g.tableWidth - 32, h: 28 })),
      { x: g.margin, y: g.footerY, w: g.width - 2 * g.margin, h: 62 },
    ];
    for (const z of zones) for (let x = z.x; x < z.x + z.w; x += 16) for (let y = z.y; y < z.y + z.h; y += 8) {
      assert.ok(contrast([184, 194, 218], [...ctx.getImageData(x, y, 1, 1).data]) >= 4.5,
        'MUTED_TEXT_CONTRAST_BELOW_4_5');
    }
  }
});

test('long names, other catalog teams and missing data do not change review facts or scene framing', async () => {
  for (const layout of ['wide', 'portrait']) {
    const raw = demo(); const before = createReview(raw); const buffer = await renderReviewCard(raw, { layout });
    assert.deepEqual(createReview(raw), before);
    assert.equal(before.derived.goldDifference, null); assert.equal(before.publishable, false);
    const other = demo(); delete other.teamCatalog;
    other.observation.teams[0].name = 'Tim Eksperimen Nama Panjang Nusantara';
    other.observation.teams[1].name = 'Komunitas Esports Nama Panjang Kedua';
    const changed = await renderReviewCard(other, { layout });
    const g = cardGeometry(layout, false); const pixels = [];
    for (const bytes of [buffer, changed]) {
      const canvas = createCanvas(g.width, g.height); const ctx = canvas.getContext('2d');
      ctx.drawImage(await loadImage(bytes), 0, 0);
      pixels.push([...ctx.getImageData(1, 180, 8, 32).data]);
    }
    assert.deepEqual(pixels[0], pixels[1]); // No randomized or value-specific background.
  }
});

test('long labels fit without horizontal squashing while complete original values remain in the report', () => {
  loadFonts(); const ctx = createCanvas(300, 100).getContext('2d');
  const long = 'Tim Eksperimen Nama Panjang Nusantara';
  const short = compactLabel(ctx, long, 150, 46);
  assert.ok(short.endsWith('…')); assert.ok(short.length < long.length);
  ctx.font = '42px "Analis Bold"'; assert.ok(ctx.measureText(short).width <= 150);
  assert.equal(compactLabel(ctx, 'FLCN', 150, 46), 'FLCN');
  const raw = demo(); raw.observation.teams[0].name = long;
  assert.equal(createReview(raw).observation.teams[0].name, long);
});
