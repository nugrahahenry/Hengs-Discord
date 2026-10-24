// ─── /scrim ───────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RESULT_CHOICES } = require('../scrim/service');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scrim')
    .setDescription('Manage scrim / tournament mode')
    .addSubcommand(sub => sub
      .setName('on')
      .setDescription('Aktifkan scrim mode')
      .addStringOption(opt => opt
        .setName('game')
        .setDescription('Nama game / tournament (opsional)')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('off')
      .setDescription('Matikan scrim mode. GG WP!')
    )
    .addSubcommand(sub => sub
      .setName('hasil')
      .setDescription('Catat 1 game scrim MLBB ke hasil-scrim (khusus Hengs Family)')
      .addStringOption(opt => opt.setName('lawan').setDescription('Nama tim lawan').setRequired(true).setMaxLength(60).setAutocomplete(true))
      .addStringOption(opt => opt.setName('hasil').setDescription('W, atau L plus alasan utamanya').setRequired(true)
        .addChoices(...RESULT_CHOICES))
      .addAttachmentOption(opt => opt.setName('ss').setDescription('Opsional: SS hasil game (PNG/JPG/WebP, maks 8 MB)').setRequired(false))
      .addStringOption(opt => opt.setName('catatan').setDescription('Opsional: yang perlu dievaluasi, atau link video + menitnya').setRequired(false).setMaxLength(300))
    )
    .addSubcommand(sub => sub
      .setName('rekap')
      .setDescription('Rekap scrim tim, cuma kamu yang lihat (khusus Hengs Family)')
      .addStringOption(opt => opt.setName('lawan').setDescription('Opsional: rekap vs satu tim').setRequired(false).setMaxLength(60).setAutocomplete(true))
    )
    .addSubcommand(sub => sub
      .setName('statku')
      .setDescription('Stat scrim kamu, dikirim lewat DM (khusus Hengs Family)')
    )
    .addSubcommand(sub => sub
      .setName('hapus')
      .setDescription('Salah catat? Hapus game terakhir yang kamu catat (khusus Hengs Family)')
    )
    .addSubcommand(sub => sub
      .setName('tanya')
      .setDescription('Tanya coach Hengs, dijawab pakai data scrim tim, cuma kamu yang lihat (khusus Hengs Family)')
      .addStringOption(opt => opt.setName('pertanyaan').setDescription('Mau nanya apa ke coach?').setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub => sub
      .setName('target')
      .setDescription('Target latihan tim: pasang satu kebiasaan main, atau lihat yang sekarang (khusus Hengs Family)')
      .addStringOption(opt => opt.setName('isi').setDescription('Opsional: target baru, misalnya semua kumpul sebelum objective pertama')
        .setRequired(false).setMaxLength(120))
    ),

  async autocomplete(interaction, { scrimResults }) {
    return scrimResults.autocomplete(interaction);
  },

  async execute(interaction, { state, scrimResults, guildAccess }) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'hasil') return scrimResults.preview(interaction, { guildAccess });
    if (sub === 'rekap') return scrimResults.recap(interaction, { guildAccess });
    if (sub === 'statku') return scrimResults.stats(interaction, { guildAccess });
    if (sub === 'hapus') return scrimResults.remove(interaction, { guildAccess });
    if (sub === 'tanya') return scrimResults.ask(interaction, { guildAccess });
    if (sub === 'target') return scrimResults.target(interaction, { guildAccess });

    if (sub === 'on') {
      const game = interaction.options.getString('game');
      state.setMode('scrim', game);
      const embed = new EmbedBuilder()
        .setColor(0x9C27B0)
        .setTitle('🎮 Scrim Mode ON!')
        .setDescription(
          game
            ? `Game: **${game}**\nGL HF! Fokus, jangan terdistraksi 🏆`
            : 'Scrim mode aktif! GL HF! 🏆'
        )
        .setFooter({ text: 'Lagi on match, jangan ganggu!' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    else if (sub === 'off') {
      const mins = state.getDuration();
      const game = state.getTopic();
      state.setMode('off');
      const embed = new EmbedBuilder()
        .setColor(0x607D8B)
        .setTitle('🏁 Scrim Selesai!')
        .setDescription(
          [
            game ? `Game: **${game}**` : null,
            mins ? `Durasi: **${mins} menit**` : null,
            'GG WP! 🏆 Semoga menang!',
          ].filter(Boolean).join('\n')
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  },
};
