const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const SERVICE = 'hengs-wa';
const MAX_EVENT_BYTES = 4096;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const RESTART_COOLDOWN_MS = 30 * 60 * 1000;
const STALE_PROCESSING_MS = 5 * 60 * 1000;
const MAX_HANDLED_IDS = 500;
const MAX_RETRY_IDS = 500;
const MAX_REJECTED_FILES = 50;
const POLL_INTERVAL_MS = 5_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const ALERT_CODES = new Set([
  'QR_REQUIRED',
  'AUTH_FAILED',
  'RECOVERY_RESTART',
  'CONNECTED',
]);
const STATUS_BY_CODE = {
  QR_REQUIRED: 'QR_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  RECOVERY_RESTART: 'RESTARTING',
};
const SEVERITY = {
  HEALTHY: 0,
  RESTARTING: 1,
  AUTH_FAILED: 2,
  QR_REQUIRED: 3,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_FILE = /^event-(\d+)-([0-9a-f-]+)\.json$/i;
const PROCESSING_FILE = /^(event-\d+-[0-9a-f-]+\.json)\.processing-\d+$/i;

const FIXED_MESSAGES = Object.freeze({
  QR_REQUIRED: [
    '**Hengs WA perlu scan QR.**',
    'Buka laptop dan scan QR dari jendela Hengs WA. QR sengaja tidak dikirim ke Discord demi keamanan sesi.',
  ].join('\n'),
  AUTH_FAILED: [
    '**Sesi Hengs WA tidak valid.**',
    'WhatsApp menolak atau me-logout sesi tersimpan. Siapkan scan QR ulang dari laptop.',
  ].join('\n'),
  RECOVERY_RESTART: [
    '**Hengs WA sedang memulihkan koneksi.**',
    'Watchdog menemukan koneksi tidak sehat dan menjalankan restart otomatis. Belum perlu scan QR.',
  ].join('\n'),
  CONNECTED: '**Hengs WA terhubung kembali.** Masalah sebelumnya sudah pulih.',
});

class AlertContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AlertContractError';
    this.code = code;
  }
}

class AlertDeliveryError extends Error {
  constructor() {
    super('DELIVERY_FAILED');
    this.name = 'AlertDeliveryError';
    this.code = 'DELIVERY_FAILED';
  }
}

function resolveBridgeDir(env = process.env) {
  const configured = String(env.HENGS_ALERT_BRIDGE_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '..', '..', '..', '.runtime', 'wa-recovery-alerts');
}

function isWaRecoveryEnabled(env = process.env) {
  const configured = String(env.HENGS_WA_RECOVERY_ALERTS_ENABLED || '').trim().toLowerCase();
  if (!configured) return true;
  return configured === 'true';
}

function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'HEALTHY',
    problemDelivered: false,
    lastDeliveredAt: null,
    handledIds: [],
    retries: {},
  };
}

function validateEvent(value, { now = Date.now(), sizeBytes = 0 } = {}) {
  if (sizeBytes > MAX_EVENT_BYTES) throw new AlertContractError('EVENT_TOO_LARGE');
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AlertContractError('INVALID_EVENT');
  }
  const keys = Object.keys(value).sort();
  const expected = ['code', 'id', 'occurredAt', 'schemaVersion', 'service'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new AlertContractError('UNKNOWN_KEYS');
  }
  if (value.schemaVersion !== SCHEMA_VERSION) throw new AlertContractError('INVALID_SCHEMA');
  if (!UUID.test(value.id)) throw new AlertContractError('INVALID_ID');
  if (value.service !== SERVICE) throw new AlertContractError('INVALID_SERVICE');
  if (!ALERT_CODES.has(value.code)) throw new AlertContractError('INVALID_CODE');

  const occurredAtMs = Date.parse(value.occurredAt);
  if (!Number.isFinite(occurredAtMs) || new Date(occurredAtMs).toISOString() !== value.occurredAt) {
    throw new AlertContractError('INVALID_TIME');
  }
  if (occurredAtMs - now > FUTURE_SKEW_MS) throw new AlertContractError('FUTURE_EVENT');
  if (now - occurredAtMs > EVENT_TTL_MS) throw new AlertContractError('STALE_EVENT');
  return { ...value, occurredAtMs };
}

function eventTime(value) {
  return Number.isFinite(value.occurredAtMs) ? value.occurredAtMs : Date.parse(value.occurredAt);
}

function healthyStateFrom(state) {
  return {
    ...createDefaultState(),
    handledIds: [...(state.handledIds || [])],
    retries: { ...(state.retries || {}) },
  };
}

function reduceBatch(events, state = createDefaultState(), now = Date.now()) {
  const ordered = [...events].sort((left, right) => eventTime(left) - eventTime(right));
  const lastConnected = ordered.reduce(
    (found, value, index) => value.code === 'CONNECTED' ? index : found,
    -1,
  );
  const segment = ordered.slice(lastConnected + 1).filter(value => value.code !== 'CONNECTED');

  if (segment.length === 0) {
    const shouldRecover = Boolean(state.problemDelivered) && ordered.some(value => value.code === 'CONNECTED');
    return {
      notification: shouldRecover ? { code: 'CONNECTED' } : null,
      nextState: healthyStateFrom(state),
    };
  }

  const baseline = lastConnected >= 0 ? healthyStateFrom(state) : { ...state };
  if (lastConnected >= 0) {
    baseline.status = 'HEALTHY';
    baseline.problemDelivered = false;
    baseline.lastDeliveredAt = null;
  }
  const selected = segment.reduce((strongest, value) => {
    const status = STATUS_BY_CODE[value.code];
    if (!strongest || SEVERITY[status] >= SEVERITY[STATUS_BY_CODE[strongest.code]]) return value;
    return strongest;
  }, null);
  const selectedStatus = STATUS_BY_CODE[selected.code];
  const baselineSeverity = SEVERITY[baseline.status] || 0;
  const selectedSeverity = SEVERITY[selectedStatus];

  let notify = !baseline.problemDelivered || selectedSeverity > baselineSeverity;
  if (
    baseline.problemDelivered
    && baseline.status === 'RESTARTING'
    && selectedStatus === 'RESTARTING'
  ) {
    notify = Number.isFinite(baseline.lastDeliveredAt)
      && now - baseline.lastDeliveredAt >= RESTART_COOLDOWN_MS;
  } else if (baseline.problemDelivered && selectedSeverity <= baselineSeverity) {
    notify = false;
  }

  if (!notify) return { notification: null, nextState: baseline };
  return {
    notification: { code: selected.code },
    nextState: {
      ...baseline,
      status: selectedStatus,
      problemDelivered: true,
      lastDeliveredAt: now,
    },
  };
}

function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AlertContractError('STATE_CORRUPT');
  if (value.schemaVersion !== SCHEMA_VERSION) throw new AlertContractError('STATE_CORRUPT');
  if (!Object.hasOwn(SEVERITY, value.status)) throw new AlertContractError('STATE_CORRUPT');
  if (typeof value.problemDelivered !== 'boolean') throw new AlertContractError('STATE_CORRUPT');
  if (value.lastDeliveredAt !== null && !Number.isFinite(value.lastDeliveredAt)) {
    throw new AlertContractError('STATE_CORRUPT');
  }
  if (!Array.isArray(value.handledIds) || value.handledIds.some(id => !UUID.test(id))) {
    throw new AlertContractError('STATE_CORRUPT');
  }
  if (!value.retries || typeof value.retries !== 'object' || Array.isArray(value.retries)) {
    throw new AlertContractError('STATE_CORRUPT');
  }
  const retries = Object.entries(value.retries).map(([id, retry]) => {
    if (!UUID.test(id) || !retry || typeof retry !== 'object' || Array.isArray(retry)) {
      throw new AlertContractError('STATE_CORRUPT');
    }
    if (JSON.stringify(Object.keys(retry).sort()) !== JSON.stringify(['attempts', 'nextAt'])) {
      throw new AlertContractError('STATE_CORRUPT');
    }
    if (!Number.isInteger(retry.attempts) || retry.attempts < 1 || !Number.isFinite(retry.nextAt)) {
      throw new AlertContractError('STATE_CORRUPT');
    }
    return [id, { attempts: retry.attempts, nextAt: retry.nextAt }];
  });
  retries.sort((left, right) => left[1].nextAt - right[1].nextAt || left[0].localeCompare(right[0]));
  return {
    ...value,
    handledIds: value.handledIds.slice(-MAX_HANDLED_IDS),
    retries: Object.fromEntries(retries.slice(-MAX_RETRY_IDS)),
  };
}

function atomicWriteJson(io, file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    io.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', flag: 'w' });
    io.renameSync(temporary, file);
  } catch (error) {
    try { io.unlinkSync(temporary); } catch {}
    throw error;
  }
}

async function deliverFixedAlert({ client, code, ownerId, settingsChannelId, guildId }) {
  const payload = {
    content: FIXED_MESSAGES[code],
    allowedMentions: { parse: [] },
  };
  try {
    const owner = await client.users.fetch(ownerId);
    await owner.send(payload);
    return 'dm';
  } catch {}

  try {
    if (!settingsChannelId || !guildId) throw new Error('missing fallback config');
    const channel = await client.channels.fetch(settingsChannelId);
    if (!channel?.isTextBased?.() || String(channel.guildId) !== String(guildId)) {
      throw new Error('invalid fallback channel');
    }
    await channel.send(payload);
    return 'channel';
  } catch {
    throw new AlertDeliveryError();
  }
}

function createWaRecoveryAlertConsumer({
  client,
  enabled = true,
  queueDir = resolveBridgeDir(),
  ownerId = process.env.OWNER_ID,
  settingsChannelId = process.env.BOT_SETTINGS_CHANNEL_ID,
  guildId = process.env.DISCORD_GUILD_ID,
  fsImpl = fs,
  now = Date.now,
  logger = console,
} = {}) {
  const stateFile = path.join(queueDir, 'consumer-state.json');
  let timer = null;
  let busy = false;

  function loadState() {
    if (!fsImpl.existsSync(stateFile)) return createDefaultState();
    try {
      return validateState(JSON.parse(fsImpl.readFileSync(stateFile, 'utf8')));
    } catch {
      throw new AlertContractError('STATE_CORRUPT');
    }
  }

  function saveState(state) {
    atomicWriteJson(fsImpl, stateFile, validateState(state));
  }

  function listPending() {
    return fsImpl.readdirSync(queueDir)
      .filter(name => EVENT_FILE.test(name))
      .sort((left, right) => Number(EVENT_FILE.exec(left)[1]) - Number(EVENT_FILE.exec(right)[1]));
  }

  function returnClaims(claims) {
    for (const claim of claims) {
      try {
        if (!fsImpl.existsSync(claim.original)) fsImpl.renameSync(claim.processing, claim.original);
        else fsImpl.unlinkSync(claim.processing);
      } catch {}
    }
  }

  function trimRejected(rejectedDir) {
    const files = fsImpl.readdirSync(rejectedDir).sort();
    for (const name of files.slice(0, Math.max(0, files.length - MAX_REJECTED_FILES))) {
      try { fsImpl.unlinkSync(path.join(rejectedDir, name)); } catch {}
    }
  }

  function rejectClaim(claim) {
    const rejectedDir = path.join(queueDir, 'rejected');
    fsImpl.mkdirSync(rejectedDir, { recursive: true });
    const target = path.join(rejectedDir, `rejected-${now()}-${path.basename(claim.original)}`);
    try { fsImpl.renameSync(claim.processing, target); } catch {
      try { fsImpl.unlinkSync(claim.processing); } catch {}
    }
    trimRejected(rejectedDir);
    logger.warn('[wa-alert] INVALID_EVENT');
  }

  function recoverStaleProcessing() {
    fsImpl.mkdirSync(queueDir, { recursive: true });
    for (const name of fsImpl.readdirSync(queueDir)) {
      const match = PROCESSING_FILE.exec(name);
      if (!match) continue;
      const processing = path.join(queueDir, name);
      if (now() - fsImpl.statSync(processing).mtimeMs < STALE_PROCESSING_MS) continue;
      const original = path.join(queueDir, match[1]);
      try {
        if (fsImpl.existsSync(original)) fsImpl.unlinkSync(processing);
        else fsImpl.renameSync(processing, original);
      } catch {
        logger.error('[wa-alert] RECOVERY_FAILED');
      }
    }
  }

  async function pollOnce() {
    if (!enabled || busy) return;
    busy = true;
    try {
      if (!ownerId) {
        logger.error('[wa-alert] CONFIG_INVALID');
        return;
      }
      fsImpl.mkdirSync(queueDir, { recursive: true });
      let state;
      try {
        state = loadState();
      } catch {
        logger.error('[wa-alert] STATE_CORRUPT');
        return;
      }

      const claims = [];
      const valid = [];
      const handled = new Set(state.handledIds);
      for (const name of listPending()) {
        const original = path.join(queueDir, name);
        const processing = `${original}.processing-${process.pid}`;
        try { fsImpl.renameSync(original, processing); } catch { continue; }
        const claim = { original, processing };
        claims.push(claim);
        try {
          const sizeBytes = fsImpl.statSync(processing).size;
          if (sizeBytes > MAX_EVENT_BYTES) throw new AlertContractError('EVENT_TOO_LARGE');
          const parsed = JSON.parse(fsImpl.readFileSync(processing, 'utf8'));
          const value = validateEvent(parsed, { now: now(), sizeBytes });
          if (handled.has(value.id)) {
            fsImpl.unlinkSync(processing);
            claims.pop();
            continue;
          }
          const retry = state.retries[value.id];
          if (retry && Number(retry.nextAt) > now()) {
            fsImpl.renameSync(processing, original);
            claims.pop();
            continue;
          }
          valid.push({ value, claim });
        } catch {
          rejectClaim(claim);
          claims.pop();
        }
      }
      if (valid.length === 0) return;

      const decision = reduceBatch(valid.map(item => item.value), state, now());
      if (decision.notification) {
        try {
          await deliverFixedAlert({
            client,
            code: decision.notification.code,
            ownerId,
            settingsChannelId,
            guildId,
          });
        } catch {
          const retries = { ...state.retries };
          for (const { value } of valid) {
            const attempts = Number(retries[value.id]?.attempts || 0) + 1;
            const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** (attempts - 1)));
            retries[value.id] = { attempts, nextAt: now() + delay };
          }
          try { saveState({ ...state, retries }); } catch {
            logger.error('[wa-alert] STATE_WRITE_FAILED');
          }
          returnClaims(claims);
          logger.error('[wa-alert] DELIVERY_FAILED');
          return;
        }
      }

      const retries = { ...decision.nextState.retries };
      for (const { value } of valid) delete retries[value.id];
      const nextState = {
        ...decision.nextState,
        handledIds: [...new Set([
          ...state.handledIds,
          ...valid.map(item => item.value.id),
        ])].slice(-MAX_HANDLED_IDS),
        retries,
      };
      try {
        saveState(nextState);
      } catch {
        returnClaims(claims);
        logger.error('[wa-alert] STATE_WRITE_FAILED');
        return;
      }
      for (const { claim } of valid) {
        try { fsImpl.unlinkSync(claim.processing); } catch {}
      }
    } finally {
      busy = false;
    }
  }

  function start() {
    if (!enabled || timer) return;
    if (!ownerId) {
      logger.error('[wa-alert] CONFIG_INVALID');
      return;
    }
    try { recoverStaleProcessing(); } catch {
      logger.error('[wa-alert] RECOVERY_FAILED');
      return;
    }
    timer = setInterval(() => {
      pollOnce().catch(() => logger.error('[wa-alert] POLL_FAILED'));
    }, POLL_INTERVAL_MS);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { pollOnce, start, stop };
}

module.exports = {
  ALERT_CODES,
  EVENT_TTL_MS,
  FUTURE_SKEW_MS,
  MAX_EVENT_BYTES,
  RESTART_COOLDOWN_MS,
  AlertContractError,
  createDefaultState,
  createWaRecoveryAlertConsumer,
  deliverFixedAlert,
  isWaRecoveryEnabled,
  reduceBatch,
  resolveBridgeDir,
  validateEvent,
};
