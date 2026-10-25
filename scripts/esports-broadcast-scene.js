'use strict';

// The existing Crown Stage supplies real artwork; geometry only frames the broadcast's reading zones.
// This decorative layer depends on layout, never match values, team names, standings or random seeds.
const path = require('node:path');
const { C } = require('../src/esports/card');
const ARENA = path.join(__dirname, '../assets/appreciation/crown-stage/arena-background.png');
let arena;

async function loadBroadcastArena() {
  if (!arena) arena = require('@napi-rs/canvas').loadImage(ARENA).catch(() => {
    arena = undefined;
    throw new Error('BROADCAST_BACKGROUND_UNAVAILABLE');
  });
  return arena;
}

function paintBroadcastScene(ctx, g, art) {
  const { width: w, height: h, margin, portrait } = g;
  ctx.save();
  const scale = Math.max(w / art.width, h / art.height);
  // Cover without stretching. Landscape keeps the architectural stage; portrait retains the tall pylons.
  ctx.drawImage(art, (w - art.width * scale) / 2,
    (h - art.height * scale) * (portrait ? 0.5 : 0.56), art.width * scale, art.height * scale);
  ctx.fillStyle = 'rgba(8,13,31,0.34)'; ctx.fillRect(0, 0, w, h);

  // Use the inherited blue/red sides as light sources, not a guessed team or winner color.
  for (const [x, color] of [[0, C.blue], [w, C.red]]) {
    const light = ctx.createRadialGradient(x, 220, 0, x, 220, w * 0.58);
    light.addColorStop(0, color + '70'); light.addColorStop(1, color + '00');
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, g.footerY);
  }
  const header = ctx.createLinearGradient(0, 0, 0, 322);
  header.addColorStop(0, 'rgba(8,13,31,0.92)');
  header.addColorStop(0.5, 'rgba(8,13,31,0.82)');
  header.addColorStop(1, 'rgba(8,13,31,0.54)');
  ctx.fillStyle = header; ctx.fillRect(0, 0, w, 322);

  const trace = (points, color, weight = 1) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke();
  };
  // Broadcast frame: neutral gold crest around the score, side rails outside the content margins.
  const scoreHalf = portrait ? 142 : 218;
  trace([[w / 2 - scoreHalf - 36, 176], [w / 2 - scoreHalf, 166],
    [w / 2 + scoreHalf, 166], [w / 2 + scoreHalf + 36, 176]], C.win + '80');
  trace([[margin, 322], [w / 2 - scoreHalf - 28, 322], [w / 2 - scoreHalf, 308],
    [w / 2 + scoreHalf, 308], [w / 2 + scoreHalf + 28, 322], [w - margin, 322]], C.win + '70');
  for (const [mirror, color] of [[false, C.blue], [true, C.red]]) {
    ctx.save(); if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    trace([[12, 174], [32, 194], [32, 286], [12, 306]], color + 'B0', 2);
    trace([[margin - 22, 354], [margin - 34, 366], [margin - 34, g.footerY - 64],
      [margin - 22, g.footerY - 52]], color + '70');
    ctx.restore();
  }
  // Quiet mats belong to the layout, so unknown values and long labels get the same readable background.
  for (let side = 0; side < 2; side++) {
    const end = g.tableY[side] + g.rowStart + 5 * g.rowHeight;
    ctx.fillStyle = 'rgba(8,13,31,0.78)';
    ctx.fillRect(g.tableX[side], g.tableY[side], g.tableWidth, end - g.tableY[side]);
  }
  ctx.fillStyle = 'rgba(8,13,31,0.94)'; ctx.fillRect(margin - 12, g.footerY - 27, w - margin * 2 + 24, h - g.footerY + 27);
  ctx.restore();
}

module.exports = { loadBroadcastArena, paintBroadcastScene };
