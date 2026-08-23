const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  resolveChannelScope,
  resolveLanguage,
  resolveReplyStyle,
} = require('../guilds/config-store');

const STYLE_LABELS = Object.freeze({
  balanced: 'Santai',
  concise: 'Ringkas',
  technical: 'Teknis',
});
const LANGUAGE_LABELS = Object.freeze({
  auto: 'Otomatis mengikuti bahasa pengguna',
  id: 'Bahasa Indonesia',
  en: 'English',
});
const CHANNEL_LABELS = Object.freeze({
  all: 'Semua channel',
  current: 'Satu channel yang dipilih',
});

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Kelola Hengs Public Beta di server ini')
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand.setName('start').setDescription('Aktifkan mention chat Hengs'))
  .addSubcommand(subcommand => subcommand.setName('status').setDescription('Lihat status Hengs'))
  .addSubcommand(subcommand => subcommand
    .setName('style')
    .setDescription('Pilih gaya balasan Hengs')
    .addStringOption(option => option
      .setName('preset')
      .setDescription('Gaya yang dipakai untuk semua mention chat di server ini')
      .setRequired(true)
      .addChoices(
        { name: 'Santai dan seimbang', value: 'balanced' },
        { name: 'Ringkas dan langsung', value: 'concise' },
        { name: 'Teknis dan terstruktur', value: 'technical' },
      )))
  .addSubcommand(subcommand => subcommand
    .setName('language')
    .setDescription('Pilih bahasa balasan Hengs')
    .addStringOption(option => option
      .setName('preset')
      .setDescription('Bahasa yang dipakai untuk balasan Hengs di server ini')
      .setRequired(true)
      .addChoices(
        { name: 'Otomatis mengikuti pengguna', value: 'auto' },
        { name: 'Bahasa Indonesia', value: 'id' },
        { name: 'English', value: 'en' },
      )))
  .addSubcommand(subcommand => subcommand
    .setName('channel')
    .setDescription('Pilih tempat Hengs boleh menjawab')
    .addStringOption(option => option
      .setName('mode')
      .setDescription('Gunakan semua channel atau hanya channel tempat command ini dijalankan')
      .setRequired(true)
      .addChoices(
        { name: 'Semua channel', value: 'all' },
        { name: 'Hanya channel ini', value: 'current' },
      )))
  .addSubcommand(subcommand => subcommand.setName('disable').setDescription('Nonaktifkan Hengs di server ini'));

function canManage(interaction) {
  if (!interaction?.guild || !interaction?.user) return false;
  if (String(interaction.guild.ownerId) === String(interaction.user.id)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

async function execute(interaction, { guildAccess, guildConfigStore, publicGuildLimit }) {
  if (!interaction.inGuild?.() || !interaction.guildId) {
    await replyPrivate(interaction, 'Setup hanya tersedia di dalam server Discord.');
    return;
  }
  if (!guildAccess || !guildConfigStore) throw new Error('SETUP_DEPENDENCY_MISSING');
  const scope = guildAccess.classify(interaction.guildId);
  const subcommand = interaction.options.getSubcommand();
  if (!canManage(interaction)) {
    await replyPrivate(interaction, 'Setup hanya dapat dibuka oleh pemilik server atau Administrator.');
    return;
  }
  if (subcommand === 'status') {
    const publicStyle = scope.kind === 'public'
      ? STYLE_LABELS[resolveReplyStyle(scope.config)]
      : STYLE_LABELS.balanced;
    const publicLanguage = scope.kind === 'public'
      ? LANGUAGE_LABELS[resolveLanguage(scope.config)]
      : LANGUAGE_LABELS.auto;
    const publicChannel = scope.kind === 'public'
      ? CHANNEL_LABELS[resolveChannelScope(scope.config).channelMode]
      : CHANNEL_LABELS.all;
    const messages = {
      home: 'Ini server utama Hengs. Semua fitur lama tetap dikelola dari sini.',
      public: [
        'Hengs Public Beta aktif. Member dapat mention Hengs atau memakai `/hengs ask`.',
        `Gaya balasan: **${publicStyle}**.`,
        `Bahasa: **${publicLanguage}**.`,
        `Cakupan: **${publicChannel}**.`,
      ].join('\n'),
      pending: 'Hengs belum aktif di server ini. Jalankan /setup start untuk memulai.',
      denied: 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.',
      dm: 'Setup hanya tersedia di dalam server Discord.',
    };
    await replyPrivate(interaction, messages[scope.kind] || messages.denied);
    return;
  }
  if (subcommand === 'language') {
    if (scope.kind === 'home') {
      await replyPrivate(interaction, 'Server utama memakai karakter pribadi Hengs dan tidak diubah lewat setup publik.');
      return;
    }
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, 'Aktifkan Hengs lebih dulu lewat /setup start sebelum memilih bahasa.');
      return;
    }
    if (scope.kind !== 'public') {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    const language = interaction.options.getString('preset', true);
    const label = LANGUAGE_LABELS[language];
    if (!label) {
      await replyPrivate(interaction, 'Pilihan bahasa tidak dikenali. Pilih salah satu preset yang tersedia.');
      return;
    }
    const result = guildConfigStore.setLanguage({
      guildId: interaction.guildId,
      language,
      setupBy: interaction.user.id,
    });
    await replyPrivate(interaction, result.changed
      ? `Bahasa balasan Hengs sekarang **${label}**.`
      : `Bahasa balasan Hengs memang sudah **${label}**. Tidak ada pengaturan yang diubah.`);
    return;
  }
  if (subcommand === 'channel') {
    if (scope.kind === 'home') {
      await replyPrivate(interaction, 'Server utama memakai aturan channel pribadi dan tidak diubah lewat setup publik.');
      return;
    }
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, 'Aktifkan Hengs lebih dulu lewat /setup start sebelum memilih channel.');
      return;
    }
    if (scope.kind !== 'public') {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    const channelMode = interaction.options.getString('mode', true);
    const label = CHANNEL_LABELS[channelMode];
    if (!label) {
      await replyPrivate(interaction, 'Pilihan channel tidak dikenali. Pilih salah satu mode yang tersedia.');
      return;
    }
    const result = guildConfigStore.setChannelScope({
      guildId: interaction.guildId,
      channelMode,
      channelId: channelMode === 'current' ? interaction.channelId : null,
      setupBy: interaction.user.id,
    });
    const changedMessage = channelMode === 'current'
      ? 'Hengs sekarang hanya menjawab di channel ini.'
      : 'Hengs sekarang dapat menjawab di semua channel.';
    await replyPrivate(interaction, result.changed
      ? changedMessage
      : `${changedMessage} Tidak ada pengaturan yang diubah.`);
    return;
  }
  if (subcommand === 'style') {
    if (scope.kind === 'home') {
      await replyPrivate(interaction, 'Server utama memakai karakter pribadi Hengs dan tidak diubah lewat setup publik.');
      return;
    }
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, 'Aktifkan Hengs lebih dulu lewat /setup start sebelum memilih gaya balasan.');
      return;
    }
    if (scope.kind !== 'public') {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    const replyStyle = interaction.options.getString('preset', true);
    const label = STYLE_LABELS[replyStyle];
    if (!label) {
      await replyPrivate(interaction, 'Pilihan gaya tidak dikenali. Pilih salah satu preset yang tersedia.');
      return;
    }
    const result = guildConfigStore.setReplyStyle({
      guildId: interaction.guildId,
      replyStyle,
      setupBy: interaction.user.id,
    });
    await replyPrivate(interaction, result.changed
      ? `Gaya balasan Hengs sekarang **${label}**.`
      : `Gaya balasan Hengs memang sudah **${label}**. Tidak ada pengaturan yang diubah.`);
    return;
  }
  if (subcommand === 'disable') {
    if (scope.kind === 'home') {
      await replyPrivate(interaction, 'Ini server utama Hengs dan tidak dapat dinonaktifkan lewat setup publik.');
      return;
    }
    if (scope.kind === 'denied') {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, 'Hengs memang belum aktif di server ini. Tidak ada pengaturan yang diubah.');
      return;
    }
    const result = guildConfigStore.remove(interaction.guildId);
    await replyPrivate(interaction, result.removed
      ? 'Hengs sudah dinonaktifkan. Data konfigurasi server ini juga sudah dihapus.'
      : 'Hengs memang belum aktif di server ini. Tidak ada pengaturan yang diubah.');
    return;
  }
  if (subcommand !== 'start') {
    await replyPrivate(interaction, 'Pilihan setup tidak dikenali.');
    return;
  }
  if (scope.kind === 'home') {
    await replyPrivate(interaction, 'Ini server utama Hengs dan sudah aktif.');
    return;
  }
  if (!['pending', 'public'].includes(scope.kind)) {
    await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
    return;
  }
  let result;
  try {
    result = guildConfigStore.activate({
      guildId: interaction.guildId,
      ownerId: interaction.guild.ownerId,
      setupBy: interaction.user.id,
      maxActiveGuilds: publicGuildLimit,
    });
  } catch (error) {
    if (error.message !== 'PUBLIC_GUILD_LIMIT_REACHED') throw error;
    await replyPrivate(interaction, 'Kapasitas Hengs Public Beta sedang penuh. Coba lagi setelah tersedia tempat.');
    return;
  }
  await replyPrivate(interaction, result.changed
    ? 'Hengs Public Beta sudah aktif. Sekarang member dapat mention Hengs untuk mengobrol.'
    : 'Hengs Public Beta sudah aktif sebelumnya. Tidak ada pengaturan yang diubah.');
}

module.exports = { data, execute };
