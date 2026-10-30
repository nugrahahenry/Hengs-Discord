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
  const counts = { m1: 6, m2: 0, m3: 6, m4: 0, m5: 6, m6: 0 };
  const reads = [];
  const count = async ({ messageId }) => { reads.push(messageId); return counts[messageId]; };
  for (const [id, template, situation] of [['m1', 'fa', 'begadang sebelum UAS'], ['m2', 'drake', 'hujan pas mau berangkat'],
    ['m3', 'fa', 'begadang sebelum UAS'], ['m4', 'drake', 'hujan pas mau berangkat'], ['m5', 'fa', 'begadang sebelum UAS'],
    ['m6', 'drake', 'hujan pas mau berangkat']]) taste.remember(GUILD, { messageId: id, channelId: 'c', template, situation });
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads, []); // too fresh
  clock.now += 3 * HOUR;
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads.sort(), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  let scores = taste.weights(GUILD);
  assert.deepEqual([...scores.templates.keys()], ['fa']); assert.deepEqual([...scores.situations.keys()], ['begadang sebelum UAS']);
  assert.deepEqual(taste.recent(GUILD, 'template', 2), ['drake', 'fa']); // newest first
  // After three days the counts are final: no more reads, totals stay, a vanished message keeps its last count.
  counts.m1 = null;
  clock.now += 72 * HOUR;
  await taste.refresh(GUILD, count);
  reads.length = 0;
  await taste.refresh(GUILD, count);
  assert.deepEqual(reads, []);
  scores = taste.weights(GUILD);
  assert.deepEqual([...scores.templates.keys()], ['fa']);
  // Persisted: a fresh store over the same file sees the same taste.
  assert.deepEqual([...createMemeTaste({ filePath: taste.filePath, now: () => clock.now }).weights(GUILD).templates.keys()], ['fa']);
});

// Owner report, 2026-10-30: three templates on repeat because zero reactions counted as liked.
test('zero reactions are never liked: a key needs 3 settled posts, net +2 and more reactions per post than average', async t => {
  const clock = { now: NOW };
  const taste = store(t, clock);
  const plan = [['gb', 0], ['gb', 0], ['gb', 0], ['gb', 0], ['gb', 0], ['fa', 2], ['fa', 2], ['fa', 2], ['drake', 5], ['drake', 5]];
  plan.forEach(([template], i) => taste.remember(GUILD, { messageId: `m${i}`, channelId: 'c', template, situation: `situasi ${template}` }));
  clock.now += 3 * HOUR;
  await taste.refresh(GUILD, async ({ messageId }) => plan[Number(messageId.slice(1))][1]);
  assert.deepEqual([...taste.weights(GUILD).templates.keys()], ['fa']); // gb has no laughs, drake only two posts
});

test('a broken taste file or a failing read never stops memes', async t => {
  const clock = { now: NOW };
  const taste = store(t, clock);
  fs.writeFileSync(taste.filePath, '{not json');
  assert.equal(taste.weights(GUILD).templates.size, 0);
  taste.remember(GUILD, { messageId: 'm1', channelId: 'c', template: 'fa', situation: 'x situasi' });
  clock.now += 3 * HOUR;
  await taste.refresh(GUILD, async () => { throw new Error('synthetic discord failure'); });
  assert.deepEqual(taste.recent(GUILD, 'template', 6), ['fa']); assert.equal(taste.weights(GUILD).templates.size, 0);
});

test('liked templates are offered first, the templates of the last six Hengs memes sit out, the rest keeps rotating', () => {
  const liked = new Map([['fa', 9], ['midwit', 7], ['drake', 5], ['ds', 0.2]]);
  const offered = offerTemplates(TEMPLATES, DAYKEY, 2, liked).map(row => row.id);
  assert.equal(offered.length, 6); assert.equal(new Set(offered).size, 6);
  assert.deepEqual(offered.slice(0, 3), ['fa', 'midwit', 'drake']);
  assert.deepEqual(offerTemplates(TEMPLATES, DAYKEY, 2, new Map()), offerTemplates(TEMPLATES, DAYKEY, 2));
  const recent = ['gb', 'dbg', 'midwit', 'gb', 'dbg', 'fa', 'drake'];
  const rested = offerTemplates(TEMPLATES, DAYKEY, 2, liked, recent).map(row => row.id);
  for (const id of ['gb', 'dbg', 'midwit', 'fa']) assert.ok(!rested.includes(id), id); // six newest: gb dbg midwit gb dbg fa
  assert.equal(rested[0], 'drake'); // seventh back, so liked and offered again
});

test('the first Hengs slot reuses the best-liked situation unless it ran in the last 14 days', () => {
  const row = { seen: [], receipts: [] };
  const best = EVERGREEN[5];
  const liked = new Map([[best, 8], [EVERGREEN[6], 1]]);
  assert.equal(pickTopic(row, DAYKEY, 0, liked).title, best);
  // Later slots keep walking the themes.
  assert.equal(pickTopic(row, DAYKEY, 2, liked).title, pickTopic(row, DAYKEY, 2).title);
  const { memeHash } = require('../src/news/memes');
  const ran = days => ({ seen: [{ hash: memeHash(`evergreen:${best}:${new Date(NOW - days * 24 * HOUR).toISOString().slice(0, 10)}`), at: NOW }], receipts: [] });
  assert.notEqual(pickTopic(ran(10), DAYKEY, 0, liked).title, best);
  assert.equal(pickTopic(ran(15), DAYKEY, 0, liked).title, best);
});
