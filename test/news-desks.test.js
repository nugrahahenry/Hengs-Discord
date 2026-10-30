'use strict';

// News desks (owner request, 2026-10-31): more variety across tech, AI, gadget, gaming, esports, pop culture and kampus.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { SOURCES, ALWAYS_ON, deskOf, deskTopics, onlyFits } = require('../src/news/feeds');
const { selectArticles, STALE_LIFT } = require('../src/news/selection');
const { wibClock, DAY } = require('../src/news/store');

const NOW = Date.parse('2026-10-31T01:00:00Z');
const source = id => SOURCES.find(row => row.id === id);
let serial = 0;
function item(id, heat, title = 'Rilis baru minggu ini') {
  const row = source(id); serial += 1;
  return { source: row.name, topic: row.topic, url: `https://${row.hosts[0]}/news/${serial}/`, title, excerpt: '',
    hash: crypto.createHash('sha256').update(`${id}:${serial}`).digest('hex'), publishedAt: NOW - 60_000, heat };
}
const settings = (count, topics = ['tech', 'ai', 'gaming']) => ({ topics, count });
const ids = picks => picks.map(pick => SOURCES.find(row => row.name === pick.source && row.topic === pick.topic).id);

test('desks: pop culture and kampus ride along with any news topic, never with memes alone; esports and gadget have their own desk', () => {
  assert.deepEqual(deskTopics(['tech']), ['tech', ...ALWAYS_ON]);
  assert.deepEqual(deskTopics(['memes']), ['memes']);
  assert.deepEqual([deskOf(source('steam')), deskOf(source('hybrid')), deskOf(source('selular')), deskOf(source('cnnedukasi'))],
    ['gaming', 'esports', 'gadget', 'kampus']);
  // New sources only appended: old SOURCES indexes and ids stay, and every id passes the live receipts validator.
  assert.deepEqual(SOURCES.slice(0, 4).map(row => row.id), ['mozilla', 'nvidia', 'steam', 'xkcd']);
  assert.ok(SOURCES.every(row => /^[a-z0-9-]{1,64}$/.test(row.id)));
  assert.equal(new Set(SOURCES.map(row => row.id)).size, SOURCES.length);
});

test('pop culture feeds keep films, series, music and anime but never celebrity gossip', () => {
  assert.equal(onlyFits(source('cnnhiburan'), 'Trailer film baru rilis pekan depan'), true);
  assert.equal(onlyFits(source('cnnhiburan'), 'Aktor film digugat cerai'), false);
  assert.equal(onlyFits(source('liputan6showbiz'), 'Artis pamer rumah baru'), false);
  assert.equal(onlyFits(source('cnnindonesia'), 'Artis pamer rumah baru'), true); // other desks are not filtered here
  const picks = selectArticles(settings(5), [item('cnnhiburan', 9, 'Aktor film selingkuh'), item('liputan6showbiz', 1, 'Konser K-pop di Jakarta')], null, NOW);
  assert.deepEqual(ids(picks), ['liputan6showbiz']);
});

test('one slot per desk first, a second only when no other desk has news, and topics gate their desks', () => {
  const items = [item('mozilla', 10), item('cloudflare', 9), item('antara', 8), item('steam', 1), item('cnnedukasi', 0),
    item('cnnhiburan', 5, 'Sinopsis drakor baru')];
  assert.deepEqual(ids(selectArticles(settings(4, ['tech']), items, null, NOW)), ['mozilla', 'cnnhiburan', 'cnnedukasi', 'cloudflare']);
  // steam is gaming: off without the gaming topic, in with it.
  assert.deepEqual(ids(selectArticles(settings(4), items, null, NOW)), ['mozilla', 'cnnhiburan', 'steam', 'cnnedukasi']);
  assert.deepEqual(ids(selectArticles(settings(9, ['tech']), items, null, NOW)), ['mozilla', 'cnnhiburan', 'cnnedukasi', 'cloudflare']);
});

test('a desk missing for three days gets a lift, liked desks a smaller one, and a desk used today waits', () => {
  const day = back => wibClock(NOW - back * DAY).day;
  const receipt = (publisher, back) => ({ day: day(back), kind: 'news', slot: 0, status: 'sent', publisher, hashes: [] });
  const items = () => [item('mozilla', 3), item('steam', 2)];
  // Tech was sent yesterday, gaming not for days: 3 + 0 against 2 + 2.
  assert.deepEqual(ids(selectArticles(settings(1), items(), { receipts: [receipt('cloudflare', 1)] }, NOW)), ['steam']);
  assert.equal(STALE_LIFT, 2);
  // Both recent: heat decides, until members keep marking 🔥 on gaming.
  const both = { receipts: [receipt('cloudflare', 1), receipt('jagatplay', 2)] };
  assert.deepEqual(ids(selectArticles(settings(1), items(), both, NOW)), ['mozilla']);
  assert.deepEqual(ids(selectArticles(settings(1), [item('mozilla', 3), item('steam', 2.5)], both, NOW, { liked: new Map([['gaming', 1]]) })), ['steam']);
  // A tech post already went out today: gaming first, tech again only as a second pass.
  const today = { receipts: [receipt('cloudflare', 0)] };
  assert.deepEqual(ids(selectArticles(settings(2), [item('mozilla', 9), item('steam', 0)], today, NOW)), ['steam', 'mozilla']);
});
