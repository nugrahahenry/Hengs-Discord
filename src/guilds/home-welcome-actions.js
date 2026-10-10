'use strict';

function applyHomeWelcomeAction({ route, guildId, store }) {
  if (!route || !guildId || !store) throw new Error('HOME_WELCOME_DEPENDENCY_MISSING');

  if (route.action === 'invalid') {
    return 'Format welcome belum aman. Pakai contoh: `ubah welcome jadi "Halo, selamat datang!"`. Pastikan satu baris dan tanpa mention atau link.';
  }

  if (route.action === 'set') {
    const saved = store.set({ guildId, welcomeCopy: route.welcomeCopy });
    return `✅ Welcome custom disimpan untuk member baru: "${saved.welcomeCopy}"`;
  }

  if (route.action === 'clear') {
    const result = store.clear({ guildId });
    return result.removed
      ? '✅ Welcome custom dimatikan. Member baru akan menerima welcome bawaan Hengs.'
      : 'Welcome custom memang belum aktif. Welcome bawaan Hengs tetap dipakai.';
  }

  if (route.action === 'show') {
    const current = store.get(guildId);
    return current
      ? `📝 Welcome custom saat ini: "${current.welcomeCopy}"`
      : 'Belum ada welcome custom. Member baru masih menerima welcome bawaan Hengs.';
  }

  throw new Error('HOME_WELCOME_ACTION_INVALID');
}

module.exports = { applyHomeWelcomeAction };
