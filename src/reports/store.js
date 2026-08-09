const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { REPORT_CATEGORIES, normalizeDiscordMessageLink, positiveInteger } = require('./validation');

const DATA_DIR = process.env.REPORT_DATA_DIR
  ? path.resolve(process.env.REPORT_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'reports-state.json');
const MAX_REPORTS = 500;
const MAX_AUDIT = 500;
const MAX_OPEN_PER_REPORTER = 3;
const REPORT_ID = /^[a-f0-9]{16}$/;
const DISCORD_ID = /^\d{15,22}$/;
const EXTERNAL_ID = /^discord:\d{15,22}$/;
const ACTIVE_STATUSES = new Set(['open', 'claimed', 'purge_pending']);
const FINAL_STATUSES = new Set(['resolved', 'dismissed']);
const ALL_STATUSES = new Set([...ACTIVE_STATUSES, ...FINAL_STATUSES]);
const CATEGORY_VALUES = new Set(REPORT_CATEGORIES.map(item => item.value));
const PRIORITIES = new Set(['normal', 'important', 'urgent']);
const PRIORITY_SOURCES = new Set(['category', 'moderator']);
const IMPORTANT_CATEGORIES = new Set(['harassment', 'spam_scam', 'inappropriate']);
const PRIORITY_RANK = Object.freeze({ urgent: 0, important: 1, normal: 2 });
const ALLOWED_AUDIT_DETAIL_KEYS = new Set([
  'errorCode',
  'fromPriority',
  'fromStatus',
  'toPriority',
  'toStatus',
]);
const DELIVERY_STATUSES = new Set(['reserved', 'sending', 'delivered']);
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

class ReportStoreError extends Error {
  constructor(code, userMessage, diagnosticCode = null) {
    super(userMessage);
    this.name = 'ReportStoreError';
    this.code = code;
    this.userMessage = userMessage;
    this.diagnosticCode = diagnosticCode;
  }
}

function defaultState() {
  return { reports: [], audit: [] };
}

function derivePriority(category) {
  return IMPORTANT_CATEGORIES.has(category) ? 'important' : 'normal';
}

function migrateState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.reports)) {
    return { state, changed: false };
  }
  let changed = false;
  const reports = state.reports.map(report => {
    if (!report || typeof report !== 'object') return report;
    const hasPriority = Object.hasOwn(report, 'priority');
    const hasSource = Object.hasOwn(report, 'prioritySource');
    if (hasPriority !== hasSource) throw new Error('record laporan tidak valid');
    if (hasPriority) {
      if (!PRIORITIES.has(report.priority) || !PRIORITY_SOURCES.has(report.prioritySource)) {
        throw new Error('record laporan tidak valid');
      }
      return report;
    }
    if (!CATEGORY_VALUES.has(report.category)) throw new Error('record laporan tidak valid');
    changed = true;
    return {
      ...report,
      priority: derivePriority(report.category),
      prioritySource: 'category',
    };
  });
  return {
    state: changed ? { ...state, reports } : state,
    changed,
  };
}

function validDate(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function validNullableDiscordId(value) {
  return value === null || DISCORD_ID.test(value);
}

function validatePanel(panel) {
  return panel === null || (
    panel
    && typeof panel === 'object'
    && DISCORD_ID.test(panel.channelId)
    && DISCORD_ID.test(panel.messageId)
  );
}

function validateEvidence(evidence) {
  if (evidence === null) return true;
  if (!evidence || typeof evidence !== 'object') return false;
  let url;
  try { url = new URL(evidence.url); } catch { return false; }
  return typeof evidence.name === 'string'
    && evidence.name.length > 0
    && evidence.name.length <= 100
    && typeof evidence.contentType === 'string'
    && evidence.contentType.length > 0
    && evidence.contentType.length <= 100
    && Number.isSafeInteger(evidence.size)
    && evidence.size > 0
    && evidence.size <= MAX_EVIDENCE_BYTES
    && url.protocol === 'https:'
    && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname.toLowerCase());
}

function validateAuditEntry(entry) {
  if (
    !entry
    || typeof entry !== 'object'
    || !/^[a-f0-9]{12}$/.test(entry.id)
    || !(REPORT_ID.test(entry.reportId) || entry.reportId === 'unknown')
    || !/^[a-z0-9_-]{1,40}$/i.test(entry.action)
    || !(DISCORD_ID.test(entry.actor) || ['system', 'retention'].includes(entry.actor))
    || !validDate(entry.at)
  ) return false;
  if (entry.details === undefined) return true;
  if (!entry.details || typeof entry.details !== 'object' || Array.isArray(entry.details)) return false;
  return Object.entries(entry.details).every(([key, value]) => (
    ALLOWED_AUDIT_DETAIL_KEYS.has(key)
    && typeof value === 'string'
    && /^[A-Z0-9_-]{1,50}$/i.test(value)
  ));
}

function validateReportRecord(report) {
  if (
    !report
    || typeof report !== 'object'
    || !REPORT_ID.test(report.id)
    || !ALL_STATUSES.has(report.status)
    || !Number.isSafeInteger(report.revision)
    || report.revision < 0
    || !CATEGORY_VALUES.has(report.category)
    || !PRIORITIES.has(report.priority)
    || !PRIORITY_SOURCES.has(report.prioritySource)
    || typeof report.details !== 'string'
    || report.details.length < 20
    || report.details.length > 1500
    || !DISCORD_ID.test(report.reporterId)
    || !validNullableDiscordId(report.targetUserId)
    || !DISCORD_ID.test(report.guildId)
    || !EXTERNAL_ID.test(report.externalId)
    || typeof report.anonymous !== 'boolean'
    || !validDate(report.createdAt)
    || !validNullableDiscordId(report.claimedBy)
    || !validDate(report.claimedAt, true)
    || !validNullableDiscordId(report.finalizedBy)
    || !validDate(report.finalizedAt, true)
    || !validDate(report.purgeRequestedAt, true)
    || !validatePanel(report.panel)
    || !validateEvidence(report.evidence)
    || !DELIVERY_STATUSES.has(report.deliveryStatus)
    || !validDate(report.deliveryAttemptAt, true)
    || typeof report.messageSyncPending !== 'boolean'
  ) return false;

  if (report.messageLink !== null) {
    try {
      if (normalizeDiscordMessageLink(report.messageLink, report.guildId) !== report.messageLink) return false;
    } catch {
      return false;
    }
  }
  if (report.status === 'claimed' && (!DISCORD_ID.test(report.claimedBy) || !validDate(report.claimedAt))) {
    return false;
  }
  if (FINAL_STATUSES.has(report.status)) {
    if (
      typeof report.finalNote !== 'string'
      || report.finalNote.length < 5
      || report.finalNote.length > 500
      || !DISCORD_ID.test(report.finalizedBy)
      || !validDate(report.finalizedAt)
    ) return false;
  } else if (report.status !== 'purge_pending' && report.finalNote !== null) {
    return false;
  }
  if (report.panel && report.deliveryStatus !== 'delivered') return false;
  if (report.deliveryStatus === 'sending' && !validDate(report.deliveryAttemptAt)) return false;
  return true;
}

function validateState(state) {
  if (
    !state
    || typeof state !== 'object'
    || !Array.isArray(state.reports)
    || !Array.isArray(state.audit)
    || state.reports.length > MAX_REPORTS
    || state.audit.length > MAX_AUDIT
  ) {
    throw new Error('root reports/audit bukan array');
  }
  const reportIds = new Set();
  const externalIds = new Set();
  for (const report of state.reports) {
    if (
      !validateReportRecord(report)
      || reportIds.has(report.id)
      || externalIds.has(report.externalId)
    ) {
      throw new Error('record laporan tidak valid');
    }
    reportIds.add(report.id);
    externalIds.add(report.externalId);
  }
  if (!state.audit.every(validateAuditEntry)) throw new Error('audit laporan tidak valid');
  return state;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    const migrated = migrateState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    const state = validateState(migrated.state);
    if (migrated.changed) writeState(state);
    return state;
  } catch (error) {
    const diagnosticCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? error.code
      : 'STATE_INVALID';
    throw new ReportStoreError(
      'STATE_CORRUPT',
      'Data laporan sedang tidak tersedia. Hubungi owner.',
      diagnosticCode,
    );
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let fd = null;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, JSON.stringify(state, null, 2), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temporary, STATE_FILE);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
}

function safeActor(value) {
  const normalized = String(value || 'system').slice(0, 100);
  return DISCORD_ID.test(normalized) || ['system', 'retention'].includes(normalized)
    ? normalized
    : 'system';
}

function appendAudit(state, reportId, action, actor, details = null) {
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    reportId: REPORT_ID.test(reportId) ? reportId : 'unknown',
    action: String(action || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'unknown',
    actor: safeActor(actor),
    at: new Date().toISOString(),
  };
  if (details && typeof details === 'object') {
    const safeDetails = {};
    for (const [key, value] of Object.entries(details)) {
      if (!ALLOWED_AUDIT_DETAIL_KEYS.has(key)) continue;
      safeDetails[key] = String(value).replace(/[^A-Z0-9_-]/gi, '').slice(0, 50);
    }
    if (Object.keys(safeDetails).length) entry.details = safeDetails;
  }
  state.audit.unshift(entry);
  state.audit = state.audit.slice(0, MAX_AUDIT);
  return entry;
}

function validateCreateInput(input) {
  if (!CATEGORY_VALUES.has(input?.category)) {
    throw new ReportStoreError('INVALID_CATEGORY', 'Kategori laporan tidak valid.');
  }
  const details = String(input.details || '').trim();
  if (details.length < 20 || details.length > 1500) {
    throw new ReportStoreError('INVALID_DETAILS', 'Detail laporan harus berisi 20-1.500 karakter.');
  }
  const reporterId = String(input.reporterId || '');
  const targetUserId = input.targetUserId ? String(input.targetUserId) : null;
  const guildId = String(input.guildId || '');
  const externalId = String(input.externalId || '');
  if (!DISCORD_ID.test(reporterId) || !DISCORD_ID.test(guildId)) {
    throw new ReportStoreError('INVALID_ID', 'Identitas laporan tidak valid.');
  }
  if (targetUserId && !DISCORD_ID.test(targetUserId)) {
    throw new ReportStoreError('INVALID_ID', 'Member tujuan tidak valid.');
  }
  if (!EXTERNAL_ID.test(externalId)) {
    throw new ReportStoreError('INVALID_EXTERNAL_ID', 'Identitas request laporan tidak valid.');
  }
  return {
    category: input.category,
    details,
    reporterId,
    targetUserId,
    messageLink: input.messageLink || null,
    anonymous: input.anonymous === true,
    guildId,
    externalId,
  };
}

function createReport(input, options = {}) {
  const normalized = validateCreateInput(input);
  const state = readState();
  const existing = state.reports.find(report => report.externalId === normalized.externalId);
  if (existing) return { report: existing, created: false };
  const activeCount = state.reports.filter(report => (
    report.reporterId === normalized.reporterId && ACTIVE_STATUSES.has(report.status)
  )).length;
  if (activeCount >= MAX_OPEN_PER_REPORTER) {
    throw new ReportStoreError(
      'OPEN_REPORT_LIMIT',
      'Kamu sudah memiliki tiga laporan aktif. Tunggu salah satunya ditangani.',
    );
  }
  if (state.reports.length >= MAX_REPORTS) {
    throw new ReportStoreError(
      'REPORT_CAPACITY',
      'Ruang laporan sedang penuh. Coba lagi setelah moderator menyelesaikan arsip.',
    );
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const report = {
    id: crypto.randomBytes(8).toString('hex'),
    revision: 0,
    status: 'open',
    ...normalized,
    priority: derivePriority(normalized.category),
    prioritySource: 'category',
    createdAt: new Date(nowMs).toISOString(),
    claimedBy: null,
    claimedAt: null,
    finalNote: null,
    finalizedBy: null,
    finalizedAt: null,
    panel: null,
    evidence: null,
    deliveryStatus: 'reserved',
    deliveryAttemptAt: null,
    messageSyncPending: true,
    purgeRequestedAt: null,
  };
  state.reports.unshift(report);
  appendAudit(state, report.id, 'report_created', report.anonymous ? 'system' : report.reporterId);
  writeState(state);
  return { report, created: true };
}

function claimPanelDelivery(id, options = {}) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  if (!report) return { ok: false, reason: 'missing', report: null };
  if (report.panel || report.deliveryStatus !== 'reserved') {
    return { ok: false, reason: 'status', report };
  }
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  report.deliveryStatus = 'sending';
  report.deliveryAttemptAt = new Date(nowMs).toISOString();
  writeState(state);
  return { ok: true, reason: null, report };
}

function getReport(id) {
  return readState().reports.find(report => report.id === id) || null;
}

function listActiveReports() {
  return readState().reports
    .filter(report => report.status === 'open' || report.status === 'claimed')
    .sort((left, right) => (
      Date.parse(left.createdAt) - Date.parse(right.createdAt)
      || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
      || left.id.localeCompare(right.id)
    ));
}

function setPriority(id, actorId, priority, expectedRevision) {
  const normalizedActor = String(actorId || '');
  if (!DISCORD_ID.test(normalizedActor)) {
    throw new ReportStoreError('INVALID_ID', 'Identitas moderator tidak valid.');
  }
  if (!PRIORITIES.has(priority)) {
    throw new ReportStoreError('INVALID_PRIORITY', 'Prioritas laporan tidak valid.');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new ReportStoreError('INVALID_REVISION', 'Revisi laporan tidak valid.');
  }
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  const failure = transitionFailure(report, expectedRevision);
  if (failure) return failure;
  if (!['open', 'claimed', 'resolved', 'dismissed'].includes(report.status)) {
    return { ok: false, reason: 'status', report };
  }
  const previousPriority = report.priority;
  report.priority = priority;
  report.prioritySource = 'moderator';
  report.revision += 1;
  report.messageSyncPending = true;
  appendAudit(state, report.id, 'report_priority_changed', normalizedActor, {
    fromPriority: previousPriority,
    toPriority: priority,
  });
  writeState(state);
  return { ok: true, reason: null, report };
}

function setPanel(id, panel) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  if (!report || report.panel) return null;
  const channelId = String(panel?.channelId || '');
  const messageId = String(panel?.messageId || '');
  if (!DISCORD_ID.test(channelId) || !DISCORD_ID.test(messageId)) {
    throw new ReportStoreError('INVALID_PANEL', 'Identitas panel laporan tidak valid.');
  }
  report.panel = { channelId, messageId };
  report.evidence = panel.evidence ? {
    name: String(panel.evidence.name || '').slice(0, 100),
    url: String(panel.evidence.url || '').slice(0, 1000),
    contentType: String(panel.evidence.contentType || '').slice(0, 100),
    size: Number(panel.evidence.size) || 0,
  } : null;
  report.deliveryStatus = 'delivered';
  report.messageSyncPending = false;
  writeState(state);
  return report;
}

function abortPanelDelivery(id, errorCode = 'SEND_FAILED') {
  const state = readState();
  const index = state.reports.findIndex(report => report.id === id);
  if (index < 0) return false;
  const report = state.reports[index];
  if (report.status !== 'open' || report.panel) return false;
  state.reports.splice(index, 1);
  appendAudit(state, report.id, 'report_delivery_failed', 'system', {
    errorCode: String(errorCode || 'SEND_FAILED').toUpperCase(),
  });
  writeState(state);
  return true;
}

function transitionFailure(report, expectedRevision, requiredStatus = null) {
  if (!report) return { ok: false, reason: 'missing', report: null };
  if (report.revision !== expectedRevision) return { ok: false, reason: 'stale', report };
  if (requiredStatus && report.status !== requiredStatus) {
    return { ok: false, reason: 'status', report };
  }
  return null;
}

function claimReport(id, actorId, expectedRevision) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  const failure = transitionFailure(report, expectedRevision, 'open');
  if (failure) return failure;
  report.status = 'claimed';
  report.claimedBy = String(actorId);
  report.claimedAt = new Date().toISOString();
  report.revision += 1;
  report.messageSyncPending = true;
  appendAudit(state, report.id, 'report_claimed', actorId);
  writeState(state);
  return { ok: true, reason: null, report };
}

function releaseClaim(id, actorId, expectedRevision, ownerOverride = false) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  const failure = transitionFailure(report, expectedRevision, 'claimed');
  if (failure) return failure;
  if (!ownerOverride && report.claimedBy !== String(actorId)) {
    return { ok: false, reason: 'forbidden', report };
  }
  report.status = 'open';
  report.claimedBy = null;
  report.claimedAt = null;
  report.revision += 1;
  report.messageSyncPending = true;
  appendAudit(state, report.id, 'report_released', actorId);
  writeState(state);
  return { ok: true, reason: null, report };
}

function finalizeReport(id, status, actorId, note, expectedRevision, options = {}) {
  if (!FINAL_STATUSES.has(status)) {
    throw new ReportStoreError('INVALID_STATUS', 'Status final laporan tidak valid.');
  }
  const normalizedNote = String(note || '').trim();
  if (normalizedNote.length < 5 || normalizedNote.length > 500) {
    throw new ReportStoreError('INVALID_NOTE', 'Catatan moderator harus berisi 5-500 karakter.');
  }
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  const failure = transitionFailure(report, expectedRevision, 'claimed');
  if (failure) return failure;
  if (!options.ownerOverride && report.claimedBy !== String(actorId)) {
    return { ok: false, reason: 'forbidden', report };
  }
  report.status = status;
  report.finalNote = normalizedNote;
  report.finalizedBy = String(actorId);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  report.finalizedAt = new Date(nowMs).toISOString();
  report.revision += 1;
  report.messageSyncPending = true;
  appendAudit(state, report.id, `report_${status}`, actorId);
  writeState(state);
  return { ok: true, reason: null, report };
}

function reopenReport(id, actorId, expectedRevision) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  const failure = transitionFailure(report, expectedRevision);
  if (failure) return failure;
  if (!FINAL_STATUSES.has(report.status)) return { ok: false, reason: 'status', report };
  report.status = 'open';
  report.claimedBy = null;
  report.claimedAt = null;
  report.finalNote = null;
  report.finalizedBy = null;
  report.finalizedAt = null;
  report.revision += 1;
  report.messageSyncPending = true;
  appendAudit(state, report.id, 'report_reopened', actorId);
  writeState(state);
  return { ok: true, reason: null, report };
}

function markPurgePending(id, actorId, expectedRevision = null) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  if (!report) return null;
  if (expectedRevision !== null && report.revision !== expectedRevision) return null;
  if (report.status === 'purge_pending') return report;
  const previousStatus = report.status;
  report.status = 'purge_pending';
  report.purgeRequestedAt = new Date().toISOString();
  report.revision += 1;
  report.messageSyncPending = false;
  appendAudit(state, report.id, 'report_purge_pending', actorId, {
    fromStatus: previousStatus,
    toStatus: 'purge_pending',
  });
  writeState(state);
  return report;
}

function finalizePurge(id, actorId) {
  const state = readState();
  const index = state.reports.findIndex(report => report.id === id);
  if (index < 0 || state.reports[index].status !== 'purge_pending') return false;
  const [report] = state.reports.splice(index, 1);
  appendAudit(state, report.id, 'report_purged', actorId);
  writeState(state);
  return true;
}

function recordReporterReveal(id, actorId) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  if (!report) return false;
  appendAudit(state, report.id, 'reporter_revealed', actorId);
  writeState(state);
  return true;
}

function listSyncPending() {
  return readState().reports.filter(report => report.messageSyncPending && report.panel);
}

function listUnpanelledReports() {
  return readState().reports.filter(report => report.status === 'open' && !report.panel);
}

function markSynced(id) {
  const state = readState();
  const report = state.reports.find(item => item.id === id);
  if (!report) return null;
  report.messageSyncPending = false;
  writeState(state);
  return report;
}

function listRetentionDue(nowMs = Date.now()) {
  const retentionDays = positiveInteger(process.env.REPORT_RETENTION_DAYS, 30, 365);
  const cutoff = nowMs - (retentionDays * 86_400_000);
  return readState().reports.filter(report => (
    report.status === 'purge_pending'
    || (FINAL_STATUSES.has(report.status) && Date.parse(report.finalizedAt) <= cutoff)
  ));
}

function getAuditHistory(limit = 20) {
  const bounded = Math.max(1, Math.min(Number(limit) || 20, 50));
  return readState().audit.slice(0, bounded);
}

module.exports = {
  ReportStoreError,
  abortPanelDelivery,
  claimPanelDelivery,
  claimReport,
  createReport,
  derivePriority,
  finalizePurge,
  finalizeReport,
  getAuditHistory,
  getReport,
  listActiveReports,
  listRetentionDue,
  listSyncPending,
  listUnpanelledReports,
  markPurgePending,
  markSynced,
  recordReporterReveal,
  releaseClaim,
  reopenReport,
  setPanel,
  setPriority,
};
