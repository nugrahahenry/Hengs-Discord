const fs = require('node:fs');

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_STALE_MS = 300_000;

class InstanceLockError extends Error {
  constructor(code, pid = null) {
    super(code === 'INSTANCE_ACTIVE' ? 'Hengs Discord sudah berjalan.' : 'Instance lock tidak tersedia.');
    this.name = 'InstanceLockError';
    this.code = code;
    this.pid = pid;
  }
}

function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function createInstanceLock(options) {
  const filePath = options.filePath;
  const pid = Number(options.pid || process.pid);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const isPidAlive = options.isPidAlive || defaultIsPidAlive;
  const heartbeatMs = Math.max(1_000, Number(options.heartbeatMs) || DEFAULT_HEARTBEAT_MS);
  const staleMs = Math.max(heartbeatMs * 3, Number(options.staleMs) || DEFAULT_STALE_MS);
  let timer = null;
  let acquired = false;

  function readOwner() {
    try {
      return Number.parseInt(fs.readFileSync(filePath, 'utf8').trim(), 10) || null;
    } catch {
      return null;
    }
  }

  function ageMs() {
    try {
      return now() - fs.statSync(filePath).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function touch() {
    if (!acquired || readOwner() !== pid) return false;
    try {
      const at = new Date(now());
      fs.utimesSync(filePath, at, at);
      return true;
    } catch {
      return false;
    }
  }

  function beginHeartbeat() {
    if (timer) return;
    timer = setInterval(touch, heartbeatMs);
    timer.unref?.();
  }

  function acquire() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let created = false;
      try {
        const fd = fs.openSync(filePath, 'wx');
        created = true;
        try {
          fs.writeFileSync(fd, String(pid), 'utf8');
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        acquired = true;
        touch();
        beginHeartbeat();
        return true;
      } catch (error) {
        if (created) {
          try { fs.rmSync(filePath, { force: true }); } catch {}
        }
        if (error?.code !== 'EEXIST') throw error;
        const ownerPid = readOwner();
        const age = ageMs();
        const fresh = age >= -staleMs && age <= staleMs;
        if (fresh && (!ownerPid || (ownerPid !== pid && isPidAlive(ownerPid)))) {
          throw new InstanceLockError('INSTANCE_ACTIVE', ownerPid);
        }
        fs.rmSync(filePath, { force: true });
      }
    }
    throw new InstanceLockError('LOCK_UNAVAILABLE');
  }

  function release() {
    if (timer) clearInterval(timer);
    timer = null;
    if (acquired && readOwner() === pid) {
      try { fs.rmSync(filePath, { force: true }); } catch {}
    }
    acquired = false;
  }

  return { acquire, release, touch };
}

module.exports = {
  InstanceLockError,
  createInstanceLock,
};
