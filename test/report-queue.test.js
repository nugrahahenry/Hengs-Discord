const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-report-queue-test-'));
process.env.REPORT_DATA_DIR = testDataDir;
process.env.OWNER_ID = '570152798126342144';
process.env.REPORT_MODERATOR_ROLE_IDS = '800000000000000001';

const store = require('../src/reports/store');
const queue = require('../src/reports/queue');

function stateFile() {
  return path.join(testDataDir, 'reports-state.json');
}

function reportFixture(index, overrides = {}) {
  const suffix = index.toString(16).padStart(16, '0');
  return {
    id: suffix,
    revision: 0,
    status: 'open',
    priority: 'normal',
    prioritySource: 'category',
    category: 'technical',
    details: `SECRET_DETAILS_${index}`,
    reporterId: `710000000000000${String(index).padStart(3, '0')}`,
    targetUserId: `720000000000000${String(index).padStart(3, '0')}`,
    messageLink: `https://discord.com/channels/111111111111111111/555555555555555555/666666666666666${String(index).padStart(3, '0')}`,
    anonymous: false,
    guildId: '111111111111111111',
    externalId: `discord:900000000000000${String(index).padStart(3, '0')}`,
    createdAt: new Date(1_700_000_000_000 + (index * 1_000)).toISOString(),
    claimedBy: null,
    claimedAt: null,
    finalNote: `SECRET_FINAL_NOTE_${index}`,
    finalizedBy: null,
    finalizedAt: null,
    panel: {
      channelId: '222222222222222222',
      messageId: `333333333333333${String(index).padStart(3, '0')}`,
    },
    evidence: {
      name: `SECRET_EVIDENCE_${index}.png`,
      url: 'https://cdn.discordapp.com/attachments/1/2/secret.png',
      contentType: 'image/png',
      size: 10,
    },
    deliveryStatus: 'delivered',
    deliveryAttemptAt: null,
    messageSyncPending: false,
    purgeRequestedAt: null,
    ...overrides,
  };
}

function validInput(index) {
  return {
    category: index % 2 ? 'spam_scam' : 'technical',
    details: `Laporan antrean nomor ${index} memiliki detail yang cukup panjang.`,
    reporterId: `710000000000000${String(index).padStart(3, '0')}`,
    targetUserId: null,
    messageLink: null,
    anonymous: true,
    guildId: '111111111111111111',
    externalId: `discord:910000000000000${String(index).padStart(3, '0')}`,
  };
}

function createActiveReports(count) {
  const reports = [];
  for (let index = 1; index <= count; index += 1) {
    reports.push(store.createReport(validInput(index), { nowMs: index * 1_000 }).report);
  }
  return reports;
}

function fakeInteraction({
  customId = null,
  userId = process.env.OWNER_ID,
  roleIds = [],
  guildId = '111111111111111111',
} = {}) {
  return {
    customId,
    user: { id: userId },
    guildId,
    member: { roles: { cache: new Collection(roleIds.map(id => [id, {}])) } },
    replied: false,
    deferred: false,
    lastReply: null,
    lastUpdate: null,
    isButton: () => customId !== null,
    async reply(payload) {
      this.lastReply = payload;
      this.replied = true;
    },
    async followUp(payload) {
      this.lastReply = payload;
    },
    async update(payload) {
      this.lastUpdate = payload;
      this.replied = true;
    },
  };
}

test.beforeEach(() => {
  fs.rmSync(stateFile(), { force: true });
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('queue renderer exposes metadata only and a safe panel link', () => {
  const report = reportFixture(1, {
    status: 'claimed',
    priority: 'urgent',
    category: 'harassment',
    claimedBy: '700000000000000010',
  });
  const result = queue.buildQueuePayload([report], 0);
  const serialized = JSON.stringify(result.payload);

  assert.equal(result.page, 0);
  assert.equal(result.totalPages, 1);
  assert.match(serialized, new RegExp(report.id));
  assert.match(serialized, /Sedang ditangani/);
  assert.match(serialized, /Mendesak/);
  assert.match(serialized, /Pelecehan/);
  assert.match(serialized, /<t:\d+:R>/);
  assert.match(serialized, /700000000000000010/);
  assert.match(
    serialized,
    /https:\/\/discord\.com\/channels\/111111111111111111\/222222222222222222\/333333333333333001/,
  );
  assert.doesNotMatch(
    serialized,
    /SECRET_DETAILS_1|SECRET_FINAL_NOTE_1|SECRET_EVIDENCE_1|710000000000000001|720000000000000001|555555555555555555/,
  );
  assert.deepEqual(result.payload.allowedMentions, { parse: [] });
});

test('queue pagination shows ten entries then one and clamps page requests', () => {
  const reports = Array.from({ length: 11 }, (_, index) => reportFixture(index + 1));
  const first = queue.buildQueuePayload(reports, 0);
  const second = queue.buildQueuePayload(reports, 1);
  const clamped = queue.buildQueuePayload(reports, 49);

  assert.equal(first.payload.embeds[0].toJSON().fields.length, 10);
  assert.equal(second.payload.embeds[0].toJSON().fields.length, 1);
  assert.equal(first.totalPages, 2);
  assert.equal(second.page, 1);
  assert.equal(clamped.page, 1);
  assert.match(JSON.stringify(first.payload), /reports:page:1/);
  assert.match(JSON.stringify(second.payload), /reports:page:0/);
  assert.match(JSON.stringify(second.payload), /reports:refresh:1/);
});

test('queue permission allows owner and configured moderator only', async () => {
  createActiveReports(1);
  const owner = fakeInteraction();
  const moderator = fakeInteraction({
    userId: '700000000000000010',
    roleIds: ['800000000000000001'],
  });
  const outsider = fakeInteraction({ userId: '700000000000000099' });

  assert.equal(await queue.showQueue(owner), true);
  assert.equal(await queue.showQueue(moderator), true);
  assert.equal(await queue.showQueue(outsider), true);

  assert.equal(owner.lastReply.ephemeral, true);
  assert.equal(moderator.lastReply.ephemeral, true);
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.match(outsider.lastReply.content, /tidak dapat membuka antrean/i);
  assert.deepEqual(owner.lastReply.allowedMentions, { parse: [] });
});

test('queue refresh reads fresh state and explains the quiet empty view', async () => {
  const report = createActiveReports(1)[0];
  store.claimReport(report.id, '700000000000000010', 0);
  store.finalizeReport(
    report.id,
    'resolved',
    '700000000000000010',
    'Laporan selesai diperiksa.',
    1,
  );

  const refresh = fakeInteraction({ customId: 'reports:refresh:0' });
  assert.equal(await queue.handleQueueComponent(refresh), true);
  assert.ok(refresh.lastUpdate);
  assert.match(JSON.stringify(refresh.lastUpdate), /Belum ada laporan yang perlu ditinjau/);
  assert.match(JSON.stringify(refresh.lastUpdate), /Cek Lagi/);
  assert.deepEqual(refresh.lastUpdate.allowedMentions, { parse: [] });
});

test('queue refresh clamps a stale last page after active reports shrink', async () => {
  const reports = createActiveReports(11);
  const removed = reports[10];
  store.claimReport(removed.id, '700000000000000010', 0);
  store.finalizeReport(
    removed.id,
    'dismissed',
    '700000000000000010',
    'Laporan tidak dilanjutkan.',
    1,
  );

  const next = fakeInteraction({ customId: 'reports:page:1' });
  assert.equal(await queue.handleQueueComponent(next), true);
  assert.ok(next.lastUpdate);
  assert.match(JSON.stringify(next.lastUpdate), /Halaman 1 dari 1/);
  assert.equal(next.lastUpdate.embeds[0].toJSON().fields.length, 10);
});

test('queue empty state guides moderators without exposing the owner preview', async () => {
  const moderator = fakeInteraction({
    userId: '700000000000000010',
    roleIds: ['800000000000000001'],
  });
  await queue.showQueue(moderator);
  const serialized = JSON.stringify(moderator.lastReply);

  assert.match(serialized, /Belum ada laporan yang perlu ditinjau/);
  assert.match(serialized, /laporan baru akan muncul/i);
  assert.match(serialized, /reports:refresh:0/);
  assert.doesNotMatch(serialized, /reports:preview/);
});

test('owner sees a synthetic preview entry point only while the queue is empty', async () => {
  const empty = fakeInteraction();
  await queue.showQueue(empty);
  assert.match(JSON.stringify(empty.lastReply), /Belum ada laporan yang perlu ditinjau/);
  assert.match(JSON.stringify(empty.lastReply), /reports:preview/);

  createActiveReports(1);
  const active = fakeInteraction();
  await queue.showQueue(active);
  assert.doesNotMatch(JSON.stringify(active.lastReply), /reports:preview/);
});

test('owner preview stays private, mention-safe, and never creates report state', async () => {
  assert.equal(fs.existsSync(stateFile()), false);
  const preview = fakeInteraction({ customId: 'reports:preview' });
  const originalListActiveReports = store.listActiveReports;
  store.listActiveReports = () => {
    throw new Error('Preview must not read report state');
  };

  try {
    assert.equal(await queue.handleQueueComponent(preview), true);
  } finally {
    store.listActiveReports = originalListActiveReports;
  }
  assert.ok(preview.lastUpdate);
  const serialized = JSON.stringify(preview.lastUpdate);
  assert.match(serialized, /Pratinjau Laporan/);
  assert.match(serialized, /data contoh/i);
  assert.match(serialized, /tautan promosi/i);
  assert.match(serialized, /reports:refresh:0/);
  assert.doesNotMatch(serialized, /report:(claim|release|resolve|dismiss|reopen|reveal|purge|priority_)/);
  assert.doesNotMatch(serialized, /<@\\d+>/);
  assert.deepEqual(preview.lastUpdate.allowedMentions, { parse: [] });
  assert.equal(fs.existsSync(stateFile()), false);

  const second = JSON.stringify(queue.buildPreviewPayload());
  assert.equal(second, JSON.stringify(queue.buildPreviewPayload()));
});

test('configured moderator cannot forge the owner preview control', async () => {
  const moderator = fakeInteraction({
    customId: 'reports:preview',
    userId: '700000000000000010',
    roleIds: ['800000000000000001'],
  });

  assert.equal(await queue.handleQueueComponent(moderator), true);
  assert.equal(moderator.lastUpdate, null);
  assert.equal(moderator.lastReply.ephemeral, true);
  assert.match(moderator.lastReply.content, /tidak valid atau tidak tersedia/i);
  assert.equal(fs.existsSync(stateFile()), false);
});

test('malformed queue components fail safely', async () => {

  const malformed = fakeInteraction({ customId: 'reports:page:50' });
  assert.equal(await queue.handleQueueComponent(malformed), true);
  assert.equal(malformed.lastReply.ephemeral, true);
  assert.match(malformed.lastReply.content, /Kontrol antrean tidak valid/);
  assert.deepEqual(malformed.lastReply.allowedMentions, { parse: [] });

  const unrelated = fakeInteraction({ customId: 'other:page:0' });
  assert.equal(await queue.handleQueueComponent(unrelated), false);
});
test('queue permission is rechecked for every component interaction', async () => {
  createActiveReports(1);
  const outsider = fakeInteraction({
    customId: 'reports:refresh:0',
    userId: '700000000000000099',
  });

  assert.equal(await queue.handleQueueComponent(outsider), true);
  assert.equal(outsider.lastUpdate, null);
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.match(outsider.lastReply.content, /tidak valid atau tidak tersedia/i);
});

test('queue omits panel links unless every Discord ID is valid', () => {
  const unsafe = reportFixture(1, {
    panel: {
      channelId: 'not-a-channel',
      messageId: '333333333333333001',
    },
  });
  const serialized = JSON.stringify(queue.buildQueuePayload([unsafe], 0).payload);
  assert.doesNotMatch(serialized, /Buka Panel|discord\.com\/channels/);
});
test('reports command is guild-only and delegates to the private queue', async () => {
  const reportsCommand = require('../src/commands/reports');
  const schema = reportsCommand.data.toJSON();
  const interaction = fakeInteraction();
  const calls = [];
  const reportQueue = {
    showQueue: async (received, page) => {
      calls.push({ received, page });
      return true;
    },
  };

  assert.equal(schema.name, 'reports');
  assert.equal(schema.dm_permission, false);
  assert.equal(schema.default_member_permissions, undefined);
  assert.deepEqual(schema.options || [], []);

  await reportsCommand.execute(interaction, { reportQueue });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].received, interaction);
  assert.equal(calls[0].page, 0);

  const outsider = fakeInteraction({ userId: '700000000000000099' });
  await reportsCommand.execute(outsider, { reportQueue: queue });
  assert.equal(outsider.lastReply.ephemeral, true);
  assert.match(outsider.lastReply.content, /tidak dapat membuka antrean/i);
});

test('reports command and queue route are wired into the runtime loader', () => {
  const projectRoot = path.join(__dirname, '..');
  const commandFiles = fs.readdirSync(path.join(projectRoot, 'src', 'commands'))
    .filter(name => name.endsWith('.js'));
  const indexSource = fs.readFileSync(path.join(projectRoot, 'src', 'index.js'), 'utf8');

  assert.equal(commandFiles.length, 13);
  assert.ok(commandFiles.includes('setup.js'));
  assert.ok(commandFiles.includes('reports.js'));
  assert.match(indexSource, /require\('\.\/reports\/queue'\)/);
  assert.match(indexSource, /routeReportComponent\(interaction, reportHub, reportQueue\)/);
  assert.match(indexSource, /\breportQueue,\s*\n/);
  assert.match(indexSource, /['"]reports['"]/);
  assert.match(indexSource, /startsWith\('reports:'\)/);

  const autocompleteStart = indexSource.indexOf('if (interaction.isAutocomplete())');
  const componentStart = indexSource.indexOf("interaction.customId.startsWith('report:')");
  const commandExecuteStart = indexSource.indexOf('await cmd.execute(interaction');
  assert.ok(autocompleteStart >= 0 && componentStart > autocompleteStart);
  assert.ok(commandExecuteStart > componentStart);
  assert.doesNotMatch(
    indexSource.slice(autocompleteStart, componentStart),
    /\[reports\] command failed/,
  );
  assert.match(
    indexSource.slice(commandExecuteStart),
    /catch \(err\) \{\s*if \(interaction\.commandName === 'reports'\) \{\s*console\.error\('\[reports\] command failed:', \{ code: err\.code \|\| 'COMMAND_FAILED' \}\);/,
  );
  assert.match(
    indexSource,
    /const payload = \{\s*content: 'Aksi laporan gagal dijalankan\.',\s*flags: MessageFlags\.Ephemeral,\s*allowedMentions: \{ parse: \[\] \},\s*\};/,
  );
  assert.match(
    indexSource,
    /const errMsg = \{\s*content: .*?,\s*allowedMentions: \{ parse: \[\] \},\s*\};/,
  );
  assert.match(indexSource, /interaction\.editReply\(errMsg\)/);
  assert.match(indexSource, /interaction\.followUp\(\{ \.\.\.errMsg, ephemeral: true \}\)/);
  assert.match(indexSource, /interaction\.reply\(\{ \.\.\.errMsg, ephemeral: true \}\)/);
});
