const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reports')
    .setDescription('Buka antrean laporan privat untuk moderator')
    .setDMPermission(false),

  async execute(interaction, deps) {
    return deps.reportQueue.showQueue(interaction, 0);
  },
};
