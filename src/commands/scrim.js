// ─── /scrim ───────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GAMES } = require('../scrim/store');

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
      .setDescription('Kirim SS hasil scrim tim ke hasil-scrim (khusus Hengs Family)')
      .addAttachmentOption(opt => opt.setName('ss').setDescription('Screenshot hasil akhir (PNG/JPG/WebP, maks 8 MB)').setRequired(true))
      .addStringOption(opt => opt.setName('lawan').setDescription('Nama tim lawan').setRequired(true).setMaxLength(60))
      .addStringOption(opt => opt.setName('skor').setDescription('Contoh: 2-1').setRequired(true).setMaxLength(7))
      .addStringOption(opt => opt.setName('hasil').setDescription('Hasil untuk tim kita').setRequired(true)
        .addChoices({ name: 'Menang', value: 'menang' }, { name: 'Kalah', value: 'kalah' }, { name: 'Seri', value: 'seri' }))
      .addStringOption(opt => opt.setName('game').setDescription('Default MLBB').setRequired(false)
        .addChoices(...GAMES.map(game => ({ name: game, value: game }))))
      .addStringOption(opt => opt.setName('catatan').setDescription('Opsional, misalnya draft atau hal yang perlu dievaluasi').setRequired(false).setMaxLength(300))
    ),

  async execute(interaction, { state, scrimResults, guildAccess }) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'hasil') return scrimResults.preview(interaction, { guildAccess });

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
