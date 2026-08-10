const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const OWNER_ID = '570152798126342144';
const MODERATOR_ROLE_ID = '800000000000000001';
const GUILD_ID = '111111111111111111';
const TARGET_ID = '222222222222222222';
const BOT_ID = '333333333333333333';
const MOD_LOG_ID = '444444444444444444';

const SENTINEL_CONTENT = 'private-content-sentinel-7d52';
const SENTINEL_DOMAIN = 'private-domain-sentinel.example';
const SENTINEL_URL = `https://${SENTINEL_DOMAIN}/private-path`;
const SENTINEL_FILENAME = 'private-file-sentinel.png';
const SENTINEL_ERROR = 'private-error-sentinel-5aa1';

const runtimeModules = [
  '../src/moderation/hub',
  '../src/moderation/policy',
  '../src/moderation/tracker',
  '../src/moderation/store',
  '../src/moderation/enforcer',
];

function permissions(names = []) {
  const allowed = new Set(names);
  return {
    has(value) {
      return allowed.has(value) || allowed.has('ViewChannel') || allowed.has('BanMembers') || allowed.has('ManageMessages');
    },
  };
}

function message(id, overrides = {}) {
  return {
    id,
    guildId: GUILD_ID,
    channelId: '555555555555555555',
    createdTimestamp: 1_000_000,
    content: `blocked link ${SENTINEL_URL}`,
    author: { id: TARGET_ID, bot: false },
    member: { id: TARGET_ID, user: { id: TARGET_ID, bot: false }, roles: { cache: new Map() } },
    attachments: new Map(),
    ...overrides,
  };
}

function footerText(payload) {
  const embed = payload.embeds?.[0];
  const json = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
  return String(json?.footer?.text || '');
}

function fakeModLog({ publicChannel = false, sendFailures = 0, acceptThenThrow = false } = {}) {
  const sent = [];
  const messages = new Map();
  let nextId = 0;
  let failures = sendFailures;
  return {
    id: MOD_LOG_ID,
    name: 'moderation-log',
    sent,
    isTextBased: () => true,
    permissionsFor(holder) {
      return {
        has(value) {
          if (holder?.id === BOT_ID) {
            return ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory'].includes(String(value));
          }
          if (value === 'ViewChannel') return publicChannel;
          return false;
        },
      };
    },
    async send(payload) {
      if (failures > 0) {
        failures -= 1;
        throw new Error(SENTINEL_ERROR);
      }
      const stored = {
        id: String(666666666666666660 + (++nextId)),
        author: { id: BOT_ID },
        embeds: [{ footer: { text: footerText(payload) } }],
        payload,
      };
      sent.push(stored);
      messages.set(stored.id, stored);
      if (acceptThenThrow) throw new Error(SENTINEL_ERROR);
      return stored;
    },
    messages: {
      async fetch(value) {
        if (typeof value === 'object') return new Map(messages);
        return messages.get(String(value)) || null;
      },
    },
  };
}

function fakeGuild(channel, options = {}) {
  const target = {
    id: TARGET_ID,
    user: { id: TARGET_ID, bot: false },
    bannable: true,
    manageable: true,
    roles: { cache: new Map(), highest: { comparePositionTo: () => 1 } },
  };
  const bot = {
    id: BOT_ID,
    permissions: permissions(['BanMembers', 'ManageMessages']),
    roles: { highest: { comparePositionTo: () => 1 } },
  };
  const state = { bans: 0, banFetches: 0, memberFetches: 0 };
  const cache = new Map();
  if (channel) cache.set(channel.id, channel);
  for (const extra of options.extraChannels || []) cache.set(extra.id, extra);
  let cacheLookups = 0;
  const channelCache = {
    get(id) {
      cacheLookups += 1;
      if (cacheLookups > (options.hideModLogAfterCacheLookups ?? Infinity)) return null;
      return cache.get(String(id)) || null;
    },
  };
  return {
    id: GUILD_ID,
    roles: { everyone: { id: GUILD_ID } },
    channels: {
      cache: channelCache,
      async fetch(id) {
        if (options.channelFetchGate) await options.channelFetchGate;
        return cache.get(String(id)) || null;
      },
    },
    members: {
      me: bot,
      async fetch(id) {
        if (String(id) === TARGET_ID) {
          state.memberFetches += 1;
          if (options.memberFetchGate) await options.memberFetchGate;
          if (options.targetMissing) throw new Error('Unknown Member');
          return target;
        }
        return null;
      },
      async fetchMe() { return bot; },
      async ban() {
        state.bans += 1;
        if (options.banFails) throw new Error('ban failed');
      },
    },
    bans: {
      async fetch() {
        state.banFetches += 1;
        if (options.alreadyBanned) return { user: { id: TARGET_ID } };
        throw new Error('Unknown Ban');
      },
    },
    state,
  };
}

function fakeInteraction(customId, {
  userId = OWNER_ID,
  roleIds = [],
  button = true,
  guild = undefined,
} = {}) {
  return {
    customId,
    user: { id: userId },
    guildId: GUILD_ID,
    guild,
    member: { roles: { cache: new Map(roleIds.map(id => [id, {}])) } },
    isButton: () => button,
    isModalSubmit: () => false,
    async reply(payload) { this.lastReply = payload; },
    async followUp(payload) { this.lastReply = payload; },
    async update(payload) { this.lastUpdate = payload; },
  };
}

function loadRuntime(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-moderation-hub-'));
  const environment = {
    MODERATION_DATA_DIR: directory,
    OWNER_ID,
    MOD_LOG_CHANNEL_ID: MOD_LOG_ID,
    MODERATION_ROLE_IDS: MODERATOR_ROLE_ID,
    ANTI_RAID_MODE: 'active',
    ANTI_RAID_BLOCKED_DOMAINS: SENTINEL_DOMAIN,
    ...overrides,
  };
  const previous = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  for (const modulePath of runtimeModules) delete require.cache[require.resolve(modulePath)];
  const hub = require('../src/moderation/hub');
  const store = require('../src/moderation/store');
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { hub, store, directory };
}

function incidentInput(index = 1) {
  return {
    guildId: GUILD_ID,
    memberId: TARGET_ID,
    detectionWindowStartMs: 10_000 + index,
    trigger: 'BLOCKED_DOMAIN',
    messageCount: 1,
    channelCount: 1,
  };
}

function monitorResult(issueCode = null) {
  return {
    status: 'monitor',
    banSucceeded: false,
    deletionSucceeded: false,
    deletedCount: 0,
    issueCode,
  };
}

async function waitFor(condition, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (condition()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for the test synchronization point.');
}


test('exempt and non-matching messages are not claimed by moderation', async t => {
  const { hub, store } = loadRuntime(t);
  const guild = fakeGuild(fakeModLog());

  assert.equal(await hub.handleMessage(message('700000000000000001', { guild, author: { id: TARGET_ID, bot: true } })), false);
  assert.equal(await hub.handleMessage(message('700000000000000002', { guild, content: 'ordinary discussion' })), false);
  assert.equal(store.listIncidents().length, 0);
});

test('corrupt moderation state fails closed before a non-exempt message can reach AI', async t => {
  const { hub, directory } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);
  fs.writeFileSync(path.join(directory, 'moderation-state.json'), '{', 'utf8');
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(JSON.stringify(values));
  try {
    assert.equal(await hub.handleMessage(message('700000000000000092', { guild })), true);
    assert.equal(await hub.handleMessage(message('700000000000000093', {
      guild,
      author: { id: OWNER_ID, bot: false },
      member: { id: OWNER_ID, user: { id: OWNER_ID, bot: false }, roles: { cache: new Map() } },
    })), false);
  } finally {
    console.error = originalError;
  }
  assert.equal(guild.state.bans, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /STATE_UNAVAILABLE/);
  assert.doesNotMatch(logs[0], /moderation-state|ENOENT|SyntaxError/);
});
test('a monitor match is persisted and panelled without an enforcement write', async t => {
  const { hub, store } = loadRuntime(t, { ANTI_RAID_MODE: 'monitor' });
  const channel = fakeModLog();
  const guild = fakeGuild(channel);

  assert.equal(await hub.handleMessage(message('700000000000000003', { guild })), true);

  const [incident] = store.listIncidents();
  assert.equal(incident.status, 'monitor');
  assert.equal(incident.result.status, 'monitor');
  assert.equal(guild.state.bans, 0);
  assert.equal(channel.sent.length, 1);
});

test('an active match claims, enforces, finalizes, and panels exactly one incident', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);

  assert.equal(await hub.handleMessage(message('700000000000000004', { guild })), true);

  const [incident] = store.listIncidents();
  assert.equal(incident.status, 'banned');
  assert.equal(incident.result.status, 'banned');
  assert.ok(incident.panel);
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
});

test('a matched raid remains handled when downstream persistence fails and logs only a fixed code', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);
  const originalCreate = store.createOrGetIncident;
  const originalError = console.error;
  const logs = [];
  store.createOrGetIncident = () => {
    throw new Error(SENTINEL_ERROR);
  };
  console.error = (...values) => logs.push(JSON.stringify(values));
  try {
    assert.equal(await hub.handleMessage(message('700000000000000009', { guild })), true);
  } finally {
    store.createOrGetIncident = originalCreate;
    console.error = originalError;
  }

  assert.equal(logs.length, 1);
  assert.match(logs[0], /MATCHED_INCIDENT_FAILED/);
  assert.doesNotMatch(logs[0], new RegExp(SENTINEL_ERROR));
});

test('enforcement rereads mode and allowlist after the incident claim', async t => {
  for (const scenario of [
    {
      name: 'mode switched off',
      change(store) {
        store.setMode('off', OWNER_ID, store.getMode().revision);
      },
    },
    {
      name: 'message channel allowlisted',
      change(store) {
        store.mutateAllowlist('channel', 'add', '555555555555555555', OWNER_ID, store.getMode().revision);
      },
    },
  ]) {
    await t.test(scenario.name, async subtest => {
      const { hub, store } = loadRuntime(subtest);
      let releaseRefresh;
      const channelFetchGate = new Promise(resolve => { releaseRefresh = resolve; });
      const channel = fakeModLog();
      const guild = fakeGuild(channel, {
        hideModLogAfterCacheLookups: 1,
        channelFetchGate,
      });
      const handling = hub.handleMessage(message('700000000000000010', { guild }));

      await waitFor(() => store.listIncidents()[0]?.status === 'enforcing');
      scenario.change(store);
      releaseRefresh();
      await handling;

      const [incident] = store.listIncidents();
      assert.equal(incident.status, 'monitor');
      assert.equal(guild.state.bans, 0);
      assert.equal(channel.sent.length, 1);
    });
  }
});

test('concurrent matches for one window share one claim, enforcement, and card', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);
  const first = message('700000000000000005', { guild, createdTimestamp: 1_020_000 });
  const second = message('700000000000000006', { guild, createdTimestamp: 1_020_001 });

  await Promise.all([hub.handleMessage(first), hub.handleMessage(second)]);

  assert.equal(store.listIncidents().length, 1);
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
});

test('cards and queues disable mentions and exclude content, domains, URLs, filenames, and errors', t => {
  const { hub, directory } = loadRuntime(t);
  const incident = {
    id: '0123456789abcdef',
    guildId: GUILD_ID,
    memberId: TARGET_ID,
    revision: 2,
    status: 'failed',
    trigger: 'BLOCKED_DOMAIN',
    messageCount: 5,
    channelCount: 2,
    createdAt: new Date(1_000_000).toISOString(),
    finalizedAt: new Date(1_001_000).toISOString(),
    result: { status: 'failed', banSucceeded: false, deletionSucceeded: false, deletedCount: 0, issueCode: 'BAN_FAILED' },
    content: SENTINEL_CONTENT,
    domain: SENTINEL_DOMAIN,
    url: SENTINEL_URL,
    filename: SENTINEL_FILENAME,
    error: SENTINEL_ERROR,
  };

  const card = hub.buildIncidentCard(incident);
  const queue = hub.buildIncidentQueue([incident], 99);
  const serialized = JSON.stringify({ card, queue, statePath: directory });
  for (const secret of [SENTINEL_CONTENT, SENTINEL_DOMAIN, SENTINEL_URL, SENTINEL_FILENAME, SENTINEL_ERROR]) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
  assert.deepEqual(card.allowedMentions, { parse: [] });
  assert.match(serialized, /Ban berhasil/);
  assert.match(serialized, /Penghapusan berhasil/);
  assert.deepEqual(queue.payload.allowedMentions, { parse: [] });
  assert.equal(queue.page, 0);
  assert.equal(queue.totalPages, 1);
});

test('missing, public, and wrong configured mod logs fail closed without a fallback card or ban', async t => {
  for (const scenario of [
    { name: 'missing', env: { MOD_LOG_CHANNEL_ID: '' }, channel: null },
    { name: 'public', env: {}, channel: fakeModLog({ publicChannel: true }) },
    { name: 'wrong', env: { MOD_LOG_CHANNEL_ID: '999999999999999999' }, channel: fakeModLog() },
  ]) {
    await t.test(scenario.name, async subtest => {
      const { hub, store } = loadRuntime(subtest, scenario.env);
      const fallback = scenario.channel || fakeModLog();
      const guild = fakeGuild(fallback);
      assert.equal(await hub.handleMessage(message(`7100000000000000${scenario.name.length}`, { guild })), true);
      const [incident] = store.listIncidents();
      assert.equal(incident.status, 'monitor');
      assert.equal(guild.state.bans, 0);
      assert.equal(fallback.sent.length, 0);
    });
  }
});

test('an ambiguous card send is recovered by the fixed incident footer marker', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog({ acceptThenThrow: true });
  const guild = fakeGuild(channel);

  await hub.handleMessage(message('700000000000000007', { guild }));

  const [incident] = store.listIncidents();
  assert.equal(channel.sent.length, 1);
  assert.equal(incident.panel.messageId, channel.sent[0].id);
  assert.match(footerText(channel.sent[0].payload), new RegExp(`Incident ID: ${incident.id}`));
});

test('a live incident schedules idempotent panel maintenance after delivery fails', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog({ sendFailures: 2 });
  const guild = fakeGuild(channel);
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };
  await hub.start(client, { panelRetryDelayMs: 10 });

  assert.equal(await hub.handleMessage(message('700000000000000094', { guild, client })), true);
  await new Promise(resolve => setTimeout(resolve, 80));

  const [incident] = store.listIncidents();
  assert.ok(incident.panel);
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
});
test('startup claims and recovers an incident left detected before enforcement', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);
  store.createOrGetIncident(incidentInput());
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };

  const summary = await hub.start(client, { disableTimer: true });

  const [incident] = store.listIncidents();
  assert.equal(incident.status, 'banned');
  assert.ok(incident.panel);
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
  assert.equal(summary.retried, 1);
});
test('startup finalizes an already-banned enforcing incident without a duplicate ban', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel, { targetMissing: true, alreadyBanned: true });
  const incident = store.createOrGetIncident(incidentInput()).incident;
  store.claimEnforcement(incident.id, incident.revision);

  await hub.start({ guilds: { cache: new Map([[guild.id, guild]]) } }, { disableTimer: true });

  const current = store.listIncidents()[0];
  assert.equal(current.status, 'banned');
  assert.equal(guild.state.bans, 0);
  assert.equal(channel.sent.length, 1);
});

test('startup performs one bounded enforcement retry when an enforcing member is not banned', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog();
  const guild = fakeGuild(channel);
  const incident = store.createOrGetIncident(incidentInput()).incident;
  store.claimEnforcement(incident.id, incident.revision);
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };

  await hub.start(client, { disableTimer: true });
  await hub.start(client, { disableTimer: true });

  assert.equal(store.listIncidents()[0].status, 'banned');
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
});

test('concurrent startup recovery shares one enforcement flight and one panel', async t => {
  const { hub, store } = loadRuntime(t);
  let releaseFetch;
  const memberFetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const channel = fakeModLog();
  const guild = fakeGuild(channel, { memberFetchGate });
  const incident = store.createOrGetIncident(incidentInput()).incident;
  store.claimEnforcement(incident.id, incident.revision);
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };

  const first = hub.start(client, { disableTimer: true });
  await waitFor(() => guild.state.memberFetches === 1);
  const second = hub.start(client, { disableTimer: true });
  setTimeout(releaseFetch, 10);
  await Promise.all([first, second]);

  assert.equal(store.listIncidents()[0].status, 'banned');
  assert.equal(guild.state.bans, 1);
  assert.equal(channel.sent.length, 1);
});

test('startup restores a completed panel exactly once and cancels an obsolete retry timer on reconnect', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog({ sendFailures: 1 });
  const guild = fakeGuild(channel);
  const incident = store.createOrGetIncident(incidentInput()).incident;
  const claimed = store.claimEnforcement(incident.id, incident.revision).incident;
  store.finalizeIncident(claimed.id, monitorResult(), claimed.revision);
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };

  await hub.start(client, { panelRetryDelayMs: 15 });
  await hub.start(client, { panelRetryDelayMs: 15 });
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.ok(store.listIncidents()[0].panel);
  assert.equal(channel.sent.length, 1);
});

test('panel maintenance keeps retrying until a private card is persisted', async t => {
  const { hub, store } = loadRuntime(t);
  const channel = fakeModLog({ sendFailures: 2 });
  const guild = fakeGuild(channel);
  const incident = store.createOrGetIncident(incidentInput()).incident;
  const claimed = store.claimEnforcement(incident.id, incident.revision).incident;
  store.finalizeIncident(claimed.id, monitorResult(), claimed.revision);
  const client = { guilds: { cache: new Map([[guild.id, guild]]) } };

  await hub.start(client, { panelRetryDelayMs: 10 });
  await new Promise(resolve => setTimeout(resolve, 80));

  assert.ok(store.listIncidents()[0].panel);
  assert.equal(channel.sent.length, 1);
});
test('mode controls are owner-only while moderators retain read-only status access', async t => {
  const { hub, store } = loadRuntime(t);
  const moderatorStatus = fakeInteraction('', {
    userId: '777777777777777778',
    roleIds: [MODERATOR_ROLE_ID],
  });
  await hub.showStatus(moderatorStatus);
  assert.deepEqual(moderatorStatus.lastReply.components, []);

  const moderator = fakeInteraction('mod:mode:0:monitor', {
    userId: '777777777777777778',
    roleIds: [MODERATOR_ROLE_ID],
  });
  await hub.handleComponent(moderator);
  assert.equal(store.getMode().mode, 'active');
  assert.match(moderator.lastReply.content, /tidak valid|tidak tersedia/i);

  const owner = fakeInteraction('mod:mode:0:monitor', { userId: OWNER_ID });
  await hub.handleComponent(owner);
  assert.equal(store.getMode().mode, 'monitor');
  assert.equal(store.getMode().revision, 1);
  assert.match(owner.lastReply.content, /disimpan/i);
});

test('status reports configured and effective modes with sanitized counters', async t => {
  const { hub, store } = loadRuntime(t);
  const guild = fakeGuild(fakeModLog({ publicChannel: true }));
  await hub.handleMessage(message('700000000000000091', { guild, content: 'ordinary discussion' }));

  for (const [index, status] of ['banned', 'monitor', 'partial', 'failed'].entries()) {
    const created = store.createOrGetIncident(incidentInput(100 + index)).incident;
    const claimed = store.claimEnforcement(created.id, created.revision).incident;
    store.finalizeIncident(claimed.id, {
      status,
      banSucceeded: status === 'banned',
      deletionSucceeded: status === 'banned',
      deletedCount: 0,
      issueCode: null,
    }, claimed.revision);
  }

  const interaction = fakeInteraction('', { guild });
  await hub.showStatus(interaction);
  const embed = interaction.lastReply.embeds[0].toJSON();
  const output = JSON.stringify(embed);

  assert.match(embed.description, /Mode tersimpan: \*\*active\*\*/);
  assert.match(embed.description, /Mode efektif: \*\*monitor\*\*/);
  assert.match(output, /Kanal log tidak privat/);
  assert.match(output, /Guild: 1/);
  assert.match(output, /Observasi: 1/);
  assert.match(output, /Diblokir: 1/);
  assert.match(output, /Dipantau: 1/);
  assert.match(output, /Tindakan sebagian: 1/);
  assert.match(output, /Perlu tindak lanjut: 1/);
  assert.doesNotMatch(output, /MOD_LOG_PUBLIC/);
  assert.equal(interaction.lastReply.ephemeral, true);
  assert.deepEqual(interaction.lastReply.allowedMentions, { parse: [] });
});

test('incident queue shows only the newest ten bounded metadata records and valid panel links', async t => {
  const { hub } = loadRuntime(t);
  const now = Date.now();
  const incidents = Array.from({ length: 12 }, (_unused, index) => ({
    ...incidentInput(index + 1),
    id: String(index + 1).padStart(16, '0'),
    memberId: `${String(700000000000000000 + index)}`,
    revision: 0,
    status: index === 0 ? 'unsafe-status' : 'monitor',
    trigger: index === 1 ? 'unsafe-trigger' : 'BLOCKED_DOMAIN',
    messageCount: index === 2 ? Number.MAX_SAFE_INTEGER : 3,
    channelCount: index === 2 ? Number.MAX_SAFE_INTEGER : 2,
    createdAt: index === 3 ? 'unsafe-date' : new Date(now - index * 60_000).toISOString(),
    finalizedAt: new Date(now).toISOString(),
    result: monitorResult(),
    panel: index === 4
      ? { channelId: MOD_LOG_ID, messageId: '666666666666666666' }
      : { channelId: '<@unsafe>', messageId: 'unsafe' },
  }));

  const firstPage = hub.buildIncidentQueue(incidents, 0);
  const lastPage = hub.buildIncidentQueue(incidents, 99);
  const firstEmbed = firstPage.payload.embeds[0].toJSON();
  const lastEmbed = lastPage.payload.embeds[0].toJSON();
  const output = JSON.stringify(firstEmbed);

  assert.equal(firstEmbed.fields.length, 10);
  assert.equal(lastEmbed.fields.length, 2);
  assert.match(output, /0000000000000001/);
  assert.doesNotMatch(output, /0000000000000012/);
  assert.match(JSON.stringify(lastEmbed), /0000000000000012/);
  assert.match(output, /https:\/\/discord\.com\/channels\/111111111111111111\/444444444444444444\/666666666666666666/);
  assert.doesNotMatch(output, /unsafe-status|unsafe-trigger|unsafe-date|<@unsafe>/);
  assert.match(output, /9999\/9999/);
  assert.equal(firstPage.page, 0);
  assert.equal(lastPage.page, 1);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(lastPage.totalPages, 2);
  assert.deepEqual(firstPage.payload.allowedMentions, { parse: [] });
});

test('allowlist list is owner-only and returns only bounded safe stored values', async t => {
  const { hub, store } = loadRuntime(t);
  const owner = fakeInteraction('');
  for (let index = 0; index < 12; index += 1) {
    const value = `8100000000000000${String(index).padStart(2, '0')}`;
    const result = store.mutateAllowlist('role', 'add', value, OWNER_ID, store.getMode().revision);
    assert.equal(result.ok, true);
  }
  const originalGetState = store.getState;
  store.getState = () => ({
    allowlist: {
      roleIds: [...originalGetState().allowlist.roleIds, '<@unsafe>'],
      channelIds: [],
      domains: [],
    },
  });

  await hub.mutateAllowlist(owner, 'role', 'list');
  assert.match(owner.lastReply.content, /Nilai aman: 10\/12/);
  assert.doesNotMatch(owner.lastReply.content, /<@unsafe>|810000000000001011/);
  assert.equal(owner.lastReply.ephemeral, true);
  assert.deepEqual(owner.lastReply.allowedMentions, { parse: [] });

  const outsider = fakeInteraction('', { userId: '777777777777777778' });
  await hub.mutateAllowlist(outsider, 'role', 'list');
  assert.match(outsider.lastReply.content, /hanya tersedia untuk owner/i);
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.deepEqual(outsider.lastReply.allowedMentions, { parse: [] });
});

test('components reject forged controls and clamp queue pages', async t => {
  const { hub, store } = loadRuntime(t);
  const incidents = Array.from({ length: 12 }, (_unused, index) => ({
    ...incidentInput(index + 1),
    id: String(index).padStart(16, '0'),
    revision: 0,
    status: 'monitor',
    createdAt: new Date().toISOString(),
    finalizedAt: new Date().toISOString(),
    result: monitorResult(),
  }));
  const queue = hub.buildIncidentQueue(incidents, 999);
  assert.equal(queue.page, 1);
  assert.equal(queue.totalPages, 2);
  const buttons = queue.payload.components[0].components.map(component => component.toJSON());
  assert.deepEqual(buttons.map(button => button.custom_id), [
    'mod:incidents:prev:0',
    'mod:incidents:refresh:1',
  ]);

  const originalListIncidents = store.listIncidents;
  store.listIncidents = () => incidents;
  const stalePage = fakeInteraction('mod:incidents:refresh:49', {
    userId: '777777777777777778',
    roleIds: [MODERATOR_ROLE_ID],
  });
  await hub.handleComponent(stalePage);
  store.listIncidents = originalListIncidents;
  assert.equal(stalePage.lastUpdate.embeds[0].toJSON().fields.length, 2);
  assert.match(stalePage.lastUpdate.embeds[0].toJSON().description, /Halaman: 2\/2/);
  assert.deepEqual(stalePage.lastUpdate.allowedMentions, { parse: [] });

  const outsider = fakeInteraction('mod:incidents:refresh:0', { userId: '777777777777777779' });
  await hub.handleComponent(outsider);
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.deepEqual(outsider.lastReply.allowedMentions, { parse: [] });

  const forged = fakeInteraction('mod:incidents:drop:0');
  await hub.handleComponent(forged);
  assert.equal(forged.lastReply.ephemeral, true);
  assert.deepEqual(forged.lastReply.allowedMentions, { parse: [] });
});

test('detection and card-delivery failures never persist or log raw content, URLs, filenames, or errors', async t => {
  const { hub, directory } = loadRuntime(t);
  const channel = fakeModLog({ sendFailures: 1 });
  const guild = fakeGuild(channel);
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(JSON.stringify(values));
  try {
    await hub.handleMessage(message('700000000000000008', {
      guild,
      content: `${SENTINEL_CONTENT} ${SENTINEL_URL}`,
      attachments: new Map([['1', { name: SENTINEL_FILENAME, contentType: 'image/png' }]]),
    }));
  } finally {
    console.error = originalError;
  }

  const persisted = fs.readFileSync(path.join(directory, 'moderation-state.json'), 'utf8');
  const observed = `${persisted}\n${logs.join('\n')}`;
  for (const secret of [SENTINEL_CONTENT, SENTINEL_DOMAIN, SENTINEL_URL, SENTINEL_FILENAME, SENTINEL_ERROR]) {
    assert.doesNotMatch(observed, new RegExp(secret));
  }
});
