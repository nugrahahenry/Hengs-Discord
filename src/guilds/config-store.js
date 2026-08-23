const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNOWFLAKE = /^\d{17,20}$/;
const LEGACY_CONFIG_KEYS = [
  'createdAt', 'features', 'guildId', 'ownerId',
  'revision', 'schemaVersion', 'setupBy', 'status', 'updatedAt',
];
const CONFIG_KEYS = [
  'createdAt', 'features', 'guildId', 'ownerId',
  'revision', 'schemaVersion', 'settings', 'setupBy', 'status', 'updatedAt',
];
const REPLY_STYLES = Object.freeze(['balanced', 'concise', 'technical']);
const LANGUAGES = Object.freeze(['auto', 'id', 'en']);
const CHANNEL_MODES = Object.freeze(['all', 'current']);
const SETTINGS_V3_KEYS = ['channelId', 'channelMode', 'language', 'replyStyle'];
const MAX_CONFIG_BYTES = 16 * 1024;
const DEFAULT_PUBLIC_GUILD_LIMIT = 25;
const MAX_PUBLIC_GUILD_LIMIT = 100;

function parsePublicGuildLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PUBLIC_GUILD_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PUBLIC_GUILD_LIMIT) {
    throw new Error('PUBLIC_GUILD_LIMIT_INVALID');
  }
  return parsed;
}

function assertSnowflake(value, code, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const normalized = String(value || '').trim();
  if (!SNOWFLAKE.test(normalized)) throw new Error(code);
  return normalized;
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateConfig(value, expectedGuildId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GUILD_CONFIG_INVALID');
  const expectedKeys = value.schemaVersion === 1 ? LEGACY_CONFIG_KEYS : CONFIG_KEYS;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('GUILD_CONFIG_INVALID');
  }
  if (![1, 2, 3].includes(value.schemaVersion) || value.status !== 'active') {
    throw new Error('GUILD_CONFIG_INVALID');
  }
  const guildId = assertSnowflake(value.guildId, 'GUILD_CONFIG_INVALID');
  if (guildId !== expectedGuildId) throw new Error('GUILD_CONFIG_INVALID');
  assertSnowflake(value.ownerId, 'GUILD_CONFIG_INVALID');
  assertSnowflake(value.setupBy, 'GUILD_CONFIG_INVALID');
  if (
    !value.features
    || typeof value.features !== 'object'
    || Array.isArray(value.features)
    || JSON.stringify(Object.keys(value.features)) !== JSON.stringify(['mentionChat'])
    || value.features.mentionChat !== true
  ) throw new Error('GUILD_CONFIG_INVALID');
  if (value.schemaVersion === 2) {
    if (
      !value.settings
      || typeof value.settings !== 'object'
      || Array.isArray(value.settings)
      || JSON.stringify(Object.keys(value.settings)) !== JSON.stringify(['replyStyle'])
      || !REPLY_STYLES.includes(value.settings.replyStyle)
    ) throw new Error('GUILD_CONFIG_INVALID');
  }
  if (value.schemaVersion === 3) {
    if (
      !value.settings
      || typeof value.settings !== 'object'
      || Array.isArray(value.settings)
      || JSON.stringify(Object.keys(value.settings).sort()) !== JSON.stringify(SETTINGS_V3_KEYS)
      || !REPLY_STYLES.includes(value.settings.replyStyle)
      || !LANGUAGES.includes(value.settings.language)
      || !CHANNEL_MODES.includes(value.settings.channelMode)
    ) throw new Error('GUILD_CONFIG_INVALID');
    if (value.settings.channelMode === 'all' && value.settings.channelId !== null) {
      throw new Error('GUILD_CONFIG_INVALID');
    }
    if (value.settings.channelMode === 'current') {
      assertSnowflake(value.settings.channelId, 'GUILD_CONFIG_INVALID');
    }
  }
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error('GUILD_CONFIG_INVALID');
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    throw new Error('GUILD_CONFIG_INVALID');
  }
  if (Date.parse(value.createdAt) > Date.parse(value.updatedAt)) throw new Error('GUILD_CONFIG_INVALID');
  return value;
}

function resolveReplyStyle(config) {
  if (config?.schemaVersion === 1) return 'balanced';
  const style = config?.settings?.replyStyle;
  if (!REPLY_STYLES.includes(style)) throw new Error('REPLY_STYLE_INVALID');
  return style;
}

function resolveLanguage(config) {
  if ([1, 2].includes(config?.schemaVersion)) return 'auto';
  const language = config?.settings?.language;
  if (!LANGUAGES.includes(language)) throw new Error('LANGUAGE_INVALID');
  return language;
}

function resolveChannelScope(config) {
  if ([1, 2].includes(config?.schemaVersion)) return { channelMode: 'all', channelId: null };
  const channelMode = config?.settings?.channelMode;
  const channelId = config?.settings?.channelId;
  if (!CHANNEL_MODES.includes(channelMode)) throw new Error('CHANNEL_SCOPE_INVALID');
  if (channelMode === 'all' && channelId === null) return { channelMode, channelId };
  if (channelMode === 'current') {
    return { channelMode, channelId: assertSnowflake(channelId, 'CHANNEL_SCOPE_INVALID') };
  }
  throw new Error('CHANNEL_SCOPE_INVALID');
}

function resolvedSettings(config, overrides = {}) {
  const channel = resolveChannelScope(config);
  return {
    channelId: overrides.channelId !== undefined ? overrides.channelId : channel.channelId,
    channelMode: overrides.channelMode || channel.channelMode,
    language: overrides.language || resolveLanguage(config),
    replyStyle: overrides.replyStyle || resolveReplyStyle(config),
  };
}

function assertSafeEntry(fsImpl, entryPath, { directory = false } = {}) {
  if (!fsImpl.existsSync(entryPath)) return;
  const stat = fsImpl.lstatSync(entryPath);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error('GUILD_PATH_UNSAFE');
  }
}

function createGuildConfigStore({
  rootDir = path.join(__dirname, '..', '..', 'data', 'guilds'),
  fsImpl = fs,
  now = () => new Date().toISOString(),
} = {}) {
  const resolvedRoot = path.resolve(rootDir);

  function pathsFor(guildId) {
    const safeGuildId = assertSnowflake(guildId, 'GUILD_ID_INVALID');
    const directory = path.join(resolvedRoot, safeGuildId);
    const file = path.join(directory, 'config.json');
    if (path.dirname(directory) !== resolvedRoot) throw new Error('GUILD_PATH_UNSAFE');
    return { guildId: safeGuildId, directory, file };
  }

  function inspectPaths(paths, { create = false } = {}) {
    if (create) fsImpl.mkdirSync(resolvedRoot, { recursive: true, mode: 0o700 });
    assertSafeEntry(fsImpl, resolvedRoot, { directory: true });
    if (create && !fsImpl.existsSync(paths.directory)) fsImpl.mkdirSync(paths.directory, { mode: 0o700 });
    assertSafeEntry(fsImpl, paths.directory, { directory: true });
    assertSafeEntry(fsImpl, paths.file);
  }

  function get(guildId) {
    const paths = pathsFor(guildId);
    inspectPaths(paths);
    if (!fsImpl.existsSync(paths.file)) return null;
    const stat = fsImpl.lstatSync(paths.file);
    if (stat.size > MAX_CONFIG_BYTES) throw new Error('GUILD_CONFIG_INVALID');
    let parsed;
    try {
      parsed = JSON.parse(fsImpl.readFileSync(paths.file, 'utf8'));
    } catch {
      throw new Error('GUILD_CONFIG_INVALID');
    }
    return validateConfig(parsed, paths.guildId);
  }

  function write(paths, config) {
    inspectPaths(paths, { create: true });
    const temporary = path.join(paths.directory, `.config.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    let descriptor;
    try {
      descriptor = fsImpl.openSync(temporary, 'wx', 0o600);
      fsImpl.writeFileSync(descriptor, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      fsImpl.fsyncSync(descriptor);
      fsImpl.closeSync(descriptor);
      descriptor = undefined;
      inspectPaths(paths);
      fsImpl.renameSync(temporary, paths.file);
    } finally {
      if (descriptor !== undefined) fsImpl.closeSync(descriptor);
      if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary, { force: true });
    }
  }

  function countActive() {
    if (!fsImpl.existsSync(resolvedRoot)) return 0;
    assertSafeEntry(fsImpl, resolvedRoot, { directory: true });
    let count = 0;
    for (const entry of fsImpl.readdirSync(resolvedRoot)) {
      if (!SNOWFLAKE.test(entry)) throw new Error('GUILD_STORE_INVALID');
      const paths = pathsFor(entry);
      assertSafeEntry(fsImpl, paths.directory, { directory: true });
      const config = get(entry);
      if (!config) throw new Error('GUILD_STORE_INVALID');
      count += 1;
    }
    return count;
  }

  function activate({ guildId, ownerId, setupBy, maxActiveGuilds }) {
    const paths = pathsFor(guildId);
    const normalizedOwner = assertSnowflake(ownerId, 'OWNER_ID_INVALID');
    const normalizedSetupBy = assertSnowflake(setupBy, 'SETUP_BY_INVALID');
    const existing = get(paths.guildId);
    const limit = parsePublicGuildLimit(maxActiveGuilds);
    if (!existing && countActive() >= limit) throw new Error('PUBLIC_GUILD_LIMIT_REACHED');
    const timestamp = now();
    if (!isIsoTimestamp(timestamp)) throw new Error('CLOCK_INVALID');
    const desired = {
      schemaVersion: 3,
      guildId: paths.guildId,
      ownerId: normalizedOwner,
      setupBy: normalizedSetupBy,
      status: 'active',
      features: { mentionChat: true },
      settings: existing ? resolvedSettings(existing) : {
        channelId: null,
        channelMode: 'all',
        language: 'auto',
        replyStyle: 'balanced',
      },
      revision: existing ? existing.revision : 1,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: existing ? existing.updatedAt : timestamp,
    };
    const unchanged = existing
      && existing.schemaVersion === 3
      && existing.ownerId === desired.ownerId
      && existing.setupBy === desired.setupBy;
    if (unchanged) return { config: existing, created: false, changed: false };
    if (existing) {
      desired.revision = existing.revision + 1;
      desired.updatedAt = timestamp;
    }
    validateConfig(desired, paths.guildId);
    write(paths, desired);
    return { config: desired, created: !existing, changed: true };
  }

  function setReplyStyle({ guildId, replyStyle, setupBy }) {
    const paths = pathsFor(guildId);
    const normalizedSetupBy = assertSnowflake(setupBy, 'SETUP_BY_INVALID');
    if (!REPLY_STYLES.includes(replyStyle)) throw new Error('REPLY_STYLE_INVALID');
    const existing = get(paths.guildId);
    if (!existing) throw new Error('GUILD_CONFIG_NOT_ACTIVE');
    if (existing.schemaVersion === 3 && resolveReplyStyle(existing) === replyStyle) {
      return { config: existing, changed: false };
    }
    const timestamp = now();
    if (!isIsoTimestamp(timestamp)) throw new Error('CLOCK_INVALID');
    const desired = {
      schemaVersion: 3,
      guildId: existing.guildId,
      ownerId: existing.ownerId,
      setupBy: normalizedSetupBy,
      status: 'active',
      features: { mentionChat: true },
      settings: resolvedSettings(existing, { replyStyle }),
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
    validateConfig(desired, paths.guildId);
    write(paths, desired);
    return { config: desired, changed: true };
  }

  function setLanguage({ guildId, language, setupBy }) {
    const paths = pathsFor(guildId);
    const normalizedSetupBy = assertSnowflake(setupBy, 'SETUP_BY_INVALID');
    if (!LANGUAGES.includes(language)) throw new Error('LANGUAGE_INVALID');
    const existing = get(paths.guildId);
    if (!existing) throw new Error('GUILD_CONFIG_NOT_ACTIVE');
    if (existing.schemaVersion === 3 && resolveLanguage(existing) === language) {
      return { config: existing, changed: false };
    }
    const timestamp = now();
    if (!isIsoTimestamp(timestamp)) throw new Error('CLOCK_INVALID');
    const desired = {
      schemaVersion: 3,
      guildId: existing.guildId,
      ownerId: existing.ownerId,
      setupBy: normalizedSetupBy,
      status: 'active',
      features: { mentionChat: true },
      settings: resolvedSettings(existing, { language }),
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
    validateConfig(desired, paths.guildId);
    write(paths, desired);
    return { config: desired, changed: true };
  }

  function setChannelScope({ guildId, channelMode, channelId, setupBy }) {
    const paths = pathsFor(guildId);
    const normalizedSetupBy = assertSnowflake(setupBy, 'SETUP_BY_INVALID');
    if (!CHANNEL_MODES.includes(channelMode)) throw new Error('CHANNEL_SCOPE_INVALID');
    let normalizedChannelId = null;
    if (channelMode === 'current') {
      try {
        normalizedChannelId = assertSnowflake(channelId, 'CHANNEL_SCOPE_INVALID');
      } catch {
        throw new Error('CHANNEL_SCOPE_INVALID');
      }
    } else if (channelId !== null) {
      throw new Error('CHANNEL_SCOPE_INVALID');
    }
    const existing = get(paths.guildId);
    if (!existing) throw new Error('GUILD_CONFIG_NOT_ACTIVE');
    const current = resolveChannelScope(existing);
    if (
      existing.schemaVersion === 3
      && current.channelMode === channelMode
      && current.channelId === normalizedChannelId
    ) return { config: existing, changed: false };
    const timestamp = now();
    if (!isIsoTimestamp(timestamp)) throw new Error('CLOCK_INVALID');
    const desired = {
      schemaVersion: 3,
      guildId: existing.guildId,
      ownerId: existing.ownerId,
      setupBy: normalizedSetupBy,
      status: 'active',
      features: { mentionChat: true },
      settings: resolvedSettings(existing, { channelMode, channelId: normalizedChannelId }),
      revision: existing.revision + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
    validateConfig(desired, paths.guildId);
    write(paths, desired);
    return { config: desired, changed: true };
  }

  function remove(guildId) {
    const paths = pathsFor(guildId);
    inspectPaths(paths);
    if (!fsImpl.existsSync(paths.file)) return { removed: false };
    get(paths.guildId);
    const entries = fsImpl.readdirSync(paths.directory);
    if (entries.length !== 1 || entries[0] !== 'config.json') throw new Error('GUILD_STORE_INVALID');
    fsImpl.unlinkSync(paths.file);
    fsImpl.rmdirSync(paths.directory);
    return { removed: true };
  }

  return {
    activate,
    countActive,
    get,
    remove,
    setChannelScope,
    setLanguage,
    setReplyStyle,
  };
}

module.exports = {
  CHANNEL_MODES,
  LANGUAGES,
  REPLY_STYLES,
  createGuildConfigStore,
  parsePublicGuildLimit,
  resolveChannelScope,
  resolveLanguage,
  resolveReplyStyle,
  validateConfig,
};
