const { SlashCommandBuilder } = require('discord.js');

const evidence = require('../reports/evidence');
const { REPORT_CATEGORIES, normalizeReportInput } = require('../reports/validation');

const COOLDOWN_MS = 60_000;
const cooldowns = new Map();
const activeSubmissions = new Set();

function cooldownRemaining(userId, nowMs) {
  const lastSuccess = cooldowns.get(String(userId));
  if (!Number.isFinite(lastSuccess)) return 0;
  return Math.max(0, COOLDOWN_MS - (nowMs - lastSuccess));
}

function publicError(error) {
  if (error?.userMessage) return error.userMessage;
  if (error instanceof evidence.EvidenceError) return error.message;
  return 'Laporan gagal dikirim. Coba lagi beberapa saat lagi.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Kirim laporan privat ke owner dan moderator server')
    .setDMPermission(false)
    .addStringOption(option => option
      .setName('category')
      .setDescription('Jenis masalah yang ingin dilaporkan')
      .setRequired(true)
      .addChoices(...REPORT_CATEGORIES))
    .addStringOption(option => option
      .setName('details')
      .setDescription('Jelaskan kejadian dan konteks yang perlu diperiksa')
      .setRequired(true)
      .setMinLength(20)
      .setMaxLength(1500))
    .addUserOption(option => option
      .setName('member')
      .setDescription('Member yang terkait dengan laporan (opsional)'))
    .addStringOption(option => option
      .setName('message_link')
      .setDescription('Link pesan dari server ini (opsional)')
      .setMaxLength(300))
    .addAttachmentOption(option => option
      .setName('evidence')
      .setDescription('Bukti PNG/JPG/WEBP/GIF, MP4/WEBM, PDF, atau TXT'))
    .addBooleanOption(option => option
      .setName('anonymous')
      .setDescription('Sembunyikan identitasmu dari moderator; owner tetap dapat melihat')),

  async execute(interaction, { reportHub, now = Date.now } = {}) {
    if (!interaction.inGuild?.() || !interaction.guild) {
      await interaction.reply({
        content: 'Perintah laporan hanya tersedia di dalam server.',
        ephemeral: true,
      });
      return;
    }

    const nowMs = now();
    const userKey = String(interaction.user.id);
    const remainingMs = cooldownRemaining(userKey, nowMs);
    if (remainingMs > 0) {
      await interaction.reply({
        content: `Tunggu ${Math.ceil(remainingMs / 1000)} detik sebelum mengirim laporan berikutnya.`,
        ephemeral: true,
      });
      return;
    }
    if (activeSubmissions.has(userKey)) {
      await interaction.reply({
        content: 'Laporanmu sebelumnya masih sedang diproses. Tunggu sampai selesai.',
        ephemeral: true,
      });
      return;
    }

    const attachment = interaction.options.getAttachment('evidence');
    let input;
    try {
      input = normalizeReportInput({
        category: interaction.options.getString('category', true),
        details: interaction.options.getString('details', true),
        reporterId: interaction.user.id,
        targetUserId: interaction.options.getUser('member')?.id || null,
        messageLink: interaction.options.getString('message_link'),
        anonymous: interaction.options.getBoolean('anonymous') === true,
        interactionId: interaction.id,
      }, { guildId: interaction.guildId || interaction.guild.id });
      if (attachment) {
        evidence.validateEvidenceMetadata(attachment, interaction.attachmentSizeLimit);
      }
    } catch (error) {
      await interaction.reply({
        content: publicError(error),
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    activeSubmissions.add(userKey);
    try {
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await reportHub.createReportPanel(
          interaction.guild,
          input,
          attachment,
          { discordLimit: interaction.attachmentSizeLimit },
        );
        cooldowns.set(userKey, nowMs);
        await interaction.editReply({
          content: [
            `Laporan privatmu diterima dengan ID \`${result.report.id}\`.`,
            result.report.anonymous
              ? 'Identitasmu disembunyikan dari moderator, tetapi owner tetap dapat membukanya untuk pengawasan.'
              : 'Identitasmu terlihat oleh owner dan moderator laporan.',
            'Laporan akan direview, tetapi pengiriman laporan tidak menjamin tindakan tertentu.',
          ].join('\n'),
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        console.error('[report] submission failed:', {
          reportId: error?.reportId || null,
          code: error?.code || 'UNKNOWN',
        });
        await interaction.editReply({
          content: publicError(error),
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }
    } finally {
      activeSubmissions.delete(userKey);
    }
  },

  cooldownRemaining,
  publicError,
};
