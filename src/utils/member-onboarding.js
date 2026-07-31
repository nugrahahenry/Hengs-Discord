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

module.exports = { normalizedRoleName, findMemberRole, assignMemberRole };
