const SNOWFLAKE = /^\d{17,20}$/;
const MAX_BETA_GUILDS = 10;

function parseBetaGuildIds(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(',');
  const ids = [...new Set(entries.map(item => String(item).trim()).filter(Boolean))];
  if (ids.some(id => !SNOWFLAKE.test(id))) throw new Error('BETA_GUILD_IDS_INVALID');
  if (ids.length > MAX_BETA_GUILDS) throw new Error('BETA_GUILD_LIMIT_EXCEEDED');
  return ids;
}

function createGuildAccess({ homeGuildId, betaGuildIds = [], store }) {
  const home = String(homeGuildId || '').trim();
  if (!SNOWFLAKE.test(home)) throw new Error('HOME_GUILD_ID_INVALID');
  if (!store || typeof store.get !== 'function') throw new Error('GUILD_STORE_INVALID');
  const allowlist = new Set(parseBetaGuildIds(betaGuildIds).filter(id => id !== home));

  function classify(guildId) {
    const normalized = String(guildId || '').trim();
    if (!normalized) return { kind: 'dm' };
    if (!SNOWFLAKE.test(normalized)) return { kind: 'denied' };
    if (normalized === home) return { kind: 'home' };
    if (!allowlist.has(normalized)) return { kind: 'denied' };
    try {
      const config = store.get(normalized);
      if (config?.status === 'active' && config.features?.mentionChat === true) return { kind: 'beta' };
      return { kind: 'pending' };
    } catch {
      return { kind: 'denied', code: 'CONFIG_INVALID' };
    }
  }

  return { classify, isHome: guildId => String(guildId || '') === home };
}

module.exports = { createGuildAccess, parseBetaGuildIds };
