const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const store = require('./store');

const DATA_DIR = process.env.OPS_DATA_DIR
  ? path.resolve(process.env.OPS_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const CANOX_INBOX = path.join(DATA_DIR, 'canox-ops-inbox.json');
let inboxTimer = null;
let inboxBusy = false;

function isOwner(userId) {
  return Boolean(process.env.OWNER_ID) && userId === process.env.OWNER_ID;
}

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
      : draft.status === 'publishing' ? 0x5865F2
        : 0xFEE75C;
  const status = {
    pending: 'Menunggu persetujuan owner',
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
    .setFooter({ text: 'Ops Hub · review dulu sebelum tayang publik' })
    .setTimestamp(new Date(draft.createdAt));
  if (draft.brief) {
    embed.addFields({
      name: 'Konteks / sumber',
      value: draft.brief.slice(0, 1024),
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
  if (draft.status !== 'pending') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ops:publish:${draft.id}`)
      .setLabel('Publish')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ops:discard:${draft.id}`)
      .setLabel('Discard')
      .setStyle(ButtonStyle.Danger),
  )];
}

async function editStoredPanel(guild, draft) {
  if (!draft?.panel) return;
  const channel = guild.channels.cache.get(draft.panel.channelId)
    || await guild.channels.fetch(draft.panel.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return;
  const message = await channel.messages.fetch(draft.panel.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [draftEmbed(draft)], components: approvalRow(draft) });
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
  const claimed = store.claimPublish(draftId, interaction.user.id);
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

async function handleButton(interaction) {
  if (!interaction.isButton?.() || !interaction.customId.startsWith('ops:')) return false;
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: '❌ Hanya owner yang dapat menyetujui atau membuang draft.', ephemeral: true });
    return true;
  }

  const [, action, draftId] = interaction.customId.split(':');
  // Draft dari Ops Hub awal memakai 12 hex; draft baru memakai 16 hex.
  if (!['publish', 'discard'].includes(action) || !isValidDraftId(draftId)) {
    await interaction.reply({ content: '❌ Aksi Ops Hub tidak valid.', ephemeral: true });
    return true;
  }

  if (action === 'publish') await handlePublish(interaction, draftId);
  else await handleDiscard(interaction, draftId);
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

function startCanoxInbox(client) {
  if (inboxTimer) return;
  try {
    const recovered = recoverStaleCanoxInbox();
    if (recovered) console.log('  ♻️ Inbox Canox yang tertinggal dipulihkan untuk diproses ulang.');
  } catch (error) {
    console.error('⚠ Ops inbox recovery error:', error.message);
  }
  inboxTimer = setInterval(() => consumeCanoxInbox(client), 10_000);
  recoverPublishingDrafts(client)
    .then(() => consumeCanoxInbox(client))
    .catch(error => console.error('⚠ Ops startup recovery error:', error.message));
  console.log('  → Ops Hub siap menerima draft Canox untuk direview owner.');
}

module.exports = {
  createDraftPanel,
  findSettingsChannel,
  findAnnouncementsChannel,
  getStatus: store.getStatus,
  handleButton,
  startCanoxInbox,
  // Pure helper diekspor untuk test kontrak inbox tanpa menjalankan bot.
  normalizeCanoxEntries,
  recoverStaleCanoxInbox,
  isValidDraftId,
};
