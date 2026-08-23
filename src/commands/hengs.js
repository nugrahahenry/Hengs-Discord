const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { createPublicInviteUrl } = require('../create-public-invite');
const { isPublicChannelAllowed } = require('../guilds/public-channel-policy');
const { buildPublicFeedbackComponents } = require('../guilds/public-feedback');
const { resolveLanguage, resolveReplyStyle } = require('../guilds/config-store');

const MAX_PROMPT_LENGTH = 1800;

const data = new SlashCommandBuilder()
  .setName('hengs')
  .setDescription('Tanya Hengs atau kelola ingatan percakapanmu')
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName('ask')
    .setDescription('Tanyakan sesuatu kepada Hengs')
    .addStringOption(option => option
      .setName('prompt')
      .setDescription('Pertanyaan atau topik yang ingin dibahas')
      .setRequired(true)
      .setMaxLength(MAX_PROMPT_LENGTH)))
  .addSubcommand(subcommand => subcommand
    .setName('reset')
    .setDescription('Hapus ingatan percakapan Hengs khusus untukmu'))
  .addSubcommand(subcommand => subcommand
    .setName('help')
    .setDescription('Lihat cara menggunakan Hengs'))
  .addSubcommand(subcommand => subcommand
    .setName('invite')
    .setDescription('Undang Hengs ke server Discord lain'))
  .addSubcommand(subcommand => subcommand
    .setName('privacy')
    .setDescription('Lihat cara Hengs menangani chat dan data'));

async function replyPrivate(interaction, content) {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

function activeScope(kind) {
  return kind === 'home' || kind === 'public';
}

async function execute(interaction, {
  agent,
  clientId,
  guildAccess,
  publicInsightsStore,
  publicTrafficGuard,
  logger = console,
}) {
  if (!interaction.inGuild?.() || !interaction.guildId) {
    await replyPrivate(interaction, 'Command Hengs hanya tersedia di dalam server Discord.');
    return;
  }
  if (!guildAccess) throw new Error('HENGS_DEPENDENCY_MISSING');
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'invite') {
    let inviteUrl;
    try {
      inviteUrl = createPublicInviteUrl({ clientId });
    } catch {
      logger.error('[public-invite] PUBLIC_INVITE_FAILED');
      await replyPrivate(interaction, 'Link undangan Hengs belum bisa dibuat. Coba lagi nanti ya.');
      return;
    }
    await replyPrivate(interaction, [
      '**Undang Hengs ke server lain**',
      `[Buka halaman undangan Discord](${inviteUrl}), lalu pilih server yang kamu kelola.`,
      'Setelah Hengs masuk, pemilik server atau Administrator cukup menjalankan `/setup start`.',
    ].join('\n'));
    return;
  }

  if (subcommand === 'privacy') {
    await replyPrivate(interaction, [
      '**Privasi Hengs**',
      'Pertanyaanmu dan konteks percakapan terbaru dikirim ke penyedia AI untuk membuat balasan.',
      'Cara penyedia menyimpan data mengikuti kebijakan layanan yang sedang dipakai. Jangan kirim kata sandi, token, atau data sensitif.',
      'Riwayat chat tidak disimpan ke file. Proses Hengs hanya mengingat sampai 10 pesan terbaru untuk setiap pengguna di setiap server.',
      'Untuk server publik, Hengs menyimpan angka penggunaan harian dan pilihan feedback tanpa isi chat, jawaban, atau identitas member.',
      'Gunakan `/hengs reset` kapan saja untuk menghapus ingatan percakapanmu sendiri.',
      'Pengaturan server disimpan terpisah dan dapat dihapus oleh pengelola lewat `/setup disable`.',
    ].join('\n'));
    return;
  }

  const scope = guildAccess.classify(interaction.guildId);

  if (subcommand === 'help') {
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, [
        '**Hengs belum aktif di server ini**',
        'Pemilik server atau Administrator dapat menjalankan `/setup start` untuk mengaktifkannya.',
        'Baca `/hengs privacy` untuk memahami penggunaan data.',
        'Pakai `/hengs invite` jika ingin membawa Hengs ke server lain yang kamu kelola.',
      ].join('\n'));
      return;
    }
    if (!activeScope(scope.kind)) {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    await replyPrivate(interaction, [
      '**Mulai pakai Hengs**',
      '`/hengs ask` untuk bertanya langsung, atau mention Hengs lalu tulis pertanyaanmu.',
      '`/hengs reset` untuk menghapus ingatan percakapanmu sendiri.',
      'Pemilik server atau Administrator dapat mengatur Hengs lewat `/setup`.',
      '`/hengs privacy` menjelaskan penggunaan data.',
      '`/hengs invite` membawamu ke halaman undangan Discord.',
    ].join('\n'));
    return;
  }

  if (!activeScope(scope.kind)) {
    const content = scope.kind === 'pending'
      ? 'Hengs belum aktif. Minta pemilik server atau Administrator menjalankan `/setup start`.'
      : 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.';
    await replyPrivate(interaction, content);
    return;
  }

  if (!agent) throw new Error('HENGS_DEPENDENCY_MISSING');

  if (subcommand === 'reset') {
    const conversationKey = agent.buildConversationKey(interaction.guildId, interaction.user.id);
    agent.clearHistory(conversationKey);
    await replyPrivate(interaction, 'Ingatan percakapanmu dengan Hengs di server ini sudah dihapus.');
    return;
  }

  if (subcommand !== 'ask') {
    await replyPrivate(interaction, 'Pilihan command Hengs tidak dikenali.');
    return;
  }

  if (scope.kind === 'public' && !isPublicChannelAllowed(scope.config, interaction.channelId)) {
    await replyPrivate(interaction, 'Hengs hanya dapat menjawab di channel yang dipilih pengelola server.');
    return;
  }

  const prompt = String(interaction.options.getString('prompt', true) || '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    await replyPrivate(interaction, 'Pertanyaan harus berisi 1 sampai 1800 karakter.');
    return;
  }

  let lease = null;
  let insightClaim = null;
  if (scope.kind === 'public') {
    if (!publicTrafficGuard || !publicInsightsStore) throw new Error('HENGS_DEPENDENCY_MISSING');
    const admission = publicTrafficGuard.acquire(interaction.guildId);
    if (!admission.ok) {
      try {
        publicInsightsStore.recordRejection(interaction.guildId, admission.code);
      } catch {
        logger.error('[public-insights] PUBLIC_INSIGHTS_WRITE_FAILED');
      }
      const content = admission.code === 'PUBLIC_GUILD_BUSY'
        ? 'Aku masih menjawab pesan lain di server ini. Coba lagi sebentar ya.'
        : 'Batas chat Hengs untuk server ini sedang penuh. Coba lagi beberapa menit lagi.';
      await replyPrivate(interaction, content);
      return;
    }
    lease = admission;
    try {
      insightClaim = publicInsightsStore.claimAccepted(interaction.guildId);
    } catch {
      logger.error('[public-insights] PUBLIC_INSIGHTS_WRITE_FAILED');
      lease.release();
      lease = null;
      await replyPrivate(interaction, 'Data penggunaan Hengs belum bisa diperbarui. Aku tidak akan memakai layanan AI dulu. Coba lagi nanti ya.');
      return;
    }
    if (!insightClaim.ok) {
      lease.release();
      lease = null;
      await replyPrivate(interaction, 'Batas harian Hengs untuk server ini sudah habis. Coba lagi besok setelah pukul 00.00 UTC.');
      return;
    }
  }

  await interaction.deferReply({});
  try {
    const conversationKey = agent.buildConversationKey(interaction.guildId, interaction.user.id);
    const context = scope.kind === 'public'
      ? {
        kind: 'public',
        replyStyle: resolveReplyStyle(scope.config),
        language: resolveLanguage(scope.config),
      }
      : { kind: 'home' };
    const answer = await agent.chat(prompt, conversationKey, context);
    await interaction.editReply({
      content: answer.substring(0, 2000),
      components: scope.kind === 'public'
        ? buildPublicFeedbackComponents({
          requestId: insightClaim.requestId,
          requesterId: interaction.user.id,
        })
        : [],
      allowedMentions: { parse: [] },
    });
  } catch {
    logger.error(scope.kind === 'public'
      ? '[public-ai] PUBLIC_AI_FAILED'
      : '[home-ai] HOME_AI_FAILED');
    await interaction.editReply({
      content: 'Aduh, lagi error nih. Coba lagi nanti! 🙏',
      allowedMentions: { parse: [] },
    }).catch(() => {});
  } finally {
    if (lease) lease.release();
  }
}

module.exports = { data, execute };
