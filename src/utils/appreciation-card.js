'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateAppreciation } = require('../ops/appreciation');

const SIZE = Object.freeze({ width: 1080, height: 1350 });
const ASSETS = path.join(__dirname, '../../assets/appreciation/crown-stage');
const P = { white: '#f6f8fe', gold: '#ffe7b0', ice: '#d4e5ff' };
let artwork;

// Fixed, bundled assets only. Cache one decode, never user input, URLs or rendered cards.
function loadArtwork() {
  if (!artwork) artwork = (async () => {
    const { loadImage, GlobalFonts } = require('@napi-rs/canvas');
    for (const [file, family] of [
      ['barlow-condensed-black-italic.ttf', 'Crown Display'],
      ['barlow-condensed-bold.ttf', 'Crown Names'], ['barlow-semibold.ttf', 'Crown Text'],
    ]) {
      if (!GlobalFonts.registerFromPath(path.join(ASSETS, file), family)) throw new Error('APPRECIATION_FONT_UNAVAILABLE');
    }
    const read = async file => {
      const filename = path.join(ASSETS, file);
      if (!fs.statSync(filename).isFile()) throw new Error('APPRECIATION_ASSET_UNAVAILABLE');
      const image = await loadImage(filename);
      if (!image.complete || !image.width || !image.height) throw new Error('APPRECIATION_ASSET_UNAVAILABLE');
      return image;
    };
    const icon = async file => loadImage(Buffer.from(fs.readFileSync(path.join(ASSETS, file), 'utf8').replaceAll('currentColor', P.gold)));
    const [background, trophy, crest, game, date] = await Promise.all([
      read('arena-background.png'), read('trophy.png'), read('hengs-family-cutout.png'),
      icon('game-controller-bold.svg'), icon('calendar-blank-bold.svg'),
    ]);
    return { background, trophy, crest, game, date };
  })().catch(error => { artwork = undefined; throw error; });
  return artwork;
}

function cardContent(input) {
  const data = validateAppreciation(input);
  // Only promote an explicitly supplied rank. Free-form achievements retain every word.
  const result = data.achievement.match(/^(juara\s+[1-9]\d{0,2})(?:\s+(.+))?$/i);
  const game = result?.[2]?.match(/^turnamen\s+(MLBB|PUBG|Valorant|Dota 2|Free Fire)$/i)?.[1] || '';
  return {
    ...data, heading: result ? result[1].toUpperCase() : 'APRESIASI',
    detail: result ? (game ? '' : result[2] || '') : data.achievement,
    game, branded: /^hengs\s+famil(?:ia|y)$/i.test(data.recipient),
    players: (data.players ? data.players.split('; ') : []).map(value => {
      const match = value.match(/^([^()]+?)\s*\(([^()]+)\)$/u);
      return match ? { name: match[1].trim(), nick: match[2] } : { name: value, nick: '' };
    }),
  };
}

// Split even a long unbroken name by grapheme; never crop, ellipsize or drop a player.
function wrap(ctx, value, width) {
  const units = Array.from(new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(value), part => part.segment);
  const lines = [];
  let line = '';
  for (const unit of units) {
    if (line && ctx.measureText(line + unit).width > width) {
      const space = line.lastIndexOf(' ');
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
      else { lines.push(line); line = ''; }
    }
    line += unit;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function textBlock(ctx, value, { x = 540, y = 0, width = 920, size = 47, min = size, maxLines = 1, family = 'Crown Text', color = P.white } = {}) {
  let lines;
  for (;;) {
    ctx.font = `${size}px "${family}"`;
    lines = wrap(ctx, value, width);
    if (lines.length <= maxLines || size <= min) break;
    size = Math.max(min, size - 2);
  }
  const lineHeight = Math.ceil(size * 1.05);
  return { x, y, width, size, family, color, lines, lineHeight, height: lines.length * lineHeight };
}

// Equal-width rows with at most one player's difference. Four becomes 2+2, seven 3+2+2.
function rosterRowCounts(count, columns = 3) {
  if (!count) return [];
  const rows = Math.ceil(count / columns);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

function layoutRoster(ctx, players, startY) {
  if (!players.length) return { rows: [], blocks: [], bottom: startY };
  // Measure real glyphs instead of character counts. Long names get wider columns.
  const fitsThree = players.every(player =>
    textBlock(ctx, player.name, { width: 278, size: 64, min: 56, maxLines: 2, family: 'Crown Names' }).lines.length <= 2
    && (!player.nick || textBlock(ctx, player.nick, { width: 278, size: 41, min: 36, maxLines: 2 }).lines.length <= 2));
  const counts = rosterRowCounts(players.length, fitsThree ? 3 : 2);
  const columns = Math.max(...counts);
  const cellWidth = { 1: 880, 2: 460, 3: 320 }[columns];
  const width = cellWidth - 42;
  const nameSize = Math.min(...players.map(player => textBlock(ctx, player.name,
    { width, size: columns === 1 ? 84 : columns === 2 ? 72 : 64, min: 48, maxLines: 2, family: 'Crown Names' }).size));
  const nickSize = Math.min(...players.map(player => textBlock(ctx, player.nick,
    { width, size: columns === 1 ? 48 : 41, min: 36, maxLines: 2 }).size));
  const blocks = [];
  const rows = [];
  let y = startY;
  let offset = 0;
  for (const count of counts) {
    const group = players.slice(offset, offset + count);
    const names = group.map((player, i) => textBlock(ctx, player.name, {
      x: SIZE.width / 2 + (i - (count - 1) / 2) * cellWidth,
      y, width, size: nameSize, family: 'Crown Names',
    }));
    const nameBottom = y + Math.max(...names.map(block => block.height));
    const nicknames = group.flatMap((player, i) => player.nick ? [textBlock(ctx, player.nick, {
      x: names[i].x, y: nameBottom + 4, width, size: nickSize, color: P.gold,
    })] : []);
    const bottom = Math.max(nameBottom, ...nicknames.map(block => block.y + block.height));
    blocks.push(...names, ...nicknames);
    rows.push({ count, y, bottom, names, nicknames });
    offset += count;
    y = bottom + 28;
  }
  return { rows, blocks, bottom: rows.at(-1).bottom };
}

function layoutCard(ctx, content, demo) {
  const blocks = [];
  const add = (value, options) => {
    const block = textBlock(ctx, value, options);
    blocks.push(block);
    return block.y + block.height;
  };
  add(content.heading, { y: 12, size: 188, min: 100, family: 'Crown Display' });
  let y = add(content.recipient.toUpperCase(), { y: 737, size: 112, min: 72, maxLines: 2, family: 'Crown Names' });
  if (content.occasion) y = add(content.occasion, { y: y + 3, size: 47, min: 38, maxLines: 2, color: P.gold });
  if (content.detail) y = add(content.detail, { y: y + 12, size: 42, min: 38, maxLines: 3, color: P.ice });
  const metadata = [];
  if (content.game) metadata.push({ text: content.game, icon: 'game' });
  if (content.date) metadata.push({ text: content.date, icon: 'date' });
  if (metadata.length) {
    ctx.font = '36px "Crown Text"';
    const widths = metadata.map(item => ctx.measureText(item.text).width + 46);
    const total = widths.reduce((a, b) => a + b, 0) + (metadata.length - 1) * 44;
    y += 10;
    if (total <= 920) {
      let x = (SIZE.width - total) / 2;
      metadata.forEach((item, i) => {
        item.x = x; item.y = y;
        add(item.text, { x: x + 46 + (widths[i] - 46) / 2, y, size: 36, width: widths[i] - 46 + 1, color: P.ice });
        x += widths[i] + 44;
      });
      y += 38;
    } else {
      for (const item of metadata) {
        item.x = 80; item.y = y;
        y = add(item.text, { x: 563, y, width: 874, size: 36, color: P.ice }) + 10;
      }
    }
  }
  const roster = layoutRoster(ctx, content.players, y + 44);
  if (roster.rows.length) { blocks.push(...roster.blocks); y = roster.bottom + 20; }
  const height = Math.max(SIZE.height, y + 90);
  add(demo ? 'DEMO / HENGS HALL OF FAME' : 'HENGS HALL OF FAME', { y: height - 63, size: 27, color: P.ice });
  return { blocks, metadata, roster: roster.rows, height };
}

async function renderAppreciationCard(input, { demo = false } = {}) {
  const content = cardContent(input);
  const art = await loadArtwork();
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(SIZE.width, SIZE.height);
  const layout = layoutCard(canvas.getContext('2d'), content, demo);
  if (layout.height > 3600) throw new Error('APPRECIATION_LAYOUT_LIMIT');
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#03101f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Keep the stage proportions fixed even when a long roster needs more height.
  ctx.drawImage(art.background, 0, 0, SIZE.width, SIZE.height);
  const shade = ctx.createLinearGradient(0, 690, 0, SIZE.height);
  shade.addColorStop(0, 'rgba(3,16,31,0)');
  shade.addColorStop(0.16, 'rgba(3,16,31,0.78)');
  shade.addColorStop(0.55, 'rgba(3,16,31,0.91)');
  shade.addColorStop(1, '#03101f');
  ctx.fillStyle = shade; ctx.fillRect(0, 690, SIZE.width, canvas.height - 690);
  if (content.branded) ctx.drawImage(art.crest, 251, 202, 578, 578);
  else {
    const width = 550 * art.trophy.width / art.trophy.height;
    ctx.drawImage(art.trophy, (SIZE.width - width) / 2, 182, width, 550);
  }
  for (const block of layout.blocks) {
    ctx.font = `${block.size}px "${block.family}"`;
    ctx.fillStyle = block.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    block.lines.forEach((line, i) => ctx.fillText(line, block.x, block.y + block.size * 0.9 + i * block.lineHeight));
  }
  for (const item of layout.metadata) ctx.drawImage(art[item.icon], item.x, item.y + 4, 34, 34);
  return canvas.toBuffer('image/png');
}

module.exports = { renderAppreciationCard, SIZE, cardContent, layoutCard };
