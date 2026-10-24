'use strict';

// Hengs Analis match-day cards: the broadcast-style preview of one match, and a list card for a busy day's schedule,
// the night recap and the event recap. Text drawn by Hengs; no logos, hero art or photos. Henry's backgrounds:
// assets/esports/preview-bg.png (1600x900) and recap-bg.png (square); without them the Aurora gradient.
const path = require('node:path');
const { C, WIDTH, fitText, loadArt, loadFonts, paint } = require('./card');

const ASSETS = path.join(__dirname, '../../assets/esports');
const PREVIEW_BG = path.join(ASSETS, 'preview-bg.png');
const RECAP_BG = path.join(ASSETS, 'recap-bg.png');
const FOOTER = 'Data: Liquipedia (CC-BY-SA 3.0) · Kartu buatan Hengs · Bukan afiliasi Moonton atau MPL';
const rule = (ctx, y) => { ctx.fillStyle = 'rgba(139, 92, 255, 0.45)'; ctx.fillRect(96, y, WIDTH - 192, 2); };

// data: { title, date, time, bestof, teams: [{ name, ticker }], record, heroes: [[{ name, picks }], [...]] }
async function renderPreviewCard(data, { background } = {}) {
  loadFonts();
  const { createCanvas } = require('@napi-rs/canvas');
  const height = 900;
  const canvas = createCanvas(WIDTH, height); const ctx = canvas.getContext('2d');
  paint(ctx, WIDTH, height, background === undefined ? await loadArt(PREVIEW_BG) : background);
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, data.title.toUpperCase(), 96, 112, { size: 40, min: 28, family: 'Analis Bold', color: C.accent, width: 1000 });
  fitText(ctx, data.date, WIDTH - 96, 112, { size: 32, min: 24, family: 'Analis Text', color: C.muted, width: 420, align: 'right' });
  const [a, b] = data.teams;
  fitText(ctx, a.name, 96, 300, { size: 76, min: 44, family: 'Analis Bold', color: C.text, width: 560 });
  fitText(ctx, b.name, WIDTH - 96, 300, { size: 76, min: 44, family: 'Analis Bold', color: C.text, width: 560, align: 'right' });
  fitText(ctx, 'VS', WIDTH / 2, 310, { size: 120, min: 90, family: 'Analis Display', color: C.win, width: 260, align: 'center' });
  fitText(ctx, `${data.time} · ${data.bestof}`, WIDTH / 2, 390, { size: 40, min: 30, family: 'Analis Bold', color: C.text, width: 600, align: 'center' });
  fitText(ctx, data.record, WIDTH / 2, 470, { size: 34, min: 26, family: 'Analis Text', color: C.muted, width: WIDTH - 192, align: 'center' });
  rule(ctx, 510);
  data.teams.forEach((team, i) => {
    const x = i ? WIDTH - 96 : 96; const align = i ? 'right' : 'left';
    fitText(ctx, `Andalan ${team.ticker || team.name}`, x, 574, { size: 34, min: 26, family: 'Analis Bold', color: C.accent, width: 640, align });
    const heroes = data.heroes[i] || [];
    if (!heroes.length) fitText(ctx, 'Belum ada data hero', x, 630, { size: 30, min: 24, family: 'Analis Text', color: C.dim, width: 640, align });
    heroes.forEach((hero, n) => fitText(ctx, `${hero.name} · ${hero.picks} game`, x, 630 + n * 52,
      { size: 32, min: 24, family: 'Analis Text', color: C.text, width: 640, align }));
  });
  fitText(ctx, FOOTER, WIDTH / 2, height - 64, { size: 24, min: 20, family: 'Analis Text', color: C.dim, width: WIDTH - 192, align: 'center' });
  return canvas.toBuffer('image/png');
}

// data: { title, date, headline?, subline?, sections: [{ heading, lines: [string] }] }
async function renderListCard(data, { background } = {}) {
  loadFonts();
  const { createCanvas } = require('@napi-rs/canvas');
  const body = 170 + (data.headline ? 120 : 0) + (data.subline ? 50 : 0) + data.sections.reduce((n, s) => n + 80 + s.lines.length * 50, 0);
  const height = Math.max(900, body + 140);
  const canvas = createCanvas(WIDTH, height); const ctx = canvas.getContext('2d');
  paint(ctx, WIDTH, height, background === undefined ? await loadArt(RECAP_BG) : background);
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, data.title.toUpperCase(), 96, 112, { size: 40, min: 28, family: 'Analis Bold', color: C.accent, width: 1000 });
  if (data.date) fitText(ctx, data.date, WIDTH - 96, 112, { size: 32, min: 24, family: 'Analis Text', color: C.muted, width: 420, align: 'right' });
  let y = 170;
  if (data.headline) { y += 90; fitText(ctx, data.headline, 96, y, { size: 84, min: 50, family: 'Analis Display', color: C.win, width: WIDTH - 192 }); y += 30; }
  if (data.subline) { y += 50; fitText(ctx, data.subline, 96, y, { size: 36, min: 26, family: 'Analis Text', color: C.muted, width: WIDTH - 192 }); }
  for (const section of data.sections) {
    y += 30; rule(ctx, y);
    y += 50; fitText(ctx, section.heading, 96, y, { size: 36, min: 28, family: 'Analis Bold', color: C.accent, width: WIDTH - 192 });
    for (const line of section.lines) { y += 50; fitText(ctx, line, 96, y, { size: 32, min: 22, family: 'Analis Text', color: C.text, width: WIDTH - 192 }); }
  }
  fitText(ctx, FOOTER, WIDTH / 2, height - 64, { size: 24, min: 20, family: 'Analis Text', color: C.dim, width: WIDTH - 192, align: 'center' });
  return canvas.toBuffer('image/png');
}

module.exports = { renderPreviewCard, renderListCard };
