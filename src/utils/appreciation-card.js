'use strict';

// Aurora family extension: an amber trophy seal, recipient-first type and reviewed facts.
// No network, model or persisted image. Full accessible copy stays in the Discord embed.
const { cardFont } = require('./welcome-card');
const { validateAppreciation } = require('../ops/appreciation');
const fs = require('node:fs');
const path = require('node:path');
const SIZE = Object.freeze({ width: 1000, height: 500 });

async function drawTeamLogo(ctx, data, loadImage) {
  // A bundled, owner-supplied asset only. Never fetch user URLs or derive local paths from input.
  if (!/^hengs\s+famil(?:ia|y)$/i.test(data.recipient)) return false;
  const logo = await loadImage(fs.readFileSync(path.join(__dirname, '../../assets/brand/hengs-family.png')));
  if (!logo.complete || !logo.width || !logo.height) throw new Error('APPRECIATION_LOGO_INVALID');
  const scale = Math.min(322 / logo.width, 322 / logo.height);
  ctx.drawImage(logo, 775 - logo.width * scale / 2, 253 - logo.height * scale / 2, logo.width * scale, logo.height * scale);
  return true;
}

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function linesFor(ctx, value, width, limit) {
  const lines = [];
  let current = '';
  for (const char of Array.from(value)) {
    if (current && ctx.measureText(current + char).width > width) {
      const space = current.lastIndexOf(' ');
      if (space > current.length / 2) {
        lines.push(current.slice(0, space));
        current = current.slice(space + 1) + char;
      } else {
        lines.push(current);
        current = char;
      }
    } else current += char;
  }
  if (current.trim()) lines.push(current.trim());
  const overflow = lines.length > limit;
  const visible = lines.slice(0, limit);
  if (overflow) {
    let last = visible[limit - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = Array.from(last).slice(0, -1).join('');
    visible[limit - 1] = `${last.trimEnd()}…`;
  }
  return { lines: visible, overflow };
}

function trophy(ctx) {
  ctx.save();
  ctx.translate(775, 250);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#2C2440';
  ctx.beginPath();
  ctx.arc(0, 0, 116, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#F2BC58';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 103, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#D99A47';
  ctx.lineWidth = 10;
  for (const direction of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(direction * 45, -48);
    ctx.bezierCurveTo(direction * 95, -60, direction * 88, 0, direction * 29, 4);
    ctx.stroke();
  }
  const cup = ctx.createLinearGradient(-50, -70, 50, 50);
  cup.addColorStop(0, '#FFF0BF');
  cup.addColorStop(0.45, '#F2BC58');
  cup.addColorStop(1, '#BA782D');
  ctx.fillStyle = cup;
  ctx.beginPath();
  ctx.moveTo(-49, -65);
  ctx.lineTo(49, -65);
  ctx.bezierCurveTo(47, 2, 30, 18, 0, 26);
  ctx.bezierCurveTo(-30, 18, -47, 2, -49, -65);
  ctx.fill();
  rounded(ctx, -9, 20, 18, 37, 4);
  rounded(ctx, -37, 55, 74, 13, 4);
  ctx.fillStyle = '#FFF2CB';
  rounded(ctx, -42, -62, 84, 5, 2);
  ctx.restore();
}

async function renderAppreciationCard(input, { demo = false } = {}) {
  const data = validateAppreciation(input);
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const players = data.players ? data.players.split('; ') : [];
  const height = players.length ? 520 + Math.ceil(players.length / 2) * 56 : SIZE.height;
  const canvas = createCanvas(SIZE.width, height);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, SIZE.width, height);
  bg.addColorStop(0, '#131630');
  bg.addColorStop(0.55, '#241C38');
  bg.addColorStop(1, '#49332C');
  ctx.fillStyle = bg;
  rounded(ctx, 0, 0, SIZE.width, height, 20);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(183,137,72,0.09)';
  ctx.beginPath();
  ctx.ellipse(850, 20, 430, 190, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,195,127,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(785, 250, 220, 310, 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#F8DC9F';
  ctx.font = cardFont(700, 30);
  ctx.fillText('Hall of Fame', 52, 58);
  ctx.fillStyle = '#CCBDD5';
  ctx.font = cardFont(600, 17);
  ctx.textAlign = 'right';
  ctx.fillText(demo ? 'HENGS / DEMO' : 'HENGS', 947, 55);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(239,211,163,0.25)';
  ctx.beginPath(); ctx.moveTo(52, 81); ctx.lineTo(947, 81); ctx.stroke();

  ctx.fillStyle = '#FFFAF1';
  let nameSize = 52;
  for (; nameSize > 36; nameSize -= 2) {
    ctx.font = cardFont(800, nameSize);
    if (!linesFor(ctx, data.recipient, 545, 2).overflow) break;
  }
  ctx.font = cardFont(800, nameSize);
  const name = linesFor(ctx, data.recipient, 545, 2);
  name.lines.forEach((line, i) => ctx.fillText(line, 52, 148 + i * 57));
  ctx.fillStyle = '#F3D6A8';
  ctx.font = cardFont(600, 32);
  const achievement = linesFor(ctx, data.achievement, 545, 3);
  achievement.lines.forEach((line, i) => ctx.fillText(line, 52, 252 + i * 37));

  ctx.fillStyle = '#D7CCDF';
  ctx.font = cardFont(500, 24);
  const occasion = linesFor(ctx, data.occasion || 'Apresiasi komunitas', 545, 1);
  ctx.fillText(occasion.lines[0], 52, 390);
  if (data.date) ctx.fillText(linesFor(ctx, data.date, 545, 1).lines[0], 52, 420);
  const hasLogo = await drawTeamLogo(ctx, data, loadImage);
  if (!hasLogo) trophy(ctx);
  if (players.length) {
    ctx.fillStyle = 'rgba(9,12,26,0.55)';
    rounded(ctx, 32, 443, 936, height - 498, 12);
    ctx.fillStyle = '#EBC181';
    ctx.font = cardFont(700, 17);
    ctx.fillText('ROSTER PEMAIN', 52, 472);
    players.forEach((player, i) => {
      ctx.font = cardFont(600, 30);
      ctx.fillStyle = '#FFFAF1';
      const x = i % 2 ? 520 : 52;
      ctx.fillText(linesFor(ctx, player, 418, 1).lines[0], x, 510 + Math.floor(i / 2) * 56);
    });
  }
  ctx.fillStyle = '#E1D3E7';
  ctx.font = cardFont(500, 17);
  ctx.fillText(name.overflow || achievement.overflow || occasion.overflow
    ? 'Detail lengkap ada di pesan.' : 'Kerja bagus. Komunitas ikut bangga!', 52, height - 26);
  ctx.fillStyle = '#EBC181';
  ctx.font = cardFont(700, 17);
  ctx.textAlign = 'center';
  if (!hasLogo) ctx.fillText('LAYAK DIRAYAKAN', 775, 401);
  return canvas.toBuffer('image/png');
}

module.exports = { renderAppreciationCard, SIZE };
