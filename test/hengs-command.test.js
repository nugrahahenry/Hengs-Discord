const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags } = require('discord.js');

const hengs = require('../src/commands/hengs');

const GUILD = '223456789012345678';
const USER = '323456789012345678';
const CHANNEL = '423456789012345678';

function interaction({ guild = true, subcommand = 'help', prompt = 'Halo Hengs', channelId = CHANNEL } = {}) {
  return {
    guildId: guild ? GUILD : null,
    channelId: guild ? channelId : null,
    user: { id: USER },
    options: {
      getSubcommand: () => subcommand,
      getString: name => name === 'prompt' ? prompt : null,
    },
    inGuild: () => guild,
    async reply(payload) { this.replyPayload = payload; this.replied = true; },
    async deferReply(payload) { this.deferPayload = payload; this.deferred = true; },
    async editReply(payload) { this.editPayload = payload; this.replied = true; },
  };
}

function config(overrides = {}) {
  return {
    schemaVersion: 3,
    settings: {
      channelId: null,
      channelMode: 'all',
      language: 'auto',
      replyStyle: 'balanced',
      ...overrides,
    },
  };
}

function dependencies(kind = 'public', configValue = config()) {
  const calls = [];
  const releases = [];
  return {
    calls,
    releases,
    agent: {
      buildConversationKey(guildId, userId) {
        calls.push({ buildConversationKey: [guildId, userId] });
        return `${guildId}:${userId}`;
      },
      async chat(prompt, key, context) {
        calls.push({ chat: { prompt, key, context } });
        return '@everyone jawaban aman';
      },
      clearHistory(key) { calls.push({ clearHistory: key }); },
    },
    guildAccess: { classify: () => kind === 'public' ? { kind, config: configValue } : { kind } },
    clientId: '123456789012345678',
    publicInsightsStore: {
      claimAccepted(guildId) {
        calls.push({ claimAccepted: guildId });
        return { ok: true, requestId: 'a1b2c3d4e5f60718', used: 1, limit: 100 };
      },
      recordRejection(guildId, code) {
        calls.push({ recordRejection: [guildId, code] });
        return { recorded: true };
      },
    },
    publicTrafficGuard: {
      acquire(guildId) {
        calls.push({ acquire: guildId });
        return { ok: true, release: () => releases.push(guildId) };
      },
    },
    logger: { error: code => calls.push({ log: code }) },
  };
}

function assertPrivate(payload) {
  assert.equal(payload.flags, MessageFlags.Ephemeral);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
}

test('/hengs exposes bounded chat, self-service, privacy, and caller-only reset', () => {
  const json = hengs.data.toJSON();
  assert.equal(json.name, 'hengs');
  assert.equal(json.dm_permission, false);
  assert.deepEqual(json.options.map(option => option.name), [
    'ask',
    'reset',
    'help',
    'invite',
    'privacy',
  ]);
  const prompt = json.options[0].options[0];
  assert.equal(prompt.required, true);
  assert.ok(prompt.max_length <= 1800);
  assert.deepEqual(json.options[1].options || [], []);
});

test('/hengs invite returns the fixed least-privilege Discord link privately', async () => {
  const deps = dependencies('pending');
  const value = interaction({ subcommand: 'invite' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  const match = value.replyPayload.content.match(/\((https:\/\/discord\.com\/oauth2\/authorize\?[^)]+)\)/);
  assert.ok(match);
  const url = new URL(match[1]);
  assert.equal(url.searchParams.get('client_id'), deps.clientId);
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['applications.commands', 'bot']);
  assert.equal(url.searchParams.has('token'), false);
  assert.match(value.replyPayload.content, /server yang kamu kelola/i);
  assert.equal(deps.calls.length, 0);
});

test('/hengs invite hides invalid application configuration behind a fixed code', async () => {
  const deps = dependencies('public');
  deps.clientId = 'private invalid detail';
  const value = interaction({ subcommand: 'invite' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /belum bisa dibuat/i);
  assert.doesNotMatch(value.replyPayload.content, /private invalid detail/i);
  assert.deepEqual(deps.calls, [{ log: '[public-invite] PUBLIC_INVITE_FAILED' }]);
});

test('/hengs privacy explains provider processing and bounded memory without mutation', async () => {
  for (const kind of ['pending', 'public', 'home']) {
    const deps = dependencies(kind);
    const value = interaction({ subcommand: 'privacy' });
    await hengs.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, /penyedia AI/i);
    assert.match(value.replyPayload.content, /konteks percakapan/i);
    assert.match(value.replyPayload.content, /kebijakan layanan/i);
    assert.match(value.replyPayload.content, /10 pesan terbaru/i);
    assert.match(value.replyPayload.content, /tidak disimpan ke file/i);
    assert.match(value.replyPayload.content, /\/hengs reset/i);
    assert.doesNotMatch(value.replyPayload.content, /Henry|[\u2013\u2014]/i);
    assert.equal(deps.calls.length, 0);
  }
});

test('/hengs invite and privacy stay available without reading guild config or AI', async () => {
  for (const subcommand of ['invite', 'privacy']) {
    const deps = dependencies('public');
    deps.agent = null;
    deps.guildAccess.classify = () => { throw new Error('private config detail'); };
    const value = interaction({ subcommand });
    await hengs.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.equal(deps.calls.length, 0);
  }
});

test('/hengs help guides pending guilds without starting or mutating anything', async () => {
  const deps = dependencies('pending');
  const value = interaction({ subcommand: 'help' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /\/setup start/i);
  assert.match(value.replyPayload.content, /\/hengs privacy/i);
  assert.match(value.replyPayload.content, /\/hengs invite/i);
  assert.equal(deps.calls.length, 0);
});

test('/hengs ask shares public admission and sends mention-safe output', async () => {
  const deps = dependencies('public', config({ language: 'en', replyStyle: 'technical' }));
  const value = interaction({ subcommand: 'ask', prompt: 'Explain queues' });
  await hengs.execute(value, deps);
  assert.deepEqual(value.deferPayload, {});
  assert.equal(value.editPayload.content, '@everyone jawaban aman');
  assert.deepEqual(value.editPayload.allowedMentions, { parse: [] });
  assert.deepEqual(deps.calls, [
    { acquire: GUILD },
    { claimAccepted: GUILD },
    { buildConversationKey: [GUILD, USER] },
    { chat: {
      prompt: 'Explain queues',
      key: `${GUILD}:${USER}`,
      context: { kind: 'public', replyStyle: 'technical', language: 'en' },
    } },
  ]);
  const feedback = value.editPayload.components[0].toJSON().components;
  assert.deepEqual(feedback.map(component => component.label), ['Membantu', 'Kurang pas']);
  assert.ok(feedback.every(component => component.custom_id.includes(USER)));
  assert.deepEqual(deps.releases, [GUILD]);
});

test('/hengs ask handles an owner community prompt without provider traffic', async () => {
  const deps = dependencies('home');
  const value = interaction({ subcommand: 'ask', prompt: 'Buatkan struktur server gaming' });
  value.guild = {
    ownerId: USER,
    channels: { cache: new Map([['1', { name: 'announcements' }]]) },
  };
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /Rancangan komunitas Hengs/i);
  assert.match(value.replyPayload.content, /#info-mabar/);
  assert.equal(deps.calls.some(call => call.chat), false);
  assert.equal(deps.calls.some(call => call.acquire), false);
});

test('/hengs ask enforces selected channel before consuming traffic', async () => {
  const deps = dependencies('public', config({ channelMode: 'current', channelId: CHANNEL }));
  const value = interaction({ subcommand: 'ask', channelId: '523456789012345678' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /channel yang dipilih/i);
  assert.equal(deps.calls.length, 0);
});

test('/hengs ask reports shared backpressure without calling AI', async () => {
  for (const [code, expected] of [
    ['PUBLIC_GUILD_BUSY', /menjawab pesan lain/i],
    ['PUBLIC_GUILD_RATE_LIMITED', /batas chat/i],
  ]) {
    const deps = dependencies('public');
    deps.publicTrafficGuard.acquire = () => ({ ok: false, code });
    const value = interaction({ subcommand: 'ask' });
    await hengs.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.match(value.replyPayload.content, expected);
    assert.deepEqual(deps.calls, [{ recordRejection: [GUILD, code] }]);
  }
});

test('/hengs ask enforces the persistent daily budget before calling AI', async () => {
  const deps = dependencies('public');
  deps.publicInsightsStore.claimAccepted = () => ({
    ok: false,
    code: 'PUBLIC_DAILY_LIMITED',
    used: 100,
    limit: 100,
  });
  const value = interaction({ subcommand: 'ask' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /batas harian/i);
  assert.deepEqual(deps.releases, [GUILD]);
  assert.equal(deps.calls.some(call => call.chat), false);
});

test('/hengs ask fails closed when the usage store cannot be written', async () => {
  const deps = dependencies('public');
  deps.publicInsightsStore.claimAccepted = () => { throw new Error('private path detail'); };
  const value = interaction({ subcommand: 'ask' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /tidak akan memakai layanan AI/i);
  assert.deepEqual(deps.releases, [GUILD]);
  assert.equal(deps.calls.some(call => call.chat), false);
  assert.deepEqual(deps.calls.at(-1), { log: '[public-insights] PUBLIC_INSIGHTS_WRITE_FAILED' });
});

test('/hengs ask releases admission and hides provider failures', async () => {
  const deps = dependencies('public');
  deps.agent.chat = async (prompt, key, context) => {
    deps.calls.push({ chat: { prompt, key, context } });
    throw new Error('private provider error');
  };
  const value = interaction({ subcommand: 'ask' });
  await hengs.execute(value, deps);
  assert.match(value.editPayload.content, /lagi error/i);
  assert.doesNotMatch(value.editPayload.content, /provider/i);
  assert.deepEqual(value.editPayload.allowedMentions, { parse: [] });
  assert.deepEqual(deps.releases, [GUILD]);
  assert.deepEqual(deps.calls.at(-1), { log: '[public-ai] PUBLIC_AI_FAILED' });
});

test('/hengs reset clears only the caller conversation key', async () => {
  const deps = dependencies('public');
  const value = interaction({ subcommand: 'reset' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.deepEqual(deps.calls, [
    { buildConversationKey: [GUILD, USER] },
    { clearHistory: `${GUILD}:${USER}` },
  ]);
  assert.match(value.replyPayload.content, /percakapanmu/i);
});

test('/hengs denies DM and pending AI actions without provider calls', async () => {
  for (const [value, kind] of [
    [interaction({ guild: false, subcommand: 'ask' }), 'dm'],
    [interaction({ subcommand: 'ask' }), 'pending'],
    [interaction({ subcommand: 'reset' }), 'denied'],
  ]) {
    const deps = dependencies(kind);
    await hengs.execute(value, deps);
    assertPrivate(value.replyPayload);
    assert.equal(deps.calls.length, 0);
  }
});

test('/hengs ask sends a natural announcement into the existing Ops Hub draft flow', async () => {
  const deps = dependencies('home');
  deps.agent.draftAnnouncement = async (brief, title) => {
    deps.calls.push({ draftAnnouncement: { brief, title } });
    return { title: 'Maintenance server', body: 'Server akan dipelihara.' };
  };
  deps.opsHub = {
    findSettingsChannel: () => '#bot-settings',
    async createDraftPanel(guild, input) {
      deps.calls.push({ createDraftPanel: { guild, input } });
      return { created: true, draft: { title: input.title } };
    },
  };
  const value = interaction({ subcommand: 'ask', prompt: 'Buat pengumuman maintenance server jam 20:00' });
  value.guild = { ownerId: USER };
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = USER;
  try {
    await hengs.execute(value, deps);
  } finally {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  }
  assert.equal(value.deferPayload.flags, MessageFlags.Ephemeral);
  assert.match(value.editPayload.content, /Maintenance server/);
  assert.deepEqual(deps.calls.map(call => Object.keys(call)[0]), [
    'draftAnnouncement',
    'createDraftPanel',
  ]);
  assert.equal(deps.calls[1].createDraftPanel.input.externalId, `prompt-ops:${value.id}`);
  assert.equal(deps.calls.some(call => call.chat), false);
});

test('/hengs ask sends a natural event into the existing Event Hub draft flow', async () => {
  const deps = dependencies('home');
  deps.opsHub = { findSettingsChannel: () => '#bot-settings' };
  deps.eventHub = {
    async createDraftPanel(guild, input) {
      deps.calls.push({ createEventDraft: { guild, input } });
      return { created: true, event: { title: input.title } };
    },
  };
  const value = interaction({ subcommand: 'ask', prompt: 'Buat event mabar jam 23:59' });
  value.guild = { ownerId: USER };
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = USER;
  try {
    await hengs.execute(value, deps);
  } finally {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  }
  assert.equal(value.deferPayload.flags, MessageFlags.Ephemeral);
  assert.match(value.editPayload.content, /Draft event/);
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].createEventDraft.input.externalId, `prompt-event:${value.id}`);
  assert.match(deps.calls[0].createEventDraft.input.startAt, /T/);
  assert.equal(deps.calls.some(call => call.chat), false);
});

test('/hengs ask shows a bounded operation status without creating or publishing anything', async () => {
  const deps = dependencies('home');
  deps.opsHub = {
    getStatus: () => ({ pending: 2, scheduled: 1, published: 4 }),
  };
  deps.eventHub = {
    getStatus: () => ({ draft: 1, upcoming: [{}], closed: 3 }),
  };
  const value = interaction({ subcommand: 'ask', prompt: 'lihat status draft' });
  value.guild = { ownerId: USER };
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = USER;
  try {
    await hengs.execute(value, deps);
  } finally {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  }
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /2 draft menunggu/);
  assert.match(value.replyPayload.content, /1 draft, 1 event aktif/);
  assert.equal(deps.calls.some(call => call.chat), false);
});
