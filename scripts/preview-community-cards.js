'use strict';

// Offline preview only. Optional JSON contains appreciation fields, never Discord credentials.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderAppreciationCard } = require('../src/utils/appreciation-card');
const { generateCard } = require('../src/utils/welcome-card');

async function main() {
  const input = process.argv[2];
  const data = input ? JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'))
    : { recipient: 'Tim Orion', achievement: 'Juara 1 turnamen komunitas', players: 'Raka (Sky)\nDara' };
  const output = path.join(__dirname, '../.cloud/previews/community-cards');
  fs.mkdirSync(output, { recursive: true });
  const now = new Date('2026-10-17T12:00:00+07:00');
  const member = { user: { id: 'demo', username: 'member.demo', createdAt: new Date('2025-01-01T12:00:00+07:00') },
    displayName: 'Raka', joinedAt: new Date('2026-05-01T12:00:00+07:00'), guild: { memberCount: 55 } };
  const cards = [
    ['appreciation', await renderAppreciationCard(data, { demo: !input })],
    ['no-logo-demo', await renderAppreciationCard({ recipient: 'Tim Orion', achievement: 'Juara 2 turnamen MLBB',
      occasion: 'Orion Cup', date: '17 Oktober 2026', players: 'Raka (Sky)\nDara\nBima (Nova)' }, { demo: true })],
    ['eight-players-demo', await renderAppreciationCard({ recipient: 'Komunitas Orion', achievement: 'Terima kasih sudah membantu acara komunitas',
      players: 'Raka (Sky)\nDara\nBima (Nova)\nNadia\nSatria (North)\nMaya\nAruna\nRio' }, { demo: true })],
    ['welcome-demo', await generateCard(member, 'welcome', { now, serverName: 'Hengs / DEMO' })],
    ['leave-demo', await generateCard(member, 'leave', { now, serverName: 'Hengs / DEMO', memberNumber: 54 })],
    ['long-name-demo', await generateCard({ ...member, displayName: 'Nama Member Panjang untuk Uji Keterbacaan' }, 'welcome', { now, serverName: 'Hengs / DEMO' })],
  ];
  for (const [name, buffer] of cards) {
    if (!Buffer.isBuffer(buffer)) throw new Error('PREVIEW_RENDER_FAILED');
    fs.writeFileSync(path.join(output, `${name}.png`), buffer);
  }
  // A contact sheet at desktop and mobile display widths for visual inspection.
  const decoded = await Promise.all(cards.map(async ([, buffer]) => loadImage(buffer)));
  const sheetHeight = 20 + decoded.reduce((total, image) => total + image.height * 550 / image.width + 24, 0);
  const sheet = createCanvas(930, Math.ceil(sheetHeight));
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#202127'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [column, width] of [[18, 550], [590, 320]]) {
    let y = 20;
    for (const image of decoded) {
      const height = image.height * width / image.width;
      ctx.drawImage(image, column, y, width, height);
      y += height + 24;
    }
  }
  fs.writeFileSync(path.join(output, 'review-sheet.png'), sheet.toBuffer('image/png'));
  console.log('COMMUNITY_CARD_PREVIEWS_OK');
}

main().catch(() => { console.error('COMMUNITY_CARD_PREVIEWS_FAILED'); process.exitCode = 1; });
