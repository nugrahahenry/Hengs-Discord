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

test('/hengs exposes bounded ask, caller-only reset, and fixed help', () => {
  const json = hengs.data.toJSON();
  assert.equal(json.name, 'hengs');
  assert.equal(json.dm_permission, false);
  assert.deepEqual(json.options.map(option => option.name), ['ask', 'reset', 'help']);
  const prompt = json.options[0].options[0];
  assert.equal(prompt.required, true);
  assert.ok(prompt.max_length <= 1800);
  assert.deepEqual(json.options[1].options || [], []);
});

test('/hengs help guides pending guilds without starting or mutating anything', async () => {
  const deps = dependencies('pending');
  const value = interaction({ subcommand: 'help' });
  await hengs.execute(value, deps);
  assertPrivate(value.replyPayload);
  assert.match(value.replyPayload.content, /\/setup start/i);
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
    { buildConversationKey: [GUILD, USER] },
    { chat: {
      prompt: 'Explain queues',
      key: `${GUILD}:${USER}`,
      context: { kind: 'public', replyStyle: 'technical', language: 'en' },
    } },
  ]);
  assert.deepEqual(deps.releases, [GUILD]);
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
    assert.equal(deps.calls.length, 0);
  }
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
