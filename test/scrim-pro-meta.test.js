'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { proMetaCard, LIQUIPEDIA_CREDIT } = require('../src/scrim/pro-meta');

const five = (...names) => names;
const played = (winner, picks, bans) => ({ number: 1, winner, sides: ['blue', 'red'], length: '15:00', vod: '', objective: null,
  picks, bans });
const pages = {
  'MPL/Philippines/Season 18/Playoffs': { revid: 1, matches: [{ valid: true, finished: true, games: [
    played(1, [five('Fanny', 'Lolita', 'Valentina', 'Claude', 'Chou'), five('Ling', 'Tigreal', 'Pharsa', 'Beatrix', 'Paquito')],
      [['Lancelot', 'Nolan'], ['Joy', 'Fredrinn']]),
    played(2, [five('Ling', 'Lolita', 'Pharsa', 'Claude', 'Chou'), five('Fanny', 'Tigreal', 'Valentina', 'Beatrix', 'Paquito')],
      [['Lancelot'], ['Joy']]),
    played(0, [five('Ling', 'Lolita', 'Pharsa', 'Claude', 'Chou'), five('Fanny', 'Tigreal', 'Valentina', 'Beatrix', 'Paquito')], [[], []]),
  ] }] },
  'MPL/Indonesia/Season 18/Playoffs': { revid: 2, matches: [{ valid: true, finished: false, games: [
    played(1, [five('Ling', 'Atlas', 'Yve', 'Moskov', 'Paquito'), five('Fanny', 'Lolita', 'Pharsa', 'Claude', 'Chou')], [['Joy'], ['Lancelot']]),
    played(2, [five('Ling', 'Atlas'), five('Fanny')], [[], []]),
  ] }] },
};

test('pro meta joins the coach data only when the question is about meta, draft or a pro hero', () => {
  assert.equal(proMetaCard(pages, { text: 'kita kalah mulu, latihan apa?' }), '');
  assert.equal(proMetaCard({}, { text: 'hero meta apa?' }), '');
  const card = proMetaCard(pages, { text: 'hero meta pro sekarang apa?' });
  assert.match(card, /^META PRO \(data draft Liquipedia: MPL PH S18 Playoffs, MPL ID S18 Playoffs; 3 game dengan draft lengkap\)/);
  // An undecided game and an incomplete draft are left out; a decided game of an unfinished series counts. Ties sort by name.
  assert.match(card, /\nPaling sering dipick: Chou 3, Claude 3, Fanny 3, Ling 3, Lolita 3 \(dari 3 game\)\./);
  assert.match(card, /\nPaling sering diban: Joy 3, Lancelot 3, Fredrinn 1, Nolan 1\./);
  assert.doesNotMatch(card, /Atlas|Yve|Moskov/);
});

test('a hero named in the question gets its own pro line with picks, wins and bans', () => {
  const card = proMetaCard(pages, { text: 'Fanny masih kuat nggak di pro?' });
  assert.match(card, /\nFanny: dipick 3 kali \(W 2 dari 3\), diban 0 kali\./);
  assert.match(proMetaCard(pages, { text: 'gimana kalau pakai lolita' }), /\nLolita: dipick 3 kali \(W 1 dari 3\), diban 0 kali\./);
  assert.match(LIQUIPEDIA_CREDIT, /Liquipedia/);
  assert.match(LIQUIPEDIA_CREDIT, /CC-BY-SA/);
});
