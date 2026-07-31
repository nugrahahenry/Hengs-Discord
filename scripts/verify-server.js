require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  REST,
  Routes,
} = require('discord.js');

const { normalizedRoleName } = require('../src/utils/member-onboarding');

const ROOT = path.join(__dirname, '..');
const REACTION_ROLES_FILE = path.join(ROOT, 'data', 'reaction-roles.json');

const results = [];
function report(level, label, detail = '') {
  results.push({ level, label, detail });
}

function rolePermissions(guildId, roles, member) {
  const everyone = roles.find((role) => role.id === guildId);
  let value = BigInt(everyone?.permissions || 0);
  for (const roleId of member.roles || []) {
    const role = roles.find((candidate) => candidate.id === roleId);
    if (role) value |= BigInt(role.permissions || 0);
  }
  return value;
}

function applyOverwrite(value, overwrite) {
  if (!overwrite) return value;
  return (value & ~BigInt(overwrite.deny || 0)) | BigInt(overwrite.allow || 0);
}

function channelPermissions(base, channel, guildId, member, clientId) {
  if (new PermissionsBitField(base).has(PermissionFlagsBits.Administrator)) {
    return PermissionsBitField.All;
  }

  const overwrites = channel.permission_overwrites || [];
  let value = applyOverwrite(
    base,
    overwrites.find((overwrite) => overwrite.id === guildId),
  );
  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || !member.roles.includes(overwrite.id)) continue;
    roleAllow |= BigInt(overwrite.allow || 0);
    roleDeny |= BigInt(overwrite.deny || 0);
  }
  value = (value & ~roleDeny) | roleAllow;
  return applyOverwrite(
    value,
    overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === clientId),
  );
}

function readReactionMappings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REACTION_ROLES_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    report('fail', 'Reaction-role store', `tidak dapat dibaca: ${error.message}`);
    return {};
  }
}

function resolveChannel(channels, envName, fallbackNames = []) {
  const configuredId = String(process.env[envName] || '').trim();
  if (configuredId) {
    const configured = channels.find((channel) => channel.id === configuredId);
    if (!configured) report('fail', envName, 'ID tidak ditemukan di server');
    return configured || null;
  }
  const fallback = channels.find((channel) => (
    channel.type === ChannelType.GuildText
    && fallbackNames.some((name) => channel.name.toLowerCase().includes(name))
  ));
  if (fallback) report('warn', envName, `kosong; memakai fallback nama #${fallback.name}`);
  else report('fail', envName, 'kosong dan fallback channel tidak ditemukan');
  return fallback || null;
}

function checkChannelPermissions(label, channel, base, guildId, member, clientId, required) {
  if (!channel) return;
  const effective = new PermissionsBitField(
    channelPermissions(base, channel, guildId, member, clientId),
  );
  const missing = required.filter((permission) => !effective.has(permission.bit));
  if (missing.length) {
    report('fail', label, `#${channel.name} kurang permission: ${missing.map((item) => item.name).join(', ')}`);
  } else {
    report('pass', label, `#${channel.name}`);
  }
}

async function main() {
  const token = String(process.env.DISCORD_TOKEN || '').trim();
  const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim();
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
  const ownerId = String(process.env.OWNER_ID || '').trim();
  if (!token || !clientId || !guildId || !ownerId) {
    throw new Error('DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, dan OWNER_ID wajib diisi.');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const [guild, channels, roles, member] = await Promise.all([
    rest.get(Routes.guild(guildId)),
    rest.get(Routes.guildChannels(guildId)),
    rest.get(Routes.guildRoles(guildId)),
    rest.get(Routes.guildMember(guildId, clientId)),
  ]);
  report('pass', 'Discord API', `terhubung ke ${guild.name}`);

  try {
    await rest.get(Routes.guildMember(guildId, ownerId));
    report('pass', 'OWNER_ID', 'owner ditemukan di server');
  } catch {
    report('fail', 'OWNER_ID', 'owner tidak ditemukan di server');
  }

  const base = rolePermissions(guildId, roles, member);
  const guildPermissions = new PermissionsBitField(base);
  for (const permission of [
    { bit: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
    { bit: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
  ]) {
    report(
      guildPermissions.has(permission.bit) ? 'pass' : 'fail',
      permission.name,
      guildPermissions.has(permission.bit) ? 'tersedia' : 'dibutuhkan untuk auto-role/stat channels',
    );
  }

  const commonSend = [
    { bit: PermissionFlagsBits.ViewChannel, name: 'View Channel' },
    { bit: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
    { bit: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
  ];
  const welcome = resolveChannel(channels, 'WELCOME_CHANNEL_ID', ['welcome']);
  const announce = resolveChannel(channels, 'ANNOUNCE_CHANNEL_ID', ['announcement', 'announce']);
  const botChannel = resolveChannel(channels, 'BOT_CHANNEL_ID', ['bot-commands']);
  const botSettings = resolveChannel(channels, 'BOT_SETTINGS_CHANNEL_ID', ['bot-settings']);
  const rolesChannel = resolveChannel(channels, 'ROLES_CHANNEL_ID', ['get-roles']);

  checkChannelPermissions('Welcome channel', welcome, base, guildId, member, clientId, [
    ...commonSend,
    { bit: PermissionFlagsBits.AttachFiles, name: 'Attach Files' },
  ]);
  checkChannelPermissions('Announcements channel', announce, base, guildId, member, clientId, commonSend);
  checkChannelPermissions('Bot commands channel', botChannel, base, guildId, member, clientId, [
    ...commonSend,
    { bit: PermissionFlagsBits.ReadMessageHistory, name: 'Read Message History' },
  ]);
  checkChannelPermissions('Bot settings channel', botSettings, base, guildId, member, clientId, [
    ...commonSend,
    { bit: PermissionFlagsBits.ReadMessageHistory, name: 'Read Message History' },
  ]);
  checkChannelPermissions('Reaction roles channel', rolesChannel, base, guildId, member, clientId, [
    ...commonSend,
    { bit: PermissionFlagsBits.AddReactions, name: 'Add Reactions' },
    { bit: PermissionFlagsBits.ReadMessageHistory, name: 'Read Message History' },
  ]);

  const highestBotPosition = Math.max(
    0,
    ...member.roles.map((roleId) => roles.find((role) => role.id === roleId)?.position || 0),
  );
  const configuredMemberRole = String(process.env.MEMBER_ROLE_ID || '').trim();
  const memberRole = roles.find((role) => role.id === configuredMemberRole)
    || roles.find((role) => normalizedRoleName(role.name) === 'member');
  if (!memberRole) report('fail', 'Member role', 'role Member tidak ditemukan');
  else if (highestBotPosition <= memberRole.position) {
    report('fail', 'Member role hierarchy', `role Hengs harus berada di atas ${memberRole.name}`);
  } else {
    report(configuredMemberRole ? 'pass' : 'warn', 'Member role hierarchy', (
      configuredMemberRole ? memberRole.name : `${memberRole.name}; MEMBER_ROLE_ID masih kosong`
    ));
  }

  const mappings = readReactionMappings();
  let checkedMappings = 0;
  for (const [messageId, mapping] of Object.entries(mappings)) {
    const channel = channels.find((candidate) => candidate.id === mapping.channelId);
    if (!channel) {
      report('fail', 'Reaction-role mapping', `message ${messageId}: channel tidak ditemukan`);
      continue;
    }
    try {
      await rest.get(Routes.channelMessage(mapping.channelId, messageId));
    } catch {
      report('fail', 'Reaction-role mapping', `message ${messageId}: pesan tidak ditemukan`);
      continue;
    }
    for (const roleId of Object.values(mapping.roles || {})) {
      const role = roles.find((candidate) => candidate.id === roleId);
      if (!role) report('fail', 'Reaction-role mapping', `message ${messageId}: role tidak ditemukan`);
      else if (highestBotPosition <= role.position) {
        report('fail', 'Reaction-role hierarchy', `role Hengs harus berada di atas ${role.name}`);
      }
    }
    checkedMappings += 1;
  }
  report(checkedMappings ? 'pass' : 'warn', 'Reaction-role messages', `${checkedMappings} pesan diverifikasi`);

  for (const item of results) {
    const icon = item.level === 'pass' ? '[PASS]' : item.level === 'warn' ? '[WARN]' : '[FAIL]';
    console.log(`${icon} ${item.label}${item.detail ? ` - ${item.detail}` : ''}`);
  }
  const failures = results.filter((item) => item.level === 'fail').length;
  const warnings = results.filter((item) => item.level === 'warn').length;
  console.log(`\nServer verification: ${failures} failed, ${warnings} warning(s).`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] Server verification tidak dapat dijalankan: ${error.message}`);
  process.exitCode = 1;
});
