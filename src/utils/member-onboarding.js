const { EmbedBuilder, escapeMarkdown } = require('discord.js');

const CHANNEL_NAMES = Object.freeze({
  rules: ['rules', 'aturan'],
  roles: ['get-roles', 'ambil-role', 'roles'],
  announce: ['announcement', 'announce', 'pengumuman'],
  intro: ['intro', 'perkenalan', 'kenalan'],
});

function findOnboardingChannel(guild, configuredId, kind) {
  if (!Object.hasOwn(CHANNEL_NAMES, kind)) return null;
  const channels = guild.channels.cache;
  let channel = configuredId && channels.get(configuredId);
  if (!channel?.isTextBased?.()) {
    channel = channels.find(candidate => candidate.isTextBased?.()
      && CHANNEL_NAMES[kind].some(name => candidate.name.toLowerCase().includes(name)));
  }
  return channel ? safeChannelReference(`<#${channel.id}>`, null) : null;
}

function normalizedRoleName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMemberRole(guild, configuredRoleId) {
  if (configuredRoleId) {
    const configured = guild.roles.cache.get(configuredRoleId);
    if (configured) return configured;
  }
  return guild.roles.cache.find((role) => normalizedRoleName(role.name) === 'member') || null;
}

async function assignMemberRole(member, configuredRoleId, logger = console) {
  const role = findMemberRole(member.guild, configuredRoleId);
  if (!role) {
    logger.warn('  Member role tidak ditemukan. Isi MEMBER_ROLE_ID atau buat role bernama Member.');
    return { ok: false, reason: 'missing_role' };
  }
  if (member.roles.cache?.has?.(role.id)) {
    return { ok: true, role, alreadyAssigned: true };
  }

  const botHighest = member.guild.members.me?.roles?.highest;
  if (botHighest?.comparePositionTo && botHighest.comparePositionTo(role) <= 0) {
    logger.error(`  Gagal kasih role ${role.name}: role Hengs harus berada di atas role tersebut.`);
    return { ok: false, role, reason: 'role_hierarchy' };
  }

  try {
    await member.roles.add(role);
    logger.log(`  Role "${role.name}" -> ${member.user.username}`);
    return { ok: true, role, alreadyAssigned: false };
  } catch (error) {
    logger.error(`  Gagal kasih role Member: ${error.message}`);
    return { ok: false, role, reason: 'assign_failed' };
  }
}

function safeChannelReference(value, fallback) {
  const reference = String(value || '').trim();
  return /^<#[0-9]{17,20}>$/.test(reference) ? reference : fallback;
}

function buildOnboardingFields({ rulesChannel, rolesChannel, announceChannel, introChannel } = {}) {
  const rules = safeChannelReference(rulesChannel, '**#rules**');
  const roles = safeChannelReference(rolesChannel, '**#get-roles**');
  const announce = safeChannelReference(announceChannel, '**#announcements**');
  const intro = safeChannelReference(introChannel, '**#intro-dulu-ngab**');
  return [
    {
      name: '🚀 Mulai di sini',
      value: [
        `1. ${rules} · Baca aturan`,
        `2. ${roles} · Ambil role`,
        `3. ${intro} · Kenalan`,
        `4. ${announce} · Pantau update`,
      ].join('\n'),
      inline: false,
    },
    {
      name: '🤖 Butuh bantuan?',
      value: 'Mention Hengs untuk tanya atau cari fitur. Mau langsung coba? Pakai `/fun` atau `/study`.',
      inline: false,
    },
  ];
}

function buildWelcomeEmbed(member, { customWelcomeCopy, channels, now = new Date() } = {}) {
  const displayName = escapeMarkdown(String(member.displayName || 'teman baru'), { maskedLink: true });
  const serverName = escapeMarkdown(String(member.guild.name || 'server ini'), { maskedLink: true });
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`👋 Selamat datang, ${displayName}!`.slice(0, 256))
    .setDescription(customWelcomeCopy
      || `Senang kamu mampir di **${serverName}**. Yuk, kenalan dan cari teman ngobrol atau mabar!`)
    .addFields(buildOnboardingFields(channels))
    .setFooter({ text: `Member ke-${member.guild.memberCount} · Hengs onboarding` })
    .setTimestamp(now);
}

module.exports = {
  assignMemberRole,
  buildOnboardingFields,
  buildWelcomeEmbed,
  findMemberRole,
  findOnboardingChannel,
  normalizedRoleName,
};
