const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const store = require('./store');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CANOX_INBOX = path.join(DATA_DIR, 'canox-ops-inbox.json');
let inboxTimer = null;

function isOwner(userId) {
  return Boolean(process.env.OWNER_ID) && userId === process.env.OWNER_ID;
}

function findTextChannel(guild, envNames, nameNeedles) {
  for (const envName of envNames) {
    const channelId = process.env[envName];
    const channel = channelId && guild.channels.cache.get(channelId);
    if (channel?.isTextBased?.()) return channel;
  }
  return guild.channels.cache.find(channel =>
    channel.isTextBased?.() && nameNeedles.some(needle => channel.name.toLowerCase().includes(needle)),
  ) || null;
}

function findSettingsChannel(guild) {
  return findTextChannel(guild, ['BOT_SETTINGS_CHANNEL_ID', 'BOT_CHANNEL_ID'], ['bot-settings', 'botsettings']);
}

function findAnnouncementsChannel(guild) {
  return findTextChannel(guild, ['ANNOUNCE_CHANNEL_ID'], ['announcements', 'announcement', 'announce']);
}

function draftEmbed(draft) {
  const source = draft.source === 'canox' ? 'Canox' : 'Discord';
  const color = draft.status === 'published' ? 0x57F287
    : draft.status === 'discarded' ? 0xED4245
      : 0xFEE75C;
  const status = {
    pending: 'Menunggu persetujuan owner',
    published: 'Sudah dipublikasikan',
    discarded: 'Dibuang',
  }[draft.status] || draft.status;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📋 Draft: ${draft.title}`)
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

async function postDraftPanel(guild, draft) {
  const channel = findSettingsChannel(guild);
  if (!channel) throw new Error('Channel bot-settings tidak ditemukan. Isi BOT_SETTINGS_CHANNEL_ID atau cek nama channel.');
  const message = await channel.send({ embeds: [draftEmbed(draft)], components: approvalRow(draft) });
  return store.setPanel(draft.id, { channelId: channel.id, messageId: message.id });
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
    store.removeDraft(result.draft.id);
    throw error;
  }
}

async function handleButton(interaction) {
  if (!interaction.isButton?.() || !interaction.customId.startsWith('ops:')) return false;
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: '❌ Hanya owner yang dapat menyetujui atau membuang draft.', ephemeral: true });
    return true;
  }

  const [, action, draftId] = interaction.customId.split(':');
  const draft = store.getDraft(draftId);
  if (!draft || draft.status !== 'pending') {
    await interaction.reply({ content: 'ℹ️ Draft ini sudah tidak aktif.', ephemeral: true });
    return true;
  }

  if (action === 'publish') {
    const channel = findAnnouncementsChannel(interaction.guild);
    if (!channel) {
      await interaction.reply({ content: '❌ Channel announcements tidak ditemukan. Isi ANNOUNCE_CHANNEL_ID dulu.', ephemeral: true });
      return true;
    }
    await interaction.deferUpdate();
    try {
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle(`📢 ${draft.title}`)
          .setDescription(draft.body)
          .setFooter({ text: 'Hengs Ops Hub' })
          .setTimestamp()],
        // Draft AI/Canox tidak boleh berubah jadi mass mention tanpa aksi sadar owner.
        allowedMentions: { parse: [] },
      });
      const finalized = store.finalizeDraft(draft.id, 'published', interaction.user.id);
      await interaction.message.edit({ embeds: [draftEmbed(finalized)], components: [] });
      await interaction.followUp({ content: `✅ **${finalized.title}** sudah dikirim ke ${channel}.`, ephemeral: true });
    } catch (error) {
      console.error('❌ Ops publish error:', error.message);
      await interaction.followUp({ content: `❌ Gagal publish: ${error.message}`, ephemeral: true });
    }
    return true;
  }

  if (action === 'discard') {
    await interaction.deferUpdate();
    const finalized = store.finalizeDraft(draft.id, 'discarded', interaction.user.id);
    await interaction.message.edit({ embeds: [draftEmbed(finalized)], components: [] });
    await interaction.followUp({ content: `🗑️ Draft **${finalized.title}** dibuang.`, ephemeral: true });
    return true;
  }

  await interaction.reply({ content: '❌ Aksi Ops Hub tidak dikenal.', ephemeral: true });
  return true;
}

function normalizeCanoxEntries(payload) {
  const entries = Array.isArray(payload) ? payload : payload?.drafts;
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry =>
    entry && typeof entry === 'object' && typeof entry.title === 'string' && typeof entry.body === 'string',
  ).slice(0, 10);
}

async function consumeCanoxInbox(client) {
  if (!fs.existsSync(CANOX_INBOX)) return;
  const processing = path.join(DATA_DIR, 'canox-ops-inbox.processing.json');
  try {
    fs.renameSync(CANOX_INBOX, processing);
    const payload = JSON.parse(fs.readFileSync(processing, 'utf8'));
    const entries = normalizeCanoxEntries(payload);
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
    if (!guild) throw new Error('DISCORD_GUILD_ID tidak ditemukan atau bot belum masuk server.');

    for (const entry of entries) {
      const result = await createDraftPanel(guild, {
        title: entry.title,
        body: entry.body,
        brief: entry.context || null,
        source: 'canox',
        createdBy: 'canox',
        externalId: entry.id ? `canox:${entry.id}` : null,
      });
      if (result.created) console.log(`  📥 Canox draft masuk Ops Hub: ${result.draft.title}`);
    }
    fs.renameSync(processing, path.join(DATA_DIR, `canox-ops-inbox.processed-${Date.now()}.json`));
  } catch (error) {
    console.error('⚠ Canox Ops inbox error:', error.message);
    if (fs.existsSync(processing)) {
      fs.renameSync(processing, path.join(DATA_DIR, `canox-ops-inbox.failed-${Date.now()}.json`));
    }
  }
}

function startCanoxInbox(client) {
  if (inboxTimer) return;
  inboxTimer = setInterval(() => consumeCanoxInbox(client), 10_000);
  consumeCanoxInbox(client);
  console.log('  → Ops Hub siap menerima draft Canox untuk direview owner.');
}

module.exports = {
  createDraftPanel,
  findSettingsChannel,
  findAnnouncementsChannel,
  getStatus: store.getStatus,
  handleButton,
  startCanoxInbox,
};
