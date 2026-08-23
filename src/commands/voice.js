// ─── /voice ───────────────────────────────────────────────────────────────
// Bot join/leave voice channel dengan silent presence (deaf + mute)
// Cocok buat marathon study/nonton bareng di voice

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const voiceStore = require('../utils/voice-store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Bot join/leave voice channel')

    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Bot masuk voice channel secara diam, hanya untuk nemenin')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel tujuan (default: channel kamu sekarang)')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
      )
    )

    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Bot keluar dari voice channel')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /voice join ──────────────────────────────────────────────────────────
    if (sub === 'join') {
      // DEFER DULU karena Discord timeout 3 detik dan join voice bisa lebih lama.
      await interaction.deferReply();

      let channel = interaction.options.getChannel('channel');

      if (!channel) {
        // Default: voice channel user sekarang
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        channel = member?.voice?.channel;
      }

      if (!channel) {
        await interaction.editReply('❌ Kamu tidak sedang di voice channel.\nMasuk voice dulu atau pilih channel via `/voice join channel:#nama`');
        return;
      }

      // Cek kalau bot sudah ada di channel yang sama
      const existing = getVoiceConnection(interaction.guildId);
      if (existing?.joinConfig?.channelId === channel.id) {
        await interaction.editReply(`✅ Bot sudah ada di **${channel.name}**!`);
        return;
      }

      // Kalau pindah channel, destroy dulu yang lama
      if (existing) existing.destroy();

      try {
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: interaction.guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: true,  // bot tidak mendengar audio untuk menghemat resource
          selfMute: true,  // bot tidak mengirim audio, hanya silent presence
        });

        // Tunggu sampai connected (maks 10s)
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

        // Simpan channel ini → bot auto-rejoin pas nyala lagi
        voiceStore.setVoiceChannel(interaction.guildId, channel.id);

        // Auto-reconnect kalau Discord disconnect (bukan manual leave)
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Reconnecting...
          } catch {
            connection.destroy(); // Benar-benar disconnect
            voiceStore.clearVoiceChannel(interaction.guildId); // jangan auto-rejoin channel mati ini
          }
        });

        const embed = new EmbedBuilder()
          .setColor(0x43B581)
          .setTitle('🔊 Voice Marathon Mode')
          .setDescription(`Bot sudah masuk **${channel.name}** dan siap temenin! 💪\n\n_Bot diam (deaf + mute), hanya hadir sebagai teman study/nonton_`)
          .setFooter({ text: '/voice leave untuk keluar' });

        await interaction.editReply({ embeds: [embed] });

      } catch (err) {
        console.error('❌ Voice join error:', err.message);
        await interaction.editReply(`❌ Gagal join voice: ${err.message}\n\nPastikan bot punya permission **Connect** di channel tersebut.`);
      }
    }

    // ── /voice leave ─────────────────────────────────────────────────────────
    else if (sub === 'leave') {
      await interaction.deferReply();
      const connection = getVoiceConnection(interaction.guildId);

      if (!connection) {
        await interaction.editReply('❌ Bot tidak sedang di voice channel.');
        return;
      }

      const channelId = connection.joinConfig?.channelId;
      const channelName = channelId
        ? interaction.guild.channels.cache.get(channelId)?.name || 'voice channel'
        : 'voice channel';

      connection.destroy();
      voiceStore.clearVoiceChannel(interaction.guildId); // stop auto-rejoin

      const embed = new EmbedBuilder()
        .setColor(0xE53935)
        .setDescription(`👋 Bot keluar dari **${channelName}**. Good job hari ini! 🎉`);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
