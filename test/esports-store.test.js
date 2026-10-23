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
