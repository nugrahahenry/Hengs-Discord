'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { draftData, draftable, renderDraftCard, LAYOUT } = require('../src/esports/draft-card');

const FIVE = ['Lancelot', 'Chou', 'Mathilda', 'Grock', 'Claude'];
const OTHER = ['Joy', 'Fredrinn', 'Valentina', 'Hylos', 'Brody'];
const BANS = [['Fanny', 'Ling', 'Nolan', 'Kalea', 'Hirara'], ['Zhuxin', 'Gloo', 'Arlott', 'Lukas', 'Cici']];
function match(games) {
  const score = [1, 2].map(t => games.filter(g => g.winner === t).length);
  return { id: 'm', page: 'P', stage: 'Upper Bracket', bestof: 5, mvp: 'Kairi', valid: true, finished: true,
    teams: [{ key: 'onic', name: 'ONIC', ticker: 'ONIC' }, { key: 'rrq hoshi', name: 'RRQ Hoshi', ticker: 'RRQ' }],
    games: games.map((g, i) => ({ number: i + 1, length: '18:42', vod: '', objective: { team: 1, name: 'Lord' }, bans: BANS, ...g })),
    score, winner: score[0] > score[1] ? 1 : 2 };
}

test('draft data puts the blue side left, counts the series score after the game and reads roles from the dictionary', () => {
  const m = match([{ winner: 1, sides: ['blue', 'red'], picks: [FIVE, OTHER] }, { winner: 2, sides: ['red', 'blue'], picks: [FIVE, OTHER] }]);
  const g2 = draftData(m, 1, { league: 'MPL ID S18 Playoffs' });
  assert.equal(g2.game, 'GAME 2'); assert.equal(g2.number, 2); assert.equal(g2.score, 'ONIC 1 - 1 RRQ');
  assert.deepEqual(g2.sides.map(s => [s.team, s.label, s.won]), [['RRQ Hoshi', 'SISI BIRU', true], ['ONIC', 'SISI MERAH', false]]);
  assert.deepEqual(g2.sides[1].picks[0], { name: 'Lancelot', role: 'Assassin' });
  assert.deepEqual(g2.sides[0].bans, BANS[1]);
  assert.equal(g2.detail, '18:42 · Objektif: Lord (ONIC)');
  assert.equal(g2.title, 'MPL ID S18 Playoffs · Upper Bracket');
  assert.deepEqual(draftData(m, 0).sides[0].picks.map(p => p.role), ['Assassin', 'Fighter', 'Support', 'Tank', 'Marksman']);
});

test('only decided games with five picks a side get a draft card; an unknown hero gets no role', () => {
  const m = match([{ winner: 1, sides: ['blue', 'red'], picks: [FIVE, OTHER] }, { winner: 2, sides: ['blue', 'red'], picks: [['Lancelot'], OTHER] },
    { winner: 0, sides: ['', ''], picks: [[], []] }]);
  assert.deepEqual(draftable(m), [0]);
  const odd = match([{ winner: 1, sides: ['blue', 'red'], picks: [['Newhero', ...FIVE.slice(1)], OTHER] }]);
  assert.equal(draftData(odd, 0).sides[0].picks[0].role, '');
  assert.equal(draftData(match([{ winner: 1, sides: ['', ''], picks: [FIVE, OTHER] }]), 0).sides[0].label, 'SISI ?');
});

test('the draft card is a 1600x960 PNG with Hengs-drawn frames or the GPT template behind the text', async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const data = draftData(match([{ winner: 1, sides: ['blue', 'red'], picks: [FIVE, OTHER] }]), 0, { league: 'MPL ID S18 Playoffs' });
  const size = png => [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.deepEqual(size(await renderDraftCard(data, { background: null })), [1600, 960]);
  const template = await loadImage(createCanvas(1600, 960).toBuffer('image/png'));
  assert.deepEqual(size(await renderDraftCard(data, { background: template })), [1600, 960]);
  assert.deepEqual(LAYOUT.pickY, [270, 374, 478, 582, 686]);
});
