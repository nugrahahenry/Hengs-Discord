const { PermissionFlagsBits } = require('discord.js');
const { resolveCommunityWelcome } = require('./config-store');
const { generateCard } = require('../utils/welcome-card');

const MEMBER_EVENT_REACTIONS = Object.freeze({
  welcome: '👋',
  leave: '🫡',
});

const SNOWFLAKE = /^\d{17,20}$/;
const REQUIRED_PERMISSIONS = Object.freeze([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AttachFiles,
]);

function canUseCommunityChannel(channel, guild) {
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return false;
  const botMember = guild?.members?.me;
  const permissions = botMember && channel.permissionsFor?.(botMember);
  return Boolean(permissions) && REQUIRED_PERMISSIONS.every(permission => permissions.has(permission));
}

function publicCopy(member, type, { preview = false } = {}) {
  if (preview) {
    return 'Ini preview Community Pack. Saat aktif, Hengs akan menyambut member baru di channel ini.';
  }
  if (type === 'welcome') {
    return `👋 Halo <@${member.id}>! Aku Hengs, asisten komunitas di sini. Selamat datang. Coba baca aturan, ambil role, lalu kenalan. Kalau bingung, mention Hengs atau pakai \`/hengs help\`.`;
  }
  return '🫡 Satu member baru saja meninggalkan server. Makasih sudah pernah mampir dan jadi bagian dari komunitas ini.';
}

async function reactMemberEvent(message, type, { logger = console } = {}) {
  const emoji = MEMBER_EVENT_REACTIONS[type];
  if (!emoji) return { reacted: false, code: 'COMMUNITY_REACTION_INVALID' };
  if (!message || typeof message.react !== 'function') {
    return { reacted: false, code: 'COMMUNITY_REACTION_UNAVAILABLE' };
  }
  try {
    await message.react(emoji);
    return { reacted: true, code: 'COMMUNITY_REACTION_ADDED', emoji };
  } catch {
    logger.warn('[community-pack] COMMUNITY_REACTION_FAILED');
    return { reacted: false, code: 'COMMUNITY_REACTION_FAILED', emoji };
  }
}

async function buildCommunityPayload(member, type, options = {}) {
  if (!['welcome', 'leave'].includes(type)) throw new Error('COMMUNITY_EVENT_INVALID');
  if (!SNOWFLAKE.test(String(member?.id || ''))) throw new Error('COMMUNITY_MEMBER_INVALID');
  const card = await (options.generateCardImpl || generateCard)(member, type, {
    serverName: member.guild?.name || 'Community',
  });
  const name = type === 'welcome' ? 'welcome.png' : 'leave.png';
  return {
    content: publicCopy(member, type, options),
    files: card ? [{ attachment: card, name }] : [],
    allowedMentions: options.preview || type === 'leave'
      ? { parse: [] }
      : { parse: [], users: [member.id] },
  };
}

function createCommunityPack({ generateCardImpl = generateCard, logger = console } = {}) {
  async function preview(member) {
    return buildCommunityPayload(member, 'welcome', { generateCardImpl, preview: true });
  }

  async function sendMemberEvent(member, type, config) {
    const setting = resolveCommunityWelcome(config);
    if (!setting.welcomeEnabled) return { sent: false, code: 'COMMUNITY_WELCOME_DISABLED' };
    const channel = member.guild?.channels?.cache?.get(setting.welcomeChannelId);
    if (!canUseCommunityChannel(channel, member.guild)) {
      logger.warn('[community-pack] COMMUNITY_CHANNEL_UNAVAILABLE');
      return { sent: false, code: 'COMMUNITY_CHANNEL_UNAVAILABLE' };
    }
    try {
      const payload = await buildCommunityPayload(member, type, { generateCardImpl });
      const sentMessage = await channel.send(payload);
      await reactMemberEvent(sentMessage, type, { logger });
      return { sent: true, code: 'COMMUNITY_EVENT_SENT' };
    } catch {
      logger.error('[community-pack] COMMUNITY_EVENT_FAILED');
      return { sent: false, code: 'COMMUNITY_EVENT_FAILED' };
    }
  }

  return {
    canUseChannel: canUseCommunityChannel,
    preview,
    reactMemberEvent: (message, type) => reactMemberEvent(message, type, { logger }),
    sendMemberEvent,
  };
}

module.exports = {
  MEMBER_EVENT_REACTIONS,
  REQUIRED_PERMISSIONS,
  buildCommunityPayload,
  canUseCommunityChannel,
  createCommunityPack,
  reactMemberEvent,
};
