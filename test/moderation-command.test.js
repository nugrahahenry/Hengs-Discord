const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modCommand = require('../src/commands/mod');

const OWNER_ID = '777777777777777777';
const MODERATOR_ID = '777777777777777778';
const OUTSIDER_ID = '777777777777777779';

function fakeHub({ moderators = [OWNER_ID, MODERATOR_ID], failure = null } = {}) {
  const calls = [];
  const invoke = async (method, args) => {
    calls.push({ method, args });
    if (failure) throw failure;
    return true;
  };
  return {
    calls,
    isModerator(interaction) {
      return moderators.includes(interaction.user.id);
    },
    showStatus(interaction) {
      return invoke('showStatus', [interaction]);
    },
    showIncidents(interaction, page) {
      return invoke('showIncidents', [interaction, page]);
    },
    showPreview(interaction) {
      return invoke('showPreview', [interaction]);
    },
    mutateAllowlist(interaction, kind, action, value) {
      return invoke('mutateAllowlist', [interaction, kind, action, value]);
    },
  };
}

function interaction({
  userId = OWNER_ID,
  guild = true,
  subcommand = 'status',
  group = null,
  strings = {},
  integers = {},
  roles = {},
  channels = {},
  deferred = false,
  replied = false,
} = {}) {
  return {
    user: { id: userId },
    guild: guild ? { id: '123456789012345678' } : null,
    guildId: guild ? '123456789012345678' : null,
    deferred,
    replied,
    inGuild: () => guild,
    options: {
      getSubcommand: () => subcommand,
      getSubcommandGroup: () => group,
      getString: name => strings[name] ?? null,
      getInteger: name => integers[name] ?? null,
      getRole: name => roles[name] ?? null,
      getChannel: name => channels[name] ?? null,
    },
    async reply(payload) {
      this.replyPayload = payload;
    },
    async editReply(payload) {
      this.editReplyPayload = payload;
    },
    async followUp(payload) {
      this.followUpPayload = payload;
    },
  };
}

function withOwner(t, ownerId = OWNER_ID) {
  const previous = process.env.OWNER_ID;
  process.env.OWNER_ID = ownerId;
  t.after(() => {
    if (previous === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previous;
  });
}

function assertPrivateSafeReply(payload) {
  assert.equal(payload.ephemeral, true);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
}

test('Anti-Raid runtime wiring starts recovery and intercepts messages and controls before AI commands', () => {
  const projectRoot = path.join(__dirname, '..');
  const indexSource = fs.readFileSync(path.join(projectRoot, 'src', 'index.js'), 'utf8');

  assert.match(indexSource, /require\('\.\/moderation\/hub'\)/);

  const readyStart = indexSource.indexOf('client.once(Events.ClientReady');
  const messageStart = indexSource.indexOf('client.on(Events.MessageCreate');
  const interactionStart = indexSource.indexOf('client.on(Events.InteractionCreate');
  const chatInputGuard = indexSource.indexOf('if (!interaction.isChatInputCommand()) return;', interactionStart);
  const modComponentRoute = indexSource.indexOf("interaction.customId.startsWith('mod:')", interactionStart);
  const mentionGuard = indexSource.indexOf('if (!msg.mentions.has(client.user)) return;', messageStart);
  const moderationMessage = indexSource.indexOf('await moderationHub.handleMessage(msg)', messageStart);

  assert.ok(readyStart >= 0);
  assert.ok(indexSource.indexOf('await moderationHub.start(c)', readyStart) > readyStart);
  assert.ok(messageStart > readyStart);
  assert.ok(moderationMessage > messageStart && moderationMessage < mentionGuard);
  assert.match(
    indexSource.slice(messageStart, mentionGuard),
    /const moderationMatched = await moderationHub\.handleMessage\(msg\);\s*if \(moderationMatched\) return;/,
  );
  assert.ok(interactionStart >= 0 && modComponentRoute > interactionStart);
  assert.ok(chatInputGuard > modComponentRoute);
  assert.match(indexSource, /await moderationHub\.handleComponent\(interaction\)/);
  assert.match(indexSource, /\bmoderationHub,\s*\n/);
  assert.match(indexSource, /const freeCommands = \[[^\]]*['"]mod['"][^\]]*\]/);
  assert.match(
    indexSource.slice(messageStart, mentionGuard),
    /catch \(error\) \{\s*console\.error\('\[moderation\] message failed:', \{ code: error\.code \|\| 'MESSAGE_FAILED' \}\);\s*\}/,
  );
});
test('/mod schema is guild-only, bounded, and has no default Administrator hint', () => {
  const data = modCommand.data.toJSON();

  assert.equal(data.name, 'mod');
  assert.equal(data.dm_permission, false);
  assert.equal(data.default_member_permissions, undefined);
  assert.deepEqual(data.options.map(option => option.name), ['status', 'incidents', 'preview', 'allow']);

  const incidents = data.options[1];
  assert.equal(incidents.type, 1);
  assert.deepEqual(incidents.options.map(option => ({
    name: option.name,
    type: option.type,
    required: option.required,
    min: option.min_value,
    max: option.max_value,
  })), [{ name: 'page', type: 4, required: false, min: 1, max: 50 }]);

  const allow = data.options[3];
  assert.equal(allow.type, 2);
  assert.deepEqual(allow.options.map(option => option.name), ['role', 'channel', 'domain']);
  for (const option of allow.options) {
    const action = option.options.find(item => item.name === 'action');
    assert.equal(action.type, 3);
    assert.equal(action.required, true);
    assert.deepEqual(action.choices.map(choice => ({ name: choice.name, value: choice.value })), [
      { name: 'Tambahkan', value: 'add' },
      { name: 'Hapus', value: 'remove' },
      { name: 'Lihat', value: 'list' },
    ]);
    const target = option.options.find(item => item.name === option.name);
    assert.equal(target.required, false);
  }
  const domain = allow.options.find(option => option.name === 'domain').options.find(option => option.name === 'domain');
  assert.equal(domain.type, 3);
  assert.equal(domain.min_length, 1);
  assert.equal(domain.max_length, 253);
});

test('/mod rejects DMs privately before accessing moderation services', async t => {
  withOwner(t);
  const hub = fakeHub();
  const commandInteraction = interaction({ guild: false });

  await modCommand.execute(commandInteraction, { moderationHub: hub });

  assertPrivateSafeReply(commandInteraction.replyPayload);
  assert.match(commandInteraction.replyPayload.content, /hanya tersedia di dalam server/i);
  assert.deepEqual(hub.calls, []);
});

test('/mod lets owner and configured moderator view status and bounded incidents', async t => {
  withOwner(t);
  const hub = fakeHub();
  const ownerStatus = interaction({ userId: OWNER_ID, subcommand: 'status' });
  const moderatorIncidents = interaction({
    userId: MODERATOR_ID,
    subcommand: 'incidents',
    integers: { page: 50 },
  });

  await modCommand.execute(ownerStatus, { moderationHub: hub });
  await modCommand.execute(moderatorIncidents, { moderationHub: hub });

  assert.deepEqual(hub.calls.map(call => [call.method, call.args.slice(1)]), [
    ['showStatus', []],
    ['showIncidents', [50]],
  ]);
  assert.equal(ownerStatus.replyPayload, undefined);
  assert.equal(moderatorIncidents.replyPayload, undefined);
});

test('/mod denies outsiders with a generic mention-safe ephemeral response', async t => {
  withOwner(t);
  const hub = fakeHub();
  const commandInteraction = interaction({ userId: OUTSIDER_ID, subcommand: 'status' });

  await modCommand.execute(commandInteraction, { moderationHub: hub });

  assertPrivateSafeReply(commandInteraction.replyPayload);
  assert.match(commandInteraction.replyPayload.content, /tidak dapat memakai kontrol moderasi/i);
  assert.doesNotMatch(commandInteraction.replyPayload.content, /owner|role|internal/i);
  assert.deepEqual(hub.calls, []);
});

test('/mod remains owner-only when no moderation role is configured', async t => {
  withOwner(t);
  const hub = fakeHub({ moderators: [OWNER_ID] });
  const commandInteraction = interaction({ userId: MODERATOR_ID, subcommand: 'incidents' });

  await modCommand.execute(commandInteraction, { moderationHub: hub });

  assertPrivateSafeReply(commandInteraction.replyPayload);
  assert.deepEqual(hub.calls, []);
});

test('/mod allow mutations are owner-only and delegate typed role, channel, and domain targets', async t => {
  withOwner(t);
  const hub = fakeHub();
  const moderator = interaction({
    userId: MODERATOR_ID,
    group: 'allow',
    subcommand: 'role',
    strings: { action: 'add' },
    roles: { role: { id: '123456789012345679' } },
  });
  const ownerRole = interaction({
    group: 'allow',
    subcommand: 'role',
    strings: { action: 'add' },
    roles: { role: { id: '123456789012345679' } },
  });
  const ownerChannel = interaction({
    group: 'allow',
    subcommand: 'channel',
    strings: { action: 'remove' },
    channels: { channel: { id: '123456789012345680' } },
  });
  const ownerDomain = interaction({
    group: 'allow',
    subcommand: 'domain',
    strings: { action: 'add', domain: 'HTTPS://Sub.Example.COM/' },
  });

  await modCommand.execute(moderator, { moderationHub: hub });
  await modCommand.execute(ownerRole, { moderationHub: hub });
  await modCommand.execute(ownerChannel, { moderationHub: hub });
  await modCommand.execute(ownerDomain, { moderationHub: hub });

  assertPrivateSafeReply(moderator.replyPayload);
  assert.match(moderator.replyPayload.content, /hanya tersedia untuk owner/i);
  assert.deepEqual(hub.calls.map(call => [call.method, ...call.args.slice(1)]), [
    ['mutateAllowlist', 'role', 'add', '123456789012345679'],
    ['mutateAllowlist', 'channel', 'remove', '123456789012345680'],
    ['mutateAllowlist', 'domain', 'add', 'HTTPS://Sub.Example.COM/'],
  ]);
});

test('/mod allow requires a target for add and remove but permits list without one', async t => {
  withOwner(t);
  const hub = fakeHub();
  const missingRole = interaction({
    group: 'allow',
    subcommand: 'role',
    strings: { action: 'add' },
  });
  const missingDomain = interaction({
    group: 'allow',
    subcommand: 'domain',
    strings: { action: 'remove' },
  });
  const listChannels = interaction({
    group: 'allow',
    subcommand: 'channel',
    strings: { action: 'list' },
    channels: { channel: { id: '123456789012345680' } },
  });

  await modCommand.execute(missingRole, { moderationHub: hub });
  await modCommand.execute(missingDomain, { moderationHub: hub });
  await modCommand.execute(listChannels, { moderationHub: hub });

  assertPrivateSafeReply(missingRole.replyPayload);
  assertPrivateSafeReply(missingDomain.replyPayload);
  assert.match(missingRole.replyPayload.content, /pilih role/i);
  assert.match(missingDomain.replyPayload.content, /isi domain/i);
  assert.deepEqual(hub.calls.map(call => [call.method, ...call.args.slice(1)]), [
    ['mutateAllowlist', 'channel', 'list', null],
  ]);
});

test('/mod sends safe hub failures through the valid deferred or replied response path', async t => {
  withOwner(t);
  const hub = fakeHub({ failure: new Error('RAW_INTERNAL_FAILURE') });
  const deferredInteraction = interaction({ deferred: true });
  const repliedInteraction = interaction({ replied: true });

  await modCommand.execute(deferredInteraction, { moderationHub: hub });
  await modCommand.execute(repliedInteraction, { moderationHub: hub });

  assert.equal(deferredInteraction.replyPayload, undefined);
  assert.deepEqual(deferredInteraction.editReplyPayload, {
    content: 'Kontrol moderasi sedang tidak tersedia.',
    allowedMentions: { parse: [] },
  });
  assert.equal(repliedInteraction.replyPayload, undefined);
  assertPrivateSafeReply(repliedInteraction.followUpPayload);
  assert.equal(repliedInteraction.followUpPayload.content, 'Kontrol moderasi sedang tidak tersedia.');
});
test('/mod rejects forged options and does not expose raw values or internal errors', async t => {
  withOwner(t);
  const hub = fakeHub({ failure: new Error('RAW_INTERNAL_FAILURE') });
  const forgedPage = interaction({ subcommand: 'incidents', integers: { page: 51 } });
  const forgedAction = interaction({
    group: 'allow',
    subcommand: 'domain',
    strings: { action: 'replace', domain: '@everyone RAW_DOMAIN_VALUE' },
  });
  const failedDomain = interaction({
    group: 'allow',
    subcommand: 'domain',
    strings: { action: 'add', domain: '@everyone RAW_DOMAIN_VALUE' },
  });

  await modCommand.execute(forgedPage, { moderationHub: hub });
  await modCommand.execute(forgedAction, { moderationHub: hub });
  await modCommand.execute(failedDomain, { moderationHub: hub });

  for (const commandInteraction of [forgedPage, forgedAction, failedDomain]) {
    assertPrivateSafeReply(commandInteraction.replyPayload);
    assert.doesNotMatch(commandInteraction.replyPayload.content, /RAW_INTERNAL_FAILURE|RAW_DOMAIN_VALUE|@everyone/);
  }
  assert.deepEqual(hub.calls.map(call => [call.method, ...call.args.slice(1)]), [
    ['mutateAllowlist', 'domain', 'add', '@everyone RAW_DOMAIN_VALUE'],
  ]);
});
test('/mod preview is owner-only and delegates only for the owner', async t => {
  withOwner(t);
  const hub = fakeHub();
  const owner = interaction({ userId: OWNER_ID, subcommand: 'preview' });
  const moderator = interaction({ userId: MODERATOR_ID, subcommand: 'preview' });

  await modCommand.execute(owner, { moderationHub: hub });
  await modCommand.execute(moderator, { moderationHub: hub });

  assert.deepEqual(hub.calls.map(call => call.method), ['showPreview']);
  assertPrivateSafeReply(moderator.replyPayload);
  assert.match(moderator.replyPayload.content, /hanya tersedia untuk owner/i);
});
