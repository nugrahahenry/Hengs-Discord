const SNOWFLAKE = /^\d{17,20}$/;

function createPublicTrafficGuard({
  maxRequests = 30,
  windowMs = 10 * 60 * 1000,
  now = Date.now,
} = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('PUBLIC_TRAFFIC_CONFIG_INVALID');
  }
  if (!Number.isInteger(windowMs) || windowMs < 1 || typeof now !== 'function') {
    throw new Error('PUBLIC_TRAFFIC_CONFIG_INVALID');
  }
  const guilds = new Map();

  function acquire(guildId) {
    const normalized = String(guildId || '').trim();
    if (!SNOWFLAKE.test(normalized)) throw new Error('GUILD_ID_INVALID');
    const timestamp = now();
    if (!Number.isFinite(timestamp)) throw new Error('PUBLIC_TRAFFIC_CLOCK_INVALID');
    const current = guilds.get(normalized) || { active: false, timestamps: [] };
    current.timestamps = current.timestamps.filter(value => timestamp - value < windowMs);
    if (current.active) return { ok: false, code: 'PUBLIC_GUILD_BUSY' };
    if (current.timestamps.length >= maxRequests) {
      if (current.timestamps.length > 0) guilds.set(normalized, current);
      return { ok: false, code: 'PUBLIC_GUILD_RATE_LIMITED' };
    }
    current.active = true;
    current.timestamps.push(timestamp);
    guilds.set(normalized, current);
    let released = false;
    return {
      ok: true,
      release() {
        if (released) return;
        released = true;
        current.active = false;
        if (current.timestamps.length === 0) guilds.delete(normalized);
      },
    };
  }

  return { acquire };
}

module.exports = { createPublicTrafficGuard };
