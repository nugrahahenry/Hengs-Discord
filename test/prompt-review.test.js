const assert = require('node:assert/strict');
const test = require('node:test');

const { MessageFlags } = require('discord.js');
const { resetForTests, issueReview, getTicket, handleComponent, TTL_MS } = require('../src/prompt-review');

const GUILD = '223456789012345678';
const OTHER_GUILD = '523456789012345678';
const OWNER = '323456789012345678';
const ADMIN = '423456789012345678';
const CHANNEL = '623456789012345678';
const BOT = '723456789012345678';

function guild(id = GUILD) {
  return {
    id,
    ownerId: OWNER,
    channels: { cache: new Map([
      [CHANNEL, { id: CHANNEL, name: 'announcements', viewable: true, isTextBased: () => true }],
      ['823456789012345678', { id: '823456789012345678', name: 'private', viewable: false, isTextBased: () => true }],
    ]) },
  };
}

function component(customId, overrides = {}) {
  return {
    customId,
    guildId: GUILD,
    channelId: CHANNEL,
    user: { id: OWNER },
    guild: guild(),
    message: { author: { id: BOT } },
    inGuild: () => true,
    isButton: () => true,
    async reply(payload) { this.replyPayload = payload; this.replied = true; },
    async update(payload) { this.updatePayload = payload; this.updated = true; },
    ...overrides,
  };
}

test.afterEach(() => resetForTests());

test('issueReview stores a bounded ticket and excludes invisible channels from fingerprint', () => {
  const result = issueReview({
    guild: guild(),
    guildId: GUILD,
    channelId: CHANNEL,
    requesterId: OWNER,
    blueprintKeys: ['lobby', 'gaming'],
    now: 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ticket.blueprintKeys.join(','), 'lobby,gaming');
  assert.equal(result.ticket.expiresAt, 1000 + TTL_MS);
  assert.equal(result.components[0].components.length, 2);
  assert.equal(getTicket(result.ticket.id, 1001).fingerprint, result.ticket.fingerprint);
});

test('review checks source message, same guild, same channel, and expiry', async () => {
  const result = issueReview({ guild: guild(), guildId: GUILD, channelId: CHANNEL, requesterId: OWNER, blueprintKeys: ['lobby'], now: 1000 });
  const access = { classify: () => ({ kind: 'home' }) };
  const wrongSource = component(`hengs-prompt:review:${result.ticket.id}`, { message: { author: { id: '923456789012345678' } } });
  await handleComponent(wrongSource, { guildAccess: access, botUserId: BOT, now: 1001 });
  assert.match(wrongSource.replyPayload.content, /tidak dikenali/i);
  assert.equal(wrongSource.replyPayload.flags, MessageFlags.Ephemeral);

  const expired = component(`hengs-prompt:review:${result.ticket.id}`);
  await handleComponent(expired, { guildAccess: access, botUserId: BOT, now: 1000 + TTL_MS });
  assert.match(expired.replyPayload.content, /kedaluwarsa/i);
});

test('review is private, rechecks drift, and approve is one-shot owner-only', async () => {
  const result = issueReview({ guild: guild(), guildId: GUILD, channelId: CHANNEL, requesterId: OWNER, blueprintKeys: ['creator'], now: 1000 });
  const access = { classify: () => ({ kind: 'home' }) };
  const review = component(`hengs-prompt:review:${result.ticket.id}`);
  await handleComponent(review, { guildAccess: access, botUserId: BOT, now: 1001 });
  assert.equal(review.updated, true);
  assert.match(review.updatePayload.content, /Review privat aktif/);
  assert.equal(review.updatePayload.allowedMentions.parse.length, 0);
  assert.equal(review.updatePayload.components[0].components[0].data.label, 'Konfirmasi rencana');

  const approved = component(`hengs-prompt:approve:${result.ticket.id}`);
  await handleComponent(approved, { guildAccess: access, botUserId: BOT, now: 1002 });
  assert.match(approved.updatePayload.content, /Belum ada channel/);
  assert.equal(approved.updatePayload.components.length, 0);
  assert.equal(getTicket(result.ticket.id, 1002), null);

  const replay = component(`hengs-prompt:approve:${result.ticket.id}`);
  await handleComponent(replay, { guildAccess: access, botUserId: BOT, now: 1003 });
  assert.match(replay.replyPayload.content, /kedaluwarsa/i);
});

test('approve cannot skip the private review stage', async () => {
  const result = issueReview({ guild: guild(), guildId: GUILD, channelId: CHANNEL, requesterId: OWNER, blueprintKeys: ['lobby'], now: 1000 });
  const access = { classify: () => ({ kind: 'home' }) };
  const approve = component(`hengs-prompt:approve:${result.ticket.id}`);
  await handleComponent(approve, { guildAccess: access, botUserId: BOT, now: 1001 });
  assert.match(approve.replyPayload.content, /belum dibuka/i);
  assert.ok(getTicket(result.ticket.id, 1001));
});

test('administrator may issue a preview but cannot approve it', async () => {
  const result = issueReview({ guild: guild(), guildId: GUILD, channelId: CHANNEL, requesterId: ADMIN, blueprintKeys: ['core'], now: 1000 });
  const access = { classify: () => ({ kind: 'home' }) };
  const approve = component(`hengs-prompt:approve:${result.ticket.id}`, { user: { id: ADMIN } });
  await handleComponent(approve, { guildAccess: access, botUserId: BOT, now: 1001 });
  assert.match(approve.replyPayload.content, /hanya bisa dilakukan owner/i);
  assert.ok(getTicket(result.ticket.id, 1001));
});

test('inventory drift consumes the old ticket and fails closed', async () => {
  const target = guild();
  const result = issueReview({ guild: target, guildId: GUILD, channelId: CHANNEL, requesterId: OWNER, blueprintKeys: ['lobby'], now: 1000 });
  target.channels.cache.set('923456789012345678', { id: '923456789012345678', name: 'new-channel', viewable: true, isTextBased: () => true });
  const access = { classify: () => ({ kind: 'home' }) };
  const review = component(`hengs-prompt:review:${result.ticket.id}`, { guild: target });
  await handleComponent(review, { guildAccess: access, botUserId: BOT, now: 1001 });
  assert.match(review.replyPayload.content, /struktur server berubah/i);
  assert.equal(getTicket(result.ticket.id, 1001), null);
});
