const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const setup = require('../src/commands/setup');

const GUILD = '223456789012345678';
const OWNER = '323456789012345678';
const ADMIN = '423456789012345678';

function interaction({
  guild = true,
  ownerId = OWNER,
  userId = OWNER,
  administrator = false,
  subcommand = 'status',
} = {}) {
  return {
    guildId: guild ? GUILD : null,
    channelId: guild ? '523456789012345678' : null,
    guild: guild ? { id: GUILD, ownerId } : null,
    user: { id: userId },
    memberPermissions: { has: permission => permission === PermissionFlagsBits.Administrator && administrator },
    options: { getSubcommand: () => subcommand },
    inGuild: () => guild,
    async reply(payload) { this.replyPayload = payload; },
  };
}

function dependencies(kind = 'pending') {
  const calls = [];
  return {
    calls,
    guildAccess: { classify: () => ({ kind }) },
    guildConfigStore: {
      activate(input) {
        calls.push(input);
        return { created: true, changed: true, config: { status: 'active' } };
      },
    },
  };
}

function assertPrivate(payload) {
  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.doesNotMatch(payload.content, /\d{15,22}/);
}

test('/setup is a guild-only command with start and status', () => {
  const json = setup.data.toJSON();
  assert.equal(json.name, 'setup');
  assert.equal(json.dm_permission, false);
  assert.deepEqual(json.options.map(option => option.name), ['start', 'status']);
});

test('/setup start activates an allowlisted guild for its owner or administrator', async () => {
  for (const actor of [
    { userId: OWNER, administrator: false },
    { userId: ADMIN, administrator: true },
  ]) {
    const deps = dependencies('pending');
    const value = interaction({ ...actor, subcommand: 'start' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, /aktif/i);
    assert.equal(deps.calls.length, 1);
    assert.equal(deps.calls[0].guildId, GUILD);
  }
});

test('/setup denies DMs, non-allowlisted guilds, and unauthorized members without mutation', async () => {
  const cases = [
    { value: interaction({ guild: false, subcommand: 'start' }), kind: 'dm' },
    { value: interaction({ subcommand: 'start' }), kind: 'denied' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'start' }), kind: 'pending' },
  ];

  for (const item of cases) {
    const deps = dependencies(item.kind);
    await setup.execute(item.value, deps);
    assertPrivate(item.value.replyPayload);
    assert.equal(deps.calls.length, 0);
  }
});

test('/setup status reports fixed states without exposing stored IDs', async () => {
  for (const [kind, expected] of [
    ['denied', /belum masuk beta/i],
    ['pending', /belum aktif/i],
    ['beta', /aktif/i],
    ['home', /server utama/i],
  ]) {
    const deps = dependencies(kind);
    const value = interaction({ subcommand: 'status' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, expected);
  }
});
