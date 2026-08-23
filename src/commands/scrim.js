// ─── /scrim ───────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
    ),

  async execute(interaction, { state }) {
    const sub = interaction.options.getSubcommand();

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
