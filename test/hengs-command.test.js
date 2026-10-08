const assert = require('node:assert/strict');
const test = require('node:test');
const { MessageFlags } = require('discord.js');

const hengs = require('../src/commands/hengs');
const crypto = require('node:crypto');

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
    async editReply(payload) {
      this.editPayloads = this.editPayloads || [];
      this.editPayloads.push(payload);
      this.editPayload = payload;
      this.replied = true;
    },
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

test('Canox memory admits only configured home owner and stays ephemeral through save/recall', async (t) => {
  const names = ['OWNER_ID', 'DISCORD_GUILD_ID', 'HENGS_MEMORY_ENABLED', 'CANOX_MEMORY_URL', 'CANOX_MEMORY_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const fetchBefore = globalThis.fetch;
  t.after(() => { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } globalThis.fetch = fetchBefore; });
  const capability = crypto.randomBytes(32).toString('hex');
  Object.assign(process.env, { OWNER_ID: USER, DISCORD_GUILD_ID: GUILD, HENGS_MEMORY_ENABLED: '1',
    CANOX_MEMORY_URL: 'http://127.0.0.1/integrations/hengs/memory', CANOX_MEMORY_TOKEN: capability });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, body: options.body ? JSON.parse(options.body) : null });
    return new Response(JSON.stringify(url.endsWith('/change')
      ? { schema_version: 1, ok: true, item: { id: 'abcdef123456', revision: 1, enabled: true } }
      : { schema_version: 1, ok: true, etag: 'a'.repeat(64), preferences: {}, knowledge: [] }));
  };
  const deps = dependencies('home');
  const preview = interaction({ subcommand: 'ask', prompt: 'ingat: materi gradient descent' });
  await hengs.execute(preview, deps);
  assert.equal(preview.deferPayload.flags, MessageFlags.Ephemeral);
  assert.match(preview.editPayload.content, /provider AI/);
  assert.equal(calls.length, 0);
  const confirm = interaction({ subcommand: 'ask', prompt: 'oke simpan ingatan' });
  await hengs.execute(confirm, deps);
  assert.match(confirm.editPayload.content, /tersimpan/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.operation, 'create');
  const ask = interaction({ subcommand: 'ask', prompt: 'jelaskan gradient descent' });
  await hengs.execute(ask, deps);
  assert.equal(ask.deferPayload.flags, MessageFlags.Ephemeral);
  assert.deepEqual(calls.slice(1).map(call => call.path), ['/integrations/hengs/memory/recall', '/integrations/hengs/memory/revision']);
  const other = interaction({ subcommand: 'ask', prompt: 'ingat: materi lain' });
  other.user.id = '923456789012345678';
  other.guild = { ownerId: other.user.id };
  await hengs.execute(other, deps);
  assertPrivate(other.replyPayload);
  assert.match(other.replyPayload.content, /hanya tersedia untuk owner/);
  const publicAsk = interaction({ subcommand: 'ask', prompt: 'ingat: materi publik' });
  await hengs.execute(publicAsk, dependencies('public'));
  assert.match(publicAsk.replyPayload.content, /hanya tersedia untuk owner/);
  assert.equal(calls.length, 3);
});

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
    assert.match(value.replyPayload.content, /64.*24 pesan/i);
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
  assert.match(value.editPayloads[0].content, /sedang menyusun jawaban/i);
  assert.equal(value.editPayload.content, '@everyone jawaban aman');
  assert.deepEqual(value.editPayload.allowedMentions, { parse: [] });
  assert.deepEqual(deps.calls, [
    { acquire: GUILD },
    { claimAccepted: GUILD },
    { buildConversationKey: [GUILD, USER] },
    { chat: {
      prompt: 'Explain queues',
      key: `${GUILD}:${USER}`,
      context: { kind: 'public', visibility: 'shared', replyStyle: 'technical', language: 'en' },
    } },
  ]);
  const feedback = value.editPayload.components[0].toJSON().components;
  assert.deepEqual(feedback.map(component => component.label), ['Membantu', 'Kurang pas']);
  assert.ok(feedback.every(component => component.custom_id.includes(USER)));
  assert.deepEqual(deps.releases, [GUILD]);
});

test('/hengs ask keeps home-guild AI conversation private', async () => {
  const deps = dependencies('home');
  const value = interaction({ subcommand: 'ask', prompt: 'Bantu aku memahami queue' });
  await hengs.execute(value, deps);
  assert.equal(value.deferPayload.flags, MessageFlags.Ephemeral);
  assert.match(value.editPayloads[0].content, /sedang menyusun jawaban/i);
  assert.equal(value.editPayload.content, '@everyone jawaban aman');
  assert.deepEqual(value.editPayload.allowedMentions, { parse: [] });
  assert.deepEqual(deps.calls, [
    { buildConversationKey: [GUILD, USER] },
    { chat: {
      prompt: 'Bantu aku memahami queue',
      key: `${GUILD}:${USER}`,
      context: { kind: 'home', visibility: 'private' },
    } },
  ]);
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

test('/hengs ask routes ordinary continuation to AI instead of a personal feature menu', async () => {
  const deps = dependencies('home');
  const value = interaction({ subcommand: 'ask', prompt: 'ada lagi?' });
  value.guild = { ownerId: USER };
  await hengs.execute(value, deps);
  assert.equal(deps.calls.some(call => call.chat), true);
});

test('/hengs ask resumes missing time and note confirmation through the real command wiring', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-08T08:00:00Z'));
  const notes = [];
  const reminders = [];
  const store = { scopeKey: (guildId, userId) => `${guildId}:${userId}`,
    addNote: ({ text }) => { notes.push(text); return { ok: true, item: { id: 'note-0001' } }; },
    addReminder: ({ text }) => { reminders.push(text); return { ok: true, item: { text } }; } };
  const deps = dependencies('home');
  deps.personalAssistant = require('../src/personal-assistant').createPersonalAssistant({ store });
  for (const prompt of ['ingatkan aku bayar listrik', 'jam 9 malam', 'catat beli kabel', 'oke catat']) {
    const value = interaction({ subcommand: 'ask', prompt });
    value.guild = { ownerId: USER };
    await hengs.execute(value, deps);
    assert.equal(value.deferPayload.flags, MessageFlags.Ephemeral);
  }
  assert.deepEqual(reminders, ['bayar listrik']);
  assert.deepEqual(notes, ['beli kabel']);
  assert.equal(deps.calls.some(call => call.chat), false);
});

test('private feature receipts are recorded only after delivery and a reset invalidates the lease', async () => {
  const deps = dependencies('home');
  const receipts = [];
  let active = true;
  deps.agent.createConversationLease = () => ({ recordFeature: (family, code) => {
    if (active) receipts.push({ family, code });
  } });
  deps.personalAssistant = { canContinue: () => false,
    handle: async () => ({ intent: { kind: 'note_add' }, reply: 'PRIVATE_NOTE_BODY', contextFamily: 'notes', contextCode: 'SAVED' }) };
  const value = interaction({ subcommand: 'ask', prompt: 'catat PRIVATE_NOTE_BODY' });
  value.guild = { ownerId: USER };
  await hengs.execute(value, deps);
  assert.deepEqual(receipts, [{ family: 'notes', code: 'SAVED' }]);
  assert.doesNotMatch(JSON.stringify(receipts), /PRIVATE_NOTE_BODY/);
  receipts.length = 0;
  const cleared = interaction({ subcommand: 'ask', prompt: 'catat PRIVATE_NOTE_BODY' });
  cleared.guild = { ownerId: USER };
  cleared.editReply = async () => { active = false; };
  await hengs.execute(cleared, deps);
  assert.deepEqual(receipts, []);
});

test('pending personal state is never inspected by public or non-manager callers', async () => {
  for (const kind of ['home', 'public']) {
    const deps = dependencies(kind);
    deps.personalAssistant = { canContinue: () => { throw new Error('MUST_NOT_INSPECT'); } };
    const value = interaction({ subcommand: 'ask', prompt: 'jam 9 malam' });
    value.guild = { ownerId: '523456789012345678' };
    await hengs.execute(value, deps);
    assert.equal(deps.calls.some(call => call.chat), true);
  }
});

test('a personal result completed after reset does not send its stale body or claim undo', async () => {
  const deps = dependencies('home');
  let current = true;
  deps.agent.createConversationLease = () => ({ isCurrent: () => current,
    recordFeature: () => { throw new Error('MUST_NOT_RECORD'); } });
  deps.personalAssistant = { canContinue: () => false, handle: async () => {
    current = false;
    return { reply: 'STALE_PRIVATE_BODY', contextFamily: 'notes', contextCode: 'SAVED' };
  } };
  const value = interaction({ subcommand: 'ask', prompt: 'catat STALE_PRIVATE_BODY' });
  value.guild = { ownerId: USER };
  await hengs.execute(value, deps);
  assert.match(value.editPayload.content, /direset.*reset bukan undo/);
  assert.doesNotMatch(value.editPayload.content, /STALE_PRIVATE_BODY/);
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

test('/hengs ask keeps personal notes ephemeral and delegates to the fixed assistant', async () => {
  const deps = dependencies('home');
  deps.personalAssistant = {
    async handle(prompt, scope) {
      deps.calls.push({ personal: { prompt, scope } });
      return { reply: '✅ Sudah dicatat sebagai note-0001.' };
    },
  };
  const value = interaction({ subcommand: 'ask', prompt: 'catat daftar tugas' });
  value.guild = { ownerId: USER };
  await hengs.execute(value, deps);
  assert.equal(value.deferPayload.flags, MessageFlags.Ephemeral);
  assert.equal(value.editPayload.content, '✅ Sudah dicatat sebagai note-0001.');
  assert.deepEqual(deps.calls, [{ personal: { prompt: 'catat daftar tugas', scope: { guildId: GUILD, userId: USER } } }]);
});
