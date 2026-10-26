'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPreviewCard, renderListCard } = require('../src/esports/daily-cards');

const size = png => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test('the preview card is a 1600x900 PNG, with or without hero data', async () => {
  const data = { title: 'MPL ID S18 Playoffs · Upper Bracket', date: 'Rabu, 4 Nov 2026', time: '15:00 WIB', bestof: 'Bo5',
    teams: [{ name: 'ONIC', ticker: 'ONIC' }, { name: 'RRQ Hoshi', ticker: 'RRQ' }], record: 'Musim ini: ONIC 2-0 RRQ (game 4-1)',
    heroes: [[{ name: 'Lancelot', picks: 7 }], []] };
  const png = await renderPreviewCard(data, { background: null });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual(size(png), { width: 1600, height: 900 });
});

test('list cards grow with their lines and keep the footer clear', async () => {
  const lines = n => Array.from({ length: n }, (_, i) => `Baris ${i + 1}`);
  const small = await renderListCard({ title: 'Rekap hari ini', date: 'Rabu, 4 Nov 2026', sections: [{ heading: 'Hasil', lines: lines(3) }] }, { background: null });
  const big = await renderListCard({ title: 'Rekap event', date: 'Ahad', headline: 'EVOS juara!', subline: 'Final', sections: [
    { heading: 'Hasil', lines: lines(12) }, { heading: 'Angka', lines: lines(8) }] }, { background: null });
  assert.equal(size(small).width, 1600); assert.equal(size(small).height, 900);
  assert.ok(size(big).height > 900);
});
