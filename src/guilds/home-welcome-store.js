'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const MAX_COPY_LENGTH = 180;
const SNOWFLAKE = /^\d{17,20}$/;
const KEYS = ['guildId', 'schemaVersion', 'updatedAt', 'welcomeCopy'];
const BLOCKED = /(?:@|https?:\/\/|discord\.gg|```|[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069])/iu;

function assertGuildId(value) {
  const guildId = String(value || '').trim();
  if (!SNOWFLAKE.test(guildId)) throw new Error('HOME_WELCOME_GUILD_INVALID');
  return guildId;
}

function normalizeWelcomeCopy(value) {
  if (typeof value !== 'string') throw new Error('HOME_WELCOME_COPY_INVALID');
  if (/[\r\n\t]/u.test(value)) throw new Error('HOME_WELCOME_COPY_INVALID');
  const copy = value.replace(/[\u2013\u2014]/g, '-').trim();
  if (!copy || copy.length > MAX_COPY_LENGTH || BLOCKED.test(copy)) {
    throw new Error('HOME_WELCOME_COPY_INVALID');
  }
  return copy;
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validate(value, expectedGuildId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('HOME_WELCOME_STATE_INVALID');
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(KEYS.slice().sort())) {
    throw new Error('HOME_WELCOME_STATE_INVALID');
  }
  if (value.schemaVersion !== SCHEMA_VERSION || value.guildId !== expectedGuildId
    || !isIsoTimestamp(value.updatedAt)) {
    throw new Error('HOME_WELCOME_STATE_INVALID');
  }
  normalizeWelcomeCopy(value.welcomeCopy);
  return value;
}

function createHomeWelcomeStore({
  filePath = path.join(process.cwd(), 'data', 'home-welcome.json'),
  fsImpl = fs,
  now = () => new Date().toISOString(),
} = {}) {
  const target = path.resolve(filePath);

  function ensureParent() {
    fsImpl.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  }

  function get(guildId) {
    const normalizedGuildId = assertGuildId(guildId);
    if (!fsImpl.existsSync(target)) return null;
    const stat = fsImpl.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024) {
      throw new Error('HOME_WELCOME_STATE_INVALID');
    }
    let value;
    try {
      value = JSON.parse(fsImpl.readFileSync(target, 'utf8'));
    } catch {
      throw new Error('HOME_WELCOME_STATE_INVALID');
    }
    return validate(value, normalizedGuildId);
  }

  function set({ guildId, welcomeCopy }) {
    const normalizedGuildId = assertGuildId(guildId);
    const copy = normalizeWelcomeCopy(welcomeCopy);
    const timestamp = now();
    if (!isIsoTimestamp(timestamp)) throw new Error('HOME_WELCOME_CLOCK_INVALID');
    const value = validate({
      guildId: normalizedGuildId,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: timestamp,
      welcomeCopy: copy,
    }, normalizedGuildId);
    ensureParent();
    const temporary = `${target}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    let descriptor;
    try {
      descriptor = fsImpl.openSync(temporary, 'wx', 0o600);
      fsImpl.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fsImpl.fsyncSync(descriptor);
      fsImpl.closeSync(descriptor);
      descriptor = undefined;
      fsImpl.renameSync(temporary, target);
      return value;
    } finally {
      if (descriptor !== undefined) fsImpl.closeSync(descriptor);
      if (fsImpl.existsSync(temporary)) fsImpl.rmSync(temporary, { force: true });
    }
  }

  function clear({ guildId }) {
    const normalizedGuildId = assertGuildId(guildId);
    if (!fsImpl.existsSync(target)) return { removed: false };
    const stat = fsImpl.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024) {
      throw new Error('HOME_WELCOME_STATE_INVALID');
    }
    let value;
    try {
      value = JSON.parse(fsImpl.readFileSync(target, 'utf8'));
    } catch {
      throw new Error('HOME_WELCOME_STATE_INVALID');
    }
    validate(value, normalizedGuildId);
    fsImpl.unlinkSync(target);
    return { removed: true };
  }

  return { clear, get, set };
}

module.exports = {
  MAX_COPY_LENGTH,
  SCHEMA_VERSION,
  createHomeWelcomeStore,
  normalizeWelcomeCopy,
  validateHomeWelcomeState: validate,
};
