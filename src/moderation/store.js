const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.MODERATION_DATA_DIR
  ? path.resolve(process.env.MODERATION_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'moderation-state.json');
const MAX_INCIDENTS = 500;
const ADJACENT_DETECTION_WINDOW_MS = 60_000;
const MAX_AUDIT = 500;
const DISCORD_ID = /^\d{15,22}$/;
const INCIDENT_ID = /^[a-f0-9]{16}$/;
const MODES = new Set(['active', 'monitor', 'off']);
const ALLOWLIST_KINDS = Object.freeze({ role: 'roleIds', channel: 'channelIds', domain: 'domains' });
const ALLOWLIST_ACTIONS = new Set(['add', 'remove']);
const TRIGGERS = new Set([
  'BLOCKED_DOMAIN',
  'CROSS_CHANNEL_ATTACHMENT_FLOOD',
  'CROSS_CHANNEL_REPEAT',
  'SINGLE_CHANNEL_BURST',
]);
const INCIDENT_STATUSES = new Set(['detected', 'enforcing', 'banned', 'monitor', 'partial', 'failed']);
const FINAL_STATUSES = new Set(['banned', 'monitor', 'partial', 'failed']);
const ISSUE_CODES = new Set([
  'MOD_LOG_PUBLIC',
  'MOD_LOG_UNAVAILABLE',
  'BAN_MEMBERS_MISSING',
  'MANAGE_MESSAGES_MISSING',
  'TARGET_UNBANNABLE',
  'POLICY_INVALID',
  'BAN_FAILED',
  'DELETE_FAILED',
  'BAN_AND_DELETE_FAILED',
  'PREREQUISITES_CHANGED',
  'NOT_BANNED',
]);
const AUDIT_DETAIL_KEYS = new Set(['fromMode', 'toMode', 'trigger', 'status']);
const AUDIT_ACTIONS = new Set([
  'mode_changed',
  'allowlist_role_add',
  'allowlist_role_remove',
  'allowlist_channel_add',
  'allowlist_channel_remove',
  'allowlist_domain_add',
  'allowlist_domain_remove',
  'incident_detected',
  'enforcement_claimed',
  'incident_finalized',
  'incident_panel_set',
]);

class ModerationStoreError extends Error {
  constructor(code, userMessage, diagnosticCode = null) {
    super(userMessage);
    this.name = 'ModerationStoreError';
    this.code = code;
    this.userMessage = userMessage;
    this.diagnosticCode = diagnosticCode;
  }
}

function defaultMode() {
  const requested = String(process.env.ANTI_RAID_MODE || 'active').trim().toLowerCase();
  return MODES.has(requested) ? requested : 'monitor';
}

function defaultState() {
  return {
    schemaVersion: 1,
    revision: 0,
    mode: defaultMode(),
    allowlist: { roleIds: [], channelIds: [], domains: [] },
    incidents: [],
    audit: [],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validDate(value, nullable = false) {
  return (nullable && value === null)
    || (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)));
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253 || /[^\x00-\x7F]/.test(domain) || /[/?#@:]/.test(domain)) return null;
  if (domain.includes('..')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return domain;
}

function validPanel(panel) {
  return panel === null || (
    panel
    && typeof panel === 'object'
    && DISCORD_ID.test(panel.channelId)
    && DISCORD_ID.test(panel.messageId)
    && Object.keys(panel).every(key => key === 'channelId' || key === 'messageId')
  );
}

function validIssueCode(value) {
  return value === null || ISSUE_CODES.has(value);
}

function validResult(result) {
  return result === null || (
    result
    && typeof result === 'object'
    && FINAL_STATUSES.has(result.status)
    && typeof result.banSucceeded === 'boolean'
    && typeof result.deletionSucceeded === 'boolean'
    && Number.isSafeInteger(result.deletedCount)
    && result.deletedCount >= 0
    && validIssueCode(result.issueCode)
    && Object.keys(result).every(key => [
      'status', 'banSucceeded', 'deletionSucceeded', 'deletedCount', 'issueCode',
    ].includes(key))
  );
}

function normalizeResult(result) {
  if (
    !result
    || typeof result !== 'object'
    || !FINAL_STATUSES.has(result.status)
    || typeof result.banSucceeded !== 'boolean'
    || typeof result.deletionSucceeded !== 'boolean'
    || !Number.isSafeInteger(result.deletedCount)
    || result.deletedCount < 0
    || !validIssueCode(result.issueCode)
  ) return null;
  return {
    status: result.status,
    banSucceeded: result.banSucceeded,
    deletionSucceeded: result.deletionSucceeded,
    deletedCount: result.deletedCount,
    issueCode: result.issueCode,
  };
}

function validIncident(incident) {
  return incident
    && typeof incident === 'object'
    && INCIDENT_ID.test(incident.id)
    && typeof incident.externalKey === 'string'
    && incident.externalKey === `${incident.guildId}:${incident.memberId}:${incident.detectionWindowStartMs}`
    && DISCORD_ID.test(incident.guildId)
    && DISCORD_ID.test(incident.memberId)
    && Number.isSafeInteger(incident.detectionWindowStartMs)
    && incident.detectionWindowStartMs >= 0
    && validRevision(incident.revision)
    && INCIDENT_STATUSES.has(incident.status)
    && TRIGGERS.has(incident.trigger)
    && Number.isSafeInteger(incident.messageCount)
    && incident.messageCount > 0
    && Number.isSafeInteger(incident.channelCount)
    && incident.channelCount > 0
    && incident.channelCount <= incident.messageCount
    && validDate(incident.createdAt)
    && validDate(incident.finalizedAt, true)
    && validPanel(incident.panel)
    && validResult(incident.result)
    && Object.keys(incident).every(key => [
      'id', 'externalKey', 'guildId', 'memberId', 'detectionWindowStartMs', 'revision',
      'status', 'trigger', 'messageCount', 'channelCount', 'createdAt', 'finalizedAt',
      'panel', 'result',
    ].includes(key))
    && (incident.status === 'enforcing' || incident.status === 'detected'
      ? incident.finalizedAt === null && incident.result === null
      : incident.finalizedAt !== null && incident.result?.status === incident.status);
}

function validAudit(entry) {
  if (
    !entry
    || typeof entry !== 'object'
    || !/^[a-f0-9]{12}$/.test(entry.id)
    || !(INCIDENT_ID.test(entry.incidentId) || entry.incidentId === 'state')
    || !AUDIT_ACTIONS.has(entry.action)
    || !(DISCORD_ID.test(entry.actorId) || entry.actorId === 'system')
    || !validDate(entry.at)
    || Object.keys(entry).some(key => !['id', 'incidentId', 'action', 'actorId', 'at', 'details'].includes(key))
  ) return false;
  if (entry.details === undefined) return true;
  return entry.details
    && typeof entry.details === 'object'
    && !Array.isArray(entry.details)
    && Object.entries(entry.details).every(([key, value]) => AUDIT_DETAIL_KEYS.has(key) && typeof value === 'string' && /^[A-Z0-9_]{1,50}$/.test(value));
}

function validateState(state) {
  if (
    !state
    || typeof state !== 'object'
    || state.schemaVersion !== 1
    || !validRevision(state.revision)
    || !MODES.has(state.mode)
    || !state.allowlist
    || !Array.isArray(state.allowlist.roleIds)
    || !Array.isArray(state.allowlist.channelIds)
    || !Array.isArray(state.allowlist.domains)
    || !Array.isArray(state.incidents)
    || !Array.isArray(state.audit)
    || state.incidents.length > MAX_INCIDENTS
    || state.audit.length > MAX_AUDIT
    || Object.keys(state).some(key => !['schemaVersion', 'revision', 'mode', 'allowlist', 'incidents', 'audit'].includes(key))
    || Object.keys(state.allowlist).some(key => !['roleIds', 'channelIds', 'domains'].includes(key))
  ) throw new Error('invalid moderation state');

  const roleIds = new Set(state.allowlist.roleIds);
  const channelIds = new Set(state.allowlist.channelIds);
  const domains = new Set(state.allowlist.domains);
  if (
    roleIds.size !== state.allowlist.roleIds.length
    || channelIds.size !== state.allowlist.channelIds.length
    || domains.size !== state.allowlist.domains.length
    || !state.allowlist.roleIds.every(value => DISCORD_ID.test(value))
    || !state.allowlist.channelIds.every(value => DISCORD_ID.test(value))
    || !state.allowlist.domains.every(value => normalizeDomain(value) === value)
  ) throw new Error('invalid moderation allowlist');

  const incidentIds = new Set();
  const externalKeys = new Set();
  for (const incident of state.incidents) {
    if (!validIncident(incident) || incidentIds.has(incident.id) || externalKeys.has(incident.externalKey)) {
      throw new Error('invalid moderation incident');
    }
    incidentIds.add(incident.id);
    externalKeys.add(incident.externalKey);
  }
  if (!state.audit.every(validAudit)) throw new Error('invalid moderation audit');
  return state;
}

function migrateLegacyState(state) {
  if (!state || typeof state !== 'object' || state.schema !== 1 || state.schemaVersion !== undefined) return null;
  const allowedKeys = new Set(['schema', 'revision', 'mode', 'allowlist', 'incidents', 'audit']);
  if (Object.keys(state).some(key => !allowedKeys.has(key))) return null;
  const migrated = { ...state, schemaVersion: state.schema };
  delete migrated.schema;
  return migrated;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const migrated = migrateLegacyState(parsed);
    const state = validateState(migrated || parsed);
    if (migrated) writeState(state);
    return state;
  } catch (error) {
    const diagnosticCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? error.code
      : 'STATE_INVALID';
    throw new ModerationStoreError(
      'STATE_CORRUPT',
      'Data moderasi sedang tidak tersedia. Hubungi owner.',
      diagnosticCode,
    );
  }
}

// The runtime lock guarantees a single bot process; revisions protect competing in-process handlers.
function writeState(state) {
  validateState(state);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    fs.writeFileSync(descriptor, JSON.stringify(state, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, STATE_FILE);
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
}

function appendAudit(state, incidentId, action, actorId = 'system', details = null) {
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    incidentId: INCIDENT_ID.test(incidentId) ? incidentId : 'state',
    action,
    actorId: DISCORD_ID.test(String(actorId)) ? String(actorId) : 'system',
    at: new Date().toISOString(),
  };
  if (details) {
    const safeDetails = {};
    for (const [key, value] of Object.entries(details)) {
      if (!AUDIT_DETAIL_KEYS.has(key) || typeof value !== 'string' || !/^[A-Z0-9_]{1,50}$/.test(value)) continue;
      safeDetails[key] = value;
    }
    if (Object.keys(safeDetails).length) entry.details = safeDetails;
  }
  state.audit.unshift(entry);
  state.audit = state.audit.slice(0, MAX_AUDIT);
}

function transitionFailure(target, expectedRevision) {
  if (!target) return { ok: false, reason: 'missing', incident: null };
  if (target.revision !== expectedRevision) return { ok: false, reason: 'stale', incident: clone(target) };
  return null;
}

function validExpectedRevision(value) {
  if (!validRevision(value)) throw new ModerationStoreError('INVALID_REVISION', 'Revisi moderasi tidak valid.');
}

function validateActor(actorId) {
  const normalized = String(actorId || '');
  if (!DISCORD_ID.test(normalized)) throw new ModerationStoreError('INVALID_ACTOR', 'Identitas moderator tidak valid.');
  return normalized;
}

function getState() {
  return clone(readState());
}

function getMode() {
  const state = readState();
  return { mode: state.mode, revision: state.revision };
}

function setMode(mode, actorId, expectedRevision) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!MODES.has(normalizedMode)) throw new ModerationStoreError('INVALID_MODE', 'Mode moderasi tidak valid.');
  const actor = validateActor(actorId);
  validExpectedRevision(expectedRevision);
  const state = readState();
  if (state.revision !== expectedRevision) return { ok: false, reason: 'stale', state: clone(state) };
  const previousMode = state.mode;
  state.mode = normalizedMode;
  state.revision += 1;
  appendAudit(state, 'state', 'mode_changed', actor, { fromMode: previousMode.toUpperCase(), toMode: normalizedMode.toUpperCase() });
  writeState(state);
  return { ok: true, reason: null, state: clone(state) };
}

function mutateAllowlist(kind, action, value, actorId, expectedRevision) {
  const field = ALLOWLIST_KINDS[kind];
  if (!field || !ALLOWLIST_ACTIONS.has(action)) {
    throw new ModerationStoreError('INVALID_ALLOWLIST', 'Perubahan allowlist tidak valid.');
  }
  const actor = validateActor(actorId);
  validExpectedRevision(expectedRevision);
  const normalized = field === 'domains' ? normalizeDomain(value) : String(value || '').trim();
  if (!normalized || (field !== 'domains' && !DISCORD_ID.test(normalized))) {
    throw new ModerationStoreError('INVALID_ALLOWLIST', 'Nilai allowlist tidak valid.');
  }
  const state = readState();
  if (state.revision !== expectedRevision) return { ok: false, reason: 'stale', state: clone(state) };
  const values = new Set(state.allowlist[field]);
  if (action === 'add') values.add(normalized);
  else values.delete(normalized);
  state.allowlist[field] = [...values].sort();
  state.revision += 1;
  appendAudit(state, 'state', `allowlist_${kind}_${action}`, actor);
  writeState(state);
  return { ok: true, reason: null, state: clone(state) };
}

function normalizeIncidentInput(input) {
  const guildId = String(input?.guildId || '');
  const memberId = String(input?.memberId || '');
  const detectionWindowStartMs = input?.detectionWindowStartMs;
  const trigger = String(input?.trigger || '');
  const messageCount = input?.messageCount;
  const channelCount = input?.channelCount;
  if (!DISCORD_ID.test(guildId) || !DISCORD_ID.test(memberId)) {
    throw new ModerationStoreError('INVALID_INCIDENT', 'Identitas insiden tidak valid.');
  }
  if (!Number.isSafeInteger(detectionWindowStartMs) || detectionWindowStartMs < 0 || !TRIGGERS.has(trigger)) {
    throw new ModerationStoreError('INVALID_INCIDENT', 'Deteksi insiden tidak valid.');
  }
  if (!Number.isSafeInteger(messageCount) || messageCount <= 0 || !Number.isSafeInteger(channelCount) || channelCount <= 0 || channelCount > messageCount) {
    throw new ModerationStoreError('INVALID_INCIDENT', 'Bukti insiden tidak valid.');
  }
  return { guildId, memberId, detectionWindowStartMs, trigger, messageCount, channelCount };
}

function createOrGetIncident(input) {
  const normalized = normalizeIncidentInput(input);
  const externalKey = `${normalized.guildId}:${normalized.memberId}:${normalized.detectionWindowStartMs}`;
  const state = readState();
  const existing = state.incidents.find(incident => incident.externalKey === externalKey);
  if (existing) return { incident: clone(existing), created: false };
  const adjacent = state.incidents.find(incident => (
    incident.guildId === normalized.guildId
    && incident.memberId === normalized.memberId
    && Math.abs(incident.detectionWindowStartMs - normalized.detectionWindowStartMs) === ADJACENT_DETECTION_WINDOW_MS
  ));
  if (adjacent) return { incident: clone(adjacent), created: false };

  if (state.incidents.length >= MAX_INCIDENTS) {
    const finalized = state.incidents.filter(incident => FINAL_STATUSES.has(incident.status) && incident.panel);
    if (!finalized.length) {
      throw new ModerationStoreError('INCIDENT_CAPACITY', 'Ruang insiden moderasi sedang penuh.');
    }
    const oldest = finalized.reduce((candidate, incident) => (
      !candidate || Date.parse(incident.finalizedAt) <= Date.parse(candidate.finalizedAt)
        ? incident
        : candidate
    ), null);
    state.incidents.splice(state.incidents.findIndex(incident => incident.id === oldest.id), 1);
  }

  const incident = {
    id: crypto.randomBytes(8).toString('hex'),
    externalKey,
    ...normalized,
    revision: 0,
    status: 'detected',
    createdAt: new Date().toISOString(),
    finalizedAt: null,
    panel: null,
    result: null,
  };
  state.incidents.unshift(incident);
  appendAudit(state, incident.id, 'incident_detected', 'system', { trigger: incident.trigger });
  writeState(state);
  return { incident: clone(incident), created: true };
}

function claimEnforcement(id, expectedRevision) {
  validExpectedRevision(expectedRevision);
  const state = readState();
  const incident = state.incidents.find(item => item.id === id);
  const failure = transitionFailure(incident, expectedRevision);
  if (failure) return failure;
  if (incident.status !== 'detected') return { ok: false, reason: 'status', incident: clone(incident) };
  incident.status = 'enforcing';
  incident.revision += 1;
  appendAudit(state, incident.id, 'enforcement_claimed');
  writeState(state);
  return { ok: true, reason: null, incident: clone(incident) };
}

function finalizeIncident(id, result, expectedRevision) {
  validExpectedRevision(expectedRevision);
  const normalizedResult = normalizeResult(result);
  if (!normalizedResult) {
    throw new ModerationStoreError('INVALID_RESULT', 'Hasil penegakan moderasi tidak valid.');
  }
  const state = readState();
  const incident = state.incidents.find(item => item.id === id);
  const failure = transitionFailure(incident, expectedRevision);
  if (failure) return failure;
  if (incident.status !== 'enforcing') return { ok: false, reason: 'status', incident: clone(incident) };
  incident.status = normalizedResult.status;
  incident.result = normalizedResult;
  incident.finalizedAt = new Date().toISOString();
  incident.revision += 1;
  appendAudit(state, incident.id, 'incident_finalized', 'system', { status: normalizedResult.status.toUpperCase() });
  writeState(state);
  return { ok: true, reason: null, incident: clone(incident) };
}

function setIncidentPanel(id, panel, expectedRevision) {
  validExpectedRevision(expectedRevision);
  if (!panel || typeof panel !== 'object') {
    throw new ModerationStoreError('INVALID_PANEL', 'Panel insiden tidak valid.');
  }
  const normalizedPanel = {
    channelId: String(panel.channelId || ''),
    messageId: String(panel.messageId || ''),
  };
  if (!validPanel(normalizedPanel)) throw new ModerationStoreError('INVALID_PANEL', 'Panel insiden tidak valid.');
  const state = readState();
  const incident = state.incidents.find(item => item.id === id);
  const failure = transitionFailure(incident, expectedRevision);
  if (failure) return failure;
  if (incident.panel) return { ok: false, reason: 'status', incident: clone(incident) };
  incident.panel = normalizedPanel;
  incident.revision += 1;
  appendAudit(state, incident.id, 'incident_panel_set');
  writeState(state);
  return { ok: true, reason: null, incident: clone(incident) };
}

function listIncidents() {
  return clone(readState().incidents);
}

function listRecoverableIncidents() {
  return clone(readState().incidents.filter(incident => incident.status === 'enforcing' || !incident.panel));
}

module.exports = {
  ModerationStoreError,
  claimEnforcement,
  createOrGetIncident,
  finalizeIncident,
  getMode,
  getState,
  listIncidents,
  listRecoverableIncidents,
  mutateAllowlist,
  setIncidentPanel,
  setMode,
};
