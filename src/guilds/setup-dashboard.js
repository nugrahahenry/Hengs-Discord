const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} = require('discord.js');
const {
  resolveCommunityWelcome,
  resolveLanguage,
  resolveReplyStyle,
} = require('./config-store');

const DASHBOARD_ACTION_IDS = Object.freeze({
  cancelDisable: 'hengs-setup:dashboard:disable-cancel',
  confirmDisable: 'hengs-setup:dashboard:disable-confirm',
  disable: 'hengs-setup:dashboard:disable',
  disableCommunity: 'hengs-setup:dashboard:community-off',
  allChannels: 'hengs-setup:dashboard:all-channels',
  back: 'hengs-setup:dashboard:back',
  chatChannel: 'hengs-setup:dashboard:chat-channel',
  communityChannel: 'hengs-setup:dashboard:community-channel',
  insights: 'hengs-setup:dashboard:insights',
  language: 'hengs-setup:dashboard:language',
  preview: 'hengs-setup:dashboard:preview',
  refresh: 'hengs-setup:dashboard:refresh',
  repair: 'hengs-setup:dashboard:repair',
  settings: 'hengs-setup:dashboard:settings',
  start: 'hengs-setup:dashboard:start',
  style: 'hengs-setup:dashboard:style',
});
const DASHBOARD_ACTIONS = new Map(
  Object.entries(DASHBOARD_ACTION_IDS).map(([action, customId]) => [customId, action]),
);

function button(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function buildDashboardComponents(scopeKind) {
  if (scopeKind === 'pending') {
    return [new ActionRowBuilder().addComponents(
      button(DASHBOARD_ACTION_IDS.start, 'Mulai Setup', ButtonStyle.Primary),
      button(DASHBOARD_ACTION_IDS.refresh, 'Segarkan', ButtonStyle.Secondary),
    )];
  }
  if (scopeKind !== 'public') return [];
  return [
    new ActionRowBuilder().addComponents(
      button(DASHBOARD_ACTION_IDS.refresh, 'Segarkan', ButtonStyle.Secondary),
      button(DASHBOARD_ACTION_IDS.settings, 'Pengaturan', ButtonStyle.Primary),
      button(DASHBOARD_ACTION_IDS.preview, 'Preview Welcome', ButtonStyle.Secondary),
      button(DASHBOARD_ACTION_IDS.insights, 'Buka Insights', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      button(DASHBOARD_ACTION_IDS.disable, 'Nonaktifkan Hengs', ButtonStyle.Danger),
    ),
  ];
}

function buildDashboardSettingsComponents(config) {
  const style = resolveReplyStyle(config);
  const language = resolveLanguage(config);
  const welcome = resolveCommunityWelcome(config);
  const styleSelect = new StringSelectMenuBuilder()
    .setCustomId(DASHBOARD_ACTION_IDS.style)
    .setPlaceholder('Pilih gaya balasan')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Santai dan seimbang', value: 'balanced', default: style === 'balanced' },
      { label: 'Ringkas dan langsung', value: 'concise', default: style === 'concise' },
      { label: 'Teknis dan terstruktur', value: 'technical', default: style === 'technical' },
    );
  const languageSelect = new StringSelectMenuBuilder()
    .setCustomId(DASHBOARD_ACTION_IDS.language)
    .setPlaceholder('Pilih bahasa balasan')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Otomatis mengikuti pengguna', value: 'auto', default: language === 'auto' },
      { label: 'Bahasa Indonesia', value: 'id', default: language === 'id' },
      { label: 'English', value: 'en', default: language === 'en' },
    );
  const chatChannel = new ChannelSelectMenuBuilder()
    .setCustomId(DASHBOARD_ACTION_IDS.chatChannel)
    .setPlaceholder('Pilih satu channel chat Hengs')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  const communityChannel = new ChannelSelectMenuBuilder()
    .setCustomId(DASHBOARD_ACTION_IDS.communityChannel)
    .setPlaceholder(welcome.welcomeEnabled
      ? 'Pilih ulang channel Community Pack'
      : 'Aktifkan Community Pack di satu channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  return [
    new ActionRowBuilder().addComponents(styleSelect),
    new ActionRowBuilder().addComponents(languageSelect),
    new ActionRowBuilder().addComponents(chatChannel),
    new ActionRowBuilder().addComponents(communityChannel),
    new ActionRowBuilder().addComponents(
      button(DASHBOARD_ACTION_IDS.allChannels, 'Semua Channel', ButtonStyle.Secondary),
      button(DASHBOARD_ACTION_IDS.disableCommunity, 'Matikan Community Pack', ButtonStyle.Secondary),
      button(DASHBOARD_ACTION_IDS.back, 'Kembali', ButtonStyle.Primary),
    ),
  ];
}

function buildDisableConfirmationComponents() {
  return [new ActionRowBuilder().addComponents(
    button(DASHBOARD_ACTION_IDS.confirmDisable, 'Ya, Nonaktifkan', ButtonStyle.Danger),
    button(DASHBOARD_ACTION_IDS.cancelDisable, 'Batal', ButtonStyle.Secondary),
  )];
}

function resolveDashboardAction(interaction) {
  const action = DASHBOARD_ACTIONS.get(interaction?.customId) || null;
  if (!action) return null;
  if (['style', 'language'].includes(action)) {
    return interaction?.isStringSelectMenu?.() === true ? action : null;
  }
  if (['chatChannel', 'communityChannel'].includes(action)) {
    return interaction?.isChannelSelectMenu?.() === true ? action : null;
  }
  return interaction?.isButton?.() === true ? action : null;
}

module.exports = {
  DASHBOARD_ACTION_IDS,
  buildDashboardComponents,
  buildDashboardSettingsComponents,
  buildDisableConfirmationComponents,
  resolveDashboardAction,
};
