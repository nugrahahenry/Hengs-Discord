'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createChatTrends } = require('../src/news/chat-trends');

const HOUR = 3_600_000;

function rig({ privateName = '🔒・admin-chat' } = {}) {
  const clock = { now: Date.parse('2026-11-01T10:00:00Z') };
  const everyone = { id: 'everyone' };
  const members = new Map([['a', { displayName: 'Raka Pratama', user: { username: 'raka' } }], ['b', { displayName: 'Dara', user: { username: 'dara_x' } }]]);
  const guild = { roles: { everyone }, members: { cache: members } };
  const channel = (name, visible = true) => ({ name, guild, isTextBased: () => true, isThread: () => false,
    permissionsFor: () => ({ has: () => visible }) });
  const open = channel('💬・ngobrol'); const hidden = channel(privateName, false); const team = channel('📸・hasil-scrim');
  const trends = createChatTrends({ now: () => clock.now });
  const say = (author, content, where = open, bot = false) => trends.observe({ guild, channel: where, content, author: { id: author, bot } });
  return { clock, trends, say, open, hidden, team };
}

test('a word becomes a trend once three different members used it within a day', () => {
  const r = rig();
  r.say('a', 'bakso kantin enak banget'); r.say('a', 'bakso lagi'); r.say('b', 'setuju bakso mantap');
  assert.equal(r.trends.trend(), null); // two members so far
  r.say('c', 'ayo makan bakso');
  assert.equal(r.trends.trend(), 'bakso');
  r.clock.now += 25 * HOUR;
  assert.equal(r.trends.trend(), null); // the day is over
});

test('bots, hidden and team channels, mentions, links, names, numbers and sensitive words never count', () => {
  const r = rig();
  for (const author of ['a', 'b', 'c']) {
    r.say(author, 'rahasia admin', r.hidden); r.say(author, 'skor scrim', r.team);
    r.say(author, '<@123> https://example.com/bakso raka dara 2026 politik pemilu');
  }
  ['x', 'y', 'z'].forEach(bot => r.say(bot, 'spamword spamword', r.open, true));
  assert.equal(r.trends.trend(), null);
  assert.equal(r.trends.allowed(r.hidden), false); assert.equal(r.trends.allowed(r.team), false); assert.equal(r.trends.allowed(r.open), true);
});

test('chat trends keep nothing on disk and are wired into the meme maker and the home message handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'news', 'chat-trends.js'), 'utf8');
  assert.doesNotMatch(source, /writeFile|appendFile|createWriteStream/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(index, /trendOf: \(\) => chatTrends\.trend\(\)/);
  assert.match(index, /chatTrends\.observe\(msg\)/);
});
