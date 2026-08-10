const { SlashCommandBuilder } = require('discord.js');

const DISCORD_ID = /^\d{15,22}$/;
const ALLOW_ACTIONS = new Set(['add', 'remove', 'list']);
const ALLOW_KINDS = new Set(['role', 'channel', 'domain']);

function ownerId() {
  const value = String(process.env.OWNER_ID || '');
  return DISCORD_ID.test(value) ? value : null;
}

function isOwner(interaction) {
  const configuredOwnerId = ownerId();
  return configuredOwnerId !== null && String(interaction?.user?.id || '') === configuredOwnerId;
}

function canViewModeration(interaction, moderationHub) {
  if (isOwner(interaction)) return true;
  try {
    return moderationHub?.isModerator?.(interaction) === true;
  } catch {
    return false;
  }
}

async function replyPrivate(interaction, content) {
  const payload = {
    content,
    ephemeral: true,
    allowedMentions: { parse: [] },
  };
  if (interaction?.deferred && !interaction.replied && interaction.editReply) {
    const { ephemeral, ...editPayload } = payload;
    await interaction.editReply(editPayload);
  } else if (interaction?.deferred || interaction?.replied) {
    await interaction.followUp?.(payload);
  } else {
    await interaction.reply(payload);
  }
}

function allowTarget(interaction, kind) {
  if (kind === 'role') return interaction.options.getRole('role')?.id || null;
  if (kind === 'channel') return interaction.options.getChannel('channel')?.id || null;
  return interaction.options.getString('domain') || null;
}

function missingTargetMessage(kind) {
  return {
    role: 'Pilih role yang akan diubah di allowlist.',
    channel: 'Pilih channel yang akan diubah di allowlist.',
    domain: 'Isi domain yang akan diubah di allowlist.',
  }[kind] || 'Nilai allowlist tidak valid.';
}

const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Kontrol moderasi Anti-Raid')
  .setDMPermission(false)
  .addSubcommand(subcommand => subcommand
    .setName('status')
    .setDescription('Lihat status moderasi'))
  .addSubcommand(subcommand => subcommand
    .setName('incidents')
    .setDescription('Lihat insiden moderasi terbaru')
    .addIntegerOption(option => option
      .setName('page')
      .setDescription('Halaman insiden, dari 1 sampai 50')
      .setMinValue(1)
      .setMaxValue(50)))
  .addSubcommandGroup(group => group
    .setName('allow')
    .setDescription('Kelola pengecualian moderasi')
    .addSubcommand(subcommand => subcommand
      .setName('role')
      .setDescription('Kelola allowlist role')
      .addStringOption(option => option
        .setName('action')
        .setDescription('Tindakan allowlist')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' },
        ))
      .addRoleOption(option => option
        .setName('role')
        .setDescription('Role target')))
    .addSubcommand(subcommand => subcommand
      .setName('channel')
      .setDescription('Kelola allowlist channel')
      .addStringOption(option => option
        .setName('action')
        .setDescription('Tindakan allowlist')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' },
        ))
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('Channel target')))
    .addSubcommand(subcommand => subcommand
      .setName('domain')
      .setDescription('Kelola allowlist domain')
      .addStringOption(option => option
        .setName('action')
        .setDescription('Tindakan allowlist')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' },
          { name: 'List', value: 'list' },
        ))
      .addStringOption(option => option
        .setName('domain')
        .setDescription('Bare domain target')
        .setMinLength(1)
        .setMaxLength(253))));

module.exports = {
  data,

  async execute(interaction, { moderationHub } = {}) {
    if (!interaction.inGuild?.() || !interaction.guild) {
      await replyPrivate(interaction, 'Kontrol moderasi hanya tersedia di dalam server.');
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);
    if (!group && (subcommand === 'status' || subcommand === 'incidents')) {
      if (!canViewModeration(interaction, moderationHub)) {
        await replyPrivate(interaction, 'Kamu tidak dapat memakai kontrol moderasi.');
        return;
      }

      const page = interaction.options.getInteger('page');
      if (subcommand === 'incidents' && page !== null && (!Number.isInteger(page) || page < 1 || page > 50)) {
        await replyPrivate(interaction, 'Pilihan moderasi tidak valid.');
        return;
      }

      try {
        if (subcommand === 'status') await moderationHub.showStatus(interaction);
        else await moderationHub.showIncidents(interaction, page ?? 1);
      } catch {
        await replyPrivate(interaction, 'Kontrol moderasi sedang tidak tersedia.');
      }
      return;
    }

    if (group !== 'allow' || !ALLOW_KINDS.has(subcommand)) {
      await replyPrivate(interaction, 'Pilihan moderasi tidak valid.');
      return;
    }
    if (!isOwner(interaction)) {
      await replyPrivate(interaction, 'Perubahan allowlist hanya tersedia untuk owner.');
      return;
    }

    const action = interaction.options.getString('action');
    if (!ALLOW_ACTIONS.has(action)) {
      await replyPrivate(interaction, 'Pilihan moderasi tidak valid.');
      return;
    }
    const target = action === 'list' ? null : allowTarget(interaction, subcommand);
    if (action !== 'list' && !target) {
      await replyPrivate(interaction, missingTargetMessage(subcommand));
      return;
    }

    try {
      await moderationHub.mutateAllowlist(interaction, subcommand, action, target);
    } catch {
      await replyPrivate(interaction, 'Kontrol moderasi sedang tidak tersedia.');
    }
  },

  canViewModeration,
  isOwner,
};
