'use strict';

// /admin setup v2: a guided community setup. The owner picks packages, answers News + Memes, picks a theme from an
// image board (or writes a custom one) and sees the planned sidebar as an image. Nothing changes before
// "Bikin sekarang"; the apply step first checks that the server still matches the preview.
const crypto = require('node:crypto');
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, PermissionFlagsBits: P,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { THEMES, themeById, customTheme } = require('./channel-style');
const { PACKAGES, CATEGORIES, HENGS_OWNED, buildPlan, applyPlan } = require('./community-setup');
const { renderSidebar, renderThemeBoard } = require('./setup-preview');

const PREFIX = 'hengs-admin-setup:';
const TTL = 10 * 60_000;
const ACTIONS = ['packages', 'both', 'news', 'memes', 'none', ...THEMES.map(t => `theme-${t.id}`), 'custom', 'custommodal', 'rename',
  'retheme', 'back', 'apply', 'cancel'];
const PATTERN = new RegExp(`^hengs-admin-setup:([a-f0-9]{24}):(\\d{1,4}):(${ACTIONS.join('|')})$`);
const safe = (content, files = []) => ({ content, components: [], embeds: [], files, attachments: [], allowedMentions: { parse: [] } });
const MESSAGES = {
  COMMUNITY_SETUP_PERMISSIONS: 'Hengs perlu izin Manage Channels dan Manage Roles untuk setup ini. Belum ada yang diubah.',
  SETUP_PREVIEW_STALE: 'Isi server atau sesi berubah sejak preview. Buka `/admin setup` lagi untuk melihat rencana terbaru.',
  SETUP_BUSY: 'Setup server ini sedang berjalan. Tunggu hasilnya sebelum membuka setup lagi.',
};
const UNCERTAIN = 'Hasil setup belum bisa dipastikan; sebagian perubahan mungkin sudah terjadi. Cek channel sebelum membuka setup lagi. Tidak dicoba ulang otomatis.';

function canManage(interaction, guildAccess) {
  return Boolean(interaction.guild && interaction.guildId === interaction.guild.id
    && interaction.channelId && interaction.user?.id
    && guildAccess?.classify(interaction.guildId)?.kind === 'home'
    && (interaction.guild.ownerId === interaction.user.id
      || interaction.memberPermissions?.has(P.Administrator) === true));
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
  return { hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    items: channels.map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId || null, position: c.rawPosition ?? c.position ?? 0 })) };
}

function guideCopy(guide) {
  if (guide?.pinned) return 'sudah dikirim dan di-pin.';
  if (guide?.posted) return 'sudah dikirim, tapi belum di-pin. Kasih Hengs izin Pin Messages di channel itu, atau pin manual.';
  if (guide?.exists) return 'yang lama masih ada.';
  return 'belum terkirim. Buka `/admin setup` lagi untuk mencoba.';
}

// rows: [[action, label, style?], ...] per row, at most five buttons each.
function controls(id, rows, revision) {
  return rows.map(items => new ActionRowBuilder().addComponents(items.map(([action, label, style = ButtonStyle.Secondary]) => (
    new ButtonBuilder().setCustomId(`${PREFIX}${id}:${revision}:${action}`).setLabel(label).setStyle(style)))));
}

const labels = keys => keys.map(key => PACKAGES.find(p => p.key === key).label).join(', ');

function packagesStep(id, ticket) {
  const select = new StringSelectMenuBuilder().setCustomId(`${PREFIX}${id}:${ticket.revision}:packages`)
    .setPlaceholder('Pilih paket channel (boleh lebih dari satu)').setMinValues(1).setMaxValues(PACKAGES.length)
    .addOptions(PACKAGES.map(p => ({ label: p.label, value: p.key, description: p.about, emoji: { name: p.channels[0][0] },
      default: ticket.packages.includes(p.key) })));
  return { ...safe([
    '**Setup server Hengs (1/4): pilih paket**',
    'Pilih channel yang mau dibikin. Channel yang namanya sudah ada di server dipakai lagi, tidak dobel.',
    'Belum ada yang berubah sampai kamu pencet **Bikin sekarang** di langkah terakhir.',
  ].join('\n')), components: [new ActionRowBuilder().addComponents(select), ...controls(id, [[['cancel', 'Batal']]], ticket.revision)] };
}

function extrasStep(id, ticket) {
  return { ...safe([
    '**Setup server Hengs (2/4): News + Memes**',
    `Paket: ${labels(ticket.packages)}.`,
    'Tambah 📰 hengs-news dan 😂 hengs-memes di kategori Hengs? Cuma Hengs yang posting di sana; anggota baca dan kasih reaksi.',
    'Berita harian tidak langsung nyala. Jadwalnya diatur nanti lewat `/hengs ask`.',
  ].join('\n')), components: controls(id, [[['both', 'News + Memes', ButtonStyle.Primary], ['news', 'News aja'], ['memes', 'Memes aja'],
    ['none', 'Nggak usah']], [['back', 'Ubah paket'], ['cancel', 'Batal']]], ticket.revision) };
}

async function themeStep(id, ticket) {
  const plan = buildPlan({ packages: ticket.packages, extras: ticket.extras, theme: themeById('plain') });
  const text = plan.channels.filter(c => c.type === 'text');
  const category = CATEGORIES[plan.categories[0].key];
  const image = await renderThemeBoard({ sample: (text.length ? text : plan.channels).slice(0, 5).map(({ emoji, slug }) => ({ emoji, slug })),
    category: { emoji: category.emoji, label: category.label } });
  return { ...safe([
    '**Setup server Hengs (3/4): pilih tema nama channel**',
    'Tiap tema dicontohkan di gambar pakai channel pilihanmu.',
    'Mau gaya sendiri? Pencet **Tema custom** lalu tulis polanya dengan `{emoji}` dan `{nama}`.',
  ].join('\n'), [new AttachmentBuilder(image, { name: 'tema-hengs.png' })]),
  components: controls(id, [THEMES.map((t, i) => [`theme-${t.id}`, `${i + 1}. ${t.label}`]),
    [['custom', 'Tema custom'], ['back', 'Ubah paket'], ['cancel', 'Batal']]], ticket.revision) };
}

async function previewStep(id, ticket) {
  const { plan, rename } = ticket;
  const { counts } = plan;
  const slugs = kinds => plan.channels.filter(c => kinds.includes(c.kind)).map(c => c.slug).join(', ');
  const tidy = plan.channels.filter(c => c.id && HENGS_OWNED.includes(c.kind)).map(c => c.slug).join(', ');
  const empty = !counts.categories && !counts.channels && !counts.renames && !tidy;
  const image = await renderSidebar({ sections: plan.sections });
  return { ...safe([
    '**Setup server Hengs (4/4): preview**',
    `Tema: ${ticket.theme.label}. Di gambar, BARU = dibuat${rename ? ', GANTI = ganti nama' : ''}.`,
    `Dibuat: ${counts.categories} kategori, ${counts.channels} channel. Dipakai lagi: ${counts.reused} channel.${rename ? ` Ganti nama: ${counts.renames}.` : ''}`,
    plan.untouchedSections ? `${plan.untouchedSections} bagian lain di server tidak berubah, jadi tidak ditampilkan.` : null,
    rename ? 'Ganti nama cuma mengubah nama. ID, izin, isi dan posisinya tetap.'
      : 'Channel lama tidak diganti namanya, dipindah atau dihapus. Biar gayanya seragam, pencet **Samakan nama lama**.',
    slugs(['read']) ? `${slugs(['read'])}: anggota cuma baca dan kasih reaksi.` : null,
    slugs(['analis', 'news', 'memes']) ? `${slugs(['analis', 'news', 'memes'])}: cuma Hengs yang posting; anggota baca dan kasih reaksi.` : null,
    slugs(['scrim']) ? 'hasil-scrim: privat, cuma role Hengs Family dan Hengs. Role dibuat kalau belum ada; anggota tim kamu tambahkan sendiri.' : null,
    tidy ? `Sudah ada, izinnya dirapikan seperti di atas: ${tidy}. Overwrite role lain tetap.` : null,
    empty ? 'Semua channel pilihanmu sudah ada. Tidak ada yang perlu dibikin.' : 'Pilihan ini berlaku 10 menit.',
  ].filter(Boolean).join('\n'), [new AttachmentBuilder(image, { name: 'preview-hengs.png' })]),
  components: controls(id, [[...(empty ? [] : [['apply', 'Bikin sekarang', ButtonStyle.Success]]),
    ['rename', `Samakan nama lama: ${rename ? 'nyala' : 'mati'}`], ['retheme', 'Ganti tema'], ['back', 'Ubah paket'], ['cancel', 'Batal']]],
  ticket.revision) };
}

function customModal(id, ticket) {
  const input = (key, label, placeholder) => {
    const field = new TextInputBuilder().setCustomId(key).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short)
      .setRequired(true).setMaxLength(60);
    if (ticket.custom?.[key]) field.setValue(ticket.custom[key]);
    return new ActionRowBuilder().addComponents(field);
  };
  return new ModalBuilder().setCustomId(`${PREFIX}${id}:${ticket.revision}:custommodal`).setTitle('Tema custom')
    .addComponents(input('channel', 'Pola channel, wajib ada {nama}', '{emoji}✦{nama}'),
      input('category', 'Pola kategori, wajib ada {nama}', '✦ {emoji} {nama} ✦'));
}

function resultCopy(result, plan) {
  const channels = result.created.filter(c => c.kind !== 'category');
  const has = kinds => plan.channels.some(c => kinds.includes(c.kind));
  return [
    '**Setup selesai.**',
    `Dibuat: ${result.created.length - channels.length} kategori, ${channels.length} channel.${channels.length ? ` ${channels.map(c => `<#${c.id}>`).join(' ')}` : ''}`,
    result.renamed.length ? `Ganti nama: ${result.renamed.length}.` : null,
    result.tightened.length ? `Izin dirapikan: ${result.tightened.map(c => `<#${c.id}>`).join(' ')}.` : null,
    result.failed.length ? `Gagal, tidak dicoba ulang: ${result.failed.map(name => `\`${name}\``).join(', ')}. Cek izin Hengs, lalu buka \`/admin setup\` lagi; yang sudah jadi dipakai ulang.` : null,
    ...result.guides.map(guide => `Panduan <#${guide.id}>: ${guideCopy(guide)}`),
    has(['scrim']) ? 'Hengs Family: tambahkan anggota tim ke role itu lewat Server Settings > Members. Hengs tidak memberi role ke siapa pun.' : null,
    has(['news', 'memes']) ? 'News dan memes: jadwalnya belum nyala. Atur lewat `/hengs ask`, lihat preview, lalu terapkan.' : null,
  ].filter(Boolean).join('\n');
}

function createAdminSetupFlow({ now = Date.now, logger = console } = {}) {
  const tickets = new Map();
  const applying = new Set();
  function sweep() { for (const [id, ticket] of tickets) if (now() >= ticket.expires) tickets.delete(id); }
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
      const ticket = { actor: interaction.user.id, guild: interaction.guildId, channel: interaction.channelId, expires: now() + TTL,
        phase: 'packages', revision: 0, busy: false, packages: [], extras: {}, rename: false };
      tickets.set(id, ticket);
      await interaction.reply({ ...packagesStep(id, ticket), flags: MessageFlags.Ephemeral });
    },
    async handle(interaction, { guildAccess, postAnalystGuide, postChatGuide } = {}) {
      if (!String(interaction.customId).startsWith(PREFIX)
        || !(interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.())) return false;
      sweep();
      const match = PATTERN.exec(interaction.customId);
      const ticket = match && tickets.get(match[1]);
      const action = match?.[3];
      const shaped = action === 'packages' ? interaction.isStringSelectMenu?.()
        : action === 'custommodal' ? interaction.isModalSubmit?.() : interaction.isButton?.();
      if (!ticket || !shaped || ticket.revision !== Number(match[2]) || !canManage(interaction, guildAccess) || ticket.actor !== interaction.user.id
        || ticket.guild !== interaction.guildId || ticket.channel !== interaction.channelId) {
        await reject(interaction, 'Sesi setup tidak tersedia untukmu atau sudah kedaluwarsa. Buka `/admin setup` lagi.');
        return true;
      }
      const id = match[1];
      if (ticket.busy || applying.has(ticket.guild)) {
        await reject(interaction, 'Setup server ini sedang diproses. Tunggu hasilnya dulu.'); return true;
      }
      const phase = { packages: 'packages', both: 'extras', news: 'extras', memes: 'extras', none: 'extras', custom: 'theme', custommodal: 'theme',
        rename: 'preview', retheme: 'preview', apply: 'preview' }[action] || (action.startsWith('theme-') ? 'theme' : null);
      if ((phase && ticket.phase !== phase) || (action === 'back' && ticket.phase === 'packages')) {
        await reject(interaction, 'Tombol ini sudah tidak berlaku. Pakai panel setup yang terbaru.'); return true;
      }
      // A modal must be the first answer to the click, so the custom theme opens before anything is deferred.
      if (action === 'custom') { await interaction.showModal(customModal(id, ticket)); return true; }
      let theme = null;
      if (action === 'custommodal') {
        ticket.custom = { channel: interaction.fields.getTextInputValue('channel'), category: interaction.fields.getTextInputValue('category') };
        try { theme = customTheme(ticket.custom); } catch {
          await reject(interaction, 'Pola belum bisa dipakai: tiap pola wajib ada `{nama}` dan maksimal 60 karakter. Pencet **Tema custom** lagi untuk memperbaiki.');
          return true;
        }
      }
      ticket.busy = true;
      let ownsLock = false; let started = false;
      try {
        await interaction.deferUpdate();
        const show = async (next, step) => { ticket.phase = next; ticket.revision++; await interaction.editReply(await step(id, ticket)); };
        const preview = async () => {
          const snapshot = await inventory(interaction.guild);
          ticket.plan = buildPlan({ inventory: snapshot.items, packages: ticket.packages, extras: ticket.extras, theme: ticket.theme,
            rename: ticket.rename });
          ticket.hash = snapshot.hash;
          await show('preview', previewStep);
        };
        if (action === 'cancel') {
          tickets.delete(id);
          await interaction.editReply(safe('Setup dibatalkan. Tidak ada channel yang diubah.'));
        } else if (action === 'back') await show('packages', packagesStep);
        else if (action === 'packages') {
          const values = interaction.values;
          if (!Array.isArray(values) || !values.length || values.some(v => !PACKAGES.some(p => p.key === v))) throw new Error('SETUP_PACKAGE_UNKNOWN');
          ticket.packages = PACKAGES.map(p => p.key).filter(key => values.includes(key));
          await show('extras', extrasStep);
        } else if (phase === 'extras') {
          ticket.extras = { news: ['both', 'news'].includes(action), memes: ['both', 'memes'].includes(action) };
          await show('theme', themeStep);
        } else if (action === 'retheme') await show('theme', themeStep);
        else if (phase === 'theme') {
          ticket.theme = theme || themeById(action.slice('theme-'.length));
          await preview();
        } else if (action === 'rename') {
          ticket.rename = !ticket.rename;
          await preview();
        } else {
          if (applying.has(ticket.guild)) throw new Error('SETUP_BUSY');
          applying.add(ticket.guild); ownsLock = true;
          const snapshot = await inventory(interaction.guild);
          if (tickets.get(id) !== ticket || snapshot.hash !== ticket.hash
            || !canManage(interaction, guildAccess) || now() >= ticket.expires) {
            throw new Error('SETUP_PREVIEW_STALE');
          }
          const me = await interaction.guild.members.fetchMe({ force: true });
          if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
          // Consume before any external write; a timeout is uncertain, not a retry invitation.
          tickets.delete(id);
          await interaction.editReply(safe('Menerapkan setup. Tunggu hasilnya di panel ini.'));
          if ((await inventory(interaction.guild)).hash !== ticket.hash) throw new Error('SETUP_PREVIEW_STALE');
          const assertLease = async () => {
            if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
            if (interaction.user.id !== interaction.guild.ownerId) {
              const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
              if (!member.permissions.has(P.Administrator)) throw new Error('SETUP_PREVIEW_STALE');
            }
            if (now() >= ticket.expires || !canManage(interaction, guildAccess)) throw new Error('SETUP_PREVIEW_STALE');
          };
          started = true;
          const result = await applyPlan(interaction.guild, ticket.plan, { assertLease, postChatGuide, postAnalystGuide, logger });
          await interaction.editReply(safe(resultCopy(result, ticket.plan)));
        }
      } catch (error) {
        tickets.delete(id);
        logger.error('[admin-setup] SETUP_ACTION_FAILED');
        const content = started ? UNCERTAIN
          : (MESSAGES[error.message] || 'Setup belum diterapkan. Buka `/admin setup` lagi; tidak ada percobaan ulang otomatis.');
        if (interaction.deferred || interaction.replied) await interaction.editReply(safe(content));
        else await reject(interaction, content);
      } finally { ticket.busy = false; if (ownsLock) applying.delete(ticket.guild); }
      return true;
    },
  };
}

module.exports = { PREFIX, createAdminSetupFlow };
