const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const permissions = require('./permissions');
const store = require('./store');
const { REPORT_CATEGORIES } = require('./validation');

const PAGE_SIZE = 10;
const MAX_PAGE = 49;
const DISCORD_ID = /^\d{15,22}$/;
const CATEGORY_LABELS = new Map(REPORT_CATEGORIES.map(item => [item.value, item.name]));
const STATUS_LABELS = Object.freeze({
  open: 'Terbuka',
  claimed: 'Sedang ditangani',
});
const PRIORITY_LABELS = Object.freeze({
  normal: 'Normal',
  important: 'Penting',
  urgent: 'Mendesak',
});

function boundedPage(requestedPage, totalPages) {
  const page = Number.isSafeInteger(requestedPage) ? requestedPage : 0;
  return Math.max(0, Math.min(page, totalPages - 1));
}

function panelUrl(report) {
  if (
    !DISCORD_ID.test(String(report?.guildId || ''))
    || !DISCORD_ID.test(String(report?.panel?.channelId || ''))
    || !DISCORD_ID.test(String(report?.panel?.messageId || ''))
  ) return null;
  return 'https://discord.com/channels/'
    + report.guildId + '/' + report.panel.channelId + '/' + report.panel.messageId;
}

function reportField(report) {
  const createdSeconds = Math.floor(Date.parse(report.createdAt) / 1_000);
  const lines = [
    'Kategori: **' + (CATEGORY_LABELS.get(report.category) || 'Lainnya') + '**',
    'Umur: <t:' + createdSeconds + ':R>',
  ];
  if (report.status === 'claimed' && DISCORD_ID.test(String(report.claimedBy || ''))) {
    lines.push('Ditangani: <@' + report.claimedBy + '>');
  }
  const url = panelUrl(report);
  if (url) lines.push('[Buka Panel](' + url + ')');
  return {
    name: '#' + report.id + ' - '
      + (STATUS_LABELS[report.status] || 'Aktif') + ' - '
      + (PRIORITY_LABELS[report.priority] || 'Normal'),
    value: lines.join('\n'),
    inline: false,
  };
}

function navigationRow(page, totalPages) {
  const buttons = [];
  if (page > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('reports:page:' + (page - 1))
        .setLabel('Sebelumnya')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId('reports:refresh:' + page)
      .setLabel('Segarkan')
      .setStyle(ButtonStyle.Primary),
  );
  if (page < totalPages - 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('reports:page:' + (page + 1))
        .setLabel('Berikutnya')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return new ActionRowBuilder().addComponents(buttons);
}

function buildQueuePayload(reports, requestedPage = 0) {
  const activeReports = Array.isArray(reports) ? reports.slice(0, 500) : [];
  const totalPages = Math.max(1, Math.ceil(activeReports.length / PAGE_SIZE));
  const page = boundedPage(requestedPage, totalPages);
  const openCount = activeReports.filter(report => report.status === 'open').length;
  const claimedCount = activeReports.filter(report => report.status === 'claimed').length;
  const pageReports = activeReports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Antrean Laporan')
    .setDescription([
      'Terbuka: **' + openCount + '** - Ditangani: **' + claimedCount + '**',
      'Halaman ' + (page + 1) + '/' + totalPages,
      pageReports.length ? null : 'Tidak ada laporan aktif.',
    ].filter(Boolean).join('\n'));

  if (pageReports.length) embed.addFields(pageReports.map(reportField));

  return {
    payload: {
      embeds: [embed],
      components: [navigationRow(page, totalPages)],
      allowedMentions: { parse: [] },
    },
    page,
    totalPages,
  };
}

async function replyEphemeral(interaction, content) {
  const base = typeof content === 'string' ? { content } : content;
  const payload = {
    ...base,
    ephemeral: true,
    allowedMentions: { parse: [] },
  };
  if (interaction.deferred && !interaction.replied && interaction.editReply) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
  } else if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function showQueue(interaction, requestedPage = 0) {
  if (!permissions.isReportModerator(interaction)) {
    await replyEphemeral(interaction, 'Kamu tidak dapat membuka antrean laporan.');
    return true;
  }
  try {
    const { payload } = buildQueuePayload(store.listActiveReports(), requestedPage);
    await replyEphemeral(interaction, payload);
  } catch (error) {
    console.error('[reports] queue unavailable:', { code: error.code || 'QUEUE_STATE_FAILED' });
    await replyEphemeral(interaction, 'Antrean laporan sedang tidak dapat dibuka.');
  }
  return true;
}

function parseQueueComponent(customId) {
  const match = String(customId || '').match(/^reports:(page|refresh):(0|[1-9]\d?)$/);
  if (!match) return null;
  const page = Number(match[2]);
  if (page > MAX_PAGE) return null;
  return { action: match[1], page };
}

async function handleQueueComponent(interaction) {
  if (!interaction.isButton?.() || !String(interaction.customId || '').startsWith('reports:')) {
    return false;
  }
  const parsed = parseQueueComponent(interaction.customId);
  if (!parsed || !permissions.isReportModerator(interaction)) {
    await replyEphemeral(interaction, 'Kontrol antrean tidak valid atau tidak tersedia.');
    return true;
  }
  try {
    const { payload } = buildQueuePayload(store.listActiveReports(), parsed.page);
    await interaction.update(payload);
  } catch (error) {
    console.error('[reports] queue refresh failed:', { code: error.code || 'QUEUE_REFRESH_FAILED' });
    await replyEphemeral(interaction, 'Antrean laporan gagal diperbarui.');
  }
  return true;
}

module.exports = {
  buildQueuePayload,
  handleQueueComponent,
  showQueue,
};
