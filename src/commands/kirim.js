const { SlashCommandBuilder, MessageFlags } = require('discord.js');

// Members send memes and news here; the news and meme channels themselves are read-only.
// Sharing does the checks, the private preview and the member's own confirmation.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('kirim')
    .setDescription('Kirim meme atau berita ke channel Hengs, dengan preview dulu')
    .setDMPermission(false)
    .addSubcommand(sub => sub.setName('meme').setDescription('Kirim gambar meme ke channel memes')
      .addAttachmentOption(option => option.setName('gambar').setDescription('PNG, JPG atau WebP, maksimal 8 MB').setRequired(true))
      .addStringOption(option => option.setName('caption').setDescription('Teks pendek di atas meme (opsional)').setMaxLength(300)))
    .addSubcommand(sub => sub.setName('berita').setDescription('Kirim link berita ke channel news')
      .addStringOption(option => option.setName('link').setDescription('Link HTTPS artikelnya').setRequired(true).setMaxLength(1000))
      .addStringOption(option => option.setName('catatan').setDescription('Kenapa menarik (opsional)').setMaxLength(300))),

  async execute(interaction, { communitySharing } = {}) {
    // The image check can take longer than Discord's three-second reply window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(communitySharing
      ? await communitySharing.submit(interaction)
      : { content: 'Fitur kirim belum aktif di versi ini.' });
  },
};
