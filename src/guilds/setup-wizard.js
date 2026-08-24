const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const { resolveChannelScope, resolveCommunityWelcome } = require('./config-store');

const SETUP_STANDARD_CHANNEL_ID = 'hengs-setup:standard-channel';
const CHAT_PERMISSIONS = Object.freeze([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
]);
const ALLOWED_CHANNEL_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function buildSetupWizardComponents() {
  return [new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(SETUP_STANDARD_CHANNEL_ID)
      .setPlaceholder('Pilih channel untuk Hengs')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1),
  )];
}

function isSetupWizardInteraction(interaction) {
  return interaction?.isChannelSelectMenu?.() === true
    && interaction.customId === SETUP_STANDARD_CHANNEL_ID;
}

function belongsToGuild(channel, guild) {
  const channelGuildId = channel?.guildId || channel?.guild?.id;
  return String(channelGuildId || '') === String(guild?.id || '');
}

function canUseSetupChannel(channel, guild) {
  if (
    !belongsToGuild(channel, guild)
    || !ALLOWED_CHANNEL_TYPES.has(channel?.type)
    || !channel?.isTextBased?.()
    || typeof channel.send !== 'function'
  ) return false;
  const botMember = guild?.members?.me;
  const permissions = botMember && channel.permissionsFor?.(botMember);
  return Boolean(permissions)
    && CHAT_PERMISSIONS.every(permission => permissions.has(permission));
}

async function resolveSelectedChannel(guild, channelId) {
  const normalized = String(channelId || '');
  const cached = guild?.channels?.cache?.get?.(normalized);
  if (cached) return belongsToGuild(cached, guild) ? cached : null;
  if (typeof guild?.channels?.fetch !== 'function') return null;
  try {
    const channel = await guild.channels.fetch(normalized);
    return belongsToGuild(channel, guild) ? channel : null;
  } catch {
    return null;
  }
}

async function reviewPublicConfiguration(guild, config, communityPack) {
  const issues = [];
  const channelScope = resolveChannelScope(config);
  if (channelScope.channelMode === 'current') {
    const channel = await resolveSelectedChannel(guild, channelScope.channelId);
    if (!canUseSetupChannel(channel, guild)) issues.push('CHAT_CHANNEL_UNAVAILABLE');
  }
  const welcome = resolveCommunityWelcome(config);
  if (welcome.welcomeEnabled) {
    const channel = await resolveSelectedChannel(guild, welcome.welcomeChannelId);
    if (!communityPack?.canUseChannel?.(channel, guild)) {
      issues.push('COMMUNITY_CHANNEL_UNAVAILABLE');
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  CHAT_PERMISSIONS,
  SETUP_STANDARD_CHANNEL_ID,
  buildSetupWizardComponents,
  canUseSetupChannel,
  isSetupWizardInteraction,
  resolveSelectedChannel,
  reviewPublicConfiguration,
};
