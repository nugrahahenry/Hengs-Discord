'use strict';

let createCanvas;
try {
  ({ createCanvas } = require('@napi-rs/canvas'));
} catch {
  createCanvas = null;
}
const {
  BLUEPRINTS,
  communityLayoutLabel,
  communityChannelSlots,
  plannedCategoryName,
  plannedChannel,
} = require('./prompt-assistant');

const WIDTH = 1200;
const HEIGHT = 675;
const MAX_ROWS = 24;

function safeText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

function trimText(value, max = 30) {
  const text = safeText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function targetRows(blueprintKeys, guild, nameStyle = 'plain', customization = {}, selection = {}) {
  const selected = new Set(Array.isArray(blueprintKeys) ? blueprintKeys.map(String) : []);
  const slots = communityChannelSlots([...selected], selection);
  const rows = [];
  for (const blueprint of BLUEPRINTS) {
    if (!selected.has(blueprint.key)) continue;
    for (const { index } of slots.filter(slot => slot.blueprintKey === blueprint.key && slot.kind === 'text')) {
      const planned = plannedChannel(blueprint, 'text', index, guild, nameStyle, customization);
      rows.push({
        section: plannedCategoryName(blueprint, guild, nameStyle, customization),
        kind: 'text',
        ...planned,
      });
    }
    for (const { index } of slots.filter(slot => slot.blueprintKey === blueprint.key && slot.kind === 'voice')) {
      const planned = plannedChannel(blueprint, 'voice', index, guild, nameStyle, customization);
      rows.push({
        section: plannedCategoryName(blueprint, guild, nameStyle, customization),
        kind: 'voice',
        ...planned,
      });
    }
  }
  return rows.slice(0, MAX_ROWS);
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function renderCommunityPreviewCard({ blueprintKeys, guild, nameStyle = 'plain', layoutStyle = 'aurora', customization = {}, selection = {} } = {}) {
  if (!createCanvas) return null;
  const rows = targetRows(blueprintKeys, guild, nameStyle, customization, selection);
  if (!rows.length) return null;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const themes = {
    aurora: { stops: ['#100A2D', '#172A55', '#073C53'], glowA: 'rgba(72, 226, 255, 0.14)', glowB: 'rgba(193, 102, 255, 0.14)' },
    midnight: { stops: ['#080B18', '#171B36', '#27204A'], glowA: 'rgba(120, 148, 255, 0.14)', glowB: 'rgba(154, 99, 217, 0.14)' },
    minimal: { stops: ['#20242D', '#303744', '#495567'], glowA: 'rgba(168, 199, 250, 0.14)', glowB: 'rgba(214, 168, 255, 0.14)' },
  };
  const theme = themes[layoutStyle] || themes.aurora;
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, theme.stops[0]);
  background.addColorStop(0.52, theme.stops[1]);
  background.addColorStop(1, theme.stops[2]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = theme.glowA;
  ctx.beginPath();
  ctx.arc(1020, 78, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.glowB;
  ctx.beginPath();
  ctx.arc(130, 590, 240, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F7F8FF';
  ctx.font = '700 38px Arial';
  ctx.fillText('HENGS COMMUNITY PREVIEW', 58, 72);
  ctx.fillStyle = '#B9C8E5';
  ctx.font = '500 20px Arial';
  ctx.fillText(`Preview privat · Tema ${communityLayoutLabel(layoutStyle)}`, 60, 108);

  const columns = 2;
  const columnWidth = 520;
  const startX = 60;
  const startY = 150;
  const gapX = 36;
  const rowHeight = 35;
  const sectionHeight = 34;
  const perColumn = Math.ceil(rows.length / columns);

  for (let column = 0; column < columns; column += 1) {
    const columnRows = rows.slice(column * perColumn, (column + 1) * perColumn);
    if (!columnRows.length) continue;
    const x = startX + column * (columnWidth + gapX);
    const height = Math.min(455, 30 + columnRows.length * rowHeight + sectionHeight);
    drawRoundedRect(ctx, x, startY, columnWidth, height, 18, 'rgba(8, 13, 42, 0.68)');
    let y = startY + 38;
    let section = null;
    for (const row of columnRows) {
      if (row.section !== section) {
        section = row.section;
        ctx.fillStyle = '#8EEBFF';
        ctx.font = '700 16px Arial';
        ctx.fillText(safeText(section), x + 24, y);
        y += sectionHeight;
      }
      ctx.fillStyle = row.kind === 'voice' ? '#E8C8FF' : '#DDE7FF';
      ctx.font = '500 18px Arial';
      const prefix = row.kind === 'voice' ? '🔊' : '💬';
      ctx.fillText(`${prefix} ${row.kind === 'text' ? '#' : ''}${trimText(row.name)}`, x + 26, y);
      ctx.fillStyle = row.present ? '#7CF2B0' : '#FFD37A';
      ctx.font = '700 15px Arial';
      ctx.fillText(row.present ? 'SUDAH ADA' : 'DISARANKAN', x + columnWidth - 144, y);
      y += rowHeight;
    }
  }

  ctx.fillStyle = '#B9C8E5';
  ctx.font = '500 17px Arial';
  ctx.fillText('Teks: sudah ada / disarankan. Voice: ruang suara tetap terpisah.', 60, 642);
  return canvas.toBuffer('image/png');
}

module.exports = {
  HEIGHT,
  MAX_ROWS,
  WIDTH,
  renderCommunityPreviewCard,
  targetRows,
};
