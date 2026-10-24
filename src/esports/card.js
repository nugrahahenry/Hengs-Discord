'use strict';

// Hengs Analis series card: text drawn by Hengs from parsed Liquipedia data. No logos, hero art or photos.
// Henry's background goes in assets/esports/series-bg.png; without it the card uses the Aurora gradient.
const fs = require('node:fs');
const path = require('node:path');

const WIDTH = 1600;
const ASSETS = path.join(__dirname, '../../assets');
const BACKGROUND = path.join(ASSETS, 'esports/series-bg.png');
const FONTS = path.join(ASSETS, 'appreciation/crown-stage');
const C = { text: '#F7F8FF', muted: '#B8C2DA', dim: '#8E98B8', accent: '#35D9FF', win: '#FFE7B0', purple: '#8B5CFF',
  panel: 'rgba(8, 12, 35, 0.72)', blue: '#5AA9FF', red: '#FF6B8B' };
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const SIDE = { blue: 'biru', red: 'merah' };

function wibDate(at) {
  if (!Number.isFinite(at)) return '';
  const d = new Date(at + 7 * 3_600_000);
  const pad = n => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} WIB`;
}
const tag = team => team.ticker || team.name || 'TBD';
const list = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} dan ${names.at(-1)}` : names.join('');
const seconds = length => { const [m, s] = length.split(':').map(Number); return m * 60 + s; };

// At most two facts worth a line, all counted from the games; nothing a model would have to guess.
function notesFor(match) {
  const [win, lose] = match.winner === 1 ? [0, 1] : [1, 0];
  const W = match.teams[win];
  const decided = match.games.filter(g => g.winner);
  const notes = [];
  let deficit = [0, 0]; const run = [0, 0];
  for (const g of decided) {
    run[g.winner - 1]++;
    if (run[lose] - run[win] > deficit[1] - deficit[0]) deficit = [run[win], run[lose]];
  }
  let streak = 0;
  for (const g of [...decided].reverse()) { if (g.winner - 1 !== win) break; streak++; }
  if (deficit[1] - deficit[0] >= 2) notes.push(`Comeback: ${W.name} sempat tertinggal ${deficit[0]}-${deficit[1]} lalu menang ${streak} game beruntun.`);
  if (!match.score[lose]) notes.push(`${W.name} menang bersih ${match.score[win]}-0.`);
  if (match.score[lose] === match.score[win] - 1 && decided.length === match.bestof) notes.push(`Ditentukan di game terakhir (game ${decided.length}).`);
  if (decided.length >= 3 && decided.every(g => g.picks[0].length && g.picks[1].length)) {
    const always = [0, 1].map(t => decided.slice(1).reduce((keep, g) => keep.filter(h => g.picks[t].includes(h)), decided[0].picks[t]));
    const team = always[win].length >= always[lose].length ? win : lose;
    if (always[team].length) notes.push(`${tag(match.teams[team])} pakai ${list(always[team])} di semua ${decided.length} game.`);
  }
  const bySide = side => decided.filter(g => g.sides[win] === side);
  for (const side of ['blue', 'red']) {
    const other = side === 'blue' ? 'red' : 'blue';
    const wins = bySide(side).filter(g => g.winner - 1 === win).length;
    if (wins >= 2 && !bySide(other).some(g => g.winner - 1 === win)) notes.push(`${tag(W)} menang ${wins} dari ${bySide(side).length} game di sisi ${SIDE[side]}.`);
  }
  const timed = decided.filter(g => g.length);
  if (timed.length >= 2) {
    const longest = timed.reduce((a, b) => seconds(b.length) > seconds(a.length) ? b : a);
    notes.push(`Game terlama: game ${longest.number} (${longest.length}).`);
  }
  return notes.slice(0, 2);
}

function cardContent(match, { league = '' } = {}) {
  const [a, b] = match.teams;
  return {
    title: [league, match.stage].filter(Boolean).join(' · '),
    date: wibDate(match.startAt ?? NaN),
    teams: match.teams.map((team, i) => ({ name: team.name || 'TBD', score: match.score[i], won: match.winner === i + 1 })),
    games: match.games.filter(g => g.winner).map(g => ({
      label: [`Game ${g.number}`, g.length, `${tag(match.teams[g.winner - 1])} menang`].filter(Boolean).join(' · '),
      sides: g.sides[0] && g.sides[1] ? `${tag(a)} ${SIDE[g.sides[0]]} · ${tag(b)} ${SIDE[g.sides[1]]}` : '',
      objective: g.objective
        ? `Objektif: ${g.objective.name}${g.objective.team ? ` (${tag(match.teams[g.objective.team - 1])})` : ''}` : '',
      picks: g.picks[0].length || g.picks[1].length
        ? [0, 1].map(t => `${tag(match.teams[t])}: ${g.picks[t].join(', ') || 'belum ada'}`) : ['Draft belum ada di data Liquipedia'],
      bans: g.bans[0].length || g.bans[1].length
        ? `Ban ${tag(a)}: ${g.bans[0].join(', ') || '-'} · ${tag(b)}: ${g.bans[1].join(', ') || '-'}` : '',
    })),
    mvp: `MVP: ${match.mvp || 'belum ada di data Liquipedia'}`,
    notes: notesFor(match),
    footer: 'Data: Liquipedia (CC-BY-SA 3.0) · Kartu buatan Hengs · Bukan afiliasi Moonton atau MPL',
  };
}

let fonts;
function loadFonts() {
  if (!fonts) {
    const { GlobalFonts } = require('@napi-rs/canvas');
    for (const [file, family] of [['barlow-condensed-black-italic.ttf', 'Analis Display'],
      ['barlow-condensed-bold.ttf', 'Analis Bold'], ['barlow-semibold.ttf', 'Analis Text']]) {
      if (!GlobalFonts.registerFromPath(path.join(FONTS, file), family)) throw new Error('ESPORTS_FONT_UNAVAILABLE');
    }
    fonts = true;
  }
}

// A bundled background, if Henry has added it. A missing or broken file falls back to the gradient.
async function loadArt(file) {
  try {
    if (!fs.statSync(file).isFile()) return null;
    const image = await require('@napi-rs/canvas').loadImage(file);
    return image.width && image.height ? image : null;
  } catch { return null; }
}

// Henry's art scaled to cover, or the Aurora gradient, under the dark panel every Analis card sits on.
function paint(ctx, width, height, art) {
  if (art) {
    const scale = Math.max(width / art.width, height / art.height);
    ctx.drawImage(art, (width - art.width * scale) / 2, (height - art.height * scale) / 2, art.width * scale, art.height * scale);
  } else {
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, '#120B35'); base.addColorStop(0.5, '#10183A'); base.addColorStop(1, '#062D48');
    ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
    for (const [x, y, r, color] of [[220, 120, 520, 'rgba(139,92,255,0.35)'], [width - 180, height - 120, 620, 'rgba(53,217,255,0.22)']]) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.fillStyle = C.panel; ctx.fillRect(48, 40, width - 96, height - 80);
}

function fitText(ctx, value, x, y, { size, min = size, family, color, width, align = 'left' }) {
  for (;; size--) {
    ctx.font = `${size}px "${family}"`;
    if (ctx.measureText(value).width <= width || size <= min) break;
  }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y, width);
}

const GAME_HEIGHT = 196;
async function renderSeriesCard(match, meta, { background } = {}) {
  loadFonts();
  const content = cardContent(match, meta);
  const art = background === undefined ? await loadArt(BACKGROUND) : background;
  const { createCanvas } = require('@napi-rs/canvas');
  // Games, MVP and notes, then room for the footer line so it never touches the last note.
  const height = Math.max(900, 330 + content.games.length * GAME_HEIGHT + 60 + content.notes.length * 44 + 120);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  paint(ctx, WIDTH, height, art);
  ctx.textBaseline = 'alphabetic';
  fitText(ctx, content.title.toUpperCase(), 96, 112, { size: 40, min: 28, family: 'Analis Bold', color: C.accent, width: 1000 });
  if (content.date) fitText(ctx, content.date, WIDTH - 96, 112, { size: 32, min: 24, family: 'Analis Text', color: C.muted, width: 420, align: 'right' });
  const [a, b] = content.teams;
  fitText(ctx, a.name, 96, 236, { size: 64, min: 40, family: 'Analis Bold', color: a.won ? C.win : C.text, width: 560 });
  fitText(ctx, b.name, WIDTH - 96, 236, { size: 64, min: 40, family: 'Analis Bold', color: b.won ? C.win : C.text, width: 560, align: 'right' });
  fitText(ctx, `${a.score} - ${b.score}`, WIDTH / 2, 244, { size: 110, min: 80, family: 'Analis Display', color: C.text, width: 300, align: 'center' });
  let y = 330;
  for (const game of content.games) {
    ctx.fillStyle = 'rgba(139, 92, 255, 0.45)'; ctx.fillRect(96, y - 4, WIDTH - 192, 2);
    fitText(ctx, game.label, 96, y + 42, { size: 36, min: 28, family: 'Analis Bold', color: C.text, width: 760 });
    fitText(ctx, [game.sides, game.objective].filter(Boolean).join(' · '), WIDTH - 96, y + 42,
      { size: 28, min: 22, family: 'Analis Text', color: C.muted, width: 640, align: 'right' });
    game.picks.forEach((line, i) => fitText(ctx, line, 96, y + 88 + i * 40, { size: 30, min: 22, family: 'Analis Text', color: C.text, width: WIDTH - 192 }));
    if (game.bans) fitText(ctx, game.bans, 96, y + 172, { size: 24, min: 18, family: 'Analis Text', color: C.dim, width: WIDTH - 192 });
    y += GAME_HEIGHT;
  }
  fitText(ctx, content.mvp, 96, y + 48, { size: 40, min: 30, family: 'Analis Bold', color: C.win, width: WIDTH - 192 });
  y += 60;
  for (const note of content.notes) {
    y += 44;
    fitText(ctx, note, 96, y, { size: 30, min: 24, family: 'Analis Text', color: C.text, width: WIDTH - 192 });
  }
  fitText(ctx, content.footer, WIDTH / 2, height - 64, { size: 24, min: 20, family: 'Analis Text', color: C.dim, width: WIDTH - 192, align: 'center' });
  return canvas.toBuffer('image/png');
}

module.exports = { C, cardContent, fitText, loadArt, loadFonts, notesFor, paint, renderSeriesCard, wibDate, WIDTH };
