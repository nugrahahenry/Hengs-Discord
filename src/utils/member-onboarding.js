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
        `**1. Baca aturan** di ${rules}`,
        `**2. Ambil role** di ${roles}`,
        `**3. Kenalan** di ${intro}`,
        `**4. Pantau update** di ${announce}`,
      ].join('\n'),
      inline: false,
    },
    {
      name: '🤖 Butuh bantuan?',
      value: 'Mention Hengs kalau mau tanya, minta bantuan, atau cari fitur yang cocok.',
      inline: false,
    },
  ];
}

module.exports = {
  assignMemberRole,
  buildOnboardingFields,
  findMemberRole,
  normalizedRoleName,
};
