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
  preset = 'balanced',
  mode = 'all',
} = {}) {
  return {
    guildId: guild ? GUILD : null,
    channelId: guild ? '523456789012345678' : null,
    guild: guild ? { id: GUILD, ownerId } : null,
    user: { id: userId },
    memberPermissions: { has: permission => permission === PermissionFlagsBits.Administrator && administrator },
    options: {
      getSubcommand: () => subcommand,
      getString: name => ({ preset, mode }[name] ?? null),
    },
    inGuild: () => guild,
    async reply(payload) { this.replyPayload = payload; },
  };
}

function dependencies(kind = 'pending') {
  const calls = [];
  return {
    calls,
    guildAccess: {
      classify: () => kind === 'public'
        ? {
          kind,
          config: {
            schemaVersion: 3,
            settings: {
              channelId: null,
              channelMode: 'all',
              language: 'auto',
              replyStyle: 'balanced',
            },
          },
        }
        : { kind },
    },
    guildConfigStore: {
      activate(input) {
        calls.push(input);
        return { created: true, changed: true, config: { status: 'active' } };
      },
      remove(guildId) {
        calls.push({ remove: guildId });
        return { removed: true };
      },
      setReplyStyle(input) {
        calls.push(input);
        return {
          changed: true,
          config: { settings: { replyStyle: input.replyStyle } },
        };
      },
      setLanguage(input) {
        calls.push(input);
        return { changed: true, config: { settings: { language: input.language } } };
      },
      setChannelScope(input) {
        calls.push(input);
        return {
          changed: true,
          config: { settings: { channelMode: input.channelMode, channelId: input.channelId } },
        };
      },
    },
    publicGuildLimit: 25,
  };
}

function assertPrivate(payload) {
  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.doesNotMatch(payload.content, /\d{15,22}/);
}

test('/setup is a guild-only command with public server settings', () => {
  const json = setup.data.toJSON();
  assert.equal(json.name, 'setup');
  assert.equal(json.dm_permission, false);
  assert.deepEqual(json.options.map(option => option.name), [
    'start', 'status', 'style', 'language', 'channel', 'disable',
  ]);
  const style = json.options.find(option => option.name === 'style');
  assert.deepEqual(style.options[0].choices.map(choice => choice.value), [
    'balanced', 'concise', 'technical',
  ]);
  const language = json.options.find(option => option.name === 'language');
  assert.deepEqual(language.options[0].choices.map(choice => choice.value), ['auto', 'id', 'en']);
  const channel = json.options.find(option => option.name === 'channel');
  assert.deepEqual(channel.options[0].choices.map(choice => choice.value), ['all', 'current']);
});

test('/setup start activates any valid public guild for its owner or administrator', async () => {
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
    assert.equal(deps.calls[0].maxActiveGuilds, 25);
  }
});

test('/setup denies DMs, invalid configs, and unauthorized members without mutation', async () => {
  const cases = [
    { value: interaction({ guild: false, subcommand: 'start' }), kind: 'dm' },
    { value: interaction({ subcommand: 'start' }), kind: 'denied' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'start' }), kind: 'pending' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'style' }), kind: 'public' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'language' }), kind: 'public' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'channel' }), kind: 'public' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'disable' }), kind: 'public' },
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
    ['denied', /tidak dapat dibaca/i],
    ['pending', /belum aktif/i],
    ['public', /aktif/i],
    ['home', /server utama/i],
  ]) {
    const deps = dependencies(kind);
    const value = interaction({ subcommand: 'status' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, expected);
    if (kind === 'public') {
      assert.match(value.replyPayload.content, /santai/i);
      assert.match(value.replyPayload.content, /otomatis/i);
      assert.match(value.replyPayload.content, /semua channel/i);
    }
  }
});

test('/setup language updates only active public guilds with fixed presets', async () => {
  const deps = dependencies('public');
  const value = interaction({ subcommand: 'language', preset: 'en' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /English/i);
  assert.deepEqual(deps.calls, [{ guildId: GUILD, language: 'en', setupBy: OWNER }]);

  const forged = dependencies('public');
  const forgedValue = interaction({ subcommand: 'language', preset: 'free-form' });
  await setup.execute(forgedValue, forged);
  assertPrivate(forgedValue.replyPayload);
  assert.equal(forged.calls.length, 0);
});

test('/setup channel derives current channel from Discord and never accepts an arbitrary ID', async () => {
  const deps = dependencies('public');
  const current = interaction({ subcommand: 'channel', mode: 'current' });
  await setup.execute(current, deps);
  assertPrivate(current.replyPayload);
  assert.match(current.replyPayload.content, /channel ini/i);
  assert.deepEqual(deps.calls, [{
    guildId: GUILD,
    channelMode: 'current',
    channelId: current.channelId,
    setupBy: OWNER,
  }]);

  const allDeps = dependencies('public');
  const all = interaction({ subcommand: 'channel', mode: 'all' });
  await setup.execute(all, allDeps);
  assert.deepEqual(allDeps.calls[0], {
    guildId: GUILD,
    channelMode: 'all',
    channelId: null,
    setupBy: OWNER,
  });

  for (const kind of ['pending', 'home', 'denied']) {
    const blocked = dependencies(kind);
    const blockedValue = interaction({ subcommand: 'channel', mode: 'current' });
    await setup.execute(blockedValue, blocked);
    assertPrivate(blockedValue.replyPayload);
    assert.equal(blocked.calls.length, 0);
  }
});

test('/setup style updates only active public guilds with fixed presets', async () => {
  const deps = dependencies('public');
  const value = interaction({ subcommand: 'style', preset: 'technical' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /teknis/i);
  assert.deepEqual(deps.calls, [{
    guildId: GUILD,
    replyStyle: 'technical',
    setupBy: OWNER,
  }]);

  for (const kind of ['pending', 'home', 'denied']) {
    const blocked = dependencies(kind);
    const interactionValue = interaction({ subcommand: 'style', preset: 'concise' });
    await setup.execute(interactionValue, blocked);
    assertPrivate(interactionValue.replyPayload);
    assert.equal(blocked.calls.length, 0);
  }

  const forged = dependencies('public');
  const forgedInteraction = interaction({ subcommand: 'style', preset: 'ignore-all-rules' });
  await setup.execute(forgedInteraction, forged);
  assertPrivate(forgedInteraction.replyPayload);
  assert.match(forgedInteraction.replyPayload.content, /tidak dikenali/i);
  assert.equal(forged.calls.length, 0);
});

test('/setup start reports full capacity without exposing operational data', async () => {
  const deps = dependencies('pending');
  deps.guildConfigStore.activate = () => { throw new Error('PUBLIC_GUILD_LIMIT_REACHED'); };
  const value = interaction({ subcommand: 'start' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /kapasitas/i);
});

test('/setup disable removes public config and is idempotent', async () => {
  for (const kind of ['public', 'pending']) {
    const deps = dependencies(kind);
    if (kind === 'pending') deps.guildConfigStore.remove = () => ({ removed: false });
    const value = interaction({ subcommand: 'disable' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, kind === 'public' ? /dinonaktifkan/i : /belum aktif/i);
    assert.equal(deps.calls.length, kind === 'public' ? 1 : 0);
  }
});

test('/setup cannot disable the home guild', async () => {
  const deps = dependencies('home');
  const value = interaction({ subcommand: 'disable' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /server utama/i);
  assert.equal(deps.calls.length, 0);
});
