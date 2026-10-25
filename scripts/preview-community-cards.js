'use strict';

// Offline preview only. Optional JSON contains appreciation fields, never Discord credentials.
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderAppreciationCard } = require('../src/utils/appreciation-card');
const { generateCard } = require('../src/utils/welcome-card');

// Synthetic rosters only. Keep artwork and original certificates unchanged.
async function previewRosters() {
  const output = path.join(__dirname, '../.cloud/previews/community-cards/roster-layout');
  fs.mkdirSync(output, { recursive: true });
  const players = ['Raka (Sky)', 'Dara (Moon)', 'Bima (Nova)', 'Nadia (Luna)', 'Satria (North)', 'Maya', 'Aruna', 'Rio'];
  const fixtures = Array.from({ length: 9 }, (_, count) => ({
    name: `${count}-players`, label: `${count} pemain`, players: players.slice(0, count).join('\n'),
  }));
  fixtures.push({ name: 'long-names', label: 'Nama panjang dan tanpa nickname',
    players: 'Muhammad Arya Wibisana (North Star)\nDara (Moon)\nBima\nNadia (Bulan)' });
  const cards = [];
  for (const fixture of fixtures) {
    const buffer = await renderAppreciationCard({ recipient: 'Hengs Family', achievement: 'Juara 1 turnamen MLBB',
      occasion: 'Turnamen Contoh', players: fixture.players }, { demo: true });
    fs.writeFileSync(path.join(output, `${fixture.name}.png`), buffer);
    cards.push({ ...fixture, image: await loadImage(buffer) });
  }
  function sheet(name, selection) {
    const width = 360;
    const gap = 18;
    const rows = [];
    for (let i = 0; i < selection.length; i += 3) rows.push(selection.slice(i, i + 3));
    const heights = rows.map(row => Math.ceil(Math.max(...row.map(card => card.image.height * width / card.image.width))) + 48);
    const canvas = createCanvas(3 * width + 4 * gap, heights.reduce((a, b) => a + b, gap));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#202127'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = gap;
    rows.forEach((row, index) => {
      row.forEach((card, column) => {
        const x = gap + column * (width + gap);
        ctx.fillStyle = '#f6f8fe'; ctx.font = '18px "Crown Text"';
        ctx.fillText(card.label, x, y + 20);
        ctx.drawImage(card.image, x, y + 32, width, card.image.height * width / card.image.width);
      });
      y += heights[index];
    });
    fs.writeFileSync(path.join(output, `${name}.png`), canvas.toBuffer('image/png'));
  }
  sheet('roster-comparison', [cards[1], cards[2], cards[4]]);
  sheet('roster-edge-cases', [cards[0], cards[3], cards[5], cards[6], cards[7], cards[8], cards[9]]);
  console.log('ROSTER_CARD_PREVIEWS_OK');
}

async function main() {
  const input = process.argv[2];
  if (input === '--rosters') return previewRosters();
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
