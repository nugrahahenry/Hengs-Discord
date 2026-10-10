const assert = require('node:assert/strict');
const test = require('node:test');

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  applyCommunityPlan,
  buildCommunityOperations,
  channelInventoryFingerprint,
  resetForTests,
} = require('../src/prompt-apply');

const GUILD = '223456789012345678';
const OWNER = '323456789012345678';

function guild(entries = [], { manage = true, create, sendWelcome = false } = {}) {
  const sent = [];
  const decorate = channel => (sendWelcome ? {
    ...channel,
    permissionsFor: () => ({
      has: permission => permission === PermissionFlagsBits.ViewChannel
        || permission === PermissionFlagsBits.SendMessages,
    }),
    async send(payload) { sent.push(payload); },
  } : channel);
  const channels = new Map(entries.map((entry, index) => [
    String(index), decorate({
      id: entry.id || `${823456789012345678 + index}`,
      name: entry.name,
      type: entry.type || ChannelType.GuildText,
      viewable: true,
    }),
  ]));
  const created = [];
  return {
    id: GUILD,
    ownerId: OWNER,
    channels: {
      cache: channels,
      async create(options) {
        if (create) return create(options, created);
        const channel = decorate({
          id: `${923456789012345678 + created.length}`,
          name: options.name,
          type: options.type,
          viewable: true,
        });
        created.push(options);
        channels.set(String(channels.size), channel);
        return channel;
      },
    },
    members: { me: { permissions: { has: permission => manage && permission === PermissionFlagsBits.ManageChannels } } },
    created,
    sent,
  };
}

test.afterEach(() => resetForTests());

test('buildCommunityOperations emits a category plus missing text and voice channels', () => {
  const target = guild([
    { name: 'announcements', type: ChannelType.GuildText },
    { name: 'ruang-tunggu', type: ChannelType.GuildVoice },
  ]);
  const operations = buildCommunityOperations({ guild: target, blueprintKeys: ['lobby'] });
  assert.equal(operations.some(operation => operation.name === 'announcements'), false);
  assert.equal(operations.some(operation => operation.name === 'ruang-tunggu'), false);
  assert.equal(operations.filter(operation => operation.kind === 'category').length, 1);
  assert.ok(operations.every(operation => ['category', 'text', 'voice'].includes(operation.kind)));
  assert.ok(operations.every(operation => operation.blueprintKey === 'lobby'));
});

test('applyCommunityPlan rechecks fingerprint and creates the bounded plan', async () => {
  const target = guild([{ name: 'announcements' }]);
  const fingerprint = channelInventoryFingerprint(target);
  const result = await applyCommunityPlan({
    guild: target,
    blueprintKeys: ['lobby'],
    expectedFingerprint: fingerprint,
  });
  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 7);
  assert.equal(target.created.length, 7);
  assert.equal(target.created.filter(item => item.type === ChannelType.GuildVoice).length, 1);
  assert.equal(target.created[0].type, ChannelType.GuildCategory);
  assert.ok(target.created.slice(1).every(item => item.parent));
});

test('emoji layout reuses a plain category and only creates missing channels under it', () => {
  const target = guild([{ id: '923456789012345678', name: 'LOBI MASUK', type: ChannelType.GuildCategory }]);
  const operations = buildCommunityOperations({ guild: target, blueprintKeys: ['lobby'], nameStyle: 'emoji' });
  assert.equal(operations.some(operation => operation.kind === 'category'), false);
  assert.ok(operations.every(operation => operation.categoryId === '923456789012345678'));
  assert.equal(operations.find(operation => operation.kind === 'text').name, '📢・announcements');
});

test('apply plan creates only the selected bounded text and voice slots', async () => {
  const target = guild([]);
  const fingerprint = channelInventoryFingerprint(target);
  const result = await applyCommunityPlan({
    guild: target,
    blueprintKeys: ['lobby', 'gaming'],
    selection: { textMode: 'essential', voiceCount: 2 },
    expectedFingerprint: fingerprint,
  });
  assert.equal(result.ok, true);
  assert.equal(target.created.filter(item => item.type === ChannelType.GuildVoice).length, 2);
  assert.equal(target.created.filter(item => item.type === ChannelType.GuildText).length, 5);
  assert.equal(target.created.some(item => item.name === 'galeri-roblox'), false);
});

test('custom revisions create requested names without renaming existing channels', () => {
  const target = guild([{ id: '923456789012345678', name: 'AREA GAMING', type: ChannelType.GuildCategory }]);
  const operations = buildCommunityOperations({
    guild: target,
    blueprintKeys: ['lobby', 'gaming'],
    nameStyle: 'plain',
    customization: {
      categoryNames: { gaming: 'TEMPAT MABAR' },
      channelNames: { 'gaming:text:0': 'nongkrong' },
      welcomeCopy: 'Halo gaes',
    },
  });
  assert.equal(operations.some(operation => operation.name === 'AREA GAMING'), false);
  assert.equal(operations.some(operation => operation.name === 'TEMPAT MABAR'), false);
  assert.equal(operations.some(operation => operation.name === 'nongkrong'), true);
  assert.equal(operations.some(operation => operation.name === 'ngobrol-santai'), false);
});

test('applyCommunityPlan posts a custom welcome once after creating the lobby', async () => {
  const target = guild([], { sendWelcome: true });
  const saved = [];
  const result = await applyCommunityPlan({
    guild: target,
    blueprintKeys: ['lobby'],
    customization: { welcomeCopy: 'Halo gaes, selamat datang!' },
    welcomeCopyStore: { set: value => saved.push(value) },
    expectedFingerprint: channelInventoryFingerprint(target),
  });
  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 8);
  assert.equal(result.welcomeSent, true);
  assert.deepEqual(target.sent, [{
    content: 'Halo gaes, selamat datang!',
    allowedMentions: { parse: [] },
  }]);
  assert.deepEqual(saved, [{ guildId: GUILD, welcomeCopy: 'Halo gaes, selamat datang!' }]);
});

test('custom welcome fails closed when the target cannot receive messages', async () => {
  const target = guild([]);
  const result = await applyCommunityPlan({
    guild: target,
    blueprintKeys: ['lobby'],
    customization: { welcomeCopy: 'Halo gaes' },
    expectedFingerprint: channelInventoryFingerprint(target),
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'PROMPT_APPLY_WELCOME_PERMISSION',
    createdCount: 8,
  });
});

test('applyCommunityPlan fails closed for drift, missing permission, and provider failure', async () => {
  const drifted = guild([{ name: 'announcements' }]);
  const drift = await applyCommunityPlan({
    guild: drifted,
    blueprintKeys: ['lobby'],
    expectedFingerprint: '0'.repeat(64),
  });
  assert.deepEqual(drift, { ok: false, code: 'PROMPT_APPLY_DRIFT' });

  const denied = guild([{ name: 'announcements' }], { manage: false });
  const deniedResult = await applyCommunityPlan({
    guild: denied,
    blueprintKeys: ['lobby'],
    expectedFingerprint: channelInventoryFingerprint(denied),
  });
  assert.deepEqual(deniedResult, { ok: false, code: 'PROMPT_APPLY_PERMISSION' });

  const failed = guild([{ name: 'announcements' }], {
    create: async (_options, created) => {
      created.push({});
      throw new Error('provider detail must not escape');
    },
  });
  const failure = await applyCommunityPlan({
    guild: failed,
    blueprintKeys: ['lobby'],
    expectedFingerprint: channelInventoryFingerprint(failed),
  });
  assert.deepEqual(failure, { ok: false, code: 'PROMPT_APPLY_FAILED', createdCount: 0 });
});
