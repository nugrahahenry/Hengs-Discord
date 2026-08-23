const SNOWFLAKE = /^\d{17,20}$/;

function createGuildAccess({ homeGuildId, store }) {
  const home = String(homeGuildId || '').trim();
  if (!SNOWFLAKE.test(home)) throw new Error('HOME_GUILD_ID_INVALID');
  if (!store || typeof store.get !== 'function') throw new Error('GUILD_STORE_INVALID');

  function classify(guildId) {
    const normalized = String(guildId || '').trim();
    if (!normalized) return { kind: 'dm' };
    if (!SNOWFLAKE.test(normalized)) return { kind: 'denied' };
    if (normalized === home) return { kind: 'home' };
    try {
      const config = store.get(normalized);
      if (config?.status === 'active' && config.features?.mentionChat === true) {
        return { kind: 'public', config };
      }
      return { kind: 'pending' };
    } catch {
      return { kind: 'denied', code: 'CONFIG_INVALID' };
    }
  }

  return { classify, isHome: guildId => String(guildId || '') === home };
}

module.exports = { createGuildAccess };
