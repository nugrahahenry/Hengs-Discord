const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

const {
  buildPublicWelcome,
  findPublicWelcomeChannel,
  sendPublicGuildWelcome,
} = require('../src/guilds/public-onboarding');

const GUILD_ID = '223456789012345678';

function channel(name, { sendable = true, position = 0 } = {}) {
  return {
    name,
    position,
    isTextBased: () => true,
    permissionsFor: () => ({
      has(permission) {
        return sendable && [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ].includes(permission);
      },
    }),
    async send(payload) { this.sent = payload; },
  };
}

function guild({ system = null, channels = [] } = {}) {
  return {
    id: GUILD_ID,
    systemChannel: system,
    members: { me: { id: '323456789012345678' } },
    channels: { cache: new Map(channels.map((value, index) => [String(index), value])) },
  };
}

test('public welcome copy is fixed, mention-safe, and explains self-service setup', () => {
  const payload = buildPublicWelcome();
  assert.match(payload.content, /Hengs/i);
  assert.match(payload.content, /\/setup start/);
  assert.match(payload.content, /Mulai cepat/);
  assert.match(payload.content, /\/hengs ask/);
  assert.match(payload.content, /\/hengs help/);
  assert.match(payload.content, /\/hengs privacy/);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.doesNotMatch(payload.content, /Henry|\d{15,22}|[\u2013\u2014]/i);
});

test('public welcome channel prefers a writable system channel then a named fallback', () => {
  const system = channel('system');
  const general = channel('general', { position: 2 });
  assert.equal(findPublicWelcomeChannel(guild({ system, channels: [general] })), system);

  const blockedSystem = channel('system', { sendable: false });
  const random = channel('random', { position: 0 });
  assert.equal(
    findPublicWelcomeChannel(guild({ system: blockedSystem, channels: [random, general] })),
    general,
  );
});

test('guild create sends once only for a pending guild and logs fixed codes', async () => {
  const target = channel('general');
  const logs = [];
  const value = guild({ channels: [target] });
  const result = await sendPublicGuildWelcome(value, {
    guildAccess: { classify: () => ({ kind: 'pending' }) },
    logger: { info: value => logs.push(value), warn: value => logs.push(value) },
  });
  assert.deepEqual(result, { sent: true, code: 'PUBLIC_WELCOME_SENT' });
  assert.match(target.sent.content, /\/setup start/);
  assert.deepEqual(logs, ['[public-onboarding] PUBLIC_WELCOME_SENT']);

  for (const kind of ['home', 'public', 'denied']) {
    const untouched = channel('general');
    const skipped = await sendPublicGuildWelcome(guild({ channels: [untouched] }), {
      guildAccess: { classify: () => ({ kind }) },
      logger: { info() {}, warn() {} },
    });
    assert.equal(skipped.sent, false);
    assert.equal(untouched.sent, undefined);
  }
});

test('public welcome fails closed without a writable channel or when send fails', async () => {
  const logs = [];
  const noChannel = await sendPublicGuildWelcome(guild({ channels: [channel('x', { sendable: false })] }), {
    guildAccess: { classify: () => ({ kind: 'pending' }) },
    logger: { info() {}, warn: value => logs.push(value) },
  });
  assert.deepEqual(noChannel, { sent: false, code: 'PUBLIC_WELCOME_NO_CHANNEL' });

  const broken = channel('general');
  broken.send = async () => { throw new Error('private provider detail'); };
  const failed = await sendPublicGuildWelcome(guild({ channels: [broken] }), {
    guildAccess: { classify: () => ({ kind: 'pending' }) },
    logger: { info() {}, warn: value => logs.push(value) },
  });
  assert.deepEqual(failed, { sent: false, code: 'PUBLIC_WELCOME_FAILED' });
  assert.deepEqual(logs, [
    '[public-onboarding] PUBLIC_WELCOME_NO_CHANNEL',
    '[public-onboarding] PUBLIC_WELCOME_FAILED',
  ]);
});

test('public welcome fails closed when access or permission inspection throws', async () => {
  const logs = [];
  const brokenPermission = channel('general');
  brokenPermission.permissionsFor = () => { throw new Error('private permission detail'); };
  const noChannel = await sendPublicGuildWelcome(guild({ channels: [brokenPermission] }), {
    guildAccess: { classify: () => ({ kind: 'pending' }) },
    logger: { info() {}, warn: value => logs.push(value) },
  });
  assert.deepEqual(noChannel, { sent: false, code: 'PUBLIC_WELCOME_NO_CHANNEL' });

  const failed = await sendPublicGuildWelcome(guild({ channels: [channel('general')] }), {
    guildAccess: { classify: () => { throw new Error('private store detail'); } },
    logger: { info() {}, warn: value => logs.push(value) },
  });
  assert.deepEqual(failed, { sent: false, code: 'PUBLIC_WELCOME_FAILED' });
  assert.deepEqual(logs, [
    '[public-onboarding] PUBLIC_WELCOME_NO_CHANNEL',
    '[public-onboarding] PUBLIC_WELCOME_FAILED',
  ]);
});
