const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const { isEditor } = require('../ops/permissions');
const { formatWib, parseScheduleInput } = require('../ops/time');

function assertEventAccess(interaction) {
  if (!process.env.OWNER_ID) return 'OWNER_ID belum diisi; Event Hub ditutup secara aman.';
  if (!isEditor(interaction)) return 'Hanya owner atau editor Ops Hub yang dapat membuat dan melihat event.';
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Buat event komunitas dengan approval owner dan RSVP')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) => subcommand
      .setName('draft')
      .setDescription('Buat draft event privat di bot-settings')
      .addStringOption((option) => option
        .setName('judul')
        .setDescription('Nama event')
        .setRequired(true)
        .setMaxLength(200))
      .addStringOption((option) => option
        .setName('deskripsi')
        .setDescription('Detail singkat, syarat, atau agenda event')
        .setRequired(true)
        .setMaxLength(1500))
      .addStringOption((option) => option
        .setName('waktu')
        .setDescription('WIB: HH:mm atau YYYY-MM-DD HH:mm')
        .setRequired(true)
        .setMaxLength(16))
      .addStringOption((option) => option
        .setName('lokasi')
        .setDescription('Channel, tempat, atau tautan; opsional')
        .setMaxLength(500))
      .addIntegerOption((option) => option
        .setName('kapasitas')
        .setDescription('Batas peserta hadir; kosong berarti tanpa batas')
        .setMinValue(2)
        .setMaxValue(500)))
    .addSubcommand((subcommand) => subcommand
      .setName('status')
      .setDescription('Lihat event aktif dan jumlah RSVP')),

  async execute(interaction, { eventHub }) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Event Hub hanya tersedia di server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const accessError = assertEventAccess(interaction);
    if (accessError) {
      await interaction.reply({ content: accessError, flags: MessageFlags.Ephemeral });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'draft') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const parsedTime = parseScheduleInput(interaction.options.getString('waktu', true));
        const result = await eventHub.createDraftPanel(interaction.guild, {
          title: interaction.options.getString('judul', true),
          description: interaction.options.getString('deskripsi', true),
          startAt: parsedTime.scheduledAt,
          location: interaction.options.getString('lokasi'),
          capacity: interaction.options.getInteger('kapasitas'),
          createdBy: interaction.user.id,
          source: 'discord',
          externalId: `discord:${interaction.id}`,
        });
        if (!result.created) {
          await interaction.editReply({ content: 'Draft dari permintaan ini sudah pernah dibuat.' });
          return;
        }
        await interaction.editReply({
          content: `Draft **${result.event.title}** (${formatWib(result.event.startAt)}) sudah masuk ke bot-settings. Belum ada yang dipublikasikan.`,
        });
      } catch (error) {
        await interaction.editReply({ content: `Gagal membuat event: ${error.message}` });
      }
      return;
    }

    const status = eventHub.getStatus();
    const upcoming = status.upcoming.length
      ? status.upcoming.map((event) => (
        `**${event.title}** · \`${event.id}\`\n${formatWib(event.startAt)} · Hadir ${event.rsvp.yes.length}${event.capacity ? `/${event.capacity}` : ''} · Mungkin ${event.rsvp.maybe.length}`
      )).join('\n\n').slice(0, 3800)
      : 'Belum ada event aktif.';
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Hengs Community Event Hub')
      .setDescription(upcoming)
      .addFields(
        { name: 'Draft', value: String(status.draft), inline: true },
        { name: 'Aktif', value: String(status.published), inline: true },
        { name: 'Selesai', value: String(status.closed), inline: true },
        { name: 'Dibatalkan', value: String(status.cancelled), inline: true },
      )
      .setFooter({ text: 'Publish, cancel, dan discard tetap owner-only.' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
  assertEventAccess,
};
