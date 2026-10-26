'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WATCH, discoveredEntries } = require('../src/esports/watch');

test('the watchlist covers MPL ID S18, the Nations Cup and M8, each with a family; record pages have no event', () => {
  assert.deepEqual(WATCH.map(w => w.title), ['MPL/Philippines/Season 18/Playoffs', 'MPL/Indonesia/Season 18/Regular Season',
    'MPL/Indonesia/Season 18/Playoffs', 'Esports Nations Cup/2026/Group Stage', 'Esports Nations Cup/2026/Playoffs', 'M8 World Championship']);
  assert.ok(WATCH.every(w => w.family && w.league));
  assert.equal(WATCH.find(w => w.title.endsWith('Regular Season')).event, null);
  assert.equal(WATCH.find(w => w.title.endsWith('2026/Playoffs')).event, 'Esports Nations Cup 2026');
});

test('discovery adds new M8 stage pages once and skips known and non-match pages', () => {
  const found = discoveredEntries(['M8 World Championship/Wildcard', 'M8 World Championship/Statistics', 'M8 World Championship',
    'M8 World Championship/Swiss Stage', 'M8 World Championship/Wildcard', 'MSC 2026/Playoffs'], WATCH);
  assert.deepEqual(found, [
    { title: 'M8 World Championship/Wildcard', league: 'M8 Wildcard', family: 'M8 World Championship', event: 'M8 World Championship' },
    { title: 'M8 World Championship/Swiss Stage', league: 'M8 Swiss Stage', family: 'M8 World Championship', event: 'M8 World Championship' },
  ]);
  assert.deepEqual(discoveredEntries(['M8 World Championship/Wildcard'], [...WATCH, found[0]]), []);
});
