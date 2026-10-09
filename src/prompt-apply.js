'use strict';

const crypto = require('node:crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  BLUEPRINTS,
  CHANNEL_NAME_STYLES,
  categoryName,
  categoryNameAliases,
  channelName,
  channelNameAliases,
} = require('./prompt-assistant');

const MAX_CREATE_OPERATIONS = 32;
const SNOWFLAKE = /^\d{17,20}$/;
const guildLocks = new Set();

function fixedChannelType(channel) {
  if (channel?.type === ChannelType.GuildVoice || channel?.type === ChannelType.GuildStageVoice) return 'voice';
  if (channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement) return 'text';
  if (channel?.type === ChannelType.GuildCategory) return 'category';
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
        parentId: channel?.parentId ? String(channel.parentId) : null,
      } : null;
    })
    .filter(channel => channel && SNOWFLAKE.test(channel.id) && channel.name)
    .sort((left, right) => left.id.localeCompare(right.id));
  return entries.length <= MAX_CREATE_OPERATIONS * 32 ? entries : null;
}

function channelInventoryFingerprint(guild) {
  const entries = visibleChannels(guild);
  if (!entries) return null;
  const material = entries.map(channel => `${channel.id}\u0000${channel.kind}\u0000${channel.name}\u0000${channel.parentId || ''}`).join('\n');
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

function buildCommunityOperations({ guild, blueprintKeys, nameStyle = 'plain' } = {}) {
  const keys = assertBlueprintKeys(blueprintKeys);
  if (!CHANNEL_NAME_STYLES.includes(nameStyle)) throw new Error('PROMPT_APPLY_NAME_STYLE_INVALID');
  const channels = visibleChannels(guild);
  if (!channels) throw new Error('PROMPT_APPLY_INVENTORY_UNAVAILABLE');
  const existing = new Map(channels.map(channel => [`${channel.kind}\u0000${channel.name}`, channel]));
  const selected = new Set(keys);
  const operations = [];
  for (const blueprint of BLUEPRINTS) {
    if (!selected.has(blueprint.key)) continue;
    const categoryKey = `category\u0000${categoryName(blueprint, nameStyle).toLowerCase()}`;
    const categoryAliases = categoryNameAliases(blueprint).map(name => `category\u0000${name.toLowerCase()}`);
    const existingCategory = categoryAliases.map(alias => existing.get(alias)).find(Boolean) || null;
    if (!existingCategory) {
      operations.push({
        blueprintKey: blueprint.key,
        kind: 'category',
        name: categoryName(blueprint, nameStyle),
        type: ChannelType.GuildCategory,
        categoryKey,
        categoryId: null,
      });
      existing.set(categoryKey, { id: null, kind: 'category', name: categoryName(blueprint, nameStyle).toLowerCase() });
    } else {
      existing.set(categoryKey, existingCategory);
    }
    for (let index = 0; index < blueprint.channels.length; index += 1) {
      const aliases = channelNameAliases(blueprint, 'text', index);
      const existingChannel = aliases.map(name => existing.get(`text\u0000${name.toLowerCase()}`)).find(Boolean);
      const name = channelName(blueprint, 'text', index, nameStyle);
      if (!existingChannel) {
        operations.push({ blueprintKey: blueprint.key, kind: 'text', name, type: ChannelType.GuildText, categoryKey, categoryId: existingCategory?.id || null });
        existing.set(`text\u0000${name.toLowerCase()}`, { id: null, kind: 'text', name: name.toLowerCase() });
      }
    }
    for (let index = 0; index < (blueprint.voiceChannels || []).length; index += 1) {
      const aliases = channelNameAliases(blueprint, 'voice', index);
      const existingChannel = aliases.map(name => existing.get(`voice\u0000${name.toLowerCase()}`)).find(Boolean);
      const name = channelName(blueprint, 'voice', index, nameStyle);
      if (!existingChannel) {
        operations.push({ blueprintKey: blueprint.key, kind: 'voice', name, type: ChannelType.GuildVoice, categoryKey, categoryId: existingCategory?.id || null });
        existing.set(`voice\u0000${name.toLowerCase()}`, { id: null, kind: 'voice', name: name.toLowerCase() });
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

async function applyCommunityPlan({ guild, blueprintKeys, nameStyle = 'plain', expectedFingerprint } = {}) {
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
    operations = buildCommunityOperations({ guild, blueprintKeys, nameStyle });
  } catch (error) {
    return { ok: false, code: error.code || error.message || 'PROMPT_APPLY_INVALID' };
  }
  if (operations.length === 0) return { ok: true, createdCount: 0 };

  guildLocks.add(guildId);
  let createdCount = 0;
  const createdCategories = new Map();
  try {
    for (const operation of operations) {
      const parentId = operation.kind === 'category'
        ? null
        : operation.categoryId || createdCategories.get(operation.categoryKey) || null;
      const created = await guild.channels.create({
        name: operation.name,
        type: operation.type,
        ...(parentId ? { parent: parentId } : {}),
      });
      if (operation.kind === 'category') createdCategories.set(operation.categoryKey, String(created?.id || ''));
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
