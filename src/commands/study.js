// ─── /study ───────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('study')
    .setDescription('Manage study mode')
    .addSubcommand(sub => sub
      .setName('on')
      .setDescription('Aktifkan study mode')
      .addStringOption(opt => opt
        .setName('topic')
        .setDescription('Topik yang lagi dipelajari (opsional)')
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('off')
      .setDescription('Matikan study mode')
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Cek status mode sekarang')
    ),

  async execute(interaction, { state }) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'on') {
      const topic = interaction.options.getString('topic');
      state.setMode('study', topic);
      const embed = new EmbedBuilder()
        .setColor(0x4CAF50)
        .setTitle('📚 Study Mode ON!')
        .setDescription(
          topic
            ? `Lagi belajar: **${topic}**\nSemangat! Fokus dulu ya 💪`
            : 'Fokus belajar mode aktif!\nSemangat Henry! 💪'
        )
        .setFooter({ text: 'Pesan masuk akan dijaga bot' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    else if (sub === 'off') {
      const mins = state.getDuration();
      state.setMode('off');
      const embed = new EmbedBuilder()
        .setColor(0xFF9800)
        .setTitle('✅ Study Mode OFF')
        .setDescription(
          mins
            ? `Fokus selama **${mins} menit**. Good job! 🎉`
            : 'Study mode dimatikan. Istirahat dulu!'
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    else if (sub === 'status') {
      const mode  = state.getMode();
      const topic = state.getTopic();
      const mins  = state.getDuration();
      const colorMap = { off: 0xF44336, study: 0x4CAF50, scrim: 0x9C27B0 };
      const labelMap = { off: '🔴 OFF', study: '📚 STUDY ON', scrim: '🎮 SCRIM ON' };
      const embed = new EmbedBuilder()
        .setColor(colorMap[mode])
        .setTitle('📊 Status Sekarang')
        .addFields(
          { name: 'Mode',   value: labelMap[mode],                inline: true },
          { name: 'Topik',  value: topic || '-',                  inline: true },
          { name: 'Durasi', value: mins != null ? `${mins} menit` : '-', inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  },
};
