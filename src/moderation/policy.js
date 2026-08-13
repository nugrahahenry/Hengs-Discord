const { PermissionFlagsBits } = require('discord.js');

const MAX_DOMAIN_LENGTH = 253;
const DISCORD_ID = /^\d{15,22}$/;
const VALID_MODES = new Set(['active', 'monitor', 'off']);
const ISSUE_CODES = Object.freeze([
  'MOD_LOG_PUBLIC',
  'MOD_LOG_UNAVAILABLE',
  'BAN_MEMBERS_MISSING',
  'MANAGE_MESSAGES_MISSING',
  'TARGET_UNBANNABLE',
  'POLICY_INVALID',
]);

// Discord-owned hosts are never useful anti-raid domain targets.
const DISCORD_ALLOWED_DOMAINS = new Set([
  'discord.com',
  'discordapp.com',
  'discord.gg',
  'discord.new',
  'discordstatus.com',
  'discordapp.net',
]);

function validHostname(host) {
  if (!host || host.length > MAX_DOMAIN_LENGTH || host.includes('..')) return false;
  return host.split('.').every(label => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

function normalizeDomain(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > MAX_DOMAIN_LENGTH || /[^\x00-\x7F]/.test(value) || value.includes('*')) return null;

  let url;
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      if (!/^https?:\/\//i.test(value)) return null;
      const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1] || '';
      if (authority.includes(':')) return null;
      url = new URL(value);
    } else {
      if (/[/?#@:]/.test(value)) return null;
      url = new URL(`https://${value}`);
    }
  } catch {
    return null;
  }

  if (url.username || url.password || url.port || !/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return validHostname(host) ? host : null;
}

function isStoredDomainRule(raw) {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!value || value.length > MAX_DOMAIN_LENGTH || /[^\x00-\x7F]/.test(value)) return false;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    if (!/^https?:\/\//i.test(value)) return false;
    try {
      const url = new URL(value);
      if (url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port) return false;
    } catch {
      return false;
    }
  } else if (/[/?#@:]/.test(value) || value.includes('*')) {
    return false;
  }

  return normalizeDomain(value) !== null;
}

function listValues(raw) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return values.map(value => String(value).trim());
}

function parseDomainList(raw) {
  const values = listValues(raw);
  const domains = new Set();
  for (const value of values) {
    if (!isStoredDomainRule(value)) continue;
    const domain = normalizeDomain(value);
    if (domain) domains.add(domain);
  }
  return domains;
}

function domainMatches(host, rule) {
  const normalizedHost = normalizeDomain(host);
  const normalizedRule = normalizeDomain(rule);
  if (!normalizedHost || !normalizedRule) return false;
  return normalizedHost === normalizedRule || normalizedHost.endsWith(`.${normalizedRule}`);
}

function setValues(value) {
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  if (value && typeof value.keys === 'function') return [...value.keys()];
  return [];
}

function anyDomainMatches(host, domains) {
  return setValues(domains).some(rule => domainMatches(host, rule));
}

function domainDecision(host, policy = {}) {
  const normalizedHost = normalizeDomain(host);
  if (!normalizedHost) return 'neutral';
  if (anyDomainMatches(normalizedHost, DISCORD_ALLOWED_DOMAINS)) return 'allowed';
  if (anyDomainMatches(normalizedHost, policy.allowedDomains)) return 'allowed';
  if (anyDomainMatches(normalizedHost, policy.blockedDomains)) return 'blocked';
  return 'neutral';
}

function parseDiscordIds(raw) {
  return new Set(listValues(raw).filter(value => DISCORD_ID.test(value)));
}

function readStaticPolicy(env = process.env) {
  const requested = String(env.ANTI_RAID_MODE || 'active').trim().toLowerCase();
  const ownerValue = String(env.OWNER_ID || '').trim();
  const ownerId = DISCORD_ID.test(ownerValue) ? ownerValue : null;
  const domainValues = listValues(env.ANTI_RAID_BLOCKED_DOMAINS);
  const reviewerValues = listValues(env.MODERATION_ROLE_IDS);
  return {
    initialMode: VALID_MODES.has(requested) ? requested : 'monitor',
    ownerId,
    configurationValid: Boolean(ownerId)
      && VALID_MODES.has(requested)
      && domainValues.every(value => !value || isStoredDomainRule(value))
      && reviewerValues.every(value => !value || DISCORD_ID.test(value)),
    blockedDomains: parseDomainList(domainValues),
    reviewerRoleIds: parseDiscordIds(reviewerValues),
  };
}

function memberRoleIds(member) {
  if (member?.roles?.cache?.keys) return new Set([...member.roles.cache.keys()].map(String));
  if (Array.isArray(member?.roles)) return new Set(member.roles.map(String));
  if (Array.isArray(member?._roles)) return new Set(member._roles.map(String));
  if (member?.roles?.keys) return new Set([...member.roles.keys()].map(String));
  return new Set();
}

function hasPermission(holder, permissionName) {
  if (holder === true) return true;
  if (!holder) return false;
  if (holder[permissionName] === true || holder[String(permissionName).toLowerCase()] === true) return true;
  const permissions = holder.permissions || holder;
  if (permissions?.has) {
    try {
      if (permissions.has(permissionName)) return true;
    } catch {}
    try {
      if (permissions.has(PermissionFlagsBits[permissionName])) return true;
    } catch {}
  }
  if (permissions instanceof Set) return permissions.has(permissionName) || permissions.has(PermissionFlagsBits[permissionName]);
  return false;
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function isMessageExempt(message = {}, staticPolicy = {}, persistedPolicy = {}) {
  if (message.author?.bot === true || message.member?.user?.bot === true) return { exempt: true, reason: 'bot' };
  if (message.system === true) return { exempt: true, reason: 'system' };
  if (message.webhookId || message.webhook?.id) return { exempt: true, reason: 'webhook' };
  if (message.guild === null || (message.guildId == null && !message.guild)) return { exempt: true, reason: 'dm' };

  const userId = String(firstDefined(message.author?.id, message.member?.user?.id, message.authorId, ''));
  const guild = message.guild || {};
  const ownerId = firstDefined(staticPolicy.ownerId, staticPolicy.ownerID, process.env.OWNER_ID);
  if (ownerId && userId === String(ownerId)) return { exempt: true, reason: 'owner' };
  if (guild.ownerId && userId === String(guild.ownerId)) return { exempt: true, reason: 'guild_owner' };
  if (hasPermission(message.member, 'Administrator') || hasPermission(message.memberPermissions, 'Administrator')) {
    return { exempt: true, reason: 'administrator' };
  }

  const roles = memberRoleIds(message.member);
  if ([...setValues(staticPolicy.reviewerRoleIds)].some(roleId => roles.has(String(roleId)))) {
    return { exempt: true, reason: 'reviewer_role' };
  }

  const allowedRoleIds = firstDefined(
    persistedPolicy.allowedRoleIds,
    persistedPolicy.roleIds,
    persistedPolicy.allowlist?.roleIds,
    persistedPolicy.allowlist?.roles,
  );
  if ([...setValues(allowedRoleIds)].some(roleId => roles.has(String(roleId)))) {
    return { exempt: true, reason: 'persisted_role_allowlist' };
  }

  const allowedChannelIds = firstDefined(
    persistedPolicy.allowedChannelIds,
    persistedPolicy.channelIds,
    persistedPolicy.allowlist?.channelIds,
    persistedPolicy.allowlist?.channels,
  );
  const channelId = firstDefined(message.channelId, message.channel?.id);
  if (channelId && [...setValues(allowedChannelIds)].some(value => String(value) === String(channelId))) {
    return { exempt: true, reason: 'persisted_channel_allowlist' };
  }

  return { exempt: false, reason: null };
}

function isPublicModLog(context) {
  if (context.modLogPublic === true || context.modLogChannel?.isPublic === true || context.modLogChannel?.public === true) return true;
  const channel = context.modLogChannel;
  if (!channel || typeof channel.permissionsFor !== 'function') return true;
  const everyone = context.everyoneRole || context.guild?.roles?.everyone;
  try {
    const everyonePermissions = channel.permissionsFor(everyone);
    return hasPermission(everyonePermissions, 'ViewChannel');
  } catch {
    return true;
  }
}

function explicitPermission(context, positiveNames, holderNames) {
  for (const name of positiveNames) {
    if (context[name] === true) return true;
    if (context[name] === false) return false;
  }
  const holder = firstDefined(...holderNames.map(name => context[name]));
  return holder === undefined ? null : positiveNames.some(name => hasPermission(holder, name));
}

function hasModLogAccess(context) {
  if (!context.botMember) return true;
  const channel = context.modLogChannel;
  if (!channel || typeof channel.permissionsFor !== 'function') return false;
  let permissions;
  try {
    permissions = channel.permissionsFor(context.botMember);
  } catch {
    return false;
  }
  return ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory']
    .every(name => hasPermission(permissions, name));
}

function targetIsUnbannable(context) {
  const target = context.targetMember;
  if (!target) return false;
  if (target.bannable === false || target.manageable === false) return true;
  const botHighest = context.botMember?.roles?.highest;
  const targetHighest = target.roles?.highest;
  if (botHighest?.comparePositionTo && targetHighest) {
    try {
      return botHighest.comparePositionTo(targetHighest) <= 0;
    } catch {}
  }
  return false;
}

function assessPrerequisites(context = {}) {
  const configuredMode = String(firstDefined(
    context.configuredMode,
    context.staticPolicy?.initialMode,
    context.initialMode,
    'active',
  )).trim().toLowerCase();
  const issues = [];

  if (!VALID_MODES.has(configuredMode)) issues.push('POLICY_INVALID');
  if (context.staticPolicy?.configurationValid === false) issues.push('POLICY_INVALID');
  if (isPublicModLog(context)) issues.push('MOD_LOG_PUBLIC');
  else if (!hasModLogAccess(context)) issues.push('MOD_LOG_UNAVAILABLE');

  const canBan = explicitPermission(context, ['BanMembers'], ['botPermissions', 'botMember', 'permissions']);
  if (canBan !== true) issues.push('BAN_MEMBERS_MISSING');
  const canManageMessages = explicitPermission(context, ['ManageMessages'], ['botPermissions', 'botMember', 'permissions']);
  if (canManageMessages !== true) issues.push('MANAGE_MESSAGES_MISSING');
  if (targetIsUnbannable(context)) issues.push('TARGET_UNBANNABLE');

  const orderedIssues = ISSUE_CODES.filter(code => issues.includes(code));
  return {
    configuredMode,
    effectiveMode: configuredMode === 'off'
      ? 'off'
      : (orderedIssues.length ? 'monitor' : configuredMode),
    issues: orderedIssues,
  };
}

module.exports = {
  DISCORD_ALLOWED_DOMAINS,
  ISSUE_CODES,
  VALID_MODES,
  domainDecision,
  domainMatches,
  isMessageExempt,
  normalizeDomain,
  parseDiscordIds,
  parseDomainList,
  readStaticPolicy,
  assessPrerequisites,
};
