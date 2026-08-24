const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const DASHBOARD_ACTION_IDS = Object.freeze({
  cancelDisable: 'hengs-setup:dashboard:disable-cancel',
  confirmDisable: 'hengs-setup:dashboard:disable-confirm',
  disable: 'hengs-setup:dashboard:disable',
  insights: 'hengs-setup:dashboard:insights',
  preview: 'hengs-setup:dashboard:preview',
  refresh: 'hengs-setup:dashboard:refresh',
  repair: 'hengs-setup:dashboard:repair',
  start: 'hengs-setup:dashboard:start',
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
      button(DASHBOARD_ACTION_IDS.repair, 'Pilih Ulang Channel', ButtonStyle.Primary),
      button(DASHBOARD_ACTION_IDS.preview, 'Preview Welcome', ButtonStyle.Secondary),
      button(DASHBOARD_ACTION_IDS.insights, 'Buka Insights', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      button(DASHBOARD_ACTION_IDS.disable, 'Nonaktifkan Hengs', ButtonStyle.Danger),
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
  if (interaction?.isButton?.() !== true) return null;
  return DASHBOARD_ACTIONS.get(interaction.customId) || null;
}

module.exports = {
  DASHBOARD_ACTION_IDS,
  buildDashboardComponents,
  buildDisableConfirmationComponents,
  resolveDashboardAction,
};
