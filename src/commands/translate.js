const { SlashCommandBuilder } = require('discord.js');
const translation = require('../translation/service');

function allowedUserIds() {
  const configured = String(process.env.TRANSLATE_ALLOWED_USER_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (process.env.OWNER_ID) configured.push(process.env.OWNER_ID);
  return new Set(configured);
}

function isAllowed(userId) {
  return allowedUserIds().has(userId);
}

function privacyNotice() {
  return 'DeepL API Free hanya untuk dokumen non-sensitif. Jangan kirim data pribadi, kontrak, keuangan, credential, atau rahasia kerja.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Terjemahkan dokumen non-sensitif melalui DeepL')
    .setDMPermission(false)
    .addAttachmentOption(option => option
      .setName('file')
      .setDescription('PDF, DOCX, PPTX, HTML, atau TXT')
      .setRequired(true))
    .addStringOption(option => option
      .setName('to')
      .setDescription('Bahasa tujuan, contoh: Indonesian atau id')
      .setRequired(true)
      .setAutocomplete(true))
    .addBooleanOption(option => option
      .setName('non_sensitive')
      .setDescription('Konfirmasi file tidak berisi data pribadi atau rahasia')
      .setRequired(true)),

  async autocomplete(interaction) {
    if (!isAllowed(interaction.user.id)) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused();
    const suggestions = await translation.getTargetLanguageSuggestions(focused);
    await interaction.respond(suggestions);
  },

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Perintah ini hanya tersedia di server Hengs.',
        ephemeral: true,
      });
      return;
    }
    if (!isAllowed(interaction.user.id)) {
      await interaction.reply({
        content: 'Fitur penerjemah dokumen hanya tersedia untuk owner dan VIP yang diizinkan.',
        ephemeral: true,
      });
      return;
    }
    if (!translation.isConfigured()) {
      await interaction.reply({
        content: 'DeepL belum dikonfigurasi untuk Hengs Discord.',
        ephemeral: true,
      });
      return;
    }
    if (interaction.options.getBoolean('non_sensitive', true) !== true) {
      await interaction.reply({
        content: `Dokumen tidak dikirim. ${privacyNotice()}`,
        ephemeral: true,
      });
      return;
    }

    const attachment = interaction.options.getAttachment('file', true);
    try {
      translation.validateAttachmentMetadata(
        attachment,
        interaction.attachmentSizeLimit,
      );
    } catch (error) {
      await interaction.reply({
        content: translation.getPublicError(error),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let target;
    try {
      target = translation.resolveTargetLanguage(
        interaction.options.getString('to', true),
        await translation.loadTargetLanguages(),
      );
    } catch (error) {
      await interaction.editReply({ content: translation.getPublicError(error) });
      return;
    }

    let lastProgress = '';
    let lastProgressAt = 0;
    const updateProgress = async status => {
      const now = Date.now();
      if (status === lastProgress && now - lastProgressAt < 1_500) return;
      lastProgress = status;
      lastProgressAt = now;
      await interaction.editReply({
        content: `${status}\nTarget: **${target.name}**\n\n${privacyNotice()}`,
      });
    };

    try {
      const queued = translation.enqueueTranslation({
        attachment,
        target,
        attachmentSizeLimit: interaction.attachmentSizeLimit,
        onProgress: updateProgress,
        deliver: async result => {
          const billed = result.billedCharacters
            ? `${result.billedCharacters.toLocaleString('id-ID')} karakter`
            : 'sesuai perhitungan DeepL';
          await interaction.editReply({
            content: [
              `Selesai diterjemahkan ke **${result.target.name}**.`,
              `Format: ${result.format} | Terpakai: ${billed}.`,
              'File sementara lokal sudah dijadwalkan untuk dihapus setelah upload ini.',
              '',
              privacyNotice(),
            ].join('\n'),
            files: [{ attachment: result.outputPath, name: result.outputName }],
          });
        },
      }, () => updateProgress('Giliranmu dimulai. Memvalidasi dokumen...'));

      if (queued.position > 1) {
        await interaction.editReply({
          content: `Masuk antrean posisi **${queued.position}**.\n\n${privacyNotice()}`,
        });
      }
      await queued.promise;
    } catch (error) {
      console.error('[translate] job failed:', {
        code: error?.code || 'UNKNOWN',
        status: error?.statusCode || error?.status || null,
      });
      await interaction.editReply({
        content: `Terjemahan gagal: ${translation.getPublicError(error)}\n\nFile sementara lokal sudah dibersihkan.`,
        files: [],
      }).catch(() => {});
    }
  },

  isAllowed,
};
