const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isEditor } = require('../ops/permissions');

function assertOpsAccess(interaction) {
  if (!process.env.OWNER_ID) {
    return 'OWNER_ID belum diisi di .env. Ops Hub sengaja tidak berjalan tanpa owner yang jelas.';
  }
  if (!isEditor(interaction)) {
    return 'Hanya owner atau editor Ops Hub yang dapat memakai command ini.';
  }
  return null;
}

const AUDIT_LABELS = {
  draft_created: 'Membuat draft',
  draft_edited: 'Mengedit draft',
  draft_shorten: 'Memperpendek draft',
  draft_regenerate: 'Membuat ulang draft',
  schedule_created: 'Menjadwalkan',
  schedule_cancelled: 'Membatalkan jadwal',
  schedule_retry: 'Scheduler mencoba ulang',
  schedule_failed: 'Scheduler berhenti setelah gagal',
  revision_recovered: 'Memulihkan revisi terputus',
  draft_published: 'Memublikasikan',
  draft_discarded: 'Membuang draft',
};

function auditLine(entry) {
  const action = String(entry?.action || 'unknown').slice(0, 40);
  const label = AUDIT_LABELS[action] || action.replace(/[^a-z0-9_-]/gi, '');
  const rawActor = String(entry?.actor || 'unknown').slice(0, 100);
  const actor = ['scheduler', 'system', 'canox'].includes(rawActor)
    ? rawActor
    : /^\d{15,22}$/.test(rawActor) ? `User ID \`${rawActor}\`` : 'actor tidak valid';
  const draftId = /^(?:[a-f0-9]{12}|[a-f0-9]{16})$/.test(entry?.draftId)
    ? entry.draftId
    : 'unknown';
  const timestamp = Date.parse(entry?.at);
  const when = Number.isFinite(timestamp)
    ? `<t:${Math.floor(timestamp / 1000)}:R>`
    : 'waktu tidak valid';
  return `**${label || 'unknown'}** · Draft \`${draftId}\`\n${actor} · ${when}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ops')
    .setDescription('Ruang operasional Hengs: draft dan approval pengumuman')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
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
      .setDescription('Lihat draft tertunda dan aktivitas Ops Hub'))
    .addSubcommand(sub => sub
      .setName('history')
      .setDescription('Lihat audit tindakan Ops Hub tanpa isi draft')
      .addIntegerOption(option => option
        .setName('limit')
        .setDescription('Jumlah tindakan terbaru (default 10)')
        .setMinValue(5)
        .setMaxValue(20))),

  async execute(interaction, { agent, opsHub }) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: '❌ Ops Hub hanya dapat dipakai di server Henzzz.', ephemeral: true });
      return;
    }
    const accessError = assertOpsAccess(interaction);
    if (accessError) {
      await interaction.reply({ content: `❌ ${accessError}`, ephemeral: true });
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

    if (subcommand === 'history') {
      const limit = interaction.options.getInteger('limit') || 10;
      const entries = opsHub.getAuditHistory(limit);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📜 Riwayat Ops Hub')
        .setDescription(entries.length
          ? entries.map(auditLine).join('\n\n').slice(0, 4000)
          : 'Belum ada tindakan yang tercatat.')
        .setFooter({ text: 'Audit hanya menyimpan tindakan, ID draft, pelaku, dan waktu.' })
        .setTimestamp();
      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
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
        { name: 'Sedang direvisi', value: String(status.revising), inline: true },
        { name: 'Terjadwal', value: String(status.scheduled), inline: true },
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
  assertOpsAccess,
  auditLine,
};
