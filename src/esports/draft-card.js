'use strict';

// Hengs Analis draft card: one game's picks and bans in a broadcast draft-screen layout, drawn by Hengs from Liquipedia
// data. Roles come from the Liquipedia hero dictionary; no hero art, logos or photos. Henry's GPT backdrop
// (assets/esports/draft-bg.png, any landscape size, scaled to cover) goes behind; Hengs always draws the panels and
// slots on top, because GPT images come out in sizes like 1672x941 and exact slot positions would never line up.
// Liquipedia stores sides, not pick order, so the card names the blue and red side and never claims first pick.
const path = require('node:path');
const { C, WIDTH, fitText, loadArt, loadFonts, paint } = require('./card');
const { heroes } = require('../scrim/mlbb-heroes.json');

const HEIGHT = 960;
const DRAFT_BG = path.join(__dirname, '../../assets/esports/draft-bg.png');
const FOOTER = 'Data: Liquipedia (CC-BY-SA 3.0) · Kartu buatan Hengs · Bukan afiliasi Moonton atau MPL';
const ROLE = new Map(heroes.map(hero => [hero.name.toLowerCase(), hero.roles[0]]));
const ROLE_COLOR = { Tank: '#4F8BFF', Fighter: '#FF8A3D', Assassin: '#B45CFF', Mage: '#35D9FF', Marksman: '#FFC93D', Support: '#3DDC97' };
const SIDE = { blue: 'SISI BIRU', red: 'SISI MERAH' };
// Two side panels with five pick slots each, then five ban slots per side.
const LAYOUT = Object.freeze({
  panels: Object.freeze([{ x: 64, y: 186, w: 700, h: 600 }, { x: 836, y: 186, w: 700, h: 600 }]),
  pickY: Object.freeze([270, 374, 478, 582, 686]), pickInset: 16, pickW: 668, pickH: 88,
  banY: 812, banW: 124, banH: 56, banStep: 136,
});
const tag = team => team.ticker || team.name;

// One decided game (index among decided games), blue side on the left: names, roles, bans, the series score after it.
function draftData(match, gameIndex, { league = '' } = {}) {
  const decided = match.games.filter(g => g.winner);
  const game = decided[gameIndex];
  const run = [1, 2].map(t => decided.slice(0, gameIndex + 1).filter(g => g.winner === t).length);
  const order = game.sides[0] === 'red' && game.sides[1] === 'blue' ? [1, 0] : [0, 1];
  const side = i => ({
    team: match.teams[i].name, ticker: tag(match.teams[i]), label: SIDE[game.sides[i]] || 'SISI ?',
    color: game.sides[i] === 'red' ? C.red : C.blue, won: game.winner === i + 1,
    picks: (game.picks[i] || []).map(name => ({ name, role: ROLE.get(String(name).toLowerCase()) || '' })),
    bans: game.bans[i] || [],
  });
  const objective = game.objective
    ? `Objektif: ${game.objective.name}${game.objective.team ? ` (${tag(match.teams[game.objective.team - 1])})` : ''}` : '';
  return {
    title: [league, match.stage].filter(Boolean).join(' · '), number: game.number, game: `GAME ${game.number}`,
    detail: [game.length, objective].filter(Boolean).join(' · '),
    score: `${tag(match.teams[0])} ${run[0]} - ${run[1]} ${tag(match.teams[1])}`,
    sides: order.map(side),
  };
}

// Decided games with five picks a side get a card; an incomplete draft on Liquipedia gets none.
const draftable = match => match.games.filter(g => g.winner).map((g, i) => [g, i])
  .filter(([g]) => g.picks?.[0]?.length === 5 && g.picks?.[1]?.length === 5).map(([, i]) => i);

const box = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

function chip(ctx, x, y, w, h, role) {
  ctx.globalAlpha = 0.92; ctx.fillStyle = ROLE_COLOR[role] || C.purple; box(ctx, x, y, w, h, h / 2); ctx.fill(); ctx.globalAlpha = 1;
  fitText(ctx, role.toUpperCase(), x + w / 2, y + h - 13, { size: 22, min: 16, family: 'Analis Bold', color: '#0B1026', width: w - 20, align: 'center' });
}

// Tinted side panels, dark pick slots and ban slots on LAYOUT, over the backdrop or the Aurora gradient.
function frames(ctx, data) {
  data.sides.forEach((side, s) => {
    const p = LAYOUT.panels[s];
    ctx.fillStyle = side.color === C.red ? 'rgba(255, 107, 139, 0.10)' : 'rgba(90, 169, 255, 0.10)';
    box(ctx, p.x, p.y, p.w, p.h, 18); ctx.fill();
    ctx.strokeStyle = side.color; ctx.lineWidth = 2; box(ctx, p.x, p.y, p.w, p.h, 18); ctx.stroke();
    ctx.fillStyle = 'rgba(8, 12, 35, 0.85)';
    for (const y of LAYOUT.pickY) { box(ctx, p.x + LAYOUT.pickInset, y, LAYOUT.pickW, LAYOUT.pickH, 12); ctx.fill(); }
    ctx.fillStyle = 'rgba(8, 12, 35, 0.70)';
    for (let i = 0; i < 5; i++) { box(ctx, p.x + i * LAYOUT.banStep, LAYOUT.banY, LAYOUT.banW, LAYOUT.banH, 10); ctx.fill(); }
  });
}

async function renderDraftCard(data, { background } = {}) {
  loadFonts();
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');
  const art = background === undefined ? await loadArt(DRAFT_BG) : background;
  if (art) {
    const scale = Math.max(WIDTH / art.width, HEIGHT / art.height);
    ctx.drawImage(art, (WIDTH - art.width * scale) / 2, (HEIGHT - art.height * scale) / 2, art.width * scale, art.height * scale);
    ctx.fillStyle = 'rgba(8, 12, 35, 0.35)'; ctx.fillRect(0, 0, WIDTH, HEIGHT); // keeps the text readable on any art
  } else {
    paint(ctx, WIDTH, HEIGHT, null);
  }
  frames(ctx, data);
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, data.title.toUpperCase(), 96, 96, { size: 32, min: 24, family: 'Analis Bold', color: C.accent, width: 900 });
  fitText(ctx, data.game, 96, 156, { size: 64, min: 48, family: 'Analis Display', color: C.text, width: 400 });
  fitText(ctx, data.score, WIDTH / 2, 150, { size: 52, min: 36, family: 'Analis Bold', color: C.win, width: 480, align: 'center' });
  fitText(ctx, data.detail, WIDTH - 96, 150, { size: 30, min: 22, family: 'Analis Text', color: C.muted, width: 440, align: 'right' });
  data.sides.forEach((side, s) => {
    const p = LAYOUT.panels[s]; const right = s === 1;
    const x = right ? p.x + p.w - 28 : p.x + 28; const align = right ? 'right' : 'left';
    fitText(ctx, side.team, x, p.y + 52, { size: 40, min: 28, family: 'Analis Bold', color: side.won ? C.win : C.text, width: 440, align });
    fitText(ctx, `${side.label}${side.won ? ' · MENANG' : ''}`, right ? p.x + 28 : p.x + p.w - 28, p.y + 50,
      { size: 24, min: 18, family: 'Analis Bold', color: side.color, width: 230, align: right ? 'left' : 'right' });
    side.picks.slice(0, 5).forEach((pick, i) => {
      const y = LAYOUT.pickY[i];
      fitText(ctx, pick.name, x, y + 56, { size: 38, min: 24, family: 'Analis Bold', color: C.text, width: 420, align });
      if (pick.role) chip(ctx, right ? p.x + 40 : p.x + p.w - 40 - 170, y + 22, 170, 44, pick.role);
    });
    side.bans.slice(0, 5).forEach((name, i) => fitText(ctx, name, p.x + i * LAYOUT.banStep + LAYOUT.banW / 2, LAYOUT.banY + 36,
      { size: 22, min: 14, family: 'Analis Text', color: C.dim, width: LAYOUT.banW - 12, align: 'center' }));
  });
  fitText(ctx, FOOTER, WIDTH / 2, HEIGHT - 52, { size: 24, min: 20, family: 'Analis Text', color: C.dim, width: WIDTH - 192, align: 'center' });
  return canvas.toBuffer('image/png');
}

module.exports = { LAYOUT, HEIGHT, draftData, draftable, renderDraftCard };
