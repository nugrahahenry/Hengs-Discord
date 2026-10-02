'use strict';

const crypto = require('node:crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { BLUEPRINTS } = require('./prompt-assistant');

const MAX_CREATE_OPERATIONS = 24;
const SNOWFLAKE = /^\d{17,20}$/;
const guildLocks = new Set();

function fixedChannelType(channel) {
  if (channel?.type === ChannelType.GuildVoice || channel?.type === ChannelType.GuildStageVoice) return 'voice';
  if (channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement) return 'text';
  if (channel?.type === undefined
    && (typeof channel?.isTextBased !== 'function' || channel.isTextBased())) return 'text';
  return null;
}

function visibleChannels(guild) {
  const channels = guild?.channels?.cache;
  if (!channels?.values) return null;
  const entries = [...channels.values()]
    .filter(channel => channel?.viewable !== false)
    .map(channel => {
      const kind = fixedChannelType(channel);
      return kind ? {
        id: String(channel?.id || ''),
        kind,
        name: String(channel?.name || '').trim().toLowerCase(),
      } : null;
    })
    .filter(channel => channel && SNOWFLAKE.test(channel.id) && channel.name)
    .sort((left, right) => left.id.localeCompare(right.id));
  return entries.length <= MAX_CREATE_OPERATIONS * 32 ? entries : null;
}

function channelInventoryFingerprint(guild) {
  const entries = visibleChannels(guild);
  if (!entries) return null;
  const material = entries.map(channel => `${channel.id}\u0000${channel.kind}\u0000${channel.name}`).join('\n');
  return crypto.createHash('sha256').update(material).digest('hex');
}

function assertBlueprintKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > BLUEPRINTS.length) {
    throw new Error('PROMPT_APPLY_BLUEPRINT_INVALID');
  }
  const allowed = new Set(BLUEPRINTS.map(blueprint => blueprint.key));
  const unique = [...new Set(keys.map(String))];
  if (unique.length !== keys.length || unique.some(key => !allowed.has(key))) {
    throw new Error('PROMPT_APPLY_BLUEPRINT_INVALID');
  }
  return unique;
}

function buildCommunityOperations({ guild, blueprintKeys } = {}) {
  const keys = assertBlueprintKeys(blueprintKeys);
  const channels = visibleChannels(guild);
  if (!channels) throw new Error('PROMPT_APPLY_INVENTORY_UNAVAILABLE');
  const existing = new Set(channels.map(channel => `${channel.kind}\u0000${channel.name}`));
  const selected = new Set(keys);
  const operations = [];
  for (const blueprint of BLUEPRINTS) {
    if (!selected.has(blueprint.key)) continue;
    for (const name of blueprint.channels) {
      const key = `text\u0000${name}`;
      if (!existing.has(key)) {
        operations.push({ blueprintKey: blueprint.key, kind: 'text', name, type: ChannelType.GuildText });
        existing.add(key);
      }
    }
    for (const name of blueprint.voiceChannels || []) {
      const key = `voice\u0000${name}`;
      if (!existing.has(key)) {
        operations.push({ blueprintKey: blueprint.key, kind: 'voice', name, type: ChannelType.GuildVoice });
        existing.add(key);
      }
    }
  }
  if (operations.length > MAX_CREATE_OPERATIONS) throw new Error('PROMPT_APPLY_LIMIT');
  return operations;
}

function hasManageChannels(guild) {
  const permissions = guild?.members?.me?.permissions;
  return permissions?.has?.(PermissionFlagsBits.ManageChannels) === true;
}

async function applyCommunityPlan({ guild, blueprintKeys, expectedFingerprint } = {}) {
  const guildId = String(guild?.id || '');
  if (!SNOWFLAKE.test(guildId)) return { ok: false, code: 'PROMPT_APPLY_INVALID' };
  if (guildLocks.has(guildId)) return { ok: false, code: 'PROMPT_APPLY_BUSY' };
  if (!hasManageChannels(guild)) return { ok: false, code: 'PROMPT_APPLY_PERMISSION' };
  const fingerprint = channelInventoryFingerprint(guild);
  if (!fingerprint || fingerprint !== String(expectedFingerprint || '')) {
    return { ok: false, code: 'PROMPT_APPLY_DRIFT' };
  }
  let operations;
  try {
    operations = buildCommunityOperations({ guild, blueprintKeys });
  } catch (error) {
    return { ok: false, code: error.code || error.message || 'PROMPT_APPLY_INVALID' };
  }
  if (operations.length === 0) return { ok: true, createdCount: 0 };

  guildLocks.add(guildId);
  let createdCount = 0;
  try {
    for (const operation of operations) {
      await guild.channels.create({ name: operation.name, type: operation.type });
      createdCount += 1;
    }
    return { ok: true, createdCount };
  } catch {
    return { ok: false, code: 'PROMPT_APPLY_FAILED', createdCount };
  } finally {
    guildLocks.delete(guildId);
  }
}

function resetForTests() {
  guildLocks.clear();
}

module.exports = {
  MAX_CREATE_OPERATIONS,
  applyCommunityPlan,
  buildCommunityOperations,
  channelInventoryFingerprint,
  resetForTests,
  visibleChannels,
};
