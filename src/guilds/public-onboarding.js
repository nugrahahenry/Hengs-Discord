const { PermissionFlagsBits } = require('discord.js');

const PREFERRED_CHANNEL_NAMES = Object.freeze([
  'welcome',
  'general',
  'chat',
  'lobby',
]);

function buildPublicWelcome() {
  return {
    content: [
      'Halo, aku **Hengs**, bot AI yang baru masuk ke server ini. 👋',
      '',
      'Aku belum akan membalas chat sampai pemilik server atau Administrator menjalankan `/setup start`.',
      'Setelah aktif, member cukup mention aku untuk bertanya atau ngobrol.',
      'Gaya default-ku **Santai**. Pengelola server bisa menggantinya lewat `/setup style`.',
    ].join('\n'),
    allowedMentions: { parse: [] },
  };
}

function canWrite(channel, guild) {
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return false;
  try {
    const permissions = channel.permissionsFor?.(guild?.members?.me);
    if (!permissions?.has) return false;
    return permissions.has(PermissionFlagsBits.ViewChannel)
      && permissions.has(PermissionFlagsBits.SendMessages);
  } catch {
    return false;
  }
}

function findPublicWelcomeChannel(guild) {
  if (!guild?.channels?.cache) return null;
  if (canWrite(guild.systemChannel, guild)) return guild.systemChannel;
  const candidates = [...guild.channels.cache.values()]
    .filter(channel => canWrite(channel, guild))
    .sort((left, right) => {
      const leftName = String(left.name || '').toLowerCase();
      const rightName = String(right.name || '').toLowerCase();
      const leftPreference = PREFERRED_CHANNEL_NAMES.findIndex(name => leftName.includes(name));
      const rightPreference = PREFERRED_CHANNEL_NAMES.findIndex(name => rightName.includes(name));
      const leftRank = leftPreference === -1 ? PREFERRED_CHANNEL_NAMES.length : leftPreference;
      const rightRank = rightPreference === -1 ? PREFERRED_CHANNEL_NAMES.length : rightPreference;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return Number(left.position || 0) - Number(right.position || 0);
    });
  return candidates[0] || null;
}

async function sendPublicGuildWelcome(guild, { guildAccess, logger = console } = {}) {
  if (!guildAccess || typeof guildAccess.classify !== 'function') {
    throw new Error('PUBLIC_ONBOARDING_DEPENDENCY_MISSING');
  }
  let scope;
  try {
    scope = guildAccess.classify(guild?.id);
  } catch {
    logger.warn('[public-onboarding] PUBLIC_WELCOME_FAILED');
    return { sent: false, code: 'PUBLIC_WELCOME_FAILED' };
  }
  if (scope.kind !== 'pending') {
    return { sent: false, code: 'PUBLIC_WELCOME_SKIPPED' };
  }
  const channel = findPublicWelcomeChannel(guild);
  if (!channel) {
    logger.warn('[public-onboarding] PUBLIC_WELCOME_NO_CHANNEL');
    return { sent: false, code: 'PUBLIC_WELCOME_NO_CHANNEL' };
  }
  try {
    await channel.send(buildPublicWelcome());
    logger.info('[public-onboarding] PUBLIC_WELCOME_SENT');
    return { sent: true, code: 'PUBLIC_WELCOME_SENT' };
  } catch {
    logger.warn('[public-onboarding] PUBLIC_WELCOME_FAILED');
    return { sent: false, code: 'PUBLIC_WELCOME_FAILED' };
  }
}

module.exports = {
  buildPublicWelcome,
  findPublicWelcomeChannel,
  sendPublicGuildWelcome,
};
