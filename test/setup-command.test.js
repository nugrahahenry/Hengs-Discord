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
  range = null,
  action = 'preview',
} = {}) {
  const member = { id: userId, guild: null };
  const guildValue = guild ? { id: GUILD, ownerId, members: { me: { id: 'bot' } } } : null;
  member.guild = guildValue;
  return {
    guildId: guild ? GUILD : null,
    channelId: guild ? '523456789012345678' : null,
    guild: guildValue,
    channel: guild ? { id: '523456789012345678', isTextBased: () => true } : null,
    member,
    user: { id: userId },
    memberPermissions: { has: permission => permission === PermissionFlagsBits.Administrator && administrator },
    options: {
      getSubcommand: () => subcommand,
      getString: name => ({ preset, mode, range, action }[name] ?? null),
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
            schemaVersion: 4,
            settings: {
              channelId: null,
              channelMode: 'all',
              language: 'auto',
              replyStyle: 'balanced',
              welcomeChannelId: null,
              welcomeEnabled: false,
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
      setCommunityWelcome(input) {
        calls.push(input);
        return { changed: true, config: { settings: input } };
      },
    },
    communityPack: {
      canUseChannel() { return true; },
      async preview() {
        calls.push({ preview: true });
        return {
          content: 'Ini preview Community Pack.',
          files: [{ attachment: Buffer.from('png'), name: 'welcome.png' }],
          allowedMentions: { parse: [] },
        };
      },
    },
    publicInsightsStore: {
      getSummary(guildId, days) {
        calls.push({ getSummary: [guildId, days] });
        return {
          days,
          accepted: 8,
          busyRejected: 2,
          rateLimited: 3,
          dailyLimited: 1,
          helpful: 4,
          needsWork: 1,
          todayUsed: 2,
          dailyLimit: 100,
          activeDays: 3,
          averagePerActiveDay: 2.7,
          busiestDay: '2026-08-22',
          busiestAccepted: 4,
          feedbackRated: 5,
          feedbackCoverage: 63,
          helpfulRate: 80,
        };
      },
      remove(guildId) {
        calls.push({ removeInsights: guildId });
        return { removed: true };
      },
    },
    publicGuildLimit: 25,
    logger: { error: code => calls.push({ log: code }) },
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
    'start', 'status', 'style', 'language', 'channel', 'insights', 'welcome', 'disable',
  ]);
  const style = json.options.find(option => option.name === 'style');
  assert.deepEqual(style.options[0].choices.map(choice => choice.value), [
    'balanced', 'concise', 'technical',
  ]);
  const language = json.options.find(option => option.name === 'language');
  assert.deepEqual(language.options[0].choices.map(choice => choice.value), ['auto', 'id', 'en']);
  const channel = json.options.find(option => option.name === 'channel');
  assert.deepEqual(channel.options[0].choices.map(choice => choice.value), ['all', 'current']);
  const insights = json.options.find(option => option.name === 'insights');
  assert.deepEqual(insights.options[0].choices.map(choice => choice.value), ['7_days', '30_days']);
  assert.equal(insights.options[0].required, false);
  const welcome = json.options.find(option => option.name === 'welcome');
  assert.deepEqual(welcome.options[0].choices.map(choice => choice.value), [
    'enable', 'disable', 'preview',
  ]);
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
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'insights' }), kind: 'public' },
    { value: interaction({ userId: ADMIN, administrator: false, subcommand: 'welcome' }), kind: 'public' },
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
      assert.match(value.replyPayload.content, /Community Pack.*nonaktif/i);
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

test('/setup welcome binds the current channel, supports private preview, and disables cleanly', async () => {
  const enabledDeps = dependencies('public');
  const enabled = interaction({ subcommand: 'welcome', action: 'enable' });
  await setup.execute(enabled, enabledDeps);
  assertPrivate(enabled.replyPayload);
  assert.match(enabled.replyPayload.content, /aktif di channel ini/i);
  assert.deepEqual(enabledDeps.calls, [{
    guildId: GUILD,
    enabled: true,
    channelId: enabled.channelId,
    setupBy: OWNER,
  }]);

  const previewDeps = dependencies('public');
  const preview = interaction({ subcommand: 'welcome', action: 'preview' });
  await setup.execute(preview, previewDeps);
  assertPrivate(preview.replyPayload);
  assert.equal(preview.replyPayload.files.length, 1);
  assert.deepEqual(previewDeps.calls, [{ preview: true }]);

  const disabledDeps = dependencies('public');
  const disabled = interaction({ subcommand: 'welcome', action: 'disable' });
  await setup.execute(disabled, disabledDeps);
  assertPrivate(disabled.replyPayload);
  assert.match(disabled.replyPayload.content, /dinonaktifkan/i);
  assert.deepEqual(disabledDeps.calls, [{
    guildId: GUILD,
    enabled: false,
    channelId: null,
    setupBy: OWNER,
  }]);
});

test('/setup welcome fails closed when the selected channel lacks required permissions', async () => {
  const deps = dependencies('public');
  deps.communityPack.canUseChannel = () => false;
  const value = interaction({ subcommand: 'welcome', action: 'enable' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /belum punya izin/i);
  assert.equal(deps.calls.length, 0);
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

test('/setup insights returns private aggregate-only ranges to public server managers', async () => {
  for (const [range, days] of [[null, 7], ['30_days', 30]]) {
    const deps = dependencies('public');
    const value = interaction({ subcommand: 'insights', range });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, new RegExp(`${days} hari`, 'i'));
    assert.match(value.replyPayload.content, /8/);
    assert.match(value.replyPayload.content, /5/);
    assert.match(value.replyPayload.content, /Hari aktif.*3/i);
    assert.match(value.replyPayload.content, /63%/);
    assert.match(value.replyPayload.content, /80%/);
    assert.match(value.replyPayload.content, /Saran Hengs/i);
    assert.match(value.replyPayload.content, /isi chat.*tidak masuk/i);
    assert.doesNotMatch(value.replyPayload.content, /[\u2013\u2014]/);
    assert.deepEqual(deps.calls, [{ getSummary: [GUILD, days] }]);
  }
});

test('/setup insights does not read private metrics outside active public guilds', async () => {
  for (const kind of ['home', 'pending', 'denied']) {
    const deps = dependencies(kind);
    const value = interaction({ subcommand: 'insights' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.equal(deps.calls.length, 0);
  }
});

test('/setup insights explains an empty aggregate without exposing identifiers', async () => {
  const deps = dependencies('public');
  deps.publicInsightsStore.getSummary = () => ({
    accepted: 0,
    busyRejected: 0,
    rateLimited: 0,
    dailyLimited: 0,
    helpful: 0,
    needsWork: 0,
    todayUsed: 0,
    dailyLimit: 100,
    activeDays: 0,
    averagePerActiveDay: 0,
    busiestDay: null,
    busiestAccepted: 0,
    feedbackRated: 0,
    feedbackCoverage: 0,
    helpfulRate: 0,
  });
  const value = interaction({ subcommand: 'insights' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /belum ada permintaan publik/i);
});

test('/setup disable removes public config and is idempotent', async () => {
  for (const kind of ['public', 'pending']) {
    const deps = dependencies(kind);
    if (kind === 'pending') deps.guildConfigStore.remove = () => ({ removed: false });
    const value = interaction({ subcommand: 'disable' });
    await setup.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, kind === 'public' ? /dinonaktifkan/i : /belum aktif/i);
    assert.equal(deps.calls.length, kind === 'public' ? 2 : 0);
    if (kind === 'public') assert.deepEqual(deps.calls, [
      { removeInsights: GUILD },
      { remove: GUILD },
    ]);
  }
});

test('/setup disable keeps config active when insights cannot be purged', async () => {
  const deps = dependencies('public');
  deps.publicInsightsStore.remove = () => { throw new Error('private path detail'); };
  const value = interaction({ subcommand: 'disable' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /belum dinonaktifkan/i);
  assert.deepEqual(deps.calls, [{ log: '[public-insights] PUBLIC_INSIGHTS_PURGE_FAILED' }]);
});

test('/setup cannot disable the home guild', async () => {
  const deps = dependencies('home');
  const value = interaction({ subcommand: 'disable' });
  await setup.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /server utama/i);
  assert.equal(deps.calls.length, 0);
});
