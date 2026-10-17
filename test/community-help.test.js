'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommunityHelp, isHallGallery, botCommands, hallGuide } = require('../src/community-help');
const hengs = require('../src/commands/hengs');
const guild = { channels: { cache: new Map([['bot', { type: 0, name: '🤖・bot-commands', id: '123456789012345678' }]]) } };

test('member help is short and truthful; managers/editors see only applicable controls', () => {
  const member = buildCommunityHelp({ home: true, guild });
  assert.match(member, /<#[0-9]+>/); assert.match(member, /bukan di Hall of Fame/);
  assert.doesNotMatch(member, /Khusus pengelola|fokus belajar|Tag anggota atau/);
  const publicHelp = buildCommunityHelp({ manager: true });
  assert.match(publicHelp, /\/setup/); assert.doesNotMatch(publicHelp, /Hall of Fame|fokus belajar|bot-settings/);
  const admin = buildCommunityHelp({ home: true, manager: true, editor: true, guild });
  assert.match(admin, /Tag anggota atau Tanpa tag/);
  for (const text of [member, publicHelp, admin]) { assert.ok(text.length <= 2000); assert.doesNotMatch(text, /[\u2013\u2014]/); }
  assert.match(hallGuide(guild), /khusus galeri/);
  assert.equal(botCommands({}), '`bot-commands`');
});

test('gallery recognition excludes threads and unrelated channels', () => {
  assert.equal(isHallGallery({ name: '🏆・hall-of-fame', type: 0 }), true);
  assert.equal(isHallGallery({ name: 'hall-of-fame', type: 11 }), false);
  assert.equal(isHallGallery({ name: 'not-hall-of-fame', type: 0 }), false);
});

test('slash asks from gallery redirect privately before agent or provider use', async () => {
  let reply;
  const interaction = { inGuild: () => true, guildId: '223456789012345678', guild,
    channel: { type: 0, name: '🏆・hall-of-fame' }, user: { id: '323456789012345678' },
    options: { getSubcommand: () => 'ask' }, reply: async payload => { reply = payload; } };
  await hengs.execute(interaction, { guildAccess: { classify: () => ({ kind: 'home' }) } });
  assert.match(reply.content, /tidak ada tindakan/);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.equal(reply.flags, 64);
});
