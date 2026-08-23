const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const SNOWFLAKE = /^\d{17,20}$/;
const REQUEST_ID = /^[a-f0-9]{16}$/;
const CUSTOM_ID = /^hengs-feedback:([a-f0-9]{16}):(\d{17,20}):(helpful|needs_work)$/;

function assertIdentifiers(requestId, requesterId) {
  const normalizedRequestId = String(requestId || '').trim();
  const normalizedRequesterId = String(requesterId || '').trim();
  if (!REQUEST_ID.test(normalizedRequestId) || !SNOWFLAKE.test(normalizedRequesterId)) {
    throw new Error('PUBLIC_FEEDBACK_INVALID');
  }
  return { requestId: normalizedRequestId, requesterId: normalizedRequesterId };
}

function buildPublicFeedbackComponents({ requestId, requesterId }) {
  const normalized = assertIdentifiers(requestId, requesterId);
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hengs-feedback:${normalized.requestId}:${normalized.requesterId}:helpful`)
      .setLabel('Membantu')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hengs-feedback:${normalized.requestId}:${normalized.requesterId}:needs_work`)
      .setLabel('Kurang pas')
      .setStyle(ButtonStyle.Secondary),
  )];
}

async function replyPrivate(interaction, content) {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function handlePublicFeedback(interaction, {
  botUserId,
  guildAccess,
  publicInsightsStore,
  logger = console,
}) {
  if (!interaction?.isButton?.() || !String(interaction.customId || '').startsWith('hengs-feedback:')) {
    return false;
  }
  const match = String(interaction.customId).match(CUSTOM_ID);
  if (!match || !interaction.inGuild?.() || !interaction.guildId) {
    await replyPrivate(interaction, 'Feedback ini tidak dikenali.');
    return true;
  }
  if (!guildAccess || !publicInsightsStore || !SNOWFLAKE.test(String(botUserId || ''))) {
    throw new Error('PUBLIC_FEEDBACK_DEPENDENCY_MISSING');
  }
  const [, requestId, requesterId, rating] = match;
  const scope = guildAccess.classify(interaction.guildId);
  if (scope.kind !== 'public' || String(interaction.message?.author?.id || '') !== String(botUserId)) {
    await replyPrivate(interaction, 'Feedback ini tidak tersedia.');
    return true;
  }
  if (String(interaction.user?.id || '') !== requesterId) {
    await replyPrivate(interaction, 'Feedback ini hanya bisa diisi oleh orang yang meminta jawaban.');
    return true;
  }

  const result = publicInsightsStore.recordFeedback(interaction.guildId, requestId, rating);
  if (result.code === 'FEEDBACK_NOT_FOUND') {
    await replyPrivate(interaction, 'Feedback ini sudah kedaluwarsa atau tidak dikenali.');
    return true;
  }
  const content = result.recorded
    ? 'Makasih, feedback kamu sudah dicatat.'
    : 'Feedback untuk jawaban ini sudah tercatat.';
  try {
    await interaction.update({ components: [] });
    await interaction.followUp({
      content,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  } catch {
    logger.error('[public-feedback] PUBLIC_FEEDBACK_RESPONSE_FAILED');
    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(interaction, content).catch(() => {});
    } else {
      await interaction.followUp({
        content,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  }
  return true;
}

module.exports = { buildPublicFeedbackComponents, handlePublicFeedback };
