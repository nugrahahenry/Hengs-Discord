'use strict';

// Reading path: result, opposing rosters, neutral centre comparison. Mobile moves that comparison above the rosters.
// The supplied scoreboard owns the topology; inherited Analis fonts/palette own the visual identity.
const path = require('node:path');
const { C, fitText, loadFonts } = require('../src/esports/card');
const { loadBroadcastArena, paintBroadcastScene } = require('./esports-broadcast-scene');
const DIMENSIONS = Object.freeze({ wide: [1800, 1240], portrait: [900, 1650] });
const ITEM_DIMENSIONS = Object.freeze({ wide: [1800, 1240], portrait: [900, 2280] });
const shown = value => value === null ? '?' : String(value);
const gold = value => value === null ? '?' : new Intl.NumberFormat('id-ID').format(value);
const pct = value => value === null ? '?' : `${String(value).replace('.', ',')}%`;
const time = seconds => seconds === null ? '?' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Avoid canvas horizontal compression for labels. The complete name remains in Markdown/JSON.
function compactLabel(ctx, value, width, size, family = 'Analis Bold') {
  const full = String(value);
  ctx.save(); ctx.font = `${size - 4}px "${family}"`;
  let result = full;
  if (ctx.measureText(full).width > width) {
    const characters = Array.from(full);
    while (characters.length && ctx.measureText(characters.join('') + '…').width > width) characters.pop();
    result = characters.join('').trimEnd() + '…';
  }
  ctx.restore();
  return result;
}

function cardGeometry(layout, items) {
  if (!Object.hasOwn(DIMENSIONS, layout)) throw new Error('INVALID_REVIEW_LAYOUT');
  const portrait = layout === 'portrait'; const [width, height] = (items ? ITEM_DIMENSIONS : DIMENSIONS)[layout];
  const margin = 64; const rowHeight = items ? 116 : 57;
  return { width, height, margin, portrait, tableWidth: portrait ? 772 : 598,
    tableX: [64, portrait ? 64 : 1138], tableY: portrait ? [594, items ? 1300 : 1005] : [354, 354],
    rowStart: 86, rowHeight, iconStart: 82, iconY: 55, iconSize: 43, iconStep: 49,
    markSize: portrait ? 64 : 88, markY: 188,
    centre: portrait ? { x: 64, y: 346, width: 772, height: 218 } : { x: 710, y: 354, width: 380, height: 666 },
    footerY: portrait ? (items ? 2024 : 1418) : 1080 };
}

async function renderBroadcastCard(review, { layout, itemImage, logoImage, catalogLogos = [null, null] }) {
  const g = cardGeometry(layout, Boolean(itemImage)); const { width, height, margin, portrait } = g;
  const { createCanvas, loadImage } = require('@napi-rs/canvas'); loadFonts();
  const canvas = createCanvas(width, height); const ctx = canvas.getContext('2d');
  const o = review.observation; const [a, b] = o.teams; const usable = width - margin * 2;
  const text = (value, x, y, size = 28, color = C.text, maxWidth = usable, align = 'left', family = 'Analis Text') =>
    fitText(ctx, String(value), x, y, { size, min: size - 4, family, color, width: maxWidth, align });
  const label = (value, x, y, size, color, maxWidth, align = 'left', family = 'Analis Bold') =>
    text(compactLabel(ctx, value, maxWidth, size, family), x, y, size, color, maxWidth, align, family);
  const rule = (x, y, w, color = '#314058') => { ctx.fillStyle = color; ctx.fillRect(x, y, w, 1); };
  paintBroadcastScene(ctx, g, await loadBroadcastArena());
  text('Review pertandingan', margin, 76, portrait ? 44 : 50, C.text, usable - 100, 'left', 'Analis Bold');
  text(`${o.event || 'Event belum diketahui'} · Game ${shown(o.gameNumber)}`, margin, 118, 27);
  text(review.evidenceLabel, margin, 155, 23, C.win);
  const mascot = await loadImage(path.join(__dirname, '../assets/brand/hengs-bot-icon-v2.png'));
  ctx.drawImage(mascot, width - margin - 68, 38, 68, 68);

  o.teams.forEach((team, index) => {
    const brand = review.teamBranding?.teams[index];
    const x = index ? width - margin - g.markSize : margin;
    const region = review.teamLogoEvidence?.teams[index].region;
    const image = review.teamLogoEvidence ? (region ? logoImage : null) : catalogLogos[index];
    if (image) {
      const r = region || { x: 0, y: 0, width: image.width, height: image.height };
      if (region || brand?.plate === 'light') { ctx.fillStyle = '#F1F5F4'; ctx.fillRect(x, g.markY, g.markSize, g.markSize); }
      const scale = Math.min((g.markSize - 12) / r.width, (g.markSize - 12) / r.height);
      const w = r.width * scale; const h = r.height * scale;
      ctx.drawImage(image, r.x, r.y, r.width, r.height, x + (g.markSize - w) / 2, g.markY + (g.markSize - h) / 2, w, h);
    } else {
      ctx.fillStyle = index ? '#42243A' : '#163658'; ctx.fillRect(x, g.markY, g.markSize, g.markSize);
      const initial = (team.name || '?').split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
      text(initial, x + g.markSize / 2, g.markY + g.markSize * 0.7, portrait ? 30 : 42,
        index ? C.red : C.blue, g.markSize - 12, 'center', 'Analis Bold');
    }
    const align = index ? 'right' : 'left';
    const labelX = index ? x - 18 : x + g.markSize + 18;
    const labelWidth = portrait ? 150 : 400;
    label(brand?.ticker || team.name || 'Tim ?', labelX, portrait ? 238 : 244, portrait ? 46 : 68,
      index ? C.red : C.blue, labelWidth, align, 'Analis Bold');
    if (brand) label(brand.name, labelX, portrait ? 277 : 286, portrait ? 18 : 23,
      index ? '#F4B7C8' : '#B6D7FF', labelWidth, align, 'Analis Text');
  });
  text(`${shown(a.kills)} : ${shown(b.kills)}`, width / 2, 250, portrait ? 72 : 92,
    C.text, portrait ? 240 : 340, 'center', 'Analis Display');
  text('KILL GAME', width / 2, 286, 23, C.muted, 220, 'center');

  const table = (team, index) => {
    const x = g.tableX[index]; const y = g.tableY[index]; const w = g.tableWidth;
    const col = { name: x + 16, kda: x + w * 0.56, gold: x + w * 0.80, kp: x + w - 16 };
    ctx.fillStyle = index ? '#352239' : '#132B49'; ctx.fillRect(x, y, w, 50);
    label(team.name || 'Tim ?', x + 16, y + 34, 32, index ? C.red : C.blue, w * 0.55);
    text(o.winnerIndex === index ? 'MENANG' : o.winnerIndex === null ? 'HASIL ?' : 'KALAH', x + w - 16, y + 33, 24,
      o.winnerIndex === index ? C.win : C.muted, w * 0.35, 'right', 'Analis Bold');
    text('PEMAIN', col.name, y + 75, 21, C.muted, w * 0.33);
    text('K / D / A', col.kda, y + 75, 21, C.muted, w * 0.23, 'right');
    text('GOLD', col.gold, y + 75, 21, C.muted, w * 0.22, 'right');
    text('KP', col.kp, y + 75, 21, C.muted, w * 0.16, 'right');
    team.players.forEach((p, i) => {
      const rowY = y + g.rowStart + i * g.rowHeight;
      ctx.fillStyle = i % 2 ? '#0E162A' : '#151D33'; ctx.fillRect(x, rowY, w, g.rowHeight - (itemImage ? 6 : 0));
      label(p.name || '?', col.name, rowY + 36, 30, C.text, w * 0.31);
      text(`${shown(p.kills)} / ${shown(p.deaths)} / ${shown(p.assists)}`, col.kda, rowY + 36, 27, C.text, w * 0.23, 'right');
      text(gold(p.gold), col.gold, rowY + 36, 27, C.text, w * 0.22, 'right');
      text(pct(p.killParticipationPercent), col.kp, rowY + 36, 25, C.muted, w * 0.16, 'right');
      if (itemImage) {
        text('ITEM', col.name, rowY + g.iconY + 29, 20, C.muted, 60, 'left', 'Analis Bold');
        review.itemEvidence.rows[index][i].slots.forEach((slot, n) => {
          const ix = x + g.iconStart + n * g.iconStep; const iy = rowY + g.iconY;
          ctx.fillStyle = '#080D1F'; ctx.fillRect(ix - 1, iy - 1, g.iconSize + 2, g.iconSize + 2);
          if (slot) ctx.drawImage(itemImage, slot.x, slot.y, slot.width, slot.height, ix, iy, g.iconSize, g.iconSize);
          else text('?', ix + g.iconSize / 2, iy + 30, 28, C.muted, g.iconSize, 'center');
        });
      }
    });
  };
  table(a, 0); table(b, 1);
  const s = g.centre; const cx = s.x + s.width / 2;
  const gap = review.derived.goldDifference;
  const leader = gap === null ? 'Belum dapat dihitung' : gap === 0 ? 'Gold seimbang' : `${o.teams[gap > 0 ? 0 : 1].name || 'Tim ?'} unggul`;
  ctx.fillStyle = '#10192C'; ctx.fillRect(s.x, s.y, s.width, s.height);
  const bar = y => {
    const x = s.x + 28; const w = s.width - 56;
    ctx.fillStyle = '#33405D'; ctx.fillRect(x, y, w, 8);
    if (review.derived.blueGoldSharePercent !== null) {
      const split = w * review.derived.blueGoldSharePercent / 100;
      ctx.fillStyle = C.blue; ctx.fillRect(x, y, split, 8);
      ctx.fillStyle = C.red; ctx.fillRect(x + split, y, w - split, 8);
    }
  };
  if (portrait) {
    text('Durasi game', s.x + 28, s.y + 40, 22, C.muted, 200);
    text(time(o.durationSeconds), s.x + 28, s.y + 96, 45, C.text, 210, 'left', 'Analis Display');
    text('Selisih gold', cx, s.y + 40, 22, C.muted, 220, 'center');
    text(gap === null ? '?' : gold(Math.abs(gap)), cx, s.y + 96, 45, C.win, 230, 'center', 'Analis Bold');
    label(leader, s.x + s.width - 28, s.y + 72, 25, C.win, 210, 'right', 'Analis Text');
    text(`${gold(a.gold)} gold`, s.x + 28, s.y + 163, 28, C.blue, 300);
    text(`${gold(b.gold)} gold`, s.x + s.width - 28, s.y + 163, 28, C.red, 300, 'right');
    bar(s.y + 184);
  } else {
    text('Ringkasan game', cx, s.y + 44, 32, C.text, s.width - 40, 'center', 'Analis Bold');
    text('DURASI', cx, s.y + 101, 22, C.muted, 230, 'center');
    text(time(o.durationSeconds), cx, s.y + 160, 62, C.text, 280, 'center', 'Analis Display');
    rule(s.x + 28, s.y + 190, s.width - 56);
    text('GOLD AKHIR', cx, s.y + 237, 23, C.muted, 280, 'center');
    label(a.name || '?', s.x + 28, s.y + 278, 24, C.blue, 145, 'left', 'Analis Text');
    label(b.name || '?', s.x + s.width - 28, s.y + 278, 24, C.red, 145, 'right', 'Analis Text');
    text(gold(a.gold), s.x + 28, s.y + 321, 34, C.blue, 150, 'left', 'Analis Bold');
    text(gold(b.gold), s.x + s.width - 28, s.y + 321, 34, C.red, 150, 'right', 'Analis Bold');
    bar(s.y + 349);
    text('SELISIH GOLD', cx, s.y + 406, 23, C.muted, 290, 'center');
    text(gap === null ? '?' : gold(Math.abs(gap)), cx, s.y + 470, 58, C.win, s.width - 40, 'center', 'Analis Display');
    label(leader, cx, s.y + 510, 27, C.win, s.width - 40, 'center', 'Analis Text');
    rule(s.x + 28, s.y + 546, s.width - 56);
    text('Objektif & patch', cx, s.y + 588, 22, C.muted, s.width - 40, 'center');
    text('belum diverifikasi', cx, s.y + 622, 22, C.muted, s.width - 40, 'center');
  }
  rule(margin, g.footerY - 14, usable);
  text('KP = (kill + assist) / kill tim. ? = belum diketahui.', margin, g.footerY + 20, 24, C.muted);
  text(review.numericConsistent ? 'Angka konsisten, tetap perlu review sumber.' : 'Ada konflik angka. Periksa sumber sebelum dipakai.',
    margin, g.footerY + 55, 24, review.numericConsistent ? C.muted : C.red);
  const logoOrigin = review.teamLogoEvidence ? 'Logo dari screenshot'
    : review.teamBranding ? `Logo katalog: ${review.teamBranding.teams.filter(Boolean).length}/2 (${review.teamBranding.collectionId.toUpperCase()})`
      : 'Logo belum tersedia';
  text(`${logoOrigin} · ${itemImage ? 'Item dari screenshot, nama belum diverifikasi' : 'Item belum tersedia'}`,
    margin, g.footerY + 90, portrait ? 21 : 24, C.win);
  text('Preview lokal, bukan skor seri atau analisis gameplay. Sumber lengkap di review.md.',
    margin, g.footerY + 125, portrait ? 21 : 24, C.accent);
  return canvas.toBuffer('image/png');
}

module.exports = { renderBroadcastCard, cardGeometry, compactLabel, DIMENSIONS, ITEM_DIMENSIONS };
