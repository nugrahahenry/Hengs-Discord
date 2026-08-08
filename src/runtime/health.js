const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_STALE_AFTER_MS = 90_000;
const CONNECTION_STATES = new Set([
  'STARTING',
  'CONNECTED',
  'RECONNECTING',
  'DISCONNECTED',
  'DEGRADED',
  'INVALIDATED',
  'STOPPING',
  'STOPPED',
  'FAILED',
]);
const FINAL_STATES = new Set(['FAILED', 'INVALIDATED']);
const ISSUE_CODES = new Set([
  'CLIENT_ERROR',
  'GATEWAY_ERROR',
  'LOGIN_FAILED',
  'SESSION_INVALIDATED',
  'UNCAUGHT_EXCEPTION',
  'UNHANDLED_REJECTION',
]);

function iso(ms) {
  return new Date(ms).toISOString();
}

function boundedStaleAfter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STALE_AFTER_MS;
  return Math.min(300_000, Math.max(30_000, Math.trunc(parsed)));
}

function normalizeIssueCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return ISSUE_CODES.has(code) ? code : null;
}

function defaultHealthFile() {
  return process.env.HENGS_RUNTIME_HEALTH_FILE
    ? path.resolve(process.env.HENGS_RUNTIME_HEALTH_FILE)
    : path.join(__dirname, '..', '..', 'data', 'runtime-health.json');
}

function createRuntimeHealth(options = {}) {
  const filePath = options.filePath || defaultHealthFile();
  const version = String(options.version || '0.0.0').slice(0, 32);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const logger = options.logger || console;
  const intervalMs = Math.max(1_000, Number(options.intervalMs) || DEFAULT_INTERVAL_MS);
  const staleAfterMs = boundedStaleAfter(options.staleAfterMs);
  const startedAtMs = now();

  let connectionStatus = 'STARTING';
  let connectionChangedAtMs = startedAtMs;
  let lastIssue = null;
  let timer = null;

  function snapshot(atMs = now()) {
    const heartbeatStatus = connectionStatus === 'STOPPED' ? 'STOPPED' : 'ALIVE';
    return {
      schemaVersion: 1,
      service: 'hengs-discord',
      version,
      status: connectionStatus.toLowerCase(),
      online: connectionStatus === 'CONNECTED',
      processStartedAt: iso(startedAtMs),
      updatedAt: iso(atMs),
      uptimeSeconds: Math.max(0, Math.floor((atMs - startedAtMs) / 1_000)),
      staleAfterMs,
      connection: {
        status: connectionStatus,
        at: iso(connectionChangedAtMs),
      },
      heartbeat: {
        status: heartbeatStatus,
        at: iso(atMs),
      },
      lastIssue,
    };
  }

  function write() {
    const payload = snapshot();
    const directory = path.dirname(filePath);
    const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    let fd = null;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fd = fs.openSync(temporary, 'wx');
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2), 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(temporary, filePath);
      return true;
    } catch (error) {
      logger.error?.(`[runtime-health] snapshot gagal ditulis (${error?.code || 'UNKNOWN'}).`);
      return false;
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }
      try { fs.rmSync(temporary, { force: true }); } catch {}
    }
  }

  function setConnection(status, issueCode = null) {
    const normalized = String(status || '').trim().toUpperCase();
    if (!CONNECTION_STATES.has(normalized)) return false;
    const atMs = now();
    if (normalized !== connectionStatus) connectionChangedAtMs = atMs;
    connectionStatus = normalized;
    const safeIssue = normalizeIssueCode(issueCode);
    if (safeIssue) lastIssue = { code: safeIssue, at: iso(atMs) };
    return write();
  }

  function recordIssue(issueCode) {
    const safeIssue = normalizeIssueCode(issueCode);
    if (!safeIssue) return false;
    lastIssue = { code: safeIssue, at: iso(now()) };
    return write();
  }

  function start() {
    if (timer) return false;
    write();
    timer = setInterval(write, intervalMs);
    timer.unref?.();
    return true;
  }

  function stop(status = 'STOPPED') {
    if (timer) clearInterval(timer);
    timer = null;
    if (!FINAL_STATES.has(connectionStatus)) {
      const normalized = String(status || '').trim().toUpperCase();
      connectionStatus = CONNECTION_STATES.has(normalized) ? normalized : 'STOPPED';
      connectionChangedAtMs = now();
    }
    return write();
  }

  return {
    filePath,
    recordIssue,
    setConnection,
    snapshot,
    start,
    stop,
    write,
  };
}

function assessRuntimeHealth(value, nowMs = Date.now()) {
  if (!value || value.schemaVersion !== 1 || value.service !== 'hengs-discord') {
    return { available: false, online: false, stale: true, connection: 'UNKNOWN' };
  }
  const heartbeatAt = Date.parse(value.heartbeat?.at || '');
  const staleAfterMs = boundedStaleAfter(value.staleAfterMs);
  const ageMs = Number.isFinite(heartbeatAt) ? nowMs - heartbeatAt : Number.POSITIVE_INFINITY;
  const stale = ageMs < -300_000 || ageMs > staleAfterMs;
  const connection = CONNECTION_STATES.has(value.connection?.status)
    ? value.connection.status
    : 'UNKNOWN';
  return {
    available: true,
    online: !stale && connection === 'CONNECTED',
    stale,
    connection,
    ageMs: Number.isFinite(ageMs) ? Math.max(0, ageMs) : null,
  };
}

function bindDiscordClientHealth(client, health, events, options = {}) {
  let reachedReady = false;
  const isStopping = typeof options.isStopping === 'function' ? options.isStopping : () => false;

  client.once(events.ClientReady, () => {
    reachedReady = true;
    health.setConnection('CONNECTED');
  });
  client.on(events.Error, () => health.recordIssue('CLIENT_ERROR'));
  client.on(events.ShardError, () => {
    if (!isStopping()) health.setConnection('DEGRADED', 'GATEWAY_ERROR');
  });
  client.on(events.ShardDisconnect, () => {
    if (!isStopping()) health.setConnection('DISCONNECTED');
  });
  client.on(events.ShardReconnecting, () => {
    if (!isStopping()) health.setConnection('RECONNECTING');
  });
  client.on(events.ShardResume, () => {
    if (!isStopping() && reachedReady) health.setConnection('CONNECTED');
  });
  client.on(events.ShardReady, () => {
    if (!isStopping() && reachedReady) health.setConnection('CONNECTED');
  });
  client.on(events.Invalidated, () => {
    if (!isStopping()) health.setConnection('INVALIDATED', 'SESSION_INVALIDATED');
  });
}

module.exports = {
  assessRuntimeHealth,
  bindDiscordClientHealth,
  createRuntimeHealth,
};
