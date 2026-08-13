const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const permissions = require('./permissions');
const store = require('./store');
const { reportEmbed } = require('./hub');
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
    'Masuk: <t:' + createdSeconds + ':R>',
  ];
  if (report.status === 'claimed' && DISCORD_ID.test(String(report.claimedBy || ''))) {
    lines.push('Penanggung jawab: <@' + report.claimedBy + '>');
  }
  const url = panelUrl(report);
  if (url) lines.push('[Buka panel laporan](' + url + ')');
  return {
    name: '#' + report.id + ' | '
      + (STATUS_LABELS[report.status] || 'Aktif') + ' | '
      + (PRIORITY_LABELS[report.priority] || 'Normal'),
    value: lines.join('\n'),
    inline: false,
  };
}

function navigationRow(page, totalPages, { showPreview = false } = {}) {
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
      .setLabel('Cek Lagi')
      .setStyle(ButtonStyle.Primary),
  );
  if (showPreview) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId('reports:preview')
        .setLabel('Lihat Contoh')
        .setStyle(ButtonStyle.Secondary),
    );
  }
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

function buildQueuePayload(reports, requestedPage = 0, { showPreview = false } = {}) {
  const activeReports = Array.isArray(reports) ? reports.slice(0, 500) : [];
  const totalPages = Math.max(1, Math.ceil(activeReports.length / PAGE_SIZE));
  const page = boundedPage(requestedPage, totalPages);
  const openCount = activeReports.filter(report => report.status === 'open').length;
  const claimedCount = activeReports.filter(report => report.status === 'claimed').length;
  const pageReports = activeReports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const empty = activeReports.length === 0;
  const description = empty
    ? [
      'Belum ada laporan yang perlu ditinjau. Server sedang tenang.',
      'Laporan baru akan muncul otomatis di sini.',
      'Tekan **Cek Lagi** untuk memperbarui antrean.',
      showPreview ? 'Pakai **Lihat Contoh** untuk melihat alurnya tanpa membuat laporan.' : null,
    ].filter(Boolean)
    : [
      '**' + openCount + ' menunggu** | **' + claimedCount + ' sedang ditangani**',
      'Halaman ' + (page + 1) + ' dari ' + totalPages,
      'Buka panel laporan untuk membaca detail dan menentukan tindakan berikutnya.',
    ];

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Antrean Laporan')
    .setDescription(description.join('\n'));

  if (pageReports.length) embed.addFields(pageReports.map(reportField));

  return {
    payload: {
      embeds: [embed],
      components: [navigationRow(page, totalPages, { showPreview: empty && showPreview })],
      allowedMentions: { parse: [] },
    },
    page,
    totalPages,
  };
}

function buildPreviewPayload() {
  const report = {
    id: 'contoh-0001',
    revision: 0,
    status: 'open',
    priority: 'important',
    category: 'spam_scam',
    details: 'Seorang member berulang kali mengirim tautan promosi yang sama di beberapa channel setelah diminta berhenti.',
    reporterId: '000000000000000000',
    targetUserId: null,
    messageLink: null,
    anonymous: true,
    createdAt: '2026-08-13T00:00:00.000Z',
    claimedBy: null,
    finalNote: null,
  };
  const embed = reportEmbed(report)
    .setTitle('Pratinjau Laporan | Data Contoh')
    .setFooter({ text: 'Data contoh owner-only | tidak disimpan' });
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reports:refresh:0')
      .setLabel('Kembali ke Antrean')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    embeds: [embed],
    components: [backRow],
    allowedMentions: { parse: [] },
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
    const { payload } = buildQueuePayload(store.listActiveReports(), requestedPage, {
      showPreview: permissions.isOwner(interaction.user.id),
    });
    await replyEphemeral(interaction, payload);
  } catch (error) {
    console.error('[reports] queue unavailable:', { code: error.code || 'QUEUE_STATE_FAILED' });
    await replyEphemeral(interaction, 'Antrean laporan sedang tidak dapat dibuka.');
  }
  return true;
}

function parseQueueComponent(customId) {
  const value = String(customId || '');
  if (value === 'reports:preview') return { action: 'preview', page: 0 };
  const match = value.match(/^reports:(page|refresh):(0|[1-9]\d?)$/);
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
  if (parsed.action === 'preview') {
    if (!permissions.isOwner(interaction.user.id)) {
      await replyEphemeral(interaction, 'Kontrol antrean tidak valid atau tidak tersedia.');
      return true;
    }
    try {
      await interaction.update(buildPreviewPayload());
    } catch (error) {
      console.error('[reports] preview unavailable:', { code: error.code || 'PREVIEW_FAILED' });
      await replyEphemeral(interaction, 'Pratinjau laporan sedang tidak dapat dibuka.');
    }
    return true;
  }
  try {
    const { payload } = buildQueuePayload(store.listActiveReports(), parsed.page, {
      showPreview: permissions.isOwner(interaction.user.id),
    });
    await interaction.update(payload);
  } catch (error) {
    console.error('[reports] queue refresh failed:', { code: error.code || 'QUEUE_REFRESH_FAILED' });
    await replyEphemeral(interaction, 'Antrean laporan gagal diperbarui.');
  }
  return true;
}

module.exports = {
  buildPreviewPayload,
  buildQueuePayload,
  handleQueueComponent,
  showQueue,
};
