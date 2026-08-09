const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const evidenceService = require('./evidence');
const permissions = require('./permissions');
const store = require('./store');
const { REPORT_CATEGORIES } = require('./validation');

const REPORT_ID = /^[a-f0-9]{16}$/;
const PANEL_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.ReadMessageHistory,
];
const CATEGORY_LABELS = new Map(REPORT_CATEGORIES.map(item => [item.value, item.name]));
const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;
const ACTIVE_DELIVERY_GRACE_MS = 2 * 60 * 1000;
let maintenanceTimer = null;
let maintenanceBusy = false;

class ReportHubError extends Error {
  constructor(code, userMessage, options) {
    super(userMessage, options);
    this.name = 'ReportHubError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

function findModLogChannel(guild) {
  const channelId = String(process.env.MOD_LOG_CHANNEL_ID || '').trim();
  if (!channelId) return null;
  return guild?.channels?.cache?.get(channelId) || null;
}

function validatePrivateReviewChannel(guild, channel) {
  if (!channel || !channel.isTextBased?.()) {
    return { ok: false, code: 'REPORT_CHANNEL_MISSING' };
  }
  const everyonePermissions = channel.permissionsFor?.(guild?.roles?.everyone);
  if (!everyonePermissions || everyonePermissions.has(PermissionsBitField.Flags.ViewChannel)) {
    return { ok: false, code: 'REPORT_CHANNEL_NOT_PRIVATE' };
  }
  const botPermissions = channel.permissionsFor?.(guild?.members?.me);
  if (!botPermissions || PANEL_PERMISSIONS.some(permission => !botPermissions.has(permission))) {
    return { ok: false, code: 'REPORT_BOT_PERMISSION_MISSING' };
  }
  return { ok: true, code: null };
}

function channelError(code) {
  if (code === 'REPORT_CHANNEL_NOT_PRIVATE') {
    return new ReportHubError(code, 'Ruang laporan belum privat. Akses @everyone harus ditutup.');
  }
  if (code === 'REPORT_BOT_PERMISSION_MISSING') {
    return new ReportHubError(code, 'Izin bot di ruang laporan belum lengkap.');
  }
  return new ReportHubError('REPORT_CHANNEL_MISSING', 'Ruang laporan privat belum dikonfigurasi.');
}

async function verifyMessageLink(guild, rawUrl) {
  if (!rawUrl) return;
  let match;
  try {
    const url = new URL(rawUrl);
    match = url.pathname.match(/^\/channels\/(\d{15,22})\/(\d{15,22})\/(\d{15,22})\/?$/);
  } catch {}
  if (!match || match[1] !== String(guild?.id || '')) {
    throw new ReportHubError('REPORT_MESSAGE_UNAVAILABLE', 'Pesan terkait tidak dapat diverifikasi.');
  }
  const channel = guild.channels?.cache?.get(match[2])
    || await guild.channels?.fetch?.(match[2]).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) {
    throw new ReportHubError('REPORT_MESSAGE_UNAVAILABLE', 'Pesan terkait tidak dapat diverifikasi.');
  }
  const message = await channel.messages.fetch(match[3]).catch(() => null);
  if (!message) {
    throw new ReportHubError('REPORT_MESSAGE_UNAVAILABLE', 'Pesan terkait tidak dapat diverifikasi.');
  }
}

function statusLabel(status) {
  return {
    open: 'Terbuka',
    claimed: 'Sedang ditangani',
    resolved: 'Selesai',
    dismissed: 'Ditutup tanpa tindakan',
    purge_pending: 'Menunggu penghapusan',
  }[status] || status;
}

function reportColor(status) {
  if (status === 'open') return 0xFEE75C;
  if (status === 'claimed') return 0x5865F2;
  if (status === 'resolved') return 0x57F287;
  return 0xED4245;
}

function reportEmbed(report) {
  const reporter = report.anonymous ? 'Pelapor anonim' : `<@${report.reporterId}>`;
  const fields = [
    { name: 'Status', value: statusLabel(report.status), inline: true },
    { name: 'Kategori', value: CATEGORY_LABELS.get(report.category) || report.category, inline: true },
    { name: 'ID', value: `\`${report.id}\``, inline: true },
    { name: 'Pelapor', value: reporter, inline: true },
  ];
  if (report.targetUserId && (!report.anonymous || report.targetUserId !== report.reporterId)) {
    fields.push({ name: 'Member terkait', value: `<@${report.targetUserId}>`, inline: true });
  }
  if (report.claimedBy) fields.push({ name: 'Ditangani oleh', value: `<@${report.claimedBy}>`, inline: true });
  if (report.messageLink) fields.push({ name: 'Pesan terkait', value: `[Buka pesan](${report.messageLink})`, inline: false });
  if (report.finalNote) fields.push({ name: 'Catatan internal', value: report.finalNote, inline: false });

  return new EmbedBuilder()
    .setColor(reportColor(report.status))
    .setTitle(`Laporan insiden · ${statusLabel(report.status)}`)
    .setDescription(report.details)
    .addFields(fields)
    .setFooter({ text: `Hengs Report Hub · Report ID: ${report.id} · revisi ${report.revision}` })
    .setTimestamp(new Date(report.createdAt));
}

function actionButton(report, action, label, style) {
  return new ButtonBuilder()
    .setCustomId(`report:${action}:${report.id}:${report.revision}`)
    .setLabel(label)
    .setStyle(style);
}

function reportComponents(report) {
  if (report.status === 'purge_pending') return [];
  const buttons = [];
  if (report.status === 'open') {
    buttons.push(actionButton(report, 'claim', 'Claim', ButtonStyle.Primary));
  } else if (report.status === 'claimed') {
    buttons.push(
      actionButton(report, 'release', 'Release Claim', ButtonStyle.Secondary),
      actionButton(report, 'resolve', 'Resolve', ButtonStyle.Success),
      actionButton(report, 'dismiss', 'Dismiss', ButtonStyle.Secondary),
    );
  } else if (report.status === 'resolved' || report.status === 'dismissed') {
    buttons.push(actionButton(report, 'reopen', 'Reopen', ButtonStyle.Primary));
  }
  if (report.anonymous) buttons.push(actionButton(report, 'reveal', 'Reveal Reporter', ButtonStyle.Secondary));
  buttons.push(actionButton(report, 'purge', 'Purge', ButtonStyle.Danger));
  return [new ActionRowBuilder().addComponents(buttons)];
}

function panelPayload(report, files = []) {
  const payload = {
    embeds: [reportEmbed(report)],
    components: reportComponents(report),
    allowedMentions: { parse: [] },
  };
  if (files.length) payload.files = files;
  return payload;
}

function returnedEvidence(message, downloaded) {
  if (!downloaded) return null;
  const attachment = message?.attachments?.first?.();
  return {
    name: attachment?.name || downloaded.uploadName,
    url: attachment?.url || '',
    contentType: attachment?.contentType || downloaded.contentType,
    size: attachment?.size || downloaded.size,
  };
}

function evidenceFromExistingMessage(message) {
  const attachment = message?.attachments?.first?.();
  if (!attachment) return null;
  return {
    name: attachment.name || 'evidence',
    url: attachment.url || '',
    contentType: attachment.contentType || 'application/octet-stream',
    size: attachment.size || 0,
  };
}

async function findExistingPanelMessage(channel, botId, reportId) {
  if (!channel?.messages?.fetch || !botId) return null;
  const recent = await channel.messages.fetch({ limit: 100 });
  return recent.find?.(message => (
    message.author?.id === botId
    && message.embeds?.some(embed => String(embed.footer?.text || '').includes(`Report ID: ${reportId}`))
  )) || null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

async function recoverAcceptedPanel(channel, guild, report, delaysMs) {
  for (const waitMs of delaysMs) {
    if (waitMs > 0) await delay(waitMs);
    const existing = await findExistingPanelMessage(channel, guild?.members?.me?.id, report.id);
    if (!existing) continue;
    const recovered = store.setPanel(report.id, {
      channelId: channel.id,
      messageId: existing.id,
      evidence: evidenceFromExistingMessage(existing),
    });
    if (recovered) return { report: recovered, message: existing };
  }
  return null;
}

async function createReportPanel(guild, input, attachment, limits = {}) {
  if (!process.env.OWNER_ID) {
    throw new ReportHubError(
      'REPORT_OWNER_MISSING',
      'Owner laporan belum dikonfigurasi. Hubungi pengelola server.',
    );
  }
  let channel = findModLogChannel(guild);
  if (!channel && process.env.MOD_LOG_CHANNEL_ID && guild?.channels?.fetch) {
    channel = await guild.channels.fetch(process.env.MOD_LOG_CHANNEL_ID).catch(() => null);
  }
  const privacy = validatePrivateReviewChannel(guild, channel);
  if (!privacy.ok) throw channelError(privacy.code);
  await verifyMessageLink(guild, input.messageLink);

  const reserved = store.createReport(input);
  if (!reserved.created && reserved.report.panel) {
    return { ...reserved, panelPayload: panelPayload(reserved.report) };
  }
  if (!reserved.created) {
    if (reserved.report.deliveryStatus === 'sending') {
      throw new ReportHubError(
        'REPORT_DELIVERY_IN_PROGRESS',
        'Laporan dari permintaan ini masih diproses.',
      );
    }
    const existing = await findExistingPanelMessage(channel, guild?.members?.me?.id, reserved.report.id);
    if (existing) {
      const recovered = store.setPanel(reserved.report.id, {
        channelId: channel.id,
        messageId: existing.id,
        evidence: evidenceFromExistingMessage(existing),
      });
      return {
        report: recovered,
        created: false,
        recovered: true,
        panelPayload: panelPayload(recovered),
        message: existing,
      };
    }
  }

  const deliveryClaim = store.claimPanelDelivery(reserved.report.id);
  if (!deliveryClaim.ok) {
    throw new ReportHubError(
      'REPORT_DELIVERY_IN_PROGRESS',
      'Laporan dari permintaan ini masih diproses.',
    );
  }

  let downloaded = null;
  let message = null;
  try {
    if (attachment) {
      downloaded = await evidenceService.downloadEvidence(attachment, {
        ...(limits.evidenceOptions || {}),
        discordLimit: limits.discordLimit,
      });
    }
    const payload = panelPayload(
      reserved.report,
      downloaded ? [{ attachment: downloaded.filePath, name: downloaded.uploadName }] : [],
    );
    message = await channel.send(payload);
    const saved = store.setPanel(reserved.report.id, {
      channelId: channel.id,
      messageId: message.id,
      evidence: returnedEvidence(message, downloaded),
    });
    if (!saved) {
      await message.delete().catch(() => {});
      throw new ReportHubError('REPORT_PANEL_STATE_CONFLICT', 'State panel laporan sudah berubah.');
    }
    return { report: saved, created: reserved.created, panelPayload: payload, message };
  } catch (error) {
    if (!message) {
      const recoveryDelays = Array.isArray(limits.deliveryRecoveryDelaysMs)
        ? limits.deliveryRecoveryDelaysMs
        : [250, 1_000, 2_000];
      const recovered = await recoverAcceptedPanel(channel, guild, reserved.report, recoveryDelays)
        .catch(() => null);
      if (recovered) {
        return {
          report: recovered.report,
          created: reserved.created,
          recovered: true,
          panelPayload: panelPayload(recovered.report),
          message: recovered.message,
        };
      }
      store.abortPanelDelivery(reserved.report.id, error.code || 'SEND_FAILED');
    } else if (message && reserved.created) {
      const removed = await message.delete().then(() => true).catch(() => false);
      if (removed) store.abortPanelDelivery(reserved.report.id, error.code || 'STATE_FAILED');
    }
    if (error instanceof ReportHubError || error instanceof evidenceService.EvidenceError) throw error;
    throw new ReportHubError('REPORT_PANEL_FAILED', 'Panel laporan gagal dibuat.', { cause: error });
  } finally {
    try {
      await evidenceService.cleanupEvidence(downloaded);
    } catch {
      console.error('[report] evidence cleanup failed:', {
        reportId: reserved.report.id,
        code: 'EVIDENCE_CLEANUP_FAILED',
      });
    }
  }
}

function parseComponentId(customId, modal = false) {
  const match = String(customId || '').match(
    modal
      ? /^report:(resolve_modal|dismiss_modal|purge_modal):([a-f0-9]{16}):(\d+)$/
      : /^report:(claim|release|resolve|dismiss|reopen|reveal|purge):([a-f0-9]{16}):(\d+)$/,
  );
  if (!match || !REPORT_ID.test(match[2])) return null;
  return { action: match[1], reportId: match[2], revision: Number(match[3]) };
}

async function ephemeralReply(interaction, content) {
  const payload = { content, ephemeral: true, allowedMentions: { parse: [] } };
  if (interaction.deferred && !interaction.replied && interaction.editReply) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
  } else if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

function transitionMessage(reason) {
  if (reason === 'stale') return 'Laporan ini sudah berubah. Gunakan tombol pada panel terbaru.';
  if (reason === 'forbidden') return 'Aksi ini hanya dapat dilakukan moderator yang sedang menangani laporan.';
  if (reason === 'missing') return 'Laporan tidak ditemukan atau sudah dihapus.';
  return 'Status laporan tidak cocok untuk aksi ini.';
}

async function syncThroughButton(interaction, result, successMessage) {
  if (!result.ok) {
    await ephemeralReply(interaction, transitionMessage(result.reason));
    return;
  }
  try {
    await interaction.update(panelPayload(result.report));
    store.markSynced(result.report.id);
    await ephemeralReply(interaction, successMessage);
  } catch {
    await ephemeralReply(interaction, `${successMessage} Panel akan disinkronkan ulang otomatis.`);
  }
}

function decisionModal(action, report) {
  const isPurge = action === 'purge';
  const modalAction = isPurge ? 'purge_modal' : `${action}_modal`;
  const modal = new ModalBuilder()
    .setCustomId(`report:${modalAction}:${report.id}:${report.revision}`)
    .setTitle(isPurge ? 'Hapus permanen laporan' : `${action === 'resolve' ? 'Selesaikan' : 'Tutup'} laporan`);
  const input = new TextInputBuilder()
    .setCustomId(isPurge ? 'confirmation' : 'note')
    .setLabel(isPurge ? `Ketik ID: ${report.id}` : 'Catatan internal moderator')
    .setStyle(isPurge ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(isPurge ? report.id.length : 5)
    .setMaxLength(isPurge ? report.id.length : 500);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function handleButton(interaction) {
  if (!interaction.isButton?.() || !String(interaction.customId || '').startsWith('report:')) return false;
  const parsed = parseComponentId(interaction.customId, false);
  if (!parsed) {
    await ephemeralReply(interaction, 'Aksi laporan tidak valid.');
    return true;
  }
  if (!permissions.isReportModerator(interaction)) {
    await ephemeralReply(interaction, 'Hanya owner atau moderator laporan yang dapat memakai kontrol ini.');
    return true;
  }

  const owner = permissions.isOwner(interaction.user.id);
  const current = store.getReport(parsed.reportId);
  if (!current) {
    await ephemeralReply(interaction, transitionMessage('missing'));
    return true;
  }

  if (parsed.action === 'reveal') {
    if (!owner) {
      await ephemeralReply(interaction, 'Identitas pelapor anonim hanya dapat dilihat owner.');
    } else if (!current.anonymous) {
      await ephemeralReply(interaction, 'Laporan ini tidak dibuat secara anonim.');
    } else {
      store.recordReporterReveal(current.id, interaction.user.id);
      await ephemeralReply(interaction, `Pelapor untuk \`${current.id}\`: <@${current.reporterId}> (ID: \`${current.reporterId}\`).`);
    }
    return true;
  }

  if (['reopen', 'purge'].includes(parsed.action) && !owner) {
    await ephemeralReply(interaction, 'Aksi ini hanya dapat dilakukan owner.');
    return true;
  }
  if (current.revision !== parsed.revision) {
    await ephemeralReply(interaction, transitionMessage('stale'));
    return true;
  }

  if (parsed.action === 'resolve' || parsed.action === 'dismiss') {
    if (current.status !== 'claimed' || (!owner && current.claimedBy !== interaction.user.id)) {
      await ephemeralReply(interaction, transitionMessage('forbidden'));
      return true;
    }
    await interaction.showModal(decisionModal(parsed.action, current));
    return true;
  }
  if (parsed.action === 'purge') {
    await interaction.showModal(decisionModal('purge', current));
    return true;
  }

  let result;
  if (parsed.action === 'claim') {
    result = store.claimReport(current.id, interaction.user.id, parsed.revision);
  } else if (parsed.action === 'release') {
    result = store.releaseClaim(current.id, interaction.user.id, parsed.revision, owner);
  } else {
    result = store.reopenReport(current.id, interaction.user.id, parsed.revision);
  }
  await syncThroughButton(interaction, result, 'Aksi laporan berhasil disimpan.');
  return true;
}

async function fetchPanelMessage(guild, report) {
  if (!report?.panel) return null;
  const channel = guild?.channels?.cache?.get(report.panel.channelId)
    || await guild?.channels?.fetch?.(report.panel.channelId).catch(() => null);
  if (!channel?.messages?.fetch) {
    throw new ReportHubError('REPORT_PANEL_UNAVAILABLE', 'Panel laporan tidak dapat diakses.');
  }
  try {
    return await channel.messages.fetch(report.panel.messageId);
  } catch (error) {
    if (error?.code === 10008) return null;
    throw error;
  }
}

async function refreshStoredPanel(guild, report) {
  const message = await fetchPanelMessage(guild, report);
  if (!message) return false;
  await message.edit(panelPayload(report));
  store.markSynced(report.id);
  return true;
}

async function resolveGuild(client, guildId) {
  return client?.guilds?.cache?.get(guildId)
    || await client?.guilds?.fetch?.(guildId).catch(() => null);
}

async function recoverUnpanelledReports(client, options = {}) {
  let recovered = 0;
  let aborted = 0;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  for (const report of store.listUnpanelledReports()) {
    try {
      const guild = await resolveGuild(client, report.guildId);
      if (!guild) throw new ReportHubError('REPORT_GUILD_UNAVAILABLE', 'Server laporan tidak dapat diakses.');
      const channel = findModLogChannel(guild);
      const privacy = validatePrivateReviewChannel(guild, channel);
      if (!privacy.ok) throw channelError(privacy.code);
      const existing = await findExistingPanelMessage(channel, guild?.members?.me?.id, report.id);
      if (!existing) {
        const attemptAt = Date.parse(report.deliveryAttemptAt);
        const stillActive = report.deliveryStatus === 'sending'
          && Number.isFinite(attemptAt)
          && (nowMs - attemptAt) < ACTIVE_DELIVERY_GRACE_MS;
        if (stillActive && !options.recoverAllSending) continue;
        if (store.abortPanelDelivery(report.id, 'INTERRUPTED_DELIVERY')) aborted += 1;
        continue;
      }
      if (store.setPanel(report.id, {
        channelId: channel.id,
        messageId: existing.id,
        evidence: evidenceFromExistingMessage(existing),
      })) {
        recovered += 1;
      }
    } catch (error) {
      console.error('[report] orphan recovery failed:', {
        reportId: report.id,
        code: error.code || 'ORPHAN_RECOVERY_FAILED',
      });
    }
  }
  return { recovered, aborted };
}

async function runMaintenance(client, options = {}) {
  if (maintenanceBusy) return { recovered: 0, aborted: 0, synced: 0, purged: 0, skipped: true };
  maintenanceBusy = true;
  let recovered = 0;
  let aborted = 0;
  let synced = 0;
  let purged = 0;
  try {
    ({ recovered, aborted } = await recoverUnpanelledReports(client, options));
    for (const report of store.listSyncPending()) {
      try {
        const guild = await resolveGuild(client, report.guildId);
        if (!guild) throw new ReportHubError('REPORT_GUILD_UNAVAILABLE', 'Server laporan tidak dapat diakses.');
        if (await refreshStoredPanel(guild, report)) synced += 1;
      } catch (error) {
        console.error('[report] panel sync failed:', {
          reportId: report.id,
          code: error.code || 'PANEL_SYNC_FAILED',
        });
      }
    }

    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    for (const due of store.listRetentionDue(nowMs)) {
      let pending = due;
      try {
        if (due.status !== 'purge_pending') {
          pending = store.markPurgePending(due.id, 'retention');
        }
        if (!pending) continue;
        const guild = await resolveGuild(client, pending.guildId);
        if (!guild) throw new ReportHubError('REPORT_GUILD_UNAVAILABLE', 'Server laporan tidak dapat diakses.');
        const message = await fetchPanelMessage(guild, pending);
        if (message) await message.delete();
        if (store.finalizePurge(pending.id, 'retention')) purged += 1;
      } catch (error) {
        console.error('[report] retention purge failed:', {
          reportId: pending?.id || due.id,
          code: error.code || 'PANEL_DELETE_FAILED',
        });
      }
    }
    return { recovered, aborted, synced, purged, skipped: false };
  } finally {
    maintenanceBusy = false;
  }
}

async function start(client, options = {}) {
  await evidenceService.cleanupStaleEvidenceDirs(options.evidenceCleanupOptions);
  const result = await runMaintenance(client, { ...options, recoverAllSending: true });
  if (!options.disableTimer && !maintenanceTimer) {
    maintenanceTimer = setInterval(() => {
      runMaintenance(client).catch(error => {
        console.error('[report] maintenance failed:', { code: error.code || 'MAINTENANCE_FAILED' });
      });
    }, MAINTENANCE_INTERVAL_MS);
    maintenanceTimer.unref?.();
  }
  return result;
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit?.() || !String(interaction.customId || '').startsWith('report:')) return false;
  const parsed = parseComponentId(interaction.customId, true);
  if (!parsed) {
    await ephemeralReply(interaction, 'Form laporan tidak valid.');
    return true;
  }
  if (!permissions.isReportModerator(interaction)) {
    await ephemeralReply(interaction, 'Hanya owner atau moderator laporan yang dapat memakai form ini.');
    return true;
  }
  const owner = permissions.isOwner(interaction.user.id);
  if (parsed.action === 'purge_modal' && !owner) {
    await ephemeralReply(interaction, 'Penghapusan permanen hanya dapat dilakukan owner.');
    return true;
  }

  const current = store.getReport(parsed.reportId);
  if (!current) {
    await ephemeralReply(interaction, transitionMessage('missing'));
    return true;
  }
  if (current.revision !== parsed.revision) {
    await ephemeralReply(interaction, transitionMessage('stale'));
    return true;
  }
  await interaction.deferReply({ ephemeral: true });

  if (parsed.action === 'purge_modal') {
    const confirmation = interaction.fields.getTextInputValue('confirmation').trim();
    if (confirmation !== current.id) {
      await ephemeralReply(interaction, 'Konfirmasi tidak cocok. Laporan tidak dihapus.');
      return true;
    }
    const pending = store.markPurgePending(current.id, interaction.user.id, parsed.revision);
    if (!pending) {
      await ephemeralReply(interaction, transitionMessage('stale'));
      return true;
    }
    const message = await fetchPanelMessage(interaction.guild, pending);
    try {
      if (message) await message.delete();
      store.finalizePurge(pending.id, interaction.user.id);
      await ephemeralReply(interaction, `Laporan \`${pending.id}\` sudah dihapus permanen.`);
    } catch {
      await ephemeralReply(interaction, 'Penghapusan panel gagal. Status disimpan dan akan dicoba ulang otomatis.');
    }
    return true;
  }

  const status = parsed.action === 'resolve_modal' ? 'resolved' : 'dismissed';
  const note = interaction.fields.getTextInputValue('note');
  let result;
  try {
    result = store.finalizeReport(current.id, status, interaction.user.id, note, parsed.revision, {
      ownerOverride: owner,
    });
  } catch (error) {
    await ephemeralReply(interaction, error.userMessage || 'Catatan moderator tidak valid.');
    return true;
  }
  if (!result.ok) {
    await ephemeralReply(interaction, transitionMessage(result.reason));
    return true;
  }
  await refreshStoredPanel(interaction.guild, result.report).catch(() => false);
  await ephemeralReply(interaction, `Laporan \`${result.report.id}\` diperbarui menjadi **${statusLabel(status)}**.`);
  return true;
}

module.exports = {
  ReportHubError,
  createReportPanel,
  findModLogChannel,
  handleButton,
  handleModal,
  panelPayload,
  refreshStoredPanel,
  reportComponents,
  reportEmbed,
  recoverUnpanelledReports,
  runMaintenance,
  start,
  validatePrivateReviewChannel,
  verifyMessageLink,
};
