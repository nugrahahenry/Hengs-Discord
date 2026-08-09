const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-report-store-test-'));
process.env.REPORT_DATA_DIR = testDataDir;

const permissions = require('../src/reports/permissions');
const validation = require('../src/reports/validation');
const store = require('../src/reports/store');

function stateFile() {
  return path.join(testDataDir, 'reports-state.json');
}

function validStoreInput(overrides = {}) {
  return {
    category: 'spam_scam',
    details: 'Akun ini mengirim tautan promosi mencurigakan berulang kali.',
    reporterId: '700000000000000001',
    targetUserId: '700000000000000002',
    messageLink: null,
    anonymous: true,
    guildId: '111111111111111111',
    externalId: `discord:${Math.floor(Math.random() * 1e15).toString().padStart(15, '1')}`,
    ...overrides,
  };
}

test.beforeEach(() => {
  fs.rmSync(stateFile(), { force: true });
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('report moderator access uses a dedicated role allowlist', () => {
  const previousOwner = process.env.OWNER_ID;
  const previousRoles = process.env.REPORT_MODERATOR_ROLE_IDS;
  process.env.OWNER_ID = '570152798126342144';
  process.env.REPORT_MODERATOR_ROLE_IDS = '800000000000000001';
  try {
    assert.equal(permissions.isReportModerator({
      user: { id: '700000000000000001' },
      member: { roles: { cache: new Collection([['800000000000000001', {}]]) } },
    }), true);
    assert.equal(permissions.isReportModerator({
      user: { id: '700000000000000002' },
      member: { roles: { cache: new Collection() } },
    }), false);
    assert.equal(permissions.isReportModerator({
      user: { id: process.env.OWNER_ID },
    }), true);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
    if (previousRoles === undefined) delete process.env.REPORT_MODERATOR_ROLE_IDS;
    else process.env.REPORT_MODERATOR_ROLE_IDS = previousRoles;
  }
});

test('the guild everyone role can never grant report reviewer access', () => {
  const previousOwner = process.env.OWNER_ID;
  const previousRoles = process.env.REPORT_MODERATOR_ROLE_IDS;
  process.env.OWNER_ID = '570152798126342144';
  process.env.REPORT_MODERATOR_ROLE_IDS = '111111111111111111';
  try {
    assert.equal(permissions.isReportModerator({
      guildId: '111111111111111111',
      user: { id: '700000000000000001' },
      member: { roles: { cache: new Collection([['111111111111111111', {}]]) } },
    }), false);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
    if (previousRoles === undefined) delete process.env.REPORT_MODERATOR_ROLE_IDS;
    else process.env.REPORT_MODERATOR_ROLE_IDS = previousRoles;
  }
});

test('report input accepts a same-guild canonical message link only', () => {
  assert.equal(
    validation.normalizeDiscordMessageLink(
      'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',
      '111111111111111111',
    ),
    'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',
  );
  assert.throws(
    () => validation.normalizeDiscordMessageLink(
      'https://discord.com/channels/999999999999999999/222222222222222222/333333333333333333',
      '111111111111111111',
    ),
    /server ini/,
  );
  assert.throws(
    () => validation.normalizeDiscordMessageLink('https://example.com/message', '111111111111111111'),
    /Link pesan Discord/,
  );
});

test('report input normalizes a bounded valid payload', () => {
  const result = validation.normalizeReportInput({
    category: 'spam_scam',
    details: '  Mengirim tautan mencurigakan berulang kali.  ',
    reporterId: '700000000000000001',
    targetUserId: '700000000000000002',
    messageLink: null,
    anonymous: true,
    interactionId: '900000000000000001',
  }, { guildId: '111111111111111111' });
  assert.deepEqual(result, {
    category: 'spam_scam',
    details: 'Mengirim tautan mencurigakan berulang kali.',
    reporterId: '700000000000000001',
    targetUserId: '700000000000000002',
    messageLink: null,
    anonymous: true,
    guildId: '111111111111111111',
    externalId: 'discord:900000000000000001',
  });
  assert.throws(
    () => validation.normalizeReportInput({
      category: 'unknown',
      details: 'Isi laporan yang cukup panjang.',
      reporterId: '700000000000000001',
      interactionId: '900000000000000001',
    }, { guildId: '111111111111111111' }),
    /Kategori laporan/,
  );
});

test('report creation is idempotent and preserves anonymous identity locally', () => {
  const input = validStoreInput({ externalId: 'discord:900000000000000001' });
  const first = store.createReport(input);
  const retry = store.createReport({ ...input, details: 'Tidak boleh mengganti isi laporan.' });

  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.report.id, first.report.id);
  assert.equal(first.report.reporterId, input.reporterId);
  assert.equal(first.report.anonymous, true);
  assert.equal(first.report.status, 'open');
  assert.equal(first.report.revision, 0);
  assert.equal(first.report.messageSyncPending, true);
  assert.equal(first.report.deliveryStatus, 'reserved');
  assert.equal(
    fs.readdirSync(testDataDir).some(name => name.endsWith('.tmp')),
    false,
  );
});

test('panel delivery claim has one winner for the same report', () => {
  const report = store.createReport(validStoreInput()).report;
  const first = store.claimPanelDelivery(report.id);
  const second = store.claimPanelDelivery(report.id);
  assert.equal(first.ok, true);
  assert.equal(first.report.deliveryStatus, 'sending');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'status');
});

test('report creation limits each reporter to three non-final reports', () => {
  for (let index = 0; index < 3; index += 1) {
    store.createReport(validStoreInput({ externalId: `discord:90000000000000000${index}` }));
  }
  assert.throws(
    () => store.createReport(validStoreInput({ externalId: 'discord:900000000000000009' })),
    error => error.code === 'OPEN_REPORT_LIMIT',
  );
});

test('claim has one winner and stale revisions cannot close a report', () => {
  const report = store.createReport(validStoreInput()).report;
  const claimed = store.claimReport(report.id, '700000000000000010', 0);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.report.status, 'claimed');
  assert.equal(claimed.report.revision, 1);

  const staleClaim = store.claimReport(report.id, '700000000000000011', 0);
  assert.equal(staleClaim.ok, false);
  assert.equal(staleClaim.reason, 'stale');

  const forbidden = store.finalizeReport(
    report.id,
    'resolved',
    '700000000000000011',
    'Bukan claimant laporan.',
    1,
  );
  assert.equal(forbidden.reason, 'forbidden');

  const resolved = store.finalizeReport(
    report.id,
    'resolved',
    '700000000000000010',
    'Laporan sudah ditangani.',
    1,
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.report.status, 'resolved');
  assert.equal(resolved.report.revision, 2);
});

test('claim can be released by claimant and finalized report can be reopened', () => {
  const report = store.createReport(validStoreInput()).report;
  store.claimReport(report.id, '700000000000000010', 0);
  const denied = store.releaseClaim(report.id, '700000000000000011', 1, false);
  assert.equal(denied.reason, 'forbidden');
  const released = store.releaseClaim(report.id, '700000000000000010', 1, false);
  assert.equal(released.ok, true);
  assert.equal(released.report.status, 'open');

  store.claimReport(report.id, '700000000000000010', 2);
  store.finalizeReport(report.id, 'dismissed', '700000000000000010', 'Bukti kurang.', 3);
  const reopened = store.reopenReport(report.id, '570152798126342144', 4);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.report.status, 'open');
  assert.equal(reopened.report.revision, 5);
  assert.equal(reopened.report.finalNote, null);
});

test('audit excludes report content, message links, and final notes', () => {
  const report = store.createReport(validStoreInput({
    details: 'PRIVATE_REPORT_BODY yang tidak boleh masuk audit.',
    messageLink: 'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333',
  })).report;
  store.claimReport(report.id, '700000000000000010', 0);
  store.finalizeReport(report.id, 'dismissed', '700000000000000010', 'PRIVATE_FINAL_NOTE', 1);
  const audit = JSON.stringify(store.getAuditHistory(20));
  assert.doesNotMatch(audit, /PRIVATE_REPORT_BODY|PRIVATE_FINAL_NOTE|discord\.com/);
  assert.match(audit, /report_created|report_claimed|report_dismissed/);
});

test('anonymous report creation audit does not identify the reporter', () => {
  const reporterId = '700000000000000099';
  const report = store.createReport(validStoreInput({
    reporterId,
    anonymous: true,
  })).report;
  const createdAudit = store.getAuditHistory(20)
    .find(entry => entry.reportId === report.id && entry.action === 'report_created');
  assert.equal(createdAudit.actor, 'system');
  assert.doesNotMatch(JSON.stringify(createdAudit), new RegExp(reporterId));
});

test('failed panel delivery can release a fresh report for idempotent retry', () => {
  const input = validStoreInput({ externalId: 'discord:900000000000000099' });
  const report = store.createReport(input).report;
  assert.equal(store.abortPanelDelivery(report.id, 'SEND_FAILED'), true);
  assert.equal(store.getReport(report.id), null);
  assert.equal(store.createReport(input).created, true);
  assert.match(JSON.stringify(store.getAuditHistory(20)), /report_delivery_failed/);
});

test('purge removes sensitive report only after entering purge_pending', () => {
  const report = store.createReport(validStoreInput()).report;
  assert.equal(store.finalizePurge(report.id, '570152798126342144'), false);
  const pending = store.markPurgePending(report.id, '570152798126342144');
  assert.equal(pending.status, 'purge_pending');
  assert.equal(store.finalizePurge(report.id, '570152798126342144'), true);
  assert.equal(store.getReport(report.id), null);
  assert.match(JSON.stringify(store.getAuditHistory(20)), /report_purged/);
});

test('panel synchronization is explicit and reporter reveal audit stays content-free', () => {
  const report = store.createReport(validStoreInput()).report;
  assert.deepEqual(store.listSyncPending(), []);
  const panelled = store.setPanel(report.id, {
    channelId: '222222222222222222',
    messageId: '333333333333333333',
    evidence: {
      name: 'proof.png',
      url: 'https://cdn.discordapp.com/attachments/1/2/proof.png',
      contentType: 'image/png',
      size: 123,
    },
  });
  assert.equal(panelled.messageSyncPending, false);
  store.claimReport(report.id, '700000000000000010', 0);
  assert.equal(store.listSyncPending()[0].id, report.id);
  assert.equal(store.markSynced(report.id).messageSyncPending, false);
  assert.equal(store.recordReporterReveal(report.id, '570152798126342144'), true);
  const revealAudit = store.getAuditHistory(20)
    .find(entry => entry.action === 'reporter_revealed');
  assert.equal(revealAudit.actor, '570152798126342144');
  assert.equal(revealAudit.reportId, report.id);
  assert.equal(revealAudit.details, undefined);
});

test('retention returns finalized old reports and all purge-pending reports', () => {
  const now = Date.now();
  const old = now - (40 * 86_400_000);
  const oldReport = store.createReport(validStoreInput({
    externalId: 'discord:900000000000000071',
  }), { nowMs: old }).report;
  store.claimReport(oldReport.id, '700000000000000010', 0);
  store.finalizeReport(
    oldReport.id,
    'resolved',
    '700000000000000010',
    'Selesai ditangani.',
    1,
    { nowMs: old },
  );
  const pending = store.createReport(validStoreInput({
    externalId: 'discord:900000000000000072',
  })).report;
  store.markPurgePending(pending.id, '570152798126342144');

  const dueIds = store.listRetentionDue(now).map(item => item.id);
  assert.deepEqual(new Set(dueIds), new Set([oldReport.id, pending.id]));
});

test('corrupt report state fails closed', () => {
  fs.writeFileSync(stateFile(), '{broken', 'utf8');
  assert.throws(
    () => store.getReport('0123456789abcdef'),
    /Report state tidak dapat dibaca/,
  );
});

test('parseable report state with missing required fields also fails closed', () => {
  fs.writeFileSync(stateFile(), JSON.stringify({
    reports: [{ id: '0123456789abcdef', status: 'open', revision: 0 }],
    audit: [],
  }), 'utf8');
  assert.throws(
    () => store.getReport('0123456789abcdef'),
    error => error.code === 'STATE_CORRUPT',
  );
});
