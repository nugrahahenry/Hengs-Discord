function configuredModeratorRoleIds() {
  return new Set(
    String(process.env.REPORT_MODERATOR_ROLE_IDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(value => /^\d{15,22}$/.test(value)),
  );
}

function memberRoleIds(member) {
  if (member?.roles?.cache?.keys) return new Set(member.roles.cache.keys());
  if (Array.isArray(member?.roles)) return new Set(member.roles.map(String));
  if (Array.isArray(member?._roles)) return new Set(member._roles.map(String));
  return new Set();
}

function isOwner(userId) {
  return Boolean(process.env.OWNER_ID) && String(userId) === process.env.OWNER_ID;
}

function isReportModerator(interaction) {
  if (isOwner(interaction?.user?.id)) return true;
  if (!process.env.OWNER_ID) return false;
  const allowed = configuredModeratorRoleIds();
  allowed.delete(String(interaction?.guildId || interaction?.guild?.id || ''));
  if (!allowed.size) return false;
  const roles = memberRoleIds(interaction?.member);
  return [...allowed].some(roleId => roles.has(roleId));
}

module.exports = {
  configuredModeratorRoleIds,
  isOwner,
  isReportModerator,
  memberRoleIds,
};
