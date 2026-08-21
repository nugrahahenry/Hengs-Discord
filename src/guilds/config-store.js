const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNOWFLAKE = /^\d{17,20}$/;
const CONFIG_KEYS = [
  'createdAt', 'features', 'guildId', 'ownerId',
  'revision', 'schemaVersion', 'setupBy', 'status', 'updatedAt',
];
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
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(CONFIG_KEYS)) {
    throw new Error('GUILD_CONFIG_INVALID');
  }
  if (value.schemaVersion !== 1 || value.status !== 'active') throw new Error('GUILD_CONFIG_INVALID');
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
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error('GUILD_CONFIG_INVALID');
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    throw new Error('GUILD_CONFIG_INVALID');
  }
  if (Date.parse(value.createdAt) > Date.parse(value.updatedAt)) throw new Error('GUILD_CONFIG_INVALID');
  return value;
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
      schemaVersion: 1,
      guildId: paths.guildId,
      ownerId: normalizedOwner,
      setupBy: normalizedSetupBy,
      status: 'active',
      features: { mentionChat: true },
      revision: existing ? existing.revision : 1,
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: existing ? existing.updatedAt : timestamp,
    };
    const unchanged = existing
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

  return { activate, countActive, get, remove };
}

module.exports = { createGuildConfigStore, parsePublicGuildLimit, validateConfig };
