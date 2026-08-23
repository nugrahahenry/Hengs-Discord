const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { isPublicChannelAllowed } = require('../guilds/public-channel-policy');
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
    .setDescription('Lihat cara menggunakan Hengs'));

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
  guildAccess,
  publicTrafficGuard,
  logger = console,
}) {
  if (!interaction.inGuild?.() || !interaction.guildId) {
    await replyPrivate(interaction, 'Command Hengs hanya tersedia di dalam server Discord.');
    return;
  }
  if (!agent || !guildAccess) throw new Error('HENGS_DEPENDENCY_MISSING');
  const scope = guildAccess.classify(interaction.guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'help') {
    if (scope.kind === 'pending') {
      await replyPrivate(interaction, [
        'Hengs belum aktif di server ini.',
        'Minta pemilik server atau Administrator menjalankan `/setup start` lebih dulu.',
      ].join('\n'));
      return;
    }
    if (!activeScope(scope.kind)) {
      await replyPrivate(interaction, 'Konfigurasi Hengs di server ini tidak dapat dibaca. Hubungi pengelola Hengs.');
      return;
    }
    await replyPrivate(interaction, [
      '**Cara memakai Hengs**',
      '`/hengs ask` untuk bertanya langsung.',
      '`/hengs reset` untuk menghapus ingatan percakapanmu sendiri.',
      'Kamu juga dapat mention Hengs lalu tulis pertanyaanmu.',
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
  if (scope.kind === 'public') {
    if (!publicTrafficGuard) throw new Error('HENGS_DEPENDENCY_MISSING');
    const admission = publicTrafficGuard.acquire(interaction.guildId);
    if (!admission.ok) {
      const content = admission.code === 'PUBLIC_GUILD_BUSY'
        ? 'Aku masih menjawab pesan lain di server ini. Coba lagi sebentar ya.'
        : 'Batas chat Hengs untuk server ini sedang penuh. Coba lagi beberapa menit lagi.';
      await replyPrivate(interaction, content);
      return;
    }
    lease = admission;
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
