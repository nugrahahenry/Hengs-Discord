const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection, PermissionsBitField } = require('discord.js');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-report-hub-test-'));
process.env.REPORT_DATA_DIR = testDataDir;
process.env.OWNER_ID = '570152798126342144';
process.env.REPORT_MODERATOR_ROLE_IDS = '800000000000000001';
process.env.MOD_LOG_CHANNEL_ID = '222222222222222222';

const store = require('../src/reports/store');
const hub = require('../src/reports/hub');
const evidenceService = require('../src/reports/evidence');
const reportCommand = require('../src/commands/report');
const { routeReportComponent } = require('../src/reports/router');

let inputCounter = 0;

function stateFile() {
  return path.join(testDataDir, 'reports-state.json');
}

function validInput(overrides = {}) {
  inputCounter += 1;
  return {
    category: 'spam_scam',
    details: 'Member mengirim tautan promosi mencurigakan berulang kali.',
    reporterId: '700000000000000001',
    targetUserId: '700000000000000002',
    messageLink: null,
    anonymous: false,
    guildId: '111111111111111111',
    externalId: `discord:${String(900000000000000000n + BigInt(inputCounter))}`,
    ...overrides,
  };
}

function fakeModChannel({
  everyoneCanView = false,
  botPermissions = true,
  deleteFails = false,
  sendFails = false,
  acceptThenThrow = false,
  sendGate = null,
} = {}) {
  const sent = [];
  const messages = new Map();
  const channel = {
    id: process.env.MOD_LOG_CHANNEL_ID,
    sent,
    isTextBased: () => true,
    permissionsFor(subject) {
      if (subject?.id === '111111111111111111') {
        return { has: permission => permission === PermissionsBitField.Flags.ViewChannel && everyoneCanView };
      }
      return { has: () => botPermissions };
    },
    async send(payload) {
      if (sendFails) throw Object.assign(new Error('send failed'), { code: 'SEND_FAILED' });
      if (sendGate) await sendGate;
      sent.push(payload);
      const uploaded = payload.files?.[0];
      const attachments = new Collection();
      if (uploaded) {
        attachments.set('444444444444444444', {
          id: '444444444444444444',
          name: uploaded.name,
          url: `https://cdn.discordapp.com/attachments/1/2/${uploaded.name}`,
          contentType: 'image/png',
          size: fs.statSync(uploaded.attachment).size,
        });
      }
      const message = {
        id: String(333333333333333333n + BigInt(sent.length)),
        author: { id: '999999999999999999' },
        embeds: (payload.embeds || []).map(embed => embed.toJSON?.() || embed),
        attachments,
        deleted: false,
        edits: [],
        async edit(nextPayload) {
          this.edits.push(nextPayload);
          return this;
        },
        async delete() {
          if (deleteFails) throw new Error('delete failed');
          this.deleted = true;
        },
      };
      messages.set(message.id, message);
      if (acceptThenThrow) {
        throw Object.assign(new Error('response lost after accept'), { code: 'NETWORK_TIMEOUT' });
      }
      return message;
    },
    messages: {
      async fetch(messageId) {
        if (typeof messageId === 'object') return new Collection(messages);
        if (!messages.has(messageId)) {
          const error = new Error('Unknown Message');
          error.code = 10008;
          throw error;
        }
        return messages.get(messageId);
      },
    },
  };
  return channel;
}

function fakeGuild(channel, extraChannels = []) {
  const channels = new Collection([[channel.id, channel], ...extraChannels.map(item => [item.id, item])]);
  return {
    id: '111111111111111111',
    roles: { everyone: { id: '111111111111111111' } },
    members: { me: { id: '999999999999999999' } },
    channels: {
      cache: channels,
      fetch: async id => channels.get(id) || null,
    },
  };
}

function fakeInteraction(customId, userId, roleIds = [], type = 'button', fields = {}) {
  return {
    customId,
    user: { id: userId },
    member: { roles: { cache: new Collection(roleIds.map(id => [id, {}])) } },
    guild: null,
    lastReply: null,
    lastUpdate: null,
    shownModal: null,
    deferred: false,
    replied: false,
    fields: { getTextInputValue: name => fields[name] || '' },
    isButton: () => type === 'button',
    isModalSubmit: () => type === 'modal',
    async reply(payload) {
      this.lastReply = payload;
      this.replied = true;
    },
    async deferReply(payload) {
      this.deferred = true;
      this.deferPayload = payload;
    },
    async editReply(payload) {
      this.lastReply = { ...payload, ephemeral: this.deferPayload?.ephemeral === true };
      this.replied = true;
    },
    async followUp(payload) {
      this.lastReply = payload;
    },
    async update(payload) {
      this.lastUpdate = payload;
      this.replied = true;
    },
    async showModal(modal) {
      this.shownModal = modal;
      this.replied = true;
    },
  };
}

function fakeReportInteraction(overrides = {}) {
  const values = {
    category: 'spam_scam',
    details: 'Member mengirim tautan promosi mencurigakan berulang kali.',
    member: null,
    message_link: null,
    evidence: null,
    anonymous: true,
    ...overrides.options,
  };
  return {
    id: overrides.id || String(910000000000000000n + BigInt(inputCounter + 1)),
    guild: overrides.guild || fakeGuild(fakeModChannel()),
    guildId: '111111111111111111',
    user: { id: overrides.userId || '710000000000000001' },
    attachmentSizeLimit: 10 * 1024 * 1024,
    deferred: false,
    replied: false,
    lastReply: null,
    inGuild: () => overrides.inGuild !== false,
    options: {
      getString: name => values[name],
      getUser: name => values[name],
      getAttachment: name => values[name],
      getBoolean: name => values[name],
    },
    async deferReply(payload) {
      this.deferred = true;
      this.deferPayload = payload;
    },
    async editReply(payload) {
      this.lastReply = { ...payload, ephemeral: this.deferPayload?.ephemeral === true };
      this.replied = true;
    },
    async reply(payload) {
      this.lastReply = payload;
      this.replied = true;
    },
  };
}

function seedOpenReport(overrides = {}) {
  return store.createReport(validInput(overrides)).report;
}

function seedFinalizedReport(status = 'resolved') {
  const report = seedOpenReport();
  store.claimReport(report.id, '700000000000000010', 0);
  return store.finalizeReport(
    report.id,
    status,
    '700000000000000010',
    'Sudah diperiksa moderator.',
    1,
  ).report;
}

test.beforeEach(() => {
  fs.rmSync(stateFile(), { force: true });
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('report intake fails closed when everyone can view mod-logs', async () => {
  const channel = fakeModChannel({ everyoneCanView: true });
  await assert.rejects(
    () => hub.createReportPanel(fakeGuild(channel), validInput(), null),
    error => error.code === 'REPORT_CHANNEL_NOT_PRIVATE',
  );
  assert.equal(channel.sent.length, 0);
});

test('report intake fails closed when OWNER_ID is missing', async () => {
  const previousOwner = process.env.OWNER_ID;
  delete process.env.OWNER_ID;
  const channel = fakeModChannel();
  try {
    await assert.rejects(
      () => hub.createReportPanel(fakeGuild(channel), validInput(), null),
      error => error.code === 'REPORT_OWNER_MISSING',
    );
    assert.equal(channel.sent.length, 0);
  } finally {
    process.env.OWNER_ID = previousOwner;
  }
});

test('/report exposes bounded guild-only options to every member', () => {
  const schema = reportCommand.data.toJSON();
  assert.equal(schema.name, 'report');
  assert.equal(schema.dm_permission, false);
  assert.equal(schema.default_member_permissions, undefined);
  assert.deepEqual(schema.options.map(option => option.name), [
    'category',
    'details',
    'member',
    'message_link',
    'evidence',
    'anonymous',
  ]);
  assert.equal(schema.options.find(option => option.name === 'details').max_length, 1500);
});

test('/report returns a private receipt without notifying the target member', async () => {
  const interaction = fakeReportInteraction();
  let receivedInput = null;
  await reportCommand.execute(interaction, {
    reportHub: {
      createReportPanel: async (_guild, input) => {
        receivedInput = input;
        return { report: { id: '0123456789abcdef', category: input.category, anonymous: input.anonymous } };
      },
    },
    now: () => 1_000_000,
  });

  assert.equal(interaction.lastReply.ephemeral, true);
  assert.match(interaction.lastReply.content, /0123456789abcdef/);
  assert.match(interaction.lastReply.content, /tidak menjamin tindakan/i);
  assert.equal(receivedInput.reporterId, interaction.user.id);
  assert.equal(interaction.lastReply.allowedMentions.parse.length, 0);
});

test('/report applies cooldown only after a successful submission', async () => {
  const reportHub = {
    createReportPanel: async (_guild, input) => ({
      report: { id: '1123456789abcdef', category: input.category, anonymous: input.anonymous },
    }),
  };
  const first = fakeReportInteraction({ userId: '710000000000000099', id: '920000000000000001' });
  const second = fakeReportInteraction({ userId: '710000000000000099', id: '920000000000000002' });
  await reportCommand.execute(first, { reportHub, now: () => 2_000_000 });
  await reportCommand.execute(second, { reportHub, now: () => 2_000_001 });
  assert.match(second.lastReply.content, /tunggu/i);
});

test('/report rejects a parallel submission from the same member', async () => {
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const reportHub = {
    createReportPanel: async (_guild, input) => {
      await gate;
      return { report: { id: '2123456789abcdef', category: input.category, anonymous: input.anonymous } };
    },
  };
  const first = fakeReportInteraction({ userId: '710000000000000088', id: '930000000000000001' });
  const second = fakeReportInteraction({ userId: '710000000000000088', id: '930000000000000002' });
  const firstPromise = reportCommand.execute(first, { reportHub, now: () => 3_000_000 });
  await new Promise(resolve => setImmediate(resolve));
  const secondPromise = reportCommand.execute(second, { reportHub, now: () => 3_000_000 });
  await new Promise(resolve => setImmediate(resolve));
  releaseFirst();
  await Promise.all([firstPromise, secondPromise]);

  assert.match(second.lastReply.content, /sedang diproses|tunggu/i);
  assert.doesNotMatch(second.lastReply.content, /2123456789abcdef/);
});

test('/report hides unexpected internal error messages from members', () => {
  assert.equal(
    reportCommand.publicError(new Error('EPERM C:\\Users\\Yanu\\AppData\\Temp\\secret')),
    'Laporan gagal dikirim. Coba lagi beberapa saat lagi.',
  );
});

test('report component router dispatches only report buttons and modals', async () => {
  const calls = [];
  const reportHub = {
    handleButton: async () => calls.push('button'),
    handleModal: async () => calls.push('modal'),
  };
  assert.equal(await routeReportComponent({
    customId: 'report:claim:0123456789abcdef:0',
    isButton: () => true,
    isModalSubmit: () => false,
  }, reportHub), true);
  assert.equal(await routeReportComponent({
    customId: 'report:resolve_modal:0123456789abcdef:1',
    isButton: () => false,
    isModalSubmit: () => true,
  }, reportHub), true);
  assert.equal(await routeReportComponent({
    customId: 'event:publish:0123456789abcdef',
    isButton: () => true,
    isModalSubmit: () => false,
  }, reportHub), false);
  assert.deepEqual(calls, ['button', 'modal']);
});

test('anonymous panel hides reporter and disables all mentions', async () => {
  const channel = fakeModChannel();
  const result = await hub.createReportPanel(
    fakeGuild(channel),
    validInput({ anonymous: true, reporterId: '700000000000000009' }),
    null,
  );

  assert.deepEqual(result.panelPayload.allowedMentions, { parse: [] });
  assert.doesNotMatch(JSON.stringify(result.panelPayload), /700000000000000009/);
  assert.match(JSON.stringify(result.panelPayload), /Pelapor anonim/);
  assert.equal(store.getReport(result.report.id).panel.channelId, channel.id);
});

test('non-anonymous panel identifies reporter only inside the private review channel', async () => {
  const channel = fakeModChannel();
  const result = await hub.createReportPanel(fakeGuild(channel), validInput(), null);
  assert.match(JSON.stringify(result.panelPayload), /700000000000000001/);
  assert.deepEqual(result.panelPayload.allowedMentions, { parse: [] });
});

test('report intake rejects a same-guild message link that the bot cannot fetch', async () => {
  const channel = fakeModChannel();
  const linkedChannel = {
    id: '555555555555555555',
    isTextBased: () => true,
    messages: {
      async fetch() {
        const error = new Error('Unknown Message');
        error.code = 10008;
        throw error;
      },
    },
  };
  const guild = fakeGuild(channel, [linkedChannel]);
  await assert.rejects(
    () => hub.createReportPanel(guild, validInput({
      messageLink: 'https://discord.com/channels/111111111111111111/555555555555555555/666666666666666666',
    }), null),
    error => error.code === 'REPORT_MESSAGE_UNAVAILABLE',
  );
  assert.equal(channel.sent.length, 0);
});

test('panel evidence uses the bounded pipeline and leaves no local temporary file', async () => {
  const channel = fakeModChannel();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-report-panel-evidence-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    const result = await hub.createReportPanel(fakeGuild(channel), validInput(), {
      name: 'proof.png',
      size: png.length,
      contentType: 'image/png',
      url: 'https://cdn.discordapp.com/attachments/1/2/proof.png',
    }, {
      evidenceOptions: {
        tmpRoot,
        fetchImpl: async () => new Response(png, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      },
    });

    assert.equal(result.report.evidence.name, 'proof.png');
    assert.match(result.report.evidence.url, /^https:\/\/cdn\.discordapp\.com\//);
    assert.deepEqual(fs.readdirSync(tmpRoot), []);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('cleanup failure cannot overturn an already persisted private panel', async () => {
  const channel = fakeModChannel();
  const originalCleanup = evidenceService.cleanupEvidence;
  const originalConsoleError = console.error;
  evidenceService.cleanupEvidence = async () => {
    throw new Error('EPERM C:\\private\\temp-file');
  };
  console.error = () => {};
  try {
    const result = await hub.createReportPanel(fakeGuild(channel), validInput(), null);
    assert.equal(result.report.panel.channelId, channel.id);
    assert.equal(channel.sent.length, 1);
  } finally {
    evidenceService.cleanupEvidence = originalCleanup;
    console.error = originalConsoleError;
  }
});

test('failed Discord panel delivery releases the report reservation for retry', async () => {
  const input = validInput({ externalId: 'discord:900000000000000099' });
  await assert.rejects(
    () => hub.createReportPanel(fakeGuild(fakeModChannel({ sendFails: true })), input, null),
    error => error.code === 'REPORT_PANEL_FAILED',
  );
  assert.equal(store.createReport(input).created, true);
});

test('retry recovers a panel sent before state persistence without sending a duplicate', async () => {
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);
  const input = validInput({ externalId: 'discord:900000000000000088' });
  const reserved = store.createReport(input).report;
  const orphan = await channel.send(hub.panelPayload(reserved));

  const recovered = await hub.createReportPanel(guild, input, null);
  assert.equal(recovered.recovered, true);
  assert.equal(channel.sent.length, 1);
  assert.equal(store.getReport(reserved.id).panel.messageId, orphan.id);
});

test('parallel delivery for one interaction sends exactly one private panel', async () => {
  let releaseSend;
  const sendGate = new Promise(resolve => { releaseSend = resolve; });
  const channel = fakeModChannel({ sendGate });
  const guild = fakeGuild(channel);
  const input = validInput({ externalId: 'discord:900000000000000077' });

  const first = hub.createReportPanel(guild, input, null);
  await new Promise(resolve => setImmediate(resolve));
  const second = hub.createReportPanel(guild, input, null);
  releaseSend();
  const results = await Promise.allSettled([first, second]);

  assert.equal(channel.sent.length, 1);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const rejected = results.find(item => item.status === 'rejected');
  assert.equal(rejected.reason.code, 'REPORT_DELIVERY_IN_PROGRESS');
});

test('ambiguous send failure recovers the accepted panel instead of deleting state', async () => {
  const channel = fakeModChannel({ acceptThenThrow: true });
  const guild = fakeGuild(channel);
  const result = await hub.createReportPanel(guild, validInput(), null, {
    deliveryRecoveryDelaysMs: [0],
  });

  assert.equal(result.recovered, true);
  assert.equal(channel.sent.length, 1);
  assert.equal(store.getReport(result.report.id).panel.messageId, '333333333333333334');
});

test('two moderators claiming the same revision have exactly one winner', async () => {
  const report = seedOpenReport();
  const first = fakeInteraction(`report:claim:${report.id}:0`, '700000000000000010', ['800000000000000001']);
  const second = fakeInteraction(`report:claim:${report.id}:0`, '700000000000000011', ['800000000000000001']);
  await Promise.all([hub.handleButton(first), hub.handleButton(second)]);

  const current = store.getReport(report.id);
  assert.equal(current.status, 'claimed');
  assert.ok(['700000000000000010', '700000000000000011'].includes(current.claimedBy));
  assert.equal(current.revision, 1);
  assert.equal([first, second].filter(item => item.lastUpdate).length, 1);
});

test('a forged report button from a non-reviewer fails ephemerally', async () => {
  const report = seedOpenReport();
  const outsider = fakeInteraction(`report:claim:${report.id}:0`, '700000000000000099');
  await hub.handleButton(outsider);
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.equal(store.getReport(report.id).status, 'open');
});

test('only owner can reveal an anonymous reporter and reveal stays ephemeral', async () => {
  const reporterId = '700000000000000009';
  const report = seedOpenReport({ anonymous: true, reporterId });
  const moderator = fakeInteraction(`report:reveal:${report.id}:0`, '700000000000000010', ['800000000000000001']);
  await hub.handleButton(moderator);
  assert.doesNotMatch(JSON.stringify(moderator.lastReply), new RegExp(reporterId));

  const owner = fakeInteraction(`report:reveal:${report.id}:0`, process.env.OWNER_ID);
  await hub.handleButton(owner);
  assert.equal(owner.lastReply.ephemeral, true);
  assert.match(owner.lastReply.content, new RegExp(reporterId));
  assert.match(JSON.stringify(store.getAuditHistory(20)), /reporter_revealed/);
});

test('resolve modal rejects a stale revision without changing the report', async () => {
  const report = seedOpenReport();
  store.claimReport(report.id, '700000000000000010', 0);
  const stale = fakeInteraction(
    `report:resolve_modal:${report.id}:0`,
    '700000000000000010',
    ['800000000000000001'],
    'modal',
    { note: 'Laporan sudah ditangani.' },
  );
  await hub.handleModal(stale);
  assert.equal(store.getReport(report.id).status, 'claimed');
  assert.match(stale.lastReply.content, /sudah berubah/i);
});

test('resolve modal acknowledges ephemerally before synchronizing Discord state', async () => {
  const report = seedOpenReport();
  store.claimReport(report.id, '700000000000000010', 0);
  const modal = fakeInteraction(
    `report:resolve_modal:${report.id}:1`,
    '700000000000000010',
    ['800000000000000001'],
    'modal',
    { note: 'Laporan sudah ditangani.' },
  );
  await hub.handleModal(modal);
  assert.equal(modal.deferred, true);
  assert.equal(modal.deferPayload.ephemeral, true);
  assert.equal(store.getReport(report.id).status, 'resolved');
  assert.equal(modal.lastReply.ephemeral, true);
});

test('owner can reopen a finalized report while moderator cannot', async () => {
  const report = seedFinalizedReport();
  const moderator = fakeInteraction(
    `report:reopen:${report.id}:${report.revision}`,
    '700000000000000010',
    ['800000000000000001'],
  );
  await hub.handleButton(moderator);
  assert.equal(store.getReport(report.id).status, 'resolved');

  const owner = fakeInteraction(`report:reopen:${report.id}:${report.revision}`, process.env.OWNER_ID);
  await hub.handleButton(owner);
  assert.equal(store.getReport(report.id).status, 'open');
});

test('owner purge deletes the Discord panel before removing local report data', async () => {
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);
  const created = await hub.createReportPanel(guild, validInput(), null);
  const report = store.getReport(created.report.id);
  const modal = fakeInteraction(
    `report:purge_modal:${report.id}:${report.revision}`,
    process.env.OWNER_ID,
    [],
    'modal',
    { confirmation: report.id },
  );
  modal.guild = guild;
  await hub.handleModal(modal);

  assert.equal(modal.deferred, true);
  assert.equal(store.getReport(report.id), null);
  const panel = await channel.messages.fetch(report.panel.messageId);
  assert.equal(panel.deleted, true);
  assert.equal(modal.lastReply.ephemeral, true);
});

test('stale purge modal cannot delete a report changed while the interaction is deferred', async () => {
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);
  const created = await hub.createReportPanel(guild, validInput(), null);
  const report = store.getReport(created.report.id);
  const modal = fakeInteraction(
    `report:purge_modal:${report.id}:${report.revision}`,
    process.env.OWNER_ID,
    [],
    'modal',
    { confirmation: report.id },
  );
  modal.guild = guild;
  modal.deferReply = async function deferReply(payload) {
    this.deferred = true;
    this.deferPayload = payload;
    store.claimReport(report.id, '700000000000000010', report.revision);
  };

  await hub.handleModal(modal);

  const current = store.getReport(report.id);
  const panel = await channel.messages.fetch(report.panel.messageId);
  assert.equal(current.status, 'claimed');
  assert.equal(panel.deleted, false);
  assert.match(modal.lastReply.content, /sudah berubah/i);
});

test('startup recovery synchronizes pending panels and purges expired final reports', async () => {
  const now = Date.now();
  const old = now - (40 * 86_400_000);
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);

  const pendingMessage = await channel.send({ embeds: [], components: [] });
  const pendingReport = store.createReport(validInput()).report;
  store.setPanel(pendingReport.id, { channelId: channel.id, messageId: pendingMessage.id });
  store.claimReport(pendingReport.id, '700000000000000010', 0);

  const oldMessage = await channel.send({ embeds: [], components: [] });
  const oldReport = store.createReport(validInput(), { nowMs: old }).report;
  store.setPanel(oldReport.id, { channelId: channel.id, messageId: oldMessage.id });
  store.claimReport(oldReport.id, '700000000000000010', 0);
  store.finalizeReport(oldReport.id, 'resolved', '700000000000000010', 'Sudah selesai.', 1, { nowMs: old });

  const client = {
    guilds: {
      cache: new Collection([[guild.id, guild]]),
      fetch: async id => id === guild.id ? guild : null,
    },
  };
  const result = await hub.start(client, { disableTimer: true, nowMs: now });

  assert.equal(result.synced, 2);
  assert.equal(result.purged, 1);
  assert.equal(store.getReport(pendingReport.id).messageSyncPending, false);
  assert.equal(store.getReport(oldReport.id), null);
  assert.equal(oldMessage.deleted, true);
});

test('startup recovery links a panel sent before state persistence', async () => {
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);
  const report = store.createReport(validInput()).report;
  const orphan = await channel.send(hub.panelPayload(report));
  const client = {
    guilds: {
      cache: new Collection([[guild.id, guild]]),
      fetch: async id => id === guild.id ? guild : null,
    },
  };

  const result = await hub.start(client, { disableTimer: true });
  assert.equal(result.recovered, 1);
  assert.equal(store.getReport(report.id).panel.messageId, orphan.id);
  assert.equal(channel.sent.length, 1);
});

test('startup recovery removes an interrupted reservation when no panel was sent', async () => {
  const channel = fakeModChannel();
  const guild = fakeGuild(channel);
  const report = store.createReport(validInput()).report;
  store.claimPanelDelivery(report.id);
  const client = {
    guilds: {
      cache: new Collection([[guild.id, guild]]),
      fetch: async id => id === guild.id ? guild : null,
    },
  };

  const result = await hub.start(client, { disableTimer: true });
  assert.equal(result.aborted, 1);
  assert.equal(store.getReport(report.id), null);
});

test('startup retention keeps purge_pending state when Discord deletion fails', async () => {
  const channel = fakeModChannel({ deleteFails: true });
  const guild = fakeGuild(channel);
  const message = await channel.send({ embeds: [], components: [] });
  const report = store.createReport(validInput()).report;
  store.setPanel(report.id, { channelId: channel.id, messageId: message.id });
  store.markPurgePending(report.id, process.env.OWNER_ID);
  const client = {
    guilds: {
      cache: new Collection([[guild.id, guild]]),
      fetch: async id => id === guild.id ? guild : null,
    },
  };

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await hub.start(client, { disableTimer: true });
    assert.equal(result.purged, 0);
    assert.equal(store.getReport(report.id).status, 'purge_pending');
  } finally {
    console.error = originalConsoleError;
  }
});
