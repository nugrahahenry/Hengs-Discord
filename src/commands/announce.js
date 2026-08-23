// ─── /announce ────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Kirim pengumuman ke channel announcements (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt => opt
      .setName('message')
      .setDescription('Isi pengumuman')
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('title')
      .setDescription('Judul pengumuman (opsional, default: "Pengumuman")')
      .setRequired(false)
    )
    .addBooleanOption(opt => opt
      .setName('ping')
      .setDescription('Ping @everyone? (default: tidak)')
      .setRequired(false)
    ),

  async execute(interaction, { state }) {
    await interaction.deferReply({ ephemeral: true }); // defer dulu untuk mencegah timeout 3 detik
    const message = interaction.options.getString('message');
    const title   = interaction.options.getString('title') || 'Pengumuman';
    let   ping    = interaction.options.getBoolean('ping') ?? false;

    // KEAMANAN: ping @everyone HANYA buat Administrator (cegah mass-mention abuse oleh
    // holder "Manage Messages"). Non-admin tetap bisa announce, cuma tanpa ping.
    if (ping && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      ping = false;
    }

    const channelId = process.env.ANNOUNCE_CHANNEL_ID;
    const channel   = channelId
      ? interaction.guild.channels.cache.get(channelId)
      : interaction.channel;

    if (!channel) {
      await interaction.editReply({ content: '❌ Channel announcements tidak ditemukan. Isi `ANNOUNCE_CHANNEL_ID` di `.env` dulu.' });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setAuthor({
        name: interaction.user.displayName,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    try {
      await channel.send({ content: ping ? '@everyone' : undefined, embeds: [embed] });
    } catch (err) {
      console.error('❌ announce send error:', err.message);
      await interaction.editReply({ content: `❌ Gagal kirim pengumuman: ${err.message}` });
      return;
    }

    await interaction.editReply({ content: `✅ Pengumuman berhasil dikirim ke ${channel}!` });
  },
};
