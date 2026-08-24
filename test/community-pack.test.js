const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const {
  buildCommunityPayload,
  canUseCommunityChannel,
  createCommunityPack,
} = require('../src/guilds/community-pack');

const CHANNEL_ID = '523456789012345678';

function fixture({ allowed = true } = {}) {
  const sent = [];
  const logs = [];
  const botMember = { id: 'bot' };
  const channel = {
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => allowed }),
    async send(payload) { sent.push(payload); },
  };
  const guild = {
    name: 'Teman Hengs',
    members: { me: botMember },
    channels: { cache: new Map([[CHANNEL_ID, channel]]) },
  };
  const member = {
    id: '623456789012345678',
    guild,
    user: { username: 'member', createdAt: new Date('2025-01-01T00:00:00.000Z') },
  };
  const pack = createCommunityPack({
    generateCardImpl: async () => Buffer.from('png'),
    logger: {
      warn: code => logs.push(code),
      error: code => logs.push(code),
    },
  });
  const config = {
    schemaVersion: 4,
    settings: { welcomeEnabled: true, welcomeChannelId: CHANNEL_ID },
  };
  return { channel, config, guild, logs, member, pack, sent };
}

test('community channel requires all three Discord permissions', () => {
  const { channel, guild } = fixture();
  assert.equal(canUseCommunityChannel(channel, guild), true);
  channel.permissionsFor = () => ({
    has: permission => permission !== PermissionFlagsBits.AttachFiles,
  });
  assert.equal(canUseCommunityChannel(channel, guild), false);
});

test('public welcome sends one card with one targeted mention', async () => {
  const value = fixture();
  const result = await value.pack.sendMemberEvent(value.member, 'welcome', value.config);
  assert.deepEqual(result, { sent: true, code: 'COMMUNITY_EVENT_SENT' });
  assert.equal(value.sent.length, 1);
  assert.match(value.sent[0].content, /Aku Hengs, asisten komunitas/i);
  assert.deepEqual(value.sent[0].allowedMentions, {
    parse: [],
    users: [value.member.id],
  });
  assert.equal(value.sent[0].files[0].name, 'welcome.png');
});

test('public leave card contains no member mention', async () => {
  const value = fixture();
  const result = await value.pack.sendMemberEvent(value.member, 'leave', value.config);
  assert.deepEqual(result, { sent: true, code: 'COMMUNITY_EVENT_SENT' });
  assert.equal(value.sent.length, 1);
  assert.doesNotMatch(value.sent[0].content, /<@/);
  assert.deepEqual(value.sent[0].allowedMentions, { parse: [] });
  assert.equal(value.sent[0].files[0].name, 'leave.png');
});

test('disabled or unwritable community welcome never falls back to another channel', async () => {
  const disabled = fixture();
  disabled.config.settings = { welcomeEnabled: false, welcomeChannelId: null };
  assert.deepEqual(
    await disabled.pack.sendMemberEvent(disabled.member, 'welcome', disabled.config),
    { sent: false, code: 'COMMUNITY_WELCOME_DISABLED' },
  );
  assert.equal(disabled.sent.length, 0);

  const denied = fixture({ allowed: false });
  assert.deepEqual(
    await denied.pack.sendMemberEvent(denied.member, 'leave', denied.config),
    { sent: false, code: 'COMMUNITY_CHANNEL_UNAVAILABLE' },
  );
  assert.equal(denied.sent.length, 0);
  assert.deepEqual(denied.logs, ['[community-pack] COMMUNITY_CHANNEL_UNAVAILABLE']);
});

test('preview copy is private-ready and never mentions a member', async () => {
  const { member } = fixture();
  const payload = await buildCommunityPayload(member, 'welcome', {
    preview: true,
    generateCardImpl: async () => Buffer.from('png'),
  });
  const reply = { ...payload, flags: MessageFlags.Ephemeral };
  assert.equal(reply.flags, MessageFlags.Ephemeral);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.doesNotMatch(reply.content, /<@/);
  assert.doesNotMatch(reply.content, /[\u2013\u2014]/);
  await assert.rejects(
    buildCommunityPayload({ ...member, id: 'unsafe' }, 'welcome'),
    /COMMUNITY_MEMBER_INVALID/,
  );
});
