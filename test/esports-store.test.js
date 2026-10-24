'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createEsportsStore } = require('../src/esports/store');

const GUILD = '223456789012345678';
const DAY = 86_400_000;

function store(t, clock = { now: Date.parse('2026-10-23T12:00:00Z') }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-esports-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { clock, s: createEsportsStore({ filePath: path.join(dir, 'esports-state.json'), now: () => clock.now }) };
}

test('a post is claimed once on disk before sending, then finished; a second claim is refused', t => {
  const { s } = store(t);
  assert.equal(s.post(GUILD, 'm1'), null);
  s.claim(GUILD, 'm1', { hash: 'h1' });
  assert.equal(s.post(GUILD, 'm1').status, 'claimed');
  assert.throws(() => s.claim(GUILD, 'm1', { hash: 'h1' }), /ESPORTS_ALREADY_CLAIMED/);
  s.finish(GUILD, 'm1', { status: 'sent', messageId: '1', channelId: '2' });
  const fresh = createEsportsStore({ filePath: s.filePath });
  assert.deepEqual({ ...fresh.post(GUILD, 'm1'), at: 0 }, { status: 'sent', hash: 'h1', messageId: '1', channelId: '2', at: 0, reported: false });
  s.update(GUILD, 'm1', { hash: 'h2', reported: true });
  assert.equal(s.post(GUILD, 'm1').hash, 'h2'); assert.equal(s.post(GUILD, 'm1').reported, true);
});

test('recent lists sent posts inside a window; old posts are pruned after 30 days', t => {
  const { s, clock } = store(t);
  s.claim(GUILD, 'old', { hash: 'a' }); s.finish(GUILD, 'old', { status: 'sent', messageId: '1', channelId: '2' });
  clock.now += 2 * DAY;
  s.claim(GUILD, 'new', { hash: 'b' }); s.finish(GUILD, 'new', { status: 'sent', messageId: '3', channelId: '2' });
  s.claim(GUILD, 'failed', { hash: 'c' }); s.finish(GUILD, 'failed', { status: 'failed' });
  assert.deepEqual(s.recent(GUILD, 3 * DAY).map(r => r.id).sort(), ['new', 'old']);
  assert.deepEqual(s.recent(GUILD, DAY).map(r => r.id), ['new']);
  clock.now += 31 * DAY; s.claim(GUILD, 'later', { hash: 'd' });
  assert.equal(s.post(GUILD, 'old'), null); assert.equal(s.post(GUILD, 'later').status, 'claimed');
});

test('page cache and last check survive restarts; a broken file reads as empty', t => {
  const { s } = store(t);
  s.savePages({ 'A/B': { revid: 7, matches: [{ id: 'x' }] } }, 123);
  const fresh = createEsportsStore({ filePath: s.filePath });
  assert.deepEqual(fresh.pages(), { 'A/B': { revid: 7, matches: [{ id: 'x' }] } }); assert.equal(fresh.lastCheck(), 123);
  fs.writeFileSync(s.filePath, '{broken');
  assert.deepEqual(createEsportsStore({ filePath: s.filePath }).pages(), {});
});

test('daily claims are written once, votes keep the latest choice, and both are pruned on schedule', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-esports-daily-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let time = Date.UTC(2026, 10, 4);
  const store = createEsportsStore({ filePath: path.join(dir, 'state.json'), now: () => time });
  store.claimDaily('g', 'preview:m1', { hash: 'h1' });
  assert.throws(() => store.claimDaily('g', 'preview:m1'), /ESPORTS_ALREADY_CLAIMED/);
  store.updateDaily('g', 'preview:m1', { messageIds: ['99'] });
  assert.deepEqual(store.daily('g', 'preview:m1'), { at: time, messageIds: ['99'], hash: 'h1' });
  store.vote('g', 'm1', 'u1', 1, 'E'); store.vote('g', 'm1', 'u1', 2, 'E'); store.vote('g', 'm2', 'u2', 1, null);
  assert.deepEqual(store.votes('g', 'm1'), { u1: 2 });
  assert.deepEqual(store.allVotes('g'), { m1: { u1: 2 }, m2: { u2: 1 } });
  store.claimDaily('g', 'event:E');
  time += 8 * 86_400_000; store.vote('g', 'm3', 'u3', 1, 'F');
  assert.deepEqual(Object.keys(store.allVotes('g')), ['m2', 'm3']); // E's votes go 7 days after its event recap
  time += 31 * 86_400_000; store.vote('g', 'm4', 'u4', 1, 'F');
  assert.deepEqual(Object.keys(store.allVotes('g')), ['m4']); // anything older than 30 days goes
  assert.equal(store.daily('g', 'preview:m1'), null);
  store.saveDiscovered([{ title: 'M8 World Championship/Wildcard' }], time);
  assert.deepEqual(store.discovered().map(w => w.title), ['M8 World Championship/Wildcard']);
  assert.equal(store.lastDiscovery(), time);
});
