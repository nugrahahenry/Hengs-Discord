const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('./store');
const { formatWib, parseScheduleInput } = require('./time');
const { isOwner, isEditor } = require('./permissions');

const DATA_DIR = process.env.OPS_DATA_DIR
  ? path.resolve(process.env.OPS_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const CANOX_INBOX = path.join(DATA_DIR, 'canox-ops-inbox.json');
let inboxTimer = null;
let inboxBusy = false;
let scheduleTimer = null;
let scheduleBusy = false;

function isValidDraftId(draftId) {
  return /^(?:[a-f0-9]{12}|[a-f0-9]{16})$/.test(draftId || '');
}

function isSendableTextChannel(channel) {
  return Boolean(channel?.isTextBased?.() && typeof channel.send === 'function');
}

function findTextChannel(guild, envNames, nameNeedles) {
  for (const envName of envNames) {
    const channelId = process.env[envName];
    const channel = channelId && guild.channels.cache.get(channelId);
    if (isSendableTextChannel(channel)) return channel;
  }
  return guild.channels.cache.find(channel =>
    isSendableTextChannel(channel)
      && nameNeedles.some(needle => channel.name.toLowerCase().includes(needle)),
  ) || null;
}

function findSettingsChannel(guild) {
  // Jangan fallback ke BOT_CHANNEL_ID: draft operasional bisa berisi konteks internal
  // yang tidak pantas terlihat di channel bot umum.
  const configured = findTextChannel(guild, ['BOT_SETTINGS_CHANNEL_ID'], []);
  if (configured) return configured;
  const exactNames = new Set(['bot-settings', '🎛️・bot-settings']);
  return guild.channels.cache.find(channel =>
    isSendableTextChannel(channel) && exactNames.has(channel.name.toLowerCase()),
  ) || null;
}

function findAnnouncementsChannel(guild) {
  return findTextChannel(guild, ['ANNOUNCE_CHANNEL_ID'], []);
}

function draftEmbed(draft) {
  const source = draft.source === 'canox' ? 'Canox' : 'Discord';
  const color = draft.status === 'published' ? 0x57F287
    : draft.status === 'discarded' ? 0xED4245
      : draft.status === 'scheduled' ? 0x9B59B6
      : ['publishing', 'revising'].includes(draft.status) ? 0x5865F2
        : 0xFEE75C;
  const status = {
    pending: 'Menunggu persetujuan owner',
    revising: 'Sedang dibuatkan revisi',
    scheduled: 'Terjadwal',
    publishing: 'Sedang dipublikasikan',
    published: 'Sudah dipublikasikan',
    discarded: 'Dibuang',
  }[draft.status] || draft.status;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📋 Draft: ${draft.title}`.slice(0, 256))
    .setDescription(draft.body || '_Tidak ada isi_')
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Sumber', value: source, inline: true },
      { name: 'ID', value: `\`${draft.id}\``, inline: true },
    )
    .setFooter({ text: 'Ops Hub · editor merevisi, owner memutuskan final' })
    .setTimestamp(new Date(draft.createdAt));
  if (draft.brief) {
    embed.addFields({
      name: 'Konteks / sumber',
      value: draft.brief.slice(0, 1024),
      inline: false,
    });
  }
  if (draft.lastRevisedAt) {
    const revisionCount = Array.isArray(draft.revisions) ? draft.revisions.length : 1;
    embed.addFields({
      name: 'Revisi',
      value: `${revisionCount}x · terakhir: ${draft.lastRevisionKind || 'edit'}`,
      inline: false,
    });
  }
  if (draft.schedule?.at) {
    const retry = Number(draft.schedule.attempts) > 0
      ? `\nPercobaan ulang: ${draft.schedule.attempts}/3 · ${formatWib(draft.schedule.nextAttemptAt)}`
      : '';
    embed.addFields({
      name: 'Jadwal tayang (WIB)',
      value: `${formatWib(draft.schedule.at)}${retry}`,
      inline: false,
    });
  } else if (draft.status === 'pending' && draft.lastSchedule?.status === 'failed') {
    embed.addFields({
      name: 'Jadwal terakhir gagal',
      value: 'Tiga percobaan gagal. Review lalu jadwalkan ulang atau Publish Now.',
      inline: false,
    });
  }
  return embed;
}

function publicEmbed(draft) {
  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`📢 ${draft.title}`.slice(0, 256))
    .setDescription(draft.body)
    // ID memungkinkan pemulihan aman bila proses mati setelah Discord menerima
    // pengumuman tetapi sebelum state lokal sempat ditandai published.
    .setFooter({ text: `Hengs Ops Hub · Draft ID: ${draft.id}` })
    .setTimestamp();
}

function approvalRow(draft) {
  if (draft.status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ops:edit:${draft.id}`)
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ops:shorten:${draft.id}`)
          .setLabel('Perpendek')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`ops:regenerate:${draft.id}`)
          .setLabel('Regenerate')
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ops:publishnow:${draft.id}`)
          .setLabel('Publish Now')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ops:schedule:${draft.id}`)
          .setLabel('Jadwalkan')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ops:discard:${draft.id}`)
          .setLabel('Discard')
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  if (draft.status === 'scheduled') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ops:publishnow:${draft.id}`)
        .setLabel('Publish Now')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ops:cancelschedule:${draft.id}`)
        .setLabel('Batalkan Jadwal')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ops:discard:${draft.id}`)
        .setLabel('Discard')
        .setStyle(ButtonStyle.Danger),
    )];
  }
  return [];
}

async function editStoredPanel(guild, draft) {
  const latest = draft?.id ? store.getDraft(draft.id) : null;
  if (!latest?.panel) return false;
  const channel = guild.channels.cache.get(latest.panel.channelId)
    || await guild.channels.fetch(latest.panel.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(latest.panel.messageId).catch(() => null);
  if (!message) return false;
  await message.edit({ embeds: [draftEmbed(latest)], components: approvalRow(latest) });
  return true;
}

async function postDraftPanel(guild, draft) {
  const channel = findSettingsChannel(guild);
  if (!channel) throw new Error('Channel bot-settings tidak ditemukan. Isi BOT_SETTINGS_CHANNEL_ID atau cek nama channel.');
  const message = await channel.send({ embeds: [draftEmbed(draft)], components: approvalRow(draft) });
  try {
    const saved = store.setPanel(draft.id, { channelId: channel.id, messageId: message.id });
    if (!saved) throw new Error('Draft hilang sebelum panel selesai disimpan.');
    return saved;
  } catch (error) {
    await message.delete().catch(() => {});
    throw error;
  }
}

async function createDraftPanel(guild, input) {
  if (!findSettingsChannel(guild)) {
    throw new Error('Channel bot-settings tidak ditemukan. Isi BOT_SETTINGS_CHANNEL_ID atau cek nama channel.');
  }
  const result = store.createDraft(input);
  if (!result.created) return result;
  try {
    const draft = await postDraftPanel(guild, result.draft);
    return { draft, created: true };
  } catch (error) {
    try { store.removeDraft(result.draft.id); } catch (cleanupError) {
      console.error('❌ Ops draft cleanup error:', cleanupError.message);
    }
    throw error;
  }
}

async function handlePublish(interaction, draftId) {
  const channel = findAnnouncementsChannel(interaction.guild);
  if (!channel) {
    await interaction.reply({ content: '❌ Channel announcements tidak ditemukan. Isi ANNOUNCE_CHANNEL_ID dulu.', ephemeral: true });
    return;
  }

  // Lock dilakukan sinkron sebelum await pertama. Klik kedua tidak bisa melewati ini.
  const claimed = store.claimPublish(draftId, interaction.user.id, {
    allowScheduled: true,
  });
  if (!claimed) {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah diproses atau sedang dipublikasikan.', ephemeral: true });
    return;
  }

  try {
    await interaction.update({ embeds: [draftEmbed(claimed)], components: [] });
  } catch (error) {
    store.releasePublish(draftId);
    throw error;
  }

  let publicMessage = null;
  let finalized = null;
  try {
    publicMessage = await channel.send({
      embeds: [publicEmbed(claimed)],
      allowedMentions: { parse: [] },
    });
    finalized = store.finalizeDraft(claimed.id, 'published', interaction.user.id, {
      channelId: channel.id,
      messageId: publicMessage.id,
    });
    if (!finalized) throw new Error('Draft tidak dapat difinalisasi setelah terkirim.');
    await interaction.message.edit({ embeds: [draftEmbed(finalized)], components: [] });
    await interaction.followUp({ content: `✅ **${finalized.title}** sudah dikirim ke ${channel}.`, ephemeral: true });
  } catch (error) {
    console.error('❌ Ops publish error:', error.message);
    if (!publicMessage) {
      const released = store.releasePublish(claimed.id);
      if (released) {
        await interaction.message.edit({ embeds: [draftEmbed(released)], components: approvalRow(released) }).catch(() => {});
      }
      await interaction.followUp({ content: `❌ Gagal publish: ${error.message}`, ephemeral: true });
    } else if (!finalized) {
      // Jangan release: pengumuman sudah ada di Discord. Recovery startup akan
      // mencocokkan Draft ID dan menuntaskan state tanpa mengirim ulang.
      await interaction.followUp({
        content: '⚠️ Pengumuman sudah terkirim, tetapi state lokal belum selesai diperbarui. Jangan publish ulang; Hengs akan memulihkannya saat startup.',
        ephemeral: true,
      });
    } else {
      await interaction.followUp({
        content: '✅ Pengumuman sudah terkirim dan tercatat, tetapi panel review gagal diperbarui. Cek `/ops status` untuk status resminya.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

async function handleDiscard(interaction, draftId) {
  // Finalisasi sinkron sebelum network call menutup race dengan Publish/Discard lain.
  const finalized = store.finalizeDraft(draftId, 'discarded', interaction.user.id);
  if (!finalized) {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah diproses atau sedang dipublikasikan.', ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [draftEmbed(finalized)], components: [] });
  await interaction.followUp({ content: `🗑️ Draft **${finalized.title}** dibuang.`, ephemeral: true });
}

async function handleEdit(interaction, draftId) {
  const draft = store.getDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah diproses atau sedang direvisi.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ops:editmodal:${draft.id}`)
    .setTitle('Edit draft pengumuman');
  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Judul')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(230)
    .setValue(draft.title);
  const bodyInput = new TextInputBuilder()
    .setCustomId('body')
    .setLabel('Isi pengumuman')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(draft.body);
  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(bodyInput),
  );
  await interaction.showModal(modal);
}

async function handleSchedule(interaction, draftId) {
  const draft = store.getDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah diproses atau memiliki jadwal.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`ops:schedulemodal:${draft.id}`)
    .setTitle('Jadwalkan pengumuman');
  const timeInput = new TextInputBuilder()
    .setCustomId('time_wib')
    .setLabel('Waktu WIB')
    .setPlaceholder('Contoh: 20:30 atau 2026-08-02 20:30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(16);
  modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
  await interaction.showModal(modal);
}

async function handleCancelSchedule(interaction, draftId) {
  const cancelled = store.cancelSchedule(draftId, interaction.user.id);
  if (!cancelled) {
    await interaction.reply({
      content: 'ℹ️ Jadwal ini sudah berubah status atau sedang dipublikasikan.',
      ephemeral: true,
    });
    return;
  }
  await interaction.update({
    embeds: [draftEmbed(cancelled)],
    components: approvalRow(cancelled),
  });
  await interaction.followUp({
    content: `✅ Jadwal **${cancelled.title}** dibatalkan. Draft kembali ke review.`,
    ephemeral: true,
  });
}

async function handleAiRevision(interaction, draftId, kind, agent) {
  if (!agent?.reviseAnnouncement) {
    await interaction.reply({ content: '❌ Editor AI Ops Hub belum tersedia.', ephemeral: true });
    return;
  }
  const claimed = store.claimRevision(draftId, interaction.user.id, kind);
  if (!claimed) {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah diproses atau sedang direvisi.', ephemeral: true });
    return;
  }

  try {
    await interaction.update({ embeds: [draftEmbed(claimed)], components: [] });
  } catch (error) {
    store.releaseRevision(draftId);
    throw error;
  }

  try {
    const revised = await agent.reviseAnnouncement(claimed, kind);
    const applied = store.applyRevision(draftId, revised, interaction.user.id);
    if (!applied) throw new Error('Draft tidak dapat menyimpan hasil revisi.');
    const panelUpdated = await editStoredPanel(interaction.guild, applied);
    const label = kind === 'shorten' ? 'dipendekkan' : 'dibuat ulang';
    await interaction.followUp({
      content: panelUpdated
        ? `✅ Draft **${applied.title}** sudah ${label}. Review lagi sebelum Publish.`
        : `✅ Revisi sudah tersimpan, tetapi panel tidak ditemukan. Cek \`/ops status\` sebelum Publish.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error(`❌ Ops ${kind} error:`, error.message);
    const released = store.releaseRevision(draftId);
    if (released) await editStoredPanel(interaction.guild, released).catch(() => {});
    await interaction.followUp({
      content: '❌ Revisi AI gagal. Draft asli tetap aman dan bisa dicoba lagi.',
      ephemeral: true,
    }).catch(() => {});
  }
}

async function handleButton(interaction, { agent } = {}) {
  if (!interaction.isButton?.() || !interaction.customId.startsWith('ops:')) return false;

  const [, action, draftId] = interaction.customId.split(':');
  // Draft dari Ops Hub awal memakai 12 hex; draft baru memakai 16 hex.
  if (
    ![
      'edit',
      'shorten',
      'regenerate',
      'publish',
      'publishnow',
      'schedule',
      'cancelschedule',
      'discard',
    ].includes(action)
    || !isValidDraftId(draftId)
  ) {
    await interaction.reply({ content: '❌ Aksi Ops Hub tidak valid.', ephemeral: true });
    return true;
  }

  const editorActions = new Set(['edit', 'shorten', 'regenerate']);
  if (editorActions.has(action)) {
    if (!isEditor(interaction)) {
      await interaction.reply({
        content: '❌ Hanya owner atau editor Ops Hub yang dapat merevisi draft.',
        ephemeral: true,
      });
      return true;
    }
  } else if (!isOwner(interaction.user.id)) {
    await interaction.reply({
      content: '❌ Hanya owner yang dapat memublikasikan, menjadwalkan, membatalkan, atau membuang draft.',
      ephemeral: true,
    });
    return true;
  }

  if (action === 'edit') await handleEdit(interaction, draftId);
  else if (action === 'shorten' || action === 'regenerate') {
    await handleAiRevision(interaction, draftId, action, agent);
  } else if (action === 'schedule') await handleSchedule(interaction, draftId);
  else if (action === 'cancelschedule') await handleCancelSchedule(interaction, draftId);
  else if (action === 'publish' || action === 'publishnow') await handlePublish(interaction, draftId);
  else await handleDiscard(interaction, draftId);
  return true;
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit?.() || !interaction.customId.startsWith('ops:')) return false;
  const [, action, draftId] = interaction.customId.split(':');
  if (!['editmodal', 'schedulemodal'].includes(action) || !isValidDraftId(draftId)) {
    await interaction.reply({ content: '❌ Form Ops Hub tidak valid.', ephemeral: true });
    return true;
  }

  if (action === 'editmodal' ? !isEditor(interaction) : !isOwner(interaction.user.id)) {
    await interaction.reply({
      content: action === 'editmodal'
        ? '❌ Hanya owner atau editor Ops Hub yang dapat mengedit draft.'
        : '❌ Hanya owner yang dapat menjadwalkan draft.',
      ephemeral: true,
    });
    return true;
  }

  if (action === 'schedulemodal') {
    let parsed;
    try {
      parsed = parseScheduleInput(interaction.fields.getTextInputValue('time_wib'));
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
      return true;
    }
    const scheduled = store.scheduleDraft(draftId, interaction.user.id, parsed.scheduledAt);
    if (!scheduled) {
      await interaction.reply({
        content: 'ℹ️ Draft berubah status sebelum jadwal disimpan.',
        ephemeral: true,
      });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    const panelUpdated = await editStoredPanel(interaction.guild, scheduled).catch(() => false);
    const tomorrowNote = parsed.rolledToTomorrow ? ' Karena jam hari ini sudah lewat, jadwal dipasang untuk besok.' : '';
    await interaction.editReply({
      content: panelUpdated
        ? `✅ **${scheduled.title}** dijadwalkan: **${parsed.label} WIB**.${tomorrowNote}`
        : `✅ Jadwal tersimpan untuk **${parsed.label} WIB**, tetapi panel tidak ditemukan.`,
    });
    return true;
  }

  const updated = store.updatePendingDraft(draftId, {
    title: interaction.fields.getTextInputValue('title'),
    body: interaction.fields.getTextInputValue('body'),
  }, interaction.user.id, 'edit');
  if (!updated) {
    await interaction.reply({
      content: 'ℹ️ Draft berubah status sebelum edit disimpan. Tidak ada isi yang ditimpa.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const panelUpdated = await editStoredPanel(interaction.guild, updated);
    await interaction.editReply({
      content: panelUpdated
        ? `✅ Draft **${updated.title}** berhasil diedit.`
        : '✅ Isi draft tersimpan, tetapi panel tidak ditemukan. Cek `/ops status` sebelum Publish.',
    });
  } catch (error) {
    console.error('❌ Ops edit panel error:', error.message);
    await interaction.editReply({
      content: '✅ Isi draft sudah tersimpan, tetapi panel gagal diperbarui. Cek `/ops status` sebelum Publish.',
    });
  }
  return true;
}

function normalizeCanoxEntries(payload) {
  const entries = Array.isArray(payload) ? payload : payload?.drafts;
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry =>
    entry
      && typeof entry === 'object'
      && typeof entry.id === 'string'
      && entry.id.trim()
      && typeof entry.title === 'string'
      && entry.title.trim()
      && typeof entry.body === 'string'
      && entry.body.trim(),
  ).slice(0, 10);
}

async function consumeCanoxInbox(client) {
  if (inboxBusy || !fs.existsSync(CANOX_INBOX)) return;
  inboxBusy = true;
  const suffix = `${Date.now()}-${process.pid}`;
  const processing = path.join(DATA_DIR, `canox-ops-inbox.processing-${suffix}.json`);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.renameSync(CANOX_INBOX, processing);
    const payload = JSON.parse(fs.readFileSync(processing, 'utf8'));
    const entries = normalizeCanoxEntries(payload);
    if (!entries.length) throw new Error('Inbox Canox tidak memiliki draft valid dengan id, title, dan body.');

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
    if (!guild) throw new Error('DISCORD_GUILD_ID tidak ditemukan atau bot belum masuk server.');

    for (const entry of entries) {
      const result = await createDraftPanel(guild, {
        title: entry.title,
        body: entry.body,
        brief: entry.context || null,
        source: 'canox',
        createdBy: 'canox',
        externalId: `canox:${entry.id}`,
      });
      if (result.created) console.log(`  📥 Canox draft masuk Ops Hub: ${result.draft.title}`);
    }
    fs.rmSync(processing, { force: true });
  } catch (error) {
    console.error('⚠ Canox Ops inbox error:', error.message);
    if (fs.existsSync(processing)) {
      fs.renameSync(processing, path.join(DATA_DIR, `canox-ops-inbox.failed-${suffix}.json`));
    }
  } finally {
    inboxBusy = false;
  }
}

function recoverStaleCanoxInbox() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const staleFiles = fs.readdirSync(DATA_DIR)
    .filter(name => name.startsWith('canox-ops-inbox.processing-') && name.endsWith('.json'))
    .sort();
  if (!staleFiles.length) return 0;

  let recovered = 0;
  for (const [index, name] of staleFiles.entries()) {
    const source = path.join(DATA_DIR, name);
    if (!fs.existsSync(CANOX_INBOX)) {
      fs.renameSync(source, CANOX_INBOX);
      recovered += 1;
      continue;
    }

    // Normalnya hanya ada satu processing file karena ada mutex + instance lock.
    // Bila lebih dari satu ditemukan, simpan sebagai failed agar tidak menimpa inbox.
    const failed = path.join(
      DATA_DIR,
      `canox-ops-inbox.failed-stale-${Date.now()}-${index}.json`,
    );
    fs.renameSync(source, failed);
  }
  return recovered;
}

async function recoverPublishingDrafts(client) {
  const publishing = store.listDraftsByStatus('publishing');
  if (!publishing.length) return;

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error('⚠ Ops recovery ditunda: guild tidak dapat diakses.');
    return;
  }
  const channel = findAnnouncementsChannel(guild);
  if (!channel?.messages?.fetch) {
    console.error('⚠ Ops recovery ditunda: channel announcements tidak dapat dibaca.');
    return;
  }

  let recent;
  try {
    recent = await channel.messages.fetch({ limit: 100 });
  } catch (error) {
    console.error('⚠ Ops recovery gagal membaca announcements:', error.message);
    return;
  }

  for (const draft of publishing) {
    const marker = `Draft ID: ${draft.id}`;
    const publishedMessage = recent.find(message =>
      message.author?.id === client.user?.id
        && message.embeds?.some(embed => embed.footer?.text?.includes(marker)),
    );
    const recovered = publishedMessage
      ? store.finalizeDraft(draft.id, 'published', draft.actionBy || process.env.OWNER_ID, {
          channelId: channel.id,
          messageId: publishedMessage.id,
        })
      : store.releasePublish(draft.id);
    if (recovered) {
      await editStoredPanel(guild, recovered).catch(error =>
        console.error(`⚠ Ops panel recovery ${draft.id}:`, error.message));
      console.log(`  ♻️ Ops draft ${draft.id} dipulihkan sebagai ${recovered.status}.`);
    }
  }
}

async function recoverRevisingDrafts(client) {
  const recoveredIds = store.recoverRevisingDrafts();
  if (!recoveredIds.length) return;
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error('⚠ Ops revision recovery: guild tidak dapat diakses.');
    return;
  }
  for (const draftId of recoveredIds) {
    const draft = store.getDraft(draftId);
    if (draft) {
      await editStoredPanel(guild, draft).catch(error =>
        console.error(`⚠ Ops revision panel recovery ${draftId}:`, error.message));
    }
  }
  console.log(`  ♻️ ${recoveredIds.length} revisi Ops yang terputus dikembalikan ke pending.`);
}

async function processDueSchedules(client) {
  if (scheduleBusy) return;
  const due = store.listDueSchedules();
  if (!due.length) return;
  scheduleBusy = true;
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
    if (!guild) {
      console.error('⚠ Ops scheduler: guild tidak dapat diakses.');
      return;
    }
    const channel = findAnnouncementsChannel(guild);

    for (const dueDraft of due) {
      const claimed = store.claimScheduledPublish(dueDraft.id);
      if (!claimed) continue;
      await editStoredPanel(guild, claimed).catch(() => {});

      if (!channel) {
        console.error(`⚠ Ops scheduled publish ${claimed.id}: channel announcements tidak ditemukan.`);
        const failed = store.failScheduledPublish(claimed.id, 'CHANNEL_MISSING');
        if (failed) await editStoredPanel(guild, failed).catch(() => {});
        continue;
      }

      let publicMessage = null;
      let finalized = null;
      try {
        publicMessage = await channel.send({
          embeds: [publicEmbed(claimed)],
          allowedMentions: { parse: [] },
        });
        finalized = store.finalizeDraft(claimed.id, 'published', 'scheduler', {
          channelId: channel.id,
          messageId: publicMessage.id,
        });
        if (!finalized) throw new Error('Scheduled draft tidak dapat difinalisasi.');
        await editStoredPanel(guild, finalized);
        console.log(`  ⏰ Scheduled Ops draft ${claimed.id} berhasil dipublikasikan.`);
      } catch (error) {
        console.error(`⚠ Ops scheduled publish ${claimed.id}:`, error.message);
        if (!publicMessage) {
          const failed = store.failScheduledPublish(claimed.id, error.code || 'SEND_FAILED');
          if (failed) await editStoredPanel(guild, failed).catch(() => {});
        } else if (!finalized) {
          // Marker Draft ID di pesan publik akan dipakai recovery startup.
          console.error(`⚠ Scheduled draft ${claimed.id} sudah terkirim; menunggu recovery state.`);
        }
      }
    }
  } finally {
    scheduleBusy = false;
  }
}

async function refreshPendingDraftPanels(client) {
  const reviewable = [
    ...store.listDraftsByStatus('pending'),
    ...store.listDraftsByStatus('scheduled'),
  ].filter(draft => draft.panel);
  if (!reviewable.length) return;
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error('⚠ Ops pending panel refresh: guild tidak dapat diakses.');
    return;
  }
  let refreshed = 0;
  for (const draft of reviewable) {
    if (await editStoredPanel(guild, draft).catch(error => {
      console.error(`⚠ Ops pending panel refresh ${draft.id}:`, error.message);
      return false;
    })) {
      refreshed += 1;
    }
  }
  if (refreshed) console.log(`  ♻️ ${refreshed} panel Ops pending disinkronkan.`);
}

function startCanoxInbox(client) {
  if (inboxTimer) return;
  try {
    const recovered = recoverStaleCanoxInbox();
    if (recovered) console.log('  ♻️ Inbox Canox yang tertinggal dipulihkan untuk diproses ulang.');
  } catch (error) {
    console.error('⚠ Ops inbox recovery error:', error.message);
  }
  inboxTimer = setInterval(() => consumeCanoxInbox(client), 10_000);
  if (!scheduleTimer) {
    scheduleTimer = setInterval(() => {
      processDueSchedules(client).catch(error =>
        console.error('⚠ Ops scheduler loop error:', error.message));
    }, 15_000);
  }
  recoverRevisingDrafts(client)
    .then(() => recoverPublishingDrafts(client))
    .then(() => refreshPendingDraftPanels(client))
    .then(() => consumeCanoxInbox(client))
    .then(() => processDueSchedules(client))
    .catch(error => console.error('⚠ Ops startup recovery error:', error.message));
  console.log('  → Ops Hub siap menerima draft Canox untuk direview owner.');
}

module.exports = {
  createDraftPanel,
  findSettingsChannel,
  findAnnouncementsChannel,
  getStatus: store.getStatus,
  getAuditHistory: store.getAuditHistory,
  handleButton,
  handleModal,
  startCanoxInbox,
  // Pure helper diekspor untuk test kontrak inbox tanpa menjalankan bot.
  normalizeCanoxEntries,
  recoverStaleCanoxInbox,
  refreshPendingDraftPanels,
  processDueSchedules,
  isValidDraftId,
  approvalRow,
  isOwner,
  isEditor,
};
