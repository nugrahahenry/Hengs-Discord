const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

function assertOwner(interaction) {
  if (!process.env.OWNER_ID) {
    return 'OWNER_ID belum diisi di .env. Ops Hub sengaja tidak berjalan tanpa owner yang jelas.';
  }
  if (interaction.user.id !== process.env.OWNER_ID) {
    return 'Hanya owner yang dapat memakai Ops Hub pada versi ini.';
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ops')
    .setDescription('Ruang operasional Hengs: draft dan approval pengumuman')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('draft')
      .setDescription('Buat draft pengumuman untuk direview di bot-settings')
      .addStringOption(option => option
        .setName('brief')
        .setDescription('Poin mentah, detail event, atau ide pengumuman')
        .setRequired(true)
        .setMaxLength(1500))
      .addStringOption(option => option
        .setName('title')
        .setDescription('Judul opsional; kosongkan agar AI membuat judul')
        .setRequired(false)
        .setMaxLength(256)))
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Lihat draft tertunda dan aktivitas Ops Hub')),

  async execute(interaction, { agent, opsHub }) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: '❌ Ops Hub hanya dapat dipakai di server Henzzz.', ephemeral: true });
      return;
    }
    const ownerError = assertOwner(interaction);
    if (ownerError) {
      await interaction.reply({ content: `❌ ${ownerError}`, ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'draft') {
      await interaction.deferReply({ ephemeral: true });
      const brief = interaction.options.getString('brief', true);
      const titleOverride = interaction.options.getString('title');
      try {
        const generated = await agent.draftAnnouncement(brief, titleOverride);
        const result = await opsHub.createDraftPanel(interaction.guild, {
          ...generated,
          brief,
          source: 'discord',
          createdBy: interaction.user.id,
          externalId: `discord:${interaction.id}`,
        });
        const settingsChannel = opsHub.findSettingsChannel(interaction.guild);
        if (result.created) {
          await interaction.editReply({ content: `📋 Draft **${result.draft.title}** sudah dikirim ke ${settingsChannel}. Review dan publish dari sana.` });
        } else {
          await interaction.editReply({ content: 'ℹ️ Draft dari permintaan ini sudah pernah dibuat.' });
        }
      } catch (error) {
        console.error('❌ Ops draft error:', error.message);
        await interaction.editReply({ content: `❌ Gagal membuat draft: ${error.message}` });
      }
      return;
    }

    const status = opsHub.getStatus();
    const settingsChannel = opsHub.findSettingsChannel(interaction.guild);
    const announcementChannel = opsHub.findAnnouncementsChannel(interaction.guild);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎛️ Hengs Ops Hub')
      .addFields(
        { name: 'Draft menunggu', value: String(status.pending), inline: true },
        { name: 'Sedang diproses', value: String(status.publishing), inline: true },
        { name: 'Sudah publish', value: String(status.published), inline: true },
        { name: 'Dibuang', value: String(status.discarded), inline: true },
        { name: 'Ruang review', value: settingsChannel ? `${settingsChannel}` : 'Belum ditemukan', inline: false },
        { name: 'Tujuan publik', value: announcementChannel ? `${announcementChannel}` : 'Belum ditemukan', inline: false },
      )
      .setFooter({ text: status.latest ? `Draft terbaru: ${status.latest.title}` : 'Belum ada draft' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
