const { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Aktifkan Hengs Friend Beta di server ini')
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand.setName('start').setDescription('Aktifkan mention chat Hengs untuk server beta'))
  .addSubcommand(subcommand => subcommand.setName('status').setDescription('Lihat status Hengs Friend Beta'));

function canManage(interaction) {
  if (!interaction?.guild || !interaction?.user) return false;
  if (String(interaction.guild.ownerId) === String(interaction.user.id)) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

async function execute(interaction, { guildAccess, guildConfigStore }) {
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
      beta: 'Hengs Friend Beta aktif. Member dapat mention Hengs untuk mengobrol.',
      pending: 'Server ini sudah masuk beta, tetapi setup belum aktif.',
      denied: 'Server ini belum masuk beta Hengs.',
      dm: 'Setup hanya tersedia di dalam server Discord.',
    };
    await replyPrivate(interaction, messages[scope.kind] || messages.denied);
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
  if (!['pending', 'beta'].includes(scope.kind)) {
    await replyPrivate(interaction, 'Server ini belum masuk beta Hengs.');
    return;
  }
  const result = guildConfigStore.activate({
    guildId: interaction.guildId,
    ownerId: interaction.guild.ownerId,
    setupBy: interaction.user.id,
  });
  await replyPrivate(interaction, result.changed
    ? 'Hengs Friend Beta sudah aktif. Sekarang member dapat mention Hengs untuk mengobrol.'
    : 'Hengs Friend Beta sudah aktif sebelumnya. Tidak ada pengaturan yang diubah.');
}

module.exports = { data, execute };
