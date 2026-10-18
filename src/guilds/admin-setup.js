'use strict';

const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P,
} = require('discord.js');

const PREFIX = 'hengs-admin-setup:';
const TTL = 10 * 60_000;
const NEWS_NAME = '📰・hengs-news';
const NEWS_PERMISSIONS = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory];
const normalize = name => String(name).toLowerCase().replace(/^[^a-z0-9]+/, '');
const safe = content => ({ content, components: [], embeds: [], allowedMentions: { parse: [] } });

function canManage(interaction, guildAccess) {
  return Boolean(interaction.guild && interaction.guildId === interaction.guild.id
    && interaction.channelId && interaction.user?.id
    && guildAccess?.classify(interaction.guildId)?.kind === 'home'
    && (interaction.guild.ownerId === interaction.user.id
      || interaction.memberPermissions?.has(P.Administrator) === true));
}

function canCreate(guild) {
  return guild.members?.me?.permissions?.has(P.ManageChannels) === true;
}

async function inventory(guild) {
  const fetched = await guild.channels.fetch();
  if (!fetched || typeof fetched.values !== 'function') throw new Error('SETUP_INVENTORY_UNAVAILABLE');
  const channels = [...fetched.values()];
  if (channels.length > 500 || channels.some(c => !c || c.guildId !== guild.id)) {
    throw new Error('SETUP_INVENTORY_INVALID');
  }
  const rows = channels.map(c => [c.id, c.name, c.type, c.parentId || null,
    [...(c.permissionOverwrites?.cache?.values?.() || [])]
      .map(p => [p.id, p.type, String(p.allow.bitfield), String(p.deny.bitfield)]).sort(),
  ]).sort((a, b) => a[0].localeCompare(b[0]));
  return { channels, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}

function findNews(guild, channels, name = 'hengs-news') {
  const matches = channels.filter(c => normalize(c.name) === name);
  if (matches.length > 1 || (matches.length === 1 && matches[0].type !== ChannelType.GuildText)) {
    throw new Error('NEWS_CHANNEL_CONFLICT');
  }
  const channel = matches[0] || null;
  if (channel && !NEWS_PERMISSIONS.every(p => channel.permissionsFor(guild.members.me)?.has(p))) {
    throw new Error('NEWS_CHANNEL_PERMISSIONS');
  }
  return channel;
}

async function ensureNewsChannel(guild, { expectedId = null, parent = null } = {}) {
  const { channels } = await inventory(guild);
  const existing = findNews(guild, channels);
  if ((existing?.id || null) !== expectedId) throw new Error('NEWS_CHANNEL_CHANGED');
  if (existing) return { channel: existing, created: false };
  if (!canCreate(guild)) throw new Error('SETUP_BOT_PERMISSIONS');
  if (parent && !channels.some(c => c.id === parent && c.type === ChannelType.GuildCategory)) {
    throw new Error('NEWS_PARENT_INVALID');
  }
  const channel = await guild.channels.create({
    name: NEWS_NAME,
    type: ChannelType.GuildText,
    ...(parent ? { parent } : {}),
    topic: 'Pilihan bacaan Hengs. Berita harian belum aktif; admin mengaturnya lewat /hengs ask.',
    reason: 'Hengs admin setup: confirmed optional news channel',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory],
        deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads] },
      { id: guild.members.me.id, allow: NEWS_PERMISSIONS },
    ],
  });
  if (channel.guildId !== guild.id || channel.type !== ChannelType.GuildText) throw new Error('NEWS_CREATE_UNCERTAIN');
  return { channel, created: true };
}

async function ensureCommunityChannels(guild, { newsId = null, memeId = null, expectedHash, assertLease = () => {} } = {}) {
  const { channels, hash } = await inventory(guild);
  if (expectedHash && expectedHash !== hash) throw new Error('SETUP_PREVIEW_STALE');
  const news = findNews(guild, channels);
  const meme = findNews(guild, channels, 'hengs-memes');
  if ((news?.id || null) !== newsId || (meme?.id || null) !== memeId) throw new Error('SETUP_PREVIEW_STALE');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
  const allow = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks];
  const result = [];
  for (const [existing, name] of [[news, NEWS_NAME], [meme, '😂・hengs-memes']]) {
    await assertLease();
    if (existing) {
      // Edit only the five public participation bits. Preserve other overwrites and thread policy.
      await existing.permissionOverwrites.edit(guild.roles.everyone.id, {
        ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true,
      }, { reason: 'Hengs setup: owner confirmed direct community posting' });
      result.push(existing);
    } else {
      const parent = news?.parentId || null;
      if (parent && !channels.some(c => c.id === parent && c.type === ChannelType.GuildCategory)) throw new Error('NEWS_PARENT_INVALID');
      const created = await guild.channels.create({ name, type: ChannelType.GuildText,
        ...(parent ? { parent } : {}),
        topic: name === NEWS_NAME ? 'Berita dan sumber dari Hengs serta anggota. Kiriman anggota bukan verifikasi fakta.'
          : 'Meme, komik dan jokes. Anggota boleh unggah langsung; ikuti aturan server.',
        reason: 'Hengs setup: owner confirmed separate community channels',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow,
            deny: [P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads] },
          { id: me.id, allow: NEWS_PERMISSIONS },
        ],
      });
      if (created?.guildId !== guild.id || created.type !== ChannelType.GuildText) throw new Error('NEWS_CREATE_UNCERTAIN');
      result.push(created);
    }
  }
  return result;
}

function newsNextSteps(channel) {
  return [
    `Channel berita siap: <#${channel.id}>. Jadwal berita belum diaktifkan.`,
    'Lewat `/hengs ask`, pilih topik dan jam, lalu lihat preview sebelum kiriman uji.',
    `Contoh: \`atur berita teknologi AI jam 08:00 ke <#${channel.id}>\``,
    'Setelah kiriman uji cocok, kamu bisa memilih mengaktifkan berita harian.',
  ].join('\n');
}

function controls(id, items, revision = 0) {
  return [new ActionRowBuilder().addComponents(items.map(([action, label, style = ButtonStyle.Secondary]) => (
    new ButtonBuilder().setCustomId(`${PREFIX}${id}:${revision}:${action}`).setLabel(label).setStyle(style)
  )))];
}

function createAdminSetupFlow({ applyLegacy, now = Date.now, logger = console } = {}) {
  const tickets = new Map();
  const applying = new Set();
  function sweep() { for (const [id, ticket] of tickets) if (now() >= ticket.expires) tickets.delete(id); }
  function question(id, revision = 0) {
    return { ...safe('**Setup server Hengs**\nMau tambahkan Hengs News sekarang?\n\nPilih dulu, lalu tinjau preview. Belum ada channel yang diubah. Pilihan ini tidak menyalakan berita harian.'),
      components: controls(id, [['yes', 'News saja'], ['community', 'News + memes', ButtonStyle.Primary], ['no', 'Belum sekarang'], ['cancel', 'Batal']], revision) };
  }
  async function reject(interaction, content) {
    await interaction.reply({ ...safe(content), flags: MessageFlags.Ephemeral });
  }
  return {
    async open(interaction, { guildAccess } = {}) {
      if (!canManage(interaction, guildAccess)) return reject(interaction, 'Setup ini hanya untuk pemilik server atau Administrator di server utama Hengs.');
      sweep();
      if (applying.has(interaction.guildId)) return reject(interaction, 'Setup server ini masih berjalan. Tunggu hasilnya dulu.');
      for (const [id, t] of tickets) if (t.guild === interaction.guildId && t.actor === interaction.user.id) tickets.delete(id);
      if (tickets.size >= 100) return reject(interaction, 'Sesi setup sedang penuh. Coba lagi nanti.');
      const id = crypto.randomBytes(12).toString('hex');
      tickets.set(id, { actor: interaction.user.id, guild: interaction.guildId, channel: interaction.channelId,
        expires: now() + TTL, phase: 'question', revision: 0, busy: false });
      await interaction.reply({ ...question(id), flags: MessageFlags.Ephemeral });
    },
    async handle(interaction, { guildAccess } = {}) {
      if (!interaction.isButton?.() || !String(interaction.customId).startsWith(PREFIX)) return false;
      sweep();
      const match = /^hengs-admin-setup:([a-f0-9]{24}):(\d{1,4}):(yes|no|community|split|back|cancel|news|full)$/.exec(interaction.customId);
      const ticket = match && tickets.get(match[1]);
      if (!ticket || ticket.revision !== Number(match[2]) || !canManage(interaction, guildAccess) || ticket.actor !== interaction.user.id
        || ticket.guild !== interaction.guildId || ticket.channel !== interaction.channelId) {
        await reject(interaction, 'Sesi setup tidak tersedia untukmu atau sudah kedaluwarsa. Buka `/admin setup` lagi.');
        return true;
      }
      const [, id, , action] = match;
      if (ticket.busy || applying.has(ticket.guild)) {
        await reject(interaction, 'Setup server ini sedang diproses. Tunggu hasilnya dulu.'); return true;
      }
      ticket.busy = true;
      let ownsLock = false;
      try {
        await interaction.deferUpdate();
        if (action === 'cancel') {
          tickets.delete(id);
          await interaction.editReply(safe('Setup dibatalkan. Channel dan jadwal berita tidak diubah.'));
          return true;
        }
        if (action === 'back') {
          ticket.phase = 'question'; ticket.revision++; delete ticket.hash;
          await interaction.editReply(question(id, ticket.revision)); return true;
        }
        if (action === 'community') {
          if (ticket.phase !== 'question') throw new Error('SETUP_PHASE_INVALID');
          const snapshot = await inventory(interaction.guild);
          const news = findNews(interaction.guild, snapshot.channels);
          const meme = findNews(interaction.guild, snapshot.channels, 'hengs-memes');
          ticket.existingId = news?.id || null; ticket.memeId = meme?.id || null;
          ticket.hash = snapshot.hash; ticket.phase = 'community-preview'; ticket.revision++;
          await interaction.editReply({ ...safe([
            '**Preview news + memes**',
            `${news ? 'Pakai' : 'Buat'} hengs-news; ${meme ? 'pakai' : 'buat'} hengs-memes. Channel lama tidak dipindah/diubah namanya. Meme baru mengikuti kategori news; jika belum ada news, keduanya di luar kategori.`,
            'Buka izin @everyone untuk melihat, membaca riwayat, mengirim, melampirkan file dan menyematkan link di kedua channel. Overwrite role/anggota lain tetap; batas akun/role Discord tetap berlaku.',
            'Anggota langsung posting tanpa antrean admin/AI. Hengs tidak menjamin kebenaran atau keamanan isi kiriman. Tidak mengubah channel lain, tidak menjalankan setup lengkap.',
            'Routing/jadwal bot belum diubah. Setelah channel siap, pilih tujuan melalui atur berita, preview berita, lalu terapkan berita.',
          ].join('\n\n')), components: controls(id, [['split', 'Buat/buka kedua channel', ButtonStyle.Primary], ['back', 'Ubah pilihan'], ['cancel', 'Batal']], ticket.revision) });
          return true;
        }
        if (['yes', 'no'].includes(action)) {
          if (ticket.phase !== 'question') throw new Error('SETUP_PHASE_INVALID');
          const snapshot = await inventory(interaction.guild);
          const existing = action === 'yes' ? findNews(interaction.guild, snapshot.channels) : null;
          ticket.includeNews = action === 'yes'; ticket.existingId = existing?.id || null;
          ticket.hash = snapshot.hash; ticket.phase = 'preview'; ticket.revision++;
          const newsCopy = ticket.includeNews
            ? (existing ? 'Pakai channel hengs-news yang sudah ada, tanpa memindahkan, mengganti nama, atau izinnya.'
              : 'Buat satu channel 📰・hengs-news. Anggota biasa bisa membaca; bot/admin dapat mengirim.')
            : 'Lewati penambahan news. Channel dan pengaturan news yang sudah ada tidak dihapus atau dimatikan.';
          await interaction.editReply({ ...safe([
            '**Preview setup**', newsCopy,
            ticket.includeNews ? 'Tambah news saja: tidak menyentuh channel lain; channel baru diletakkan di luar kategori.' : null,
            '**Setup lengkap** menjalankan template server lama: statistik, welcome, announcements, community, gaming, tech, bot center, private dan voice.',
            'Setup lengkap dapat menamai ulang/memindahkan channel, mengganti statistik teks lama, dan membuat webhook GSA. Jangan pilih ini kalau hanya ingin news.',
            ticket.includeNews ? 'Dalam setup lengkap, channel news baru diletakkan di kategori ANNOUNCEMENTS.' : null,
            'Berita harian tidak diaktifkan. Pilihan berlaku 10 menit sejak setup dibuka.',
          ].filter(Boolean).join('\n\n')),
          components: controls(id, [
            ...(ticket.includeNews ? [['news', 'Tambah news saja', ButtonStyle.Primary]] : []),
            ['full', ticket.includeNews ? 'Setup lengkap + news' : 'Setup tanpa tambahan news'],
            ['back', 'Ubah pilihan'], ['cancel', 'Batal'],
          ], ticket.revision) });
          return true;
        }
        if (action === 'split' ? ticket.phase !== 'community-preview'
          : ticket.phase !== 'preview' || (action === 'news' && !ticket.includeNews)) throw new Error('SETUP_PHASE_INVALID');
        if (applying.has(ticket.guild)) throw new Error('SETUP_BUSY');
        applying.add(ticket.guild); ownsLock = true;
        const snapshot = await inventory(interaction.guild);
        if (tickets.get(id) !== ticket || snapshot.hash !== ticket.hash
          || !canManage(interaction, guildAccess) || now() >= ticket.expires) {
          throw new Error('SETUP_PREVIEW_STALE');
        }
        if ((action === 'full' || !ticket.existingId) && !canCreate(interaction.guild)) throw new Error('SETUP_BOT_PERMISSIONS');
        if (ticket.includeNews) findNews(interaction.guild, snapshot.channels);
        // Consume before any external write; a timeout is uncertain, not a retry invitation.
        tickets.delete(id);
        await interaction.editReply(safe('Menerapkan pilihan setup. Tunggu hasilnya di panel ini.'));
        if (action === 'split') {
          const assertLease = async () => {
            if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
            if (interaction.user.id !== interaction.guild.ownerId) {
              const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
              if (!member.permissions.has(P.Administrator)) throw new Error('SETUP_PREVIEW_STALE');
            }
            if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
          };
          const [news, meme] = await ensureCommunityChannels(interaction.guild, {
            newsId: ticket.existingId, memeId: ticket.memeId, expectedHash: ticket.hash, assertLease,
          });
          await interaction.editReply(safe(`Channel siap: <#${news.id}> untuk berita; <#${meme.id}> untuk meme/jokes. Anggota dapat posting sesuai izin Discord.\nRouting bot belum berubah. Lewat /hengs ask: atur berita 2 berita 1 meme ke <#${news.id}>, meme ke <#${meme.id}>, lalu preview berita dan terapkan berita (atau uji dahulu untuk konfigurasi baru).`));
        } else if (action === 'news') {
          const result = await ensureNewsChannel(interaction.guild, { expectedId: ticket.existingId });
          await interaction.editReply(safe(newsNextSteps(result.channel)));
        } else {
          await applyLegacy(interaction, { includeNews: ticket.includeNews, newsChannelId: ticket.existingId });
        }
      } catch(error) {
        const consumed = !tickets.has(id);
        tickets.delete(id);
        const messages = {
          NEWS_CHANNEL_CONFLICT: 'Ada nama hengs-news yang ganda atau dipakai jenis channel lain. Rapikan dulu, lalu buka setup lagi.',
          NEWS_CHANNEL_PERMISSIONS: 'Hengs perlu izin View Channel, Send Messages, Embed Links dan Read Message History pada channel news.',
          SETUP_BOT_PERMISSIONS: 'Hengs perlu izin Manage Channels untuk pilihan ini. Belum ada channel yang dibuat.',
          COMMUNITY_SETUP_PERMISSIONS: 'Hengs perlu Manage Channels dan Manage Roles untuk menyiapkan izin kirim anggota.',
          SETUP_PREVIEW_STALE: 'Isi server atau sesi berubah sejak preview. Buka setup lagi untuk melihat rencana terbaru.',
          SETUP_BUSY: 'Setup server ini sedang berjalan. Tunggu hasilnya sebelum membuka setup lagi.',
        };
        logger.error('[admin-setup] SETUP_ACTION_FAILED');
        const content = consumed
          ? 'Hasil setup belum bisa dipastikan; sebagian perubahan mungkin sudah terjadi. Cek channel sebelum membuka setup lagi. Tidak dicoba ulang otomatis. Jadwal berita tidak diaktifkan.'
          : (messages[error.message] || 'Setup belum diterapkan. Buka `/admin setup` lagi; tidak ada percobaan ulang otomatis.');
        if (interaction.deferred || interaction.replied) await interaction.editReply(safe(content));
        else await reject(interaction, content);
      } finally { ticket.busy = false; if (ownsLock) applying.delete(ticket.guild); }
      return true;
    },
  };
}

module.exports = { PREFIX, createAdminSetupFlow, ensureNewsChannel, ensureCommunityChannels, newsNextSteps };
