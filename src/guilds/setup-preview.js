'use strict';

// /admin setup v2 previews: a Discord-like sidebar of the planned server, and a board comparing the themes. The VM
// has no emoji or symbol fonts, so emoji are bundled Twemoji PNGs, the separators ・ ┃ ︱ 【 】 │ are drawn as shapes,
// Latin text uses the bundled Barlow and other symbols (╰ ┈ ➤ ─ ═ ˌ ˈ ...) the bundled DejaVu Sans. An emoji outside
// the bundle draws as a neutral tile.
const fs = require('node:fs');
const path = require('node:path');
const { THEMES, nameParts } = require('./channel-style');

const ASSETS = path.join(__dirname, '../../assets');
const TWEMOJI = path.join(ASSETS, 'setup/twemoji');
const S = 2; // drawn at 2x for a crisp image
const C = { bg: '#2b2d31', panel: '#1e1f22', category: '#949ba4', channel: '#949ba4', bright: '#f2f3f5', hover: '#404249',
  new: '#23a55a', renamed: '#f0b232', tile: '#5c5f66', mark: '#b5bac1' };

let images;
function load() {
  if (!images) {
    const { GlobalFonts } = require('@napi-rs/canvas');
    for (const [file, family] of [['appreciation/crown-stage/barlow-condensed-bold.ttf', 'Setup Bold'],
      ['appreciation/crown-stage/barlow-semibold.ttf', 'Setup Text'], ['setup/fonts/DejaVuSans.ttf', 'Setup Symbols'],
      ['setup/fonts/DejaVuSans-Bold.ttf', 'Setup Symbols Bold']]) {
      if (!GlobalFonts.registerFromPath(path.join(ASSETS, file), family)) throw new Error('SETUP_FONT_UNAVAILABLE');
    }
    images = new Map();
  }
  return images;
}

async function emojiImage(code) {
  const cache = load();
  if (!cache.has(code)) {
    const file = path.join(TWEMOJI, `${code}.png`);
    cache.set(code, fs.existsSync(file) ? await require('@napi-rs/canvas').loadImage(file) : null);
  }
  return cache.get(code);
}

// Barlow covers Latin; anything else in a text run (box drawing, arrows, modifier letters) goes to DejaVu.
const latin = ch => ch.codePointAt(0) <= 0x24f;
function runs(text) {
  const out = [];
  for (const ch of text) {
    const kind = latin(ch) ? 'latin' : 'symbol';
    if (out.at(-1)?.kind === kind) out.at(-1).text += ch; else out.push({ kind, text: ch });
  }
  return out;
}

// Draws one name at x on the row's baseline y; returns the x after it.
async function drawName(ctx, name, x, y, { size = 16, color = C.channel, bold = false } = {}) {
  for (const part of nameParts(name)) {
    if (part.kind === 'emoji') {
      const image = await emojiImage(part.code);
      if (image) ctx.drawImage(image, x * S, (y - size + 2) * S, size * S, size * S);
      else { ctx.fillStyle = C.tile; ctx.beginPath(); ctx.roundRect(x * S, (y - size + 2) * S, size * S, size * S, 4 * S); ctx.fill(); }
      x += size + 3;
    } else if (part.kind === 'sep') {
      ctx.fillStyle = C.mark;
      const mid = y - size / 2 + 2;
      if (part.mark === '・') { ctx.beginPath(); ctx.arc((x + 4) * S, mid * S, 2 * S, 0, Math.PI * 2); ctx.fill(); x += 9; }
      else if (part.mark === '┃') { ctx.fillRect((x + 2) * S, (mid - 8) * S, 3 * S, 16 * S); x += 9; }
      else if (part.mark === '︱') { ctx.fillRect((x + 5) * S, (mid - 8) * S, 2 * S, 16 * S); x += 13; }
      else if (part.mark === '│' || part.mark === '|') { ctx.fillRect((x + 2) * S, (mid - 8) * S, 1.5 * S, 16 * S); x += 7; }
      else {
        // 【 and 】: a thick bar with short ticks at both ends, mirrored for the closing bracket.
        const left = part.mark === '【';
        const bar = left ? x + 2 : x + 6;
        ctx.fillRect(bar * S, (mid - 8) * S, 2.5 * S, 16 * S);
        ctx.fillRect((left ? bar : bar - 3.5) * S, (mid - 8) * S, 6 * S, 2.5 * S);
        ctx.fillRect((left ? bar : bar - 3.5) * S, (mid + 5.5) * S, 6 * S, 2.5 * S);
        x += 10;
      }
    } else {
      for (const run of runs(part.text)) {
        const family = run.kind === 'latin' ? (bold ? 'Setup Bold' : 'Setup Text') : (bold ? 'Setup Symbols Bold' : 'Setup Symbols');
        ctx.font = `${(run.kind === 'latin' ? size : size - 2) * S}px "${family}"`; ctx.fillStyle = color;
        ctx.fillText(run.text, x * S, y * S);
        x += ctx.measureText(run.text).width / S;
      }
    }
  }
  return x;
}

function pill(ctx, x, y, text, color) {
  ctx.font = `${11 * S}px "Setup Bold"`;
  const w = ctx.measureText(text).width / S + 14;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x * S, (y + 9) * S, w * S, 16 * S, 8 * S); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(text, (x + w / 2) * S, (y + 21) * S); ctx.textAlign = 'left';
  return w;
}

const ROW = 34; const HEAD = 30; const PAD = 14;
const heightFor = sections => PAD * 2 + sections.reduce((h, s) => h + (s.category ? HEAD : 0) + s.channels.length * ROW + 8, 0);

function chevron(ctx, x, y) {
  ctx.fillStyle = C.category; ctx.beginPath();
  ctx.moveTo((x + 2) * S, (y + 13) * S); ctx.lineTo((x + 10) * S, (y + 13) * S); ctx.lineTo((x + 6) * S, (y + 18) * S); ctx.fill();
}

async function channelRow(ctx, channel, x, y, width) {
  if (channel.isNew || channel.renamedFrom) {
    ctx.fillStyle = C.hover; ctx.beginPath(); ctx.roundRect((x - 6) * S, (y + 2) * S, (width + 12) * S, (ROW - 4) * S, 6 * S); ctx.fill();
  }
  ctx.fillStyle = C.category;
  if (channel.kind === 'voice') {
    ctx.beginPath(); ctx.moveTo((x + 2) * S, (y + 14) * S); ctx.lineTo((x + 7) * S, (y + 14) * S); ctx.lineTo((x + 13) * S, (y + 8) * S);
    ctx.lineTo((x + 13) * S, (y + 26) * S); ctx.lineTo((x + 7) * S, (y + 20) * S); ctx.lineTo((x + 2) * S, (y + 20) * S); ctx.fill();
  } else { ctx.font = `${20 * S}px "Setup Text"`; ctx.fillText('#', x * S, (y + 24) * S); }
  const end = await drawName(ctx, channel.name, x + 22, y + 23, { color: channel.isNew || channel.renamedFrom ? C.bright : C.channel });
  if (channel.isNew) pill(ctx, Math.min(end + 8, x + width - 46), y, 'BARU', C.new);
  else if (channel.renamedFrom) pill(ctx, Math.min(end + 8, x + width - 54), y, 'GANTI', C.renamed);
}

// sections: [{ category: name|null, channels: [{ name, kind: 'text'|'voice', isNew, renamedFrom }] }]
async function renderSidebar({ sections = [], width = 380 } = {}) {
  load();
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(width * S, Math.max(120, heightFor(sections)) * S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';
  let y = PAD;
  for (const section of sections) {
    if (section.category) {
      chevron(ctx, PAD, y);
      await drawName(ctx, String(section.category).toUpperCase(), PAD + 16, y + 20, { size: 13, color: C.category, bold: true });
      y += HEAD;
    }
    for (const channel of section.channels) { await channelRow(ctx, channel, PAD, y, width - PAD * 2); y += ROW; }
    y += 8;
  }
  return canvas.toBuffer('image/png');
}

// One column per theme: the category header and the sample channels in that theme.
async function renderThemeBoard({ sample = [], category = { emoji: '🤖', label: 'Hengs' }, themes = THEMES } = {}) {
  load();
  const { createCanvas } = require('@napi-rs/canvas');
  const column = 280; const head = 44;
  const canvas = createCanvas(column * themes.length * S, (head + PAD * 2 + HEAD + sample.length * ROW + 12) * S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, theme] of themes.entries()) {
    const x0 = index * column;
    ctx.fillStyle = C.bg; ctx.beginPath(); ctx.roundRect((x0 + 8) * S, 8 * S, (column - 16) * S, (canvas.height / S - 16) * S, 10 * S); ctx.fill();
    ctx.font = `${16 * S}px "Setup Bold"`; ctx.fillStyle = C.bright;
    ctx.fillText(`${index + 1}. ${theme.label}`, (x0 + PAD + 6) * S, 36 * S);
    let y = head + PAD - 6;
    chevron(ctx, x0 + PAD + 6, y);
    await drawName(ctx, theme.category(category.emoji, category.label).toUpperCase(), x0 + PAD + 22, y + 20, { size: 13, color: C.category, bold: true });
    y += HEAD;
    for (const entry of sample) {
      await channelRow(ctx, { name: theme.channel(entry.emoji, entry.slug) }, x0 + PAD + 6, y, column - PAD * 2 - 12);
      y += ROW;
    }
  }
  return canvas.toBuffer('image/png');
}

module.exports = { renderSidebar, renderThemeBoard };
