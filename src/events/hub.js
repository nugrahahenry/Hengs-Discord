const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const store = require('./store');
const { formatWib, parseScheduleInput } = require('../ops/time');
const { findSettingsChannel, findAnnouncementsChannel } = require('../ops/hub');
const { isOwner, isEditor } = require('../ops/permissions');

const refreshQueues = new Map();
const DATA_DIR = process.env.EVENT_DATA_DIR
  ? path.resolve(process.env.EVENT_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const CANOX_EVENT_INBOX = path.join(DATA_DIR, 'canox-event-inbox.json');
let workerTimer = null;
let workerBusy = false;
let inboxTimer = null;
let inboxBusy = false;

function isValidEventId(value) {
  return /^[a-f0-9]{16}$/.test(value || '');
}

function statusLabel(status) {
  return {
    draft: 'Menunggu persetujuan owner',
    publishing: 'Sedang dipublikasikan',
    published: 'Pendaftaran dibuka',
    cancelled: 'Dibatalkan',
    closed: 'Event dimulai / pendaftaran ditutup',
    discarded: 'Draft dibuang',
  }[status] || status;
}

function eventColor(status) {
  if (status === 'published') return 0x57F287;
  if (status === 'draft') return 0xFEE75C;
  if (status === 'publishing') return 0x5865F2;
  if (status === 'closed') return 0x95A5A6;
  return 0xED4245;
}

function formatWibInput(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const date = new Date(time + (7 * 60 * 60 * 1000));
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function eventEmbed(event, { publicView = false } = {}) {
  const unix = Math.floor(Date.parse(event.startAt) / 1000);
  const yes = event.rsvp?.yes?.length || 0;
  const maybe = event.rsvp?.maybe?.length || 0;
  const capacity = event.capacity ? `${yes}/${event.capacity}` : String(yes);
  const embed = new EmbedBuilder()
    .setColor(eventColor(event.status))
    .setTitle(`${publicView ? 'Event' : 'Draft event'}: ${event.title}`.slice(0, 256))
    .setDescription(event.description)
    .addFields(
      { name: 'Waktu', value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
      { name: 'Lokasi', value: event.location || 'Discord / menyusul', inline: true },
      { name: 'Hadir', value: capacity, inline: true },
      { name: 'Mungkin', value: String(maybe), inline: true },
    )
    .setTimestamp(new Date(event.createdAt));
  if (event.sourceUrl) {
    embed.addFields({ name: 'Referensi', value: `<${event.sourceUrl}>`, inline: false });
  }
  if (publicView) {
    embed.setFooter({ text: `Hengs Event Hub · Event ID: ${event.id}` });
  } else {
    embed.addFields(
      { name: 'Status', value: statusLabel(event.status), inline: true },
      { name: 'ID', value: `\`${event.id}\``, inline: true },
      { name: 'Sumber', value: event.source === 'canox' ? 'Canox' : 'Discord', inline: true },
      { name: 'Revisi', value: String(Number.isInteger(event.revision) ? event.revision : 0), inline: true },
    );
    embed.setFooter({ text: 'Event Hub · editor membuat draft, owner memutuskan final' });
  }
  return embed;
}

function approvalRow(event) {
  if (event.status === 'draft') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:edit_details:${event.id}`)
        .setLabel('Edit Detail')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`event:edit_settings:${event.id}`)
        .setLabel('Kapasitas & Sumber')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`event:publish:${event.id}`)
        .setLabel('Publish Event')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`event:discard:${event.id}`)
        .setLabel('Discard')
        .setStyle(ButtonStyle.Danger),
    )];
  }
  if (event.status === 'published') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:cancel:${event.id}`)
        .setLabel('Batalkan Event')
        .setStyle(ButtonStyle.Danger),
    )];
  }
  return [];
}

function rsvpRow(event) {
  if (event.status !== 'published' || Date.parse(event.startAt) <= Date.now()) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`event:rsvp_yes:${event.id}`)
      .setLabel('Hadir')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`event:rsvp_maybe:${event.id}`)
      .setLabel('Mungkin')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`event:rsvp_no:${event.id}`)
      .setLabel('Batal RSVP')
      .setStyle(ButtonStyle.Secondary),
  )];
}

async function editPanel(guild, event) {
  if (!event?.panel) return false;
  const channel = guild.channels.cache.get(event.panel.channelId)
    || await guild.channels.fetch(event.panel.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(event.panel.messageId).catch(() => null);
  if (!message) return false;
  await message.edit({ embeds: [eventEmbed(event)], components: approvalRow(event) });
  return true;
}

async function editPublication(guild, event) {
  if (!event?.publication) return false;
  const channel = guild.channels.cache.get(event.publication.channelId)
    || await guild.channels.fetch(event.publication.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(event.publication.messageId).catch(() => null);
  if (!message) return false;
  await message.edit({ embeds: [eventEmbed(event, { publicView: true })], components: rsvpRow(event) });
  return true;
}

function queueRefresh(guild, eventId) {
  const previous = refreshQueues.get(eventId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(async () => {
      const latest = store.getEvent(eventId);
      if (!latest) return;
      const [panelResult, publicationResult] = await Promise.allSettled([
        latest.panel ? editPanel(guild, latest) : Promise.resolve(true),
        latest.publication ? editPublication(guild, latest) : Promise.resolve(true),
      ]);
      const panelSynced = panelResult.status === 'fulfilled' && panelResult.value === true;
      const publicationSynced = publicationResult.status === 'fulfilled' && publicationResult.value === true;
      if (panelSynced && publicationSynced) store.markMessagesSynced(eventId);
    })
    .finally(() => {
      if (refreshQueues.get(eventId) === current) refreshQueues.delete(eventId);
    });
  refreshQueues.set(eventId, current);
  return current;
}

async function createDraftPanel(guild, input) {
  const settings = findSettingsChannel(guild);
  if (!settings) throw new Error('Channel bot-settings tidak ditemukan.');
  const result = store.createEvent(input);
  if (!result.created) return result;
  let panel = null;
  try {
    panel = await settings.send({
      embeds: [eventEmbed(result.event)],
      components: approvalRow(result.event),
      allowedMentions: { parse: [] },
    });
    const saved = store.setPanel(result.event.id, {
      channelId: settings.id,
      messageId: panel.id,
    });
    if (!saved) throw new Error('Event hilang sebelum panel selesai disimpan.');
    return { event: saved, created: true };
  } catch (error) {
    if (panel) await panel.delete().catch(() => {});
    store.removeEvent(result.event.id);
    throw error;
  }
}

async function publishEvent(interaction, eventId) {
  const channel = findAnnouncementsChannel(interaction.guild);
  if (!channel) {
    await interaction.reply({ content: 'Channel announcements tidak ditemukan.', flags: MessageFlags.Ephemeral });
    return;
  }
  const current = store.getEvent(eventId);
  if (current?.status === 'draft' && Date.parse(current.startAt) <= Date.now()) {
    await interaction.reply({
      content: 'Jadwal event ini sudah lewat. Buang draft ini lalu buat event baru dengan waktu yang masih akan datang.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const claimed = store.claimPublish(eventId, interaction.user.id);
  if (!claimed) {
    await interaction.reply({ content: 'Event ini sudah diproses atau statusnya berubah.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.update({ embeds: [eventEmbed(claimed)], components: [] });

  let publicMessage = null;
  let finalized = null;
  try {
    publicMessage = await channel.send({
      embeds: [eventEmbed(claimed, { publicView: true })],
      components: rsvpRow({ ...claimed, status: 'published' }),
      allowedMentions: { parse: [] },
    });
    finalized = store.finalizePublish(eventId, interaction.user.id, {
      channelId: channel.id,
      messageId: publicMessage.id,
    });
    if (!finalized) throw new Error('State event gagal difinalisasi.');
    await queueRefresh(interaction.guild, eventId);
    await interaction.followUp({
      content: `Event **${finalized.title}** sudah tayang di ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    if (!publicMessage) {
      store.releasePublish(eventId);
      await queueRefresh(interaction.guild, eventId);
      await interaction.followUp({ content: `Gagal publish event: ${error.message}`, flags: MessageFlags.Ephemeral });
    } else if (!finalized) {
      await interaction.followUp({
        content: 'Event sudah terkirim, tetapi state belum final. Jangan publish ulang; startup recovery akan mencocokkannya.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function showEditDetailsModal(interaction, event) {
  const revision = Number.isInteger(event.revision) ? event.revision : 0;
  const modal = new ModalBuilder()
    .setCustomId(`event:editdetailsmodal:${event.id}:${revision}`)
    .setTitle('Edit detail event');
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Judul')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200)
    .setValue(event.title);
  const description = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Deskripsi')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(3500)
    .setValue(event.description);
  const startAt = new TextInputBuilder()
    .setCustomId('time_wib')
    .setLabel('Waktu WIB')
    .setPlaceholder('Contoh: 2026-08-02 19:30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(16)
    .setValue(formatWibInput(event.startAt));
  const location = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Lokasi (boleh kosong)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (event.location) location.setValue(event.location);
  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(description),
    new ActionRowBuilder().addComponents(startAt),
    new ActionRowBuilder().addComponents(location),
  );
  await interaction.showModal(modal);
}

async function showEditSettingsModal(interaction, event) {
  const revision = Number.isInteger(event.revision) ? event.revision : 0;
  const modal = new ModalBuilder()
    .setCustomId(`event:editsettingsmodal:${event.id}:${revision}`)
    .setTitle('Kapasitas dan sumber');
  const capacity = new TextInputBuilder()
    .setCustomId('capacity')
    .setLabel('Kapasitas 2-500 (boleh kosong)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(3);
  if (event.capacity) capacity.setValue(String(event.capacity));
  const sourceUrl = new TextInputBuilder()
    .setCustomId('source_url')
    .setLabel('URL sumber HTTP(S) (boleh kosong)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  if (event.sourceUrl) sourceUrl.setValue(event.sourceUrl);
  modal.addComponents(
    new ActionRowBuilder().addComponents(capacity),
    new ActionRowBuilder().addComponents(sourceUrl),
  );
  await interaction.showModal(modal);
}

async function handleButton(interaction) {
  if (!interaction.isButton?.() || !interaction.customId.startsWith('event:')) return false;
  const [, action, eventId] = interaction.customId.split(':');
  if (!isValidEventId(eventId) || !interaction.inGuild?.()) {
    await interaction.reply({ content: 'Kontrol event tidak valid.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (['edit_details', 'edit_settings'].includes(action)) {
    if (!isEditor(interaction)) {
      await interaction.reply({
        content: 'Hanya owner atau editor Ops Hub yang dapat mengedit draft event.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const event = store.getEvent(eventId);
    if (!event || event.status !== 'draft') {
      await interaction.reply({
        content: 'Draft event sudah berubah status dan tidak dapat diedit.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (action === 'edit_details') await showEditDetailsModal(interaction, event);
    else await showEditSettingsModal(interaction, event);
    return true;
  }

  if (action.startsWith('rsvp_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const response = action.slice(5);
    const result = store.setRsvp(eventId, interaction.user.id, response);
    if (!result.ok) {
      const message = result.reason === 'full'
        ? 'Kapasitas event sudah penuh.'
        : 'RSVP untuk event ini sudah ditutup.';
      await interaction.editReply({ content: message });
      return true;
    }
    await queueRefresh(interaction.guild, eventId);
    const labels = { yes: 'Hadir', maybe: 'Mungkin', no: 'RSVP dibatalkan' };
    await interaction.editReply({ content: `Pilihanmu: **${labels[response]}**.` });
    return true;
  }

  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: 'Hanya owner yang dapat melakukan tindakan final event.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === 'publish') {
    await publishEvent(interaction, eventId);
    return true;
  }
  if (action === 'discard') {
    const discarded = store.discardDraft(eventId, interaction.user.id);
    if (!discarded) {
      await interaction.reply({ content: 'Draft event sudah diproses.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.update({ embeds: [eventEmbed(discarded)], components: [] });
    store.markMessagesSynced(eventId);
    await interaction.followUp({ content: `Draft **${discarded.title}** dibuang.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === 'cancel') {
    const cancelled = store.cancelEvent(eventId, interaction.user.id);
    if (!cancelled) {
      await interaction.reply({ content: 'Event sudah ditutup, dibatalkan, atau reminder sedang diproses. Coba lagi sebentar.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.update({ embeds: [eventEmbed(cancelled)], components: [] });
    await queueRefresh(interaction.guild, eventId);
    await interaction.followUp({ content: `Event **${cancelled.title}** dibatalkan.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.reply({ content: 'Aksi event tidak dikenal.', flags: MessageFlags.Ephemeral });
  return true;
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit?.() || !interaction.customId.startsWith('event:')) return false;
  const [, action, eventId, revisionRaw] = interaction.customId.split(':');
  const expectedRevision = Number(revisionRaw);
  if (
    !['editdetailsmodal', 'editsettingsmodal'].includes(action)
    || !isValidEventId(eventId)
    || !Number.isInteger(expectedRevision)
    || expectedRevision < 0
  ) {
    await interaction.reply({ content: 'Form Event Hub tidak valid.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!isEditor(interaction)) {
    await interaction.reply({
      content: 'Hanya owner atau editor Ops Hub yang dapat menyimpan edit event.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let changes;
  try {
    if (action === 'editdetailsmodal') {
      const parsed = parseScheduleInput(interaction.fields.getTextInputValue('time_wib'));
      changes = {
        title: interaction.fields.getTextInputValue('title'),
        description: interaction.fields.getTextInputValue('description'),
        startAt: parsed.scheduledAt,
        location: interaction.fields.getTextInputValue('location'),
      };
    } else {
      const rawCapacity = interaction.fields.getTextInputValue('capacity').trim();
      if (rawCapacity && !/^\d{1,3}$/.test(rawCapacity)) {
        throw new Error('Kapasitas harus angka 2-500 atau dikosongkan.');
      }
      changes = {
        capacity: rawCapacity,
        sourceUrl: interaction.fields.getTextInputValue('source_url'),
      };
    }
    const result = store.updateDraft(
      eventId,
      changes,
      interaction.user.id,
      expectedRevision,
    );
    if (!result.ok) {
      const content = result.reason === 'stale'
        ? 'Draft sudah diedit dari panel lain. Buka modal terbaru agar perubahan tidak menimpa revisi baru.'
        : 'Draft event sudah berubah status dan tidak dapat diedit.';
      await interaction.editReply({ content });
      return true;
    }

    let panelSynced = true;
    try {
      await queueRefresh(interaction.guild, eventId);
      panelSynced = store.getEvent(eventId)?.messageSyncPending === false;
    } catch (error) {
      panelSynced = false;
      console.error('Event edit panel error:', error.message);
    }
    const label = action === 'editdetailsmodal' ? 'Detail event' : 'Kapasitas dan sumber';
    await interaction.editReply({
      content: panelSynced
        ? `${label} berhasil diperbarui. Review lagi sebelum Publish.`
        : `${label} tersimpan, tetapi panel belum sinkron. Jangan Publish sebelum panel pulih.`,
    });
  } catch (error) {
    await interaction.editReply({ content: `Edit event gagal: ${error.message}` });
  }
  return true;
}

function messageHasFooter(message, expected) {
  return message?.embeds?.some((embed) => embed.footer?.text === expected);
}

async function recentMessages(channel) {
  if (!channel?.messages?.fetch) return [];
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  return messages ? [...messages.values()] : [];
}

async function recoverPublishingEvents(client) {
  for (const event of store.listPublishingEvents()) {
    const guild = client.guilds.cache.find((item) => (
      item.channels.cache.has(event.panel?.channelId)
      || item.channels.cache.has(process.env.ANNOUNCE_CHANNEL_ID)
    ));
    if (!guild) continue;
    const channel = findAnnouncementsChannel(guild);
    const marker = `Hengs Event Hub · Event ID: ${event.id}`;
    const publicMessage = (await recentMessages(channel)).find((message) => messageHasFooter(message, marker));
    if (publicMessage) {
      store.finalizePublish(event.id, 'recovery', { channelId: channel.id, messageId: publicMessage.id });
    } else {
      store.releasePublish(event.id);
    }
    await queueRefresh(guild, event.id);
  }
}

async function recoverSendingReminders(client) {
  for (const { event, kind } of store.listSendingReminders()) {
    const guild = client.guilds.cache.find((item) => item.channels.cache.has(event.publication?.channelId));
    if (!guild) continue;
    const channel = guild.channels.cache.get(event.publication.channelId);
    const marker = `Hengs Event Hub · Reminder ${kind} · Event ID: ${event.id}`;
    const reminder = (await recentMessages(channel)).find((message) => messageHasFooter(message, marker));
    if (reminder) store.finalizeReminder(event.id, kind, reminder.id);
    else store.releaseReminder(event.id, kind);
  }
}

function reminderEmbed(event, kind) {
  const unix = Math.floor(Date.parse(event.startAt) / 1000);
  const label = kind === 'day' ? 'kurang dari 24 jam' : 'kurang dari 1 jam';
  const link = event.publication
    ? `https://discord.com/channels/${event.guildId || '@me'}/${event.publication.channelId}/${event.publication.messageId}`
    : null;
  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`Pengingat event: ${event.title}`.slice(0, 256))
    .setDescription(`Event dimulai ${label}: <t:${unix}:F> (<t:${unix}:R>).${link ? `\n[Lihat dan isi RSVP](${link})` : ''}`)
    .setFooter({ text: `Hengs Event Hub · Reminder ${kind} · Event ID: ${event.id}` })
    .setTimestamp();
}

async function processWorker(client, nowMs = Date.now()) {
  if (workerBusy) return;
  workerBusy = true;
  try {
    for (const due of store.listDueClosures(nowMs)) {
      const closed = store.closeDueEvent(due.id, nowMs);
      if (!closed) continue;
      const guild = client.guilds.cache.find((item) => item.channels.cache.has(closed.publication?.channelId));
      if (guild) await queueRefresh(guild, closed.id);
    }
    for (const { event, kind } of store.listDueReminders(nowMs)) {
      const claimed = store.claimReminder(event.id, kind);
      if (!claimed) continue;
      const guild = client.guilds.cache.find((item) => item.channels.cache.has(claimed.publication?.channelId));
      const channel = guild?.channels.cache.get(claimed.publication?.channelId);
      if (!channel) {
        store.releaseReminder(event.id, kind);
        continue;
      }
      let reminder = null;
      try {
        const withGuild = { ...claimed, guildId: guild.id };
        reminder = await channel.send({
          embeds: [reminderEmbed(withGuild, kind)],
          allowedMentions: { parse: [] },
        });
        store.finalizeReminder(event.id, kind, reminder.id);
      } catch (error) {
        if (!reminder) store.releaseReminder(event.id, kind);
        console.error(`Event reminder ${kind} gagal:`, error.message);
      }
    }
  } finally {
    workerBusy = false;
  }
}

async function refreshStoredMessages(client) {
  for (const event of store.listUnsyncedEvents()) {
    const guild = client.guilds.cache.find((candidate) => (
      candidate.channels.cache.has(event.panel?.channelId)
      || candidate.channels.cache.has(event.publication?.channelId)
    ));
    if (guild) await queueRefresh(guild, event.id);
  }
}

function normalizeCanoxEventEntries(payload, nowMs = Date.now()) {
  const entries = Array.isArray(payload) ? payload : payload?.events;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10) return [];
  const normalized = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return [];
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    const startAt = typeof entry.start_at === 'string' ? entry.start_at.trim() : '';
    const startMs = Date.parse(startAt);
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(startAt);
    if (
      !/^[A-Za-z0-9._:-]{8,120}$/.test(id)
      || !title || title.length > 200
      || !description || description.length > 3500
      || !hasTimezone || !Number.isFinite(startMs) || startMs <= nowMs
    ) return [];

    const location = entry.location === null || entry.location === undefined
      ? null : String(entry.location).trim();
    if (location && location.length > 500) return [];
    const capacity = entry.capacity === null || entry.capacity === undefined
      ? null : Number(entry.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 2 || capacity > 500)) return [];

    let sourceUrl = null;
    if (entry.source_url !== null && entry.source_url !== undefined && String(entry.source_url).trim()) {
      try {
        const parsed = new URL(String(entry.source_url).trim());
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
          return [];
        }
        sourceUrl = parsed.href;
      } catch {
        return [];
      }
      if (sourceUrl.length > 1000) return [];
    }
    normalized.push({ id, title, description, startAt, location, capacity, sourceUrl });
  }
  return normalized;
}

async function consumeCanoxEventInbox(client) {
  if (inboxBusy || !fs.existsSync(CANOX_EVENT_INBOX)) return;
  inboxBusy = true;
  const suffix = `${Date.now()}-${process.pid}`;
  const processing = path.join(DATA_DIR, `canox-event-inbox.processing-${suffix}.json`);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.renameSync(CANOX_EVENT_INBOX, processing);
    const payload = JSON.parse(fs.readFileSync(processing, 'utf8'));
    const entries = normalizeCanoxEventEntries(payload);
    if (!entries.length) {
      throw new Error('Inbox event Canox tidak valid atau memuat jadwal yang sudah lewat.');
    }

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
    if (!guild) throw new Error('DISCORD_GUILD_ID tidak ditemukan atau bot belum masuk server.');
    for (const entry of entries) {
      const result = await createDraftPanel(guild, {
        title: entry.title,
        description: entry.description,
        startAt: entry.startAt,
        location: entry.location,
        capacity: entry.capacity,
        sourceUrl: entry.sourceUrl,
        source: 'canox',
        createdBy: 'canox',
        externalId: `canox-event:${entry.id}`,
      });
      if (result.created) console.log(`  -> Draft event Canox masuk: ${result.event.title}`);
    }
    fs.rmSync(processing, { force: true });
  } catch (error) {
    console.error('Canox Event inbox error:', error.message);
    if (fs.existsSync(processing)) {
      fs.renameSync(processing, path.join(DATA_DIR, `canox-event-inbox.failed-${suffix}.json`));
    }
  } finally {
    inboxBusy = false;
  }
}

function recoverStaleCanoxEventInbox() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const staleFiles = fs.readdirSync(DATA_DIR)
    .filter((name) => name.startsWith('canox-event-inbox.processing-') && name.endsWith('.json'))
    .sort();
  if (!staleFiles.length) return 0;
  let recovered = 0;
  for (const [index, name] of staleFiles.entries()) {
    const source = path.join(DATA_DIR, name);
    if (!fs.existsSync(CANOX_EVENT_INBOX)) {
      fs.renameSync(source, CANOX_EVENT_INBOX);
      recovered += 1;
    } else {
      fs.renameSync(source, path.join(
        DATA_DIR,
        `canox-event-inbox.failed-stale-${Date.now()}-${index}.json`,
      ));
    }
  }
  return recovered;
}

function start(client) {
  if (workerTimer || inboxTimer) return;
  try {
    const recovered = recoverStaleCanoxEventInbox();
    if (recovered) console.log('  -> Inbox event Canox yang tertinggal dipulihkan.');
  } catch (error) {
    console.error('Canox Event inbox recovery error:', error.message);
  }
  recoverPublishingEvents(client)
    .then(() => recoverSendingReminders(client))
    .then(() => processWorker(client))
    .then(() => refreshStoredMessages(client))
    .then(() => consumeCanoxEventInbox(client))
    .catch((error) => console.error('Event Hub startup recovery error:', error.message));
  workerTimer = setInterval(() => {
    processWorker(client).catch((error) => console.error('Event Hub worker error:', error.message));
  }, 30_000);
  workerTimer.unref?.();
  inboxTimer = setInterval(() => {
    consumeCanoxEventInbox(client).catch((error) => console.error('Canox Event inbox loop error:', error.message));
  }, 10_000);
  inboxTimer.unref?.();
  console.log('  -> Event Hub siap menerima draft Discord/Canox dan RSVP.');
}

module.exports = {
  createDraftPanel,
  handleButton,
  handleModal,
  start,
  processWorker,
  recoverPublishingEvents,
  recoverSendingReminders,
  refreshStoredMessages,
  eventEmbed,
  approvalRow,
  rsvpRow,
  normalizeCanoxEventEntries,
  consumeCanoxEventInbox,
  recoverStaleCanoxEventInbox,
  isValidEventId,
  formatWibInput,
  getStatus: store.getStatus,
};
