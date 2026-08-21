const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Kelola Hengs Public Beta di server ini')
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand.setName('start').setDescription('Aktifkan mention chat Hengs'))
  .addSubcommand(subcommand => subcommand.setName('status').setDescription('Lihat status Hengs'))
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
    const messages = {
      home: 'Ini server utama Hengs. Semua fitur lama tetap dikelola dari sini.',
      public: 'Hengs Public Beta aktif. Member dapat mention Hengs untuk mengobrol.',
      pending: 'Hengs belum aktif di server ini. Jalankan /setup start untuk memulai.',
      denied: 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.',
      dm: 'Setup hanya tersedia di dalam server Discord.',
    };
    await replyPrivate(interaction, messages[scope.kind] || messages.denied);
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
