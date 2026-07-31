function configuredEditorRoleIds() {
  return new Set(
    String(process.env.OPS_EDITOR_ROLE_IDS || '')
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

function isEditor(interaction) {
  if (isOwner(interaction?.user?.id)) return true;
  if (!process.env.OWNER_ID) return false;
  const allowed = configuredEditorRoleIds();
  if (!allowed.size) return false;
  const memberRoles = memberRoleIds(interaction?.member);
  return [...allowed].some(roleId => memberRoles.has(roleId));
}

module.exports = {
  configuredEditorRoleIds,
  memberRoleIds,
  isOwner,
  isEditor,
};
