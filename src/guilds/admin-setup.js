'use strict';

const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P,
} = require('discord.js');
const { ROLE_NAME, CHANNEL_NAME, BOT_PERMISSIONS, findTeamRole, findScrimChannel } = require('../scrim/service');

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
  // Members read and react; only Hengs posts. Members submit through /kirim, which previews first.
  const memberBits = { ViewChannel: true, ReadMessageHistory: true, AddReactions: true, SendMessages: false,
    SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false };
  const botBits = { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true };
  const reason = { reason: 'Hengs setup: owner confirmed read-only news and meme channels' };
  const result = [];
  for (const [existing, name] of [[news, NEWS_NAME], [meme, '😂・hengs-memes']]) {
    await assertLease();
    if (existing) {
      // Edit only these bits for @everyone and Hengs. Other overwrites stay as they are.
      await existing.permissionOverwrites.edit(guild.roles.everyone.id, memberBits, reason);
      await existing.permissionOverwrites.edit(me.id, botBits, reason);
      result.push(existing);
    } else {
      const parent = news?.parentId || null;
      if (parent && !channels.some(c => c.id === parent && c.type === ChannelType.GuildCategory)) throw new Error('NEWS_PARENT_INVALID');
      const created = await guild.channels.create({ name, type: ChannelType.GuildText,
        ...(parent ? { parent } : {}),
        topic: name === NEWS_NAME ? 'Berita pilihan Hengs dan kiriman anggota lewat /kirim berita. Kiriman anggota bukan verifikasi fakta.'
          : 'Meme dari Hengs dan anggota. Kirim punyamu lewat /kirim meme di tanya-hengs.',
        reason: 'Hengs setup: owner confirmed separate read-only news and meme channels',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions],
            deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads] },
          { id: me.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks] },
        ],
      });
      if (created?.guildId !== guild.id || created.type !== ChannelType.GuildText) throw new Error('NEWS_CREATE_UNCERTAIN');
      result.push(created);
    }
  }
  return result;
}

const ANALYST_NAME = '📊・hengs-analis';
// Read-only like memes: members read and react (🔥 🤔 ⚠️), only Hengs posts. Hengs gets Pin Messages here only
// when the server already gave it that permission, since a bot cannot grant itself more than it has.
async function ensureAnalystChannel(guild, { channelId = null, expectedHash, assertLease = async () => {} } = {}) {
  const { channels, hash } = await inventory(guild);
  if (expectedHash && expectedHash !== hash) throw new Error('SETUP_PREVIEW_STALE');
  const existing = findNews(guild, channels, 'hengs-analis');
  if ((existing?.id || null) !== channelId) throw new Error('SETUP_PREVIEW_STALE');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
  const pin = me.permissions.has(P.PinMessages) === true;
  await assertLease();
  const reason = { reason: 'Hengs setup: owner confirmed read-only MLBB analyst channel' };
  if (existing) {
    await existing.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: true, ReadMessageHistory: true, AddReactions: true,
      SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false }, reason);
    await existing.permissionOverwrites.edit(me.id, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true,
      AttachFiles: true, EmbedLinks: true, AddReactions: true, ...(pin ? { PinMessages: true } : {}) }, reason);
    return { channel: existing, created: false };
  }
  const parent = findNews(guild, channels)?.parentId || null;
  if (parent && !channels.some(c => c.id === parent && c.type === ChannelType.GuildCategory)) throw new Error('NEWS_PARENT_INVALID');
  const channel = await guild.channels.create({ name: ANALYST_NAME, type: ChannelType.GuildText, ...(parent ? { parent } : {}),
    topic: 'Rekap MLBB pro dari Hengs: hasil series, draft hero, catatan dari angka. Data: Liquipedia (CC-BY-SA 3.0). Panduan ada di pesan yang di-pin.',
    ...reason,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions],
        deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads] },
      { id: me.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.AddReactions,
        ...(pin ? [P.PinMessages] : [])] },
    ],
  });
  if (channel?.guildId !== guild.id || channel.type !== ChannelType.GuildText) throw new Error('NEWS_CREATE_UNCERTAIN');
  return { channel, created: true };
}

const TANYA_NAME = '🤖・tanya-hengs';
// Hengs' own chat channel. bot-commands stays shared with other bots. Members keep the server's own permissions here
// (they chat and attach images); only Hengs gets an overwrite, with Pin Messages when the server already gave it.
async function ensureTanyaChannel(guild, { channelId = null, expectedHash, assertLease = async () => {} } = {}) {
  const { channels, hash } = await inventory(guild);
  if (expectedHash && expectedHash !== hash) throw new Error('SETUP_PREVIEW_STALE');
  const existing = findNews(guild, channels, 'tanya-hengs');
  if ((existing?.id || null) !== channelId) throw new Error('SETUP_PREVIEW_STALE');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
  const pin = me.permissions.has(P.PinMessages) === true;
  await assertLease();
  const bot = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.AddReactions, ...(pin ? [P.PinMessages] : [])];
  if (existing) return { channel: existing, created: false };
  const parent = findNews(guild, channels, 'bot-commands')?.parentId || null;
  if (parent && !channels.some(c => c.id === parent && c.type === ChannelType.GuildCategory)) throw new Error('NEWS_PARENT_INVALID');
  const channel = await guild.channels.create({ name: TANYA_NAME, type: ChannelType.GuildText, ...(parent ? { parent } : {}),
    topic: 'Ngobrol sama Hengs: mention @Hengs + pertanyaanmu. Kirim meme atau berita juga bisa di sini. Panduan ada di pesan yang di-pin.',
    reason: 'Hengs setup: owner confirmed the Tanya Hengs chat channel',
    permissionOverwrites: [{ id: me.id, allow: bot }] });
  if (channel?.guildId !== guild.id || channel.type !== ChannelType.GuildText) throw new Error('NEWS_CREATE_UNCERTAIN');
  return { channel, created: true };
}

function guideCopy(guide) {
  if (guide?.pinned) return 'Panduan sudah dikirim dan di-pin.';
  if (guide?.posted) return 'Panduan sudah dikirim, tapi Hengs belum bisa mem-pin: kasih Hengs izin Pin Messages di channel itu, atau pin manual.';
  if (guide?.exists) return 'Panduan yang lama masih ada.';
  return 'Panduan belum terkirim. Buka `/admin setup` lagi untuk mencoba.';
}

async function ensureScrimSetup(guild, { roleId = null, channelId = null, expectedHash, assertLease = async () => {} } = {}) {
  const { channels, hash } = await inventory(guild);
  if (expectedHash && expectedHash !== hash) throw new Error('SETUP_PREVIEW_STALE');
  const existingRole = await findTeamRole(guild);
  const existingChannel = findScrimChannel(channels);
  if ((existingRole?.id || null) !== roleId || (existingChannel?.id || null) !== channelId) throw new Error('SETUP_PREVIEW_STALE');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
  await assertLease();
  // The role carries no server permissions; it only unlocks posting in hasil-scrim.
  const role = existingRole || await guild.roles.create({ name: ROLE_NAME, permissions: [], mentionable: false,
    hoist: false, reason: 'Hengs setup: owner confirmed scrim team role' });
  if (!role?.id) throw new Error('SCRIM_ROLE_UNCERTAIN');
  await assertLease();
  const team = { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true };
  // Scrim results must not leak: only the team role and Hengs can see the channel (owner decision 2026-10-20).
  if (existingChannel) {
    const reason = 'Hengs setup: owner confirmed private team scrim channel';
    // Edit only these bits for @everyone, the team role and Hengs; other overwrites stay.
    await existingChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false, ReadMessageHistory: false,
      SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false, SendMessagesInThreads: false,
      AddReactions: false }, { reason });
    await existingChannel.permissionOverwrites.edit(role.id, team, { reason });
    await existingChannel.permissionOverwrites.edit(me.id, team, { reason });
    return { role, channel: existingChannel, createdRole: !existingRole, createdChannel: false };
  }
  const gaming = channels.filter(c => c.type === ChannelType.GuildCategory && normalize(c.name) === 'gaming');
  const channel = await guild.channels.create({ name: CHANNEL_NAME, type: ChannelType.GuildText,
    ...(gaming.length === 1 ? { parent: gaming[0].id } : {}),
    topic: 'Hasil scrim tim, privat untuk Hengs Family. Kirim lewat /scrim hasil di tanya-hengs atau unggah langsung.',
    reason: 'Hengs setup: owner confirmed private scrim results channel',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [], deny: [P.ViewChannel, P.ReadMessageHistory, P.SendMessages,
        P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads, P.AddReactions] },
      { id: role.id, allow: BOT_PERMISSIONS },
      { id: me.id, allow: BOT_PERMISSIONS },
    ],
  });
  if (channel?.guildId !== guild.id || channel.type !== ChannelType.GuildText) throw new Error('SCRIM_CREATE_UNCERTAIN');
  return { role, channel, createdRole: !existingRole, createdChannel: true };
}

function newsNextSteps(channel) {
  return [
    `Channel berita siap: <#${channel.id}>. Jadwal berita belum diaktifkan.`,
    'Lewat `/hengs ask`, pilih topik dan jam, lalu lihat preview sebelum kiriman uji.',
    `Contoh: \`atur berita teknologi AI jam 08:00 ke <#${channel.id}>\``,
    'Setelah kiriman uji cocok, kamu bisa memilih mengaktifkan berita harian.',
  ].join('\n');
}

// Discord allows five buttons per row.
function controls(id, items, revision = 0) {
  const rows = [];
  for (let i = 0; i < items.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(items.slice(i, i + 5).map(([action, label, style = ButtonStyle.Secondary]) => (
      new ButtonBuilder().setCustomId(`${PREFIX}${id}:${revision}:${action}`).setLabel(label).setStyle(style)
    ))));
  }
  return rows;
}

function createAdminSetupFlow({ applyLegacy, now = Date.now, logger = console } = {}) {
  const tickets = new Map();
  const applying = new Set();
  function sweep() { for (const [id, ticket] of tickets) if (now() >= ticket.expires) tickets.delete(id); }
  function question(id, revision = 0) {
    return { ...safe('**Setup server Hengs**\nMau tambahkan Hengs News sekarang? Atau siapkan channel hasil scrim tim, atau channel Analis MLBB.\n\nPilih dulu, lalu tinjau preview. Belum ada channel yang diubah. Pilihan ini tidak menyalakan berita harian.'),
      components: controls(id, [['yes', 'News saja'], ['community', 'News + memes', ButtonStyle.Primary], ['scrim', 'Scrim tim'],
        ['analis', 'Analis MLBB'], ['tanya', 'Tanya Hengs'], ['no', 'Belum sekarang'], ['cancel', 'Batal']], revision) };
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
    async handle(interaction, { guildAccess, postAnalystGuide, postChatGuide } = {}) {
      if (!interaction.isButton?.() || !String(interaction.customId).startsWith(PREFIX)) return false;
      sweep();
      const match = /^hengs-admin-setup:([a-f0-9]{24}):(\d{1,4}):(yes|no|community|split|back|cancel|news|full|scrim|scrimapply|analis|analisapply|tanya|tanyaapply)$/.exec(interaction.customId);
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
            'Cuma Hengs yang posting di kedua channel. @everyone boleh melihat, membaca riwayat dan kasih reaksi, tapi tidak mengirim atau membuat thread. Overwrite role/anggota lain tetap; admin tetap bisa posting.',
            'Anggota kirim lewat /kirim meme (gambar, dicek otomatis) atau /kirim berita (link) di tanya-hengs, dengan preview dan konfirmasi sendiri. Hengs tidak menjamin kebenaran isi kiriman. Tidak mengubah channel lain, tidak menjalankan setup lengkap.',
            'Routing/jadwal bot belum diubah. Setelah channel siap, pilih tujuan melalui atur berita, preview berita, lalu terapkan berita.',
          ].join('\n\n')), components: controls(id, [['split', 'Buat/buka kedua channel', ButtonStyle.Primary], ['back', 'Ubah pilihan'], ['cancel', 'Batal']], ticket.revision) });
          return true;
        }
        if (action === 'scrim') {
          if (ticket.phase !== 'question') throw new Error('SETUP_PHASE_INVALID');
          const snapshot = await inventory(interaction.guild);
          const role = await findTeamRole(interaction.guild);
          const channel = findScrimChannel(snapshot.channels);
          ticket.roleId = role?.id || null; ticket.scrimId = channel?.id || null;
          ticket.hash = snapshot.hash; ticket.phase = 'scrim-preview'; ticket.revision++;
          await interaction.editReply({ ...safe([
            '**Preview channel hasil scrim**',
            `${role ? 'Pakai' : 'Buat'} role Hengs Family (tanpa izin server tambahan); ${channel ? 'pakai channel hasil-scrim yang ada' : 'buat channel 📸・hasil-scrim di kategori Gaming kalau ada'}.`,
            'Channel privat: cuma role Hengs Family dan Hengs yang bisa melihat, membaca, kirim, lampirkan file dan embed. Member lain tidak bisa melihat channel ini; Owner dan role Administrator tetap bisa.',
            'Anggota tim ditambahkan ke role secara manual lewat Server Settings > Members. Hengs tidak memberi role ke siapa pun.',
            'Tidak mengubah channel lain dan tidak menjalankan setup lengkap.',
          ].join('\n\n')), components: controls(id, [['scrimapply', 'Buat/pakai role + channel', ButtonStyle.Primary], ['back', 'Ubah pilihan'], ['cancel', 'Batal']], ticket.revision) });
          return true;
        }
        if (action === 'tanya') {
          if (ticket.phase !== 'question') throw new Error('SETUP_PHASE_INVALID');
          const snapshot = await inventory(interaction.guild);
          const existing = findNews(interaction.guild, snapshot.channels, 'tanya-hengs');
          const shared = findNews(interaction.guild, snapshot.channels, 'bot-commands');
          ticket.tanyaId = existing?.id || null;
          ticket.hash = snapshot.hash; ticket.phase = 'tanya-preview'; ticket.revision++;
          await interaction.editReply({ ...safe([
            '**Preview channel Tanya Hengs**',
            existing ? 'Pakai channel tanya-hengs yang sudah ada, tanpa memindahkan atau mengganti namanya.'
              : `Buat ${TANYA_NAME} ${shared?.parentId ? 'di kategori yang sama dengan bot-commands' : 'di luar kategori'}.`,
            'Anggota ngobrol sama Hengs di sini: mention Hengs, minta berita atau meme, kirim meme atau berita lewat chat. Izin anggota ikut pengaturan server; cuma izin Hengs yang ditambah.',
            'bot-commands tetap buat bot lain (musik dan lainnya). Slash command Hengs tetap jalan di sana, tapi mention Hengs di sana cuma dibalas 👋.',
            'Hengs mengirim pesan panduan lalu mem-pin-nya. Tidak mengubah channel lain.',
          ].join('\n\n')), components: controls(id, [['tanyaapply', 'Buat/pakai tanya-hengs', ButtonStyle.Primary], ['back', 'Ubah pilihan'], ['cancel', 'Batal']], ticket.revision) });
          return true;
        }
        if (action === 'analis') {
          if (ticket.phase !== 'question') throw new Error('SETUP_PHASE_INVALID');
          const snapshot = await inventory(interaction.guild);
          const existing = findNews(interaction.guild, snapshot.channels, 'hengs-analis');
          const news = findNews(interaction.guild, snapshot.channels);
          ticket.analisId = existing?.id || null;
          ticket.hash = snapshot.hash; ticket.phase = 'analis-preview'; ticket.revision++;
          await interaction.editReply({ ...safe([
            '**Preview channel analis**',
            existing ? 'Pakai channel hengs-analis yang sudah ada, tanpa memindahkan atau mengganti namanya.'
              : `Buat ${ANALYST_NAME} ${news?.parentId ? 'di kategori yang sama dengan hengs-news' : 'di luar kategori'}.`,
            'Cuma Hengs yang posting. @everyone boleh melihat, membaca riwayat dan kasih reaksi (🔥 🤔 ⚠️), tapi tidak mengirim atau membuat thread. Overwrite role/anggota lain tetap.',
            'Hengs mengirim pesan panduan lalu mem-pin-nya. Rekap MPL diambil dari Liquipedia (CC-BY-SA 3.0); kartunya dibuat Hengs sendiri, tanpa logo atau screenshot.',
            'Tidak mengubah channel lain.',
          ].join('\n\n')), components: controls(id, [['analisapply', 'Buat/pakai channel analis', ButtonStyle.Primary], ['back', 'Ubah pilihan'], ['cancel', 'Batal']], ticket.revision) });
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
        const applyPhase = { split: 'community-preview', scrimapply: 'scrim-preview', analisapply: 'analis-preview',
          tanyaapply: 'tanya-preview' }[action] || 'preview';
        if (ticket.phase !== applyPhase || (action === 'news' && !ticket.includeNews)) throw new Error('SETUP_PHASE_INVALID');
        if (applying.has(ticket.guild)) throw new Error('SETUP_BUSY');
        applying.add(ticket.guild); ownsLock = true;
        const snapshot = await inventory(interaction.guild);
        if (tickets.get(id) !== ticket || snapshot.hash !== ticket.hash
          || !canManage(interaction, guildAccess) || now() >= ticket.expires) {
          throw new Error('SETUP_PREVIEW_STALE');
        }
        const target = action === 'analisapply' ? ticket.analisId : action === 'tanyaapply' ? ticket.tanyaId : ticket.existingId;
        if ((action === 'full' || !target) && !canCreate(interaction.guild)) throw new Error('SETUP_BOT_PERMISSIONS');
        if (ticket.includeNews) findNews(interaction.guild, snapshot.channels);
        // Consume before any external write; a timeout is uncertain, not a retry invitation.
        tickets.delete(id);
        await interaction.editReply(safe('Menerapkan pilihan setup. Tunggu hasilnya di panel ini.'));
        const assertLease = async () => {
          if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
          if (interaction.user.id !== interaction.guild.ownerId) {
            const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
            if (!member.permissions.has(P.Administrator)) throw new Error('SETUP_PREVIEW_STALE');
          }
          if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
        };
        if (action === 'tanyaapply') {
          const { channel, created } = await ensureTanyaChannel(interaction.guild, {
            channelId: ticket.tanyaId, expectedHash: ticket.hash, assertLease,
          });
          let guide = null;
          if (created) {
            try { guide = await postChatGuide?.(channel); } catch { logger.error('[admin-setup] CHAT_GUIDE_FAILED'); }
          }
          await interaction.editReply(safe(`Channel Tanya Hengs siap: <#${channel.id}>. ${created ? guideCopy(guide)
            : 'Channel-nya sudah ada, panduan tidak dikirim ulang.'}\nMention Hengs di sana buat ngobrol; bot-commands tetap buat bot lain.`));
        } else if (action === 'analisapply') {
          const { channel } = await ensureAnalystChannel(interaction.guild, {
            channelId: ticket.analisId, expectedHash: ticket.hash, assertLease,
          });
          let guide = null;
          try { guide = await postAnalystGuide?.(channel); } catch { logger.error('[admin-setup] ANALYST_GUIDE_FAILED'); }
          await interaction.editReply(safe(`Channel analis siap: <#${channel.id}>. ${guideCopy(guide)}\nHengs mulai posting kartu begitu ada series MPL yang selesai.`));
        } else if (action === 'scrimapply') {
          const { role, channel } = await ensureScrimSetup(interaction.guild, {
            roleId: ticket.roleId, channelId: ticket.scrimId, expectedHash: ticket.hash, assertLease,
          });
          await interaction.editReply(safe(`Siap: role <@&${role.id}> dan channel <#${channel.id}>. Tambahkan anggota tim ke role Hengs Family lewat Server Settings > Members. Anggota tim kirim hasil lewat /scrim hasil di tanya-hengs.`));
        } else if (action === 'split') {
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
          COMMUNITY_SETUP_PERMISSIONS: 'Hengs perlu Manage Channels dan Manage Roles untuk mengatur izin channel news dan memes.',
          SCRIM_ROLE_CONFLICT: 'Ada lebih dari satu role bernama Hengs Family. Rapikan dulu, lalu buka setup lagi.',
          SCRIM_CHANNEL_CONFLICT: 'Ada lebih dari satu channel hasil-scrim atau namanya dipakai jenis channel lain. Rapikan dulu.',
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

module.exports = { PREFIX, ANALYST_NAME, TANYA_NAME, createAdminSetupFlow, ensureNewsChannel, ensureCommunityChannels,
  ensureScrimSetup, ensureAnalystChannel, ensureTanyaChannel, newsNextSteps };
