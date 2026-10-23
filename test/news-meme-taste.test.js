'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMemeTaste, memberReactions, MEME_REACTIONS } = require('../src/news/meme-taste');
const { TEMPLATES, EVERGREEN, offerTemplates, pickTopic } = require('../src/news/memes');

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-21T06:00:00Z');
const GUILD = '223456789012345678';
const DAYKEY = '2026-10-21';

function store(t, clock) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-taste-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return createMemeTaste({ filePath: path.join(dir, 'meme-taste.json'), now: () => clock.now });
}

test('member reactions count everyone but Hengs itself, and a meh face counts against', () => {
  const reactions = new Map([['a', { count: 4, me: true }], ['b', { count: 2, me: false }]]);
  assert.equal(memberReactions({ reactions: { cache: reactions } }), 5);
  assert.equal(memberReactions(null), null);
  assert.equal(memberReactions({ reactions: { cache: new Map() } }), 0);
  const seeded = (name, count, me = true) => [name, { emoji: { name }, count, me }];
  // Hengs seeded all three; members added three laughs, one skull, one fire and two meh faces.
  const voted = new Map([seeded('😂', 4), seeded('💀', 2), seeded('😐', 3), seeded('🔥', 1, false)]);
  assert.deepEqual(MEME_REACTIONS, ['😂', '😐', '💀']);
  assert.equal(memberReactions({ reactions: { cache: voted } }), 3 + 1 + 1 - 2);
  assert.equal(memberReactions({ reactions: { cache: new Map([seeded('😐', 5)]) } }), 0);
});

test('reactions are read between 2 hours and 3 days after posting, then kept as totals', async t => {
  const clock = { now: NOW };
  const taste = store(t, clock);
  const counts = { m1: 6, m2: 0 };
  const reads = [];
  const count = async ({ messageId }) => { reads.push(messageId); return counts[messageId]; };
  taste.remember(GUILD, { messageId: 'm1', channelId: 'c', template: 'fa', situation: 'begadang sebelum UAS' });
  taste.remember(GUILD, { messageId: 'm2', channelId: 'c', template: 'drake', situation: 'hujan pas mau berangkat' });
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads, []); // too fresh
  clock.now += 3 * HOUR;
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads.sort(), ['m1', 'm2']);
  let scores = taste.weights(GUILD);
  assert.ok(scores.templates.get('fa') > scores.templates.get('drake'));
  assert.ok(scores.situations.get('begadang sebelum UAS') > scores.situations.get('hujan pas mau berangkat'));
  // After three days the counts are final: no more reads, totals stay, a vanished message keeps its last count.
  counts.m1 = null;
  clock.now += 72 * HOUR;
  await taste.refresh(GUILD, count);
  reads.length = 0;
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads, []);
  scores = taste.weights(GUILD);
  assert.ok(scores.templates.get('fa') > scores.templates.get('drake'));
  // Persisted: a fresh store over the same file sees the same taste.
  assert.deepEqual([...createMemeTaste({ filePath: taste.filePath, now: () => clock.now }).weights(GUILD).templates.keys()].sort(), ['drake', 'fa']);
});

test('a broken taste file or a failing read never stops memes', async t => {
  const clock = { now: NOW };
  const taste = store(t, clock);
  fs.writeFileSync(taste.filePath, '{not json');
  assert.equal(taste.weights(GUILD).templates.size, 0);
  taste.remember(GUILD, { messageId: 'm1', channelId: 'c', template: 'fa', situation: 'x situasi' });
  clock.now += 3 * HOUR;
  await taste.refresh(GUILD, async () => { throw new Error('synthetic discord failure'); });
  assert.equal(taste.weights(GUILD).templates.has('fa'), true);
});

test('the best-liked templates are offered first; the rest keeps rotating', () => {
  const scores = new Map([['fa', 9], ['midwit', 7], ['drake', 5], ['ds', 0.2]]);
  const offered = offerTemplates(TEMPLATES, DAYKEY, 2, scores).map(row => row.id);
  assert.equal(offered.length, 6); assert.equal(new Set(offered).size, 6);
  assert.deepEqual(offered.slice(0, 3), ['fa', 'midwit', 'drake']);
  assert.deepEqual(offerTemplates(TEMPLATES, DAYKEY, 2, new Map()), offerTemplates(TEMPLATES, DAYKEY, 2));
});

test('the first Hengs slot of the day reuses the best-liked situation unless it ran today or yesterday', () => {
  const row = { seen: [], receipts: [] };
  const best = EVERGREEN[5];
  const scores = new Map([[best, 8], [EVERGREEN[6], 1]]);
  assert.equal(pickTopic(row, DAYKEY, 0, scores).title, best);
  // Later slots keep exploring the rotation.
  assert.equal(pickTopic(row, DAYKEY, 2, scores).title, pickTopic(row, DAYKEY, 2).title);
  const { memeHash } = require('../src/news/memes');
  const ranYesterday = { seen: [{ hash: memeHash(`evergreen:${best}:2026-10-20`), at: NOW - 20 * HOUR }], receipts: [] };
  assert.notEqual(pickTopic(ranYesterday, DAYKEY, 0, scores).title, best);
});
