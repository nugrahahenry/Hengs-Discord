'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TOPICS = Object.freeze(['tech', 'ai', 'gaming', 'memes']);
const DAY = 86_400_000;
const MAX_BYTES = 2 * 1024 * 1024;
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const epoch = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');

function validSettings(value) {
  return exact(value, 'channelId topics time count tone') && snowflake(value.channelId)
    && Array.isArray(value.topics) && value.topics.length >= 1 && value.topics.length <= 4
    && new Set(value.topics).size === value.topics.length && value.topics.every(x => TOPICS.includes(x))
    && typeof value.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    && Number.isInteger(value.count) && value.count >= 1 && value.count <= 3
    && ['casual', 'neutral'].includes(value.tone);
}

function validateState(value) {
  if (!exact(value, 'schemaVersion guilds') || ![1, 2].includes(value.schemaVersion)
    || !Array.isArray(value.guilds) || value.guilds.length > 100) throw new Error('NEWS_STATE_INVALID');
  const ids = new Set();
  for (const row of value.guilds) {
    if (!exact(row, 'guildId revision settings enabled tested updatedAt receipts seen')
      || !snowflake(row.guildId) || ids.has(row.guildId) || !validSettings(row.settings)
      || !Number.isSafeInteger(row.revision) || row.revision < 1 || !epoch(row.updatedAt)
      || typeof row.enabled !== 'boolean' || typeof row.tested !== 'boolean'
      || (row.enabled && !row.tested) || !Array.isArray(row.receipts) || row.receipts.length > (value.schemaVersion === 1 ? 31 : 93)
      || !Array.isArray(row.seen) || row.seen.length > 90) throw new Error('NEWS_STATE_INVALID');
    ids.add(row.guildId);
    const dates = new Set();
    for (const receipt of row.receipts) {
      const key = value.schemaVersion === 1 ? receipt.day : `${receipt.day}:${receipt.slot}`;
      if (!exact(receipt, value.schemaVersion === 1 ? 'day status at hashes' : 'day status at hashes slot publisher') || typeof receipt.day !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.day) || dates.has(key)
        || !['claimed', 'sent', 'empty', 'failed', 'cancelled'].includes(receipt.status)
        || !epoch(receipt.at) || !Array.isArray(receipt.hashes) || receipt.hashes.length > 3
        || !receipt.hashes.every(hash)) throw new Error('NEWS_STATE_INVALID');
      if (value.schemaVersion === 2 && (!Number.isInteger(receipt.slot) || receipt.slot < -1 || receipt.slot > 2
        || !(receipt.publisher === null || (typeof receipt.publisher === 'string' && /^[a-z0-9-]{1,64}$/.test(receipt.publisher)))
        || (receipt.slot >= 0 && receipt.hashes.length > 1))) throw new Error('NEWS_STATE_INVALID');
      dates.add(key);
    }
    if (value.schemaVersion === 2 && row.receipts.some(x => x.slot === -1
      && row.receipts.some(y => y.day === x.day && y.slot !== -1))) throw new Error('NEWS_STATE_INVALID');
    if (row.seen.some(item => !exact(item, 'hash at') || !hash(item.hash) || !epoch(item.at))) {
      throw new Error('NEWS_STATE_INVALID');
    }
  }
  return value;
}

function upgradeState(value) {
  const copy = structuredClone(validateState(value));
  if (copy.schemaVersion === 1) {
    copy.schemaVersion = 2;
    for (const row of copy.guilds) for (const receipt of row.receipts) Object.assign(receipt, { slot: -1, publisher: null });
  }
  return validateState(copy);
}

// Explicit rollback adapter: conservatively consume each affected day, never erase delivery proof.
function downgradeState(value) {
  const copy = upgradeState(value);
  for (const row of copy.guilds) {
    const days = new Map();
    for (const receipt of row.receipts) {
      const old = days.get(receipt.day);
      days.set(receipt.day, { day: receipt.day, status: 'cancelled', at: Math.max(old?.at || 0, receipt.at),
        hashes: [...new Set([...(old?.hashes || []), ...receipt.hashes])].slice(0, 3) });
    }
    row.receipts = [...days.values()].slice(-31);
  }
  copy.schemaVersion = 1;
  return validateState(copy);
}

function createNewsStore({ filePath = path.join(__dirname, '..', '..', 'data', 'news-state.json'),
  fsImpl = fs, now = Date.now } = {}) {
  function read() {
    let stat;
    try { stat = fsImpl.lstatSync(filePath); } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 2, guilds: [] };
      throw new Error('NEWS_STATE_READ_FAILED');
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('NEWS_STATE_INVALID');
    try { return upgradeState(JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))); }
    catch { throw new Error('NEWS_STATE_INVALID'); }
  }
  function write(value) {
    const content = JSON.stringify(validateState(value));
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('NEWS_STATE_LIMIT');
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.tmp-${crypto.randomBytes(8).toString('hex')}`;
    let fd;
    try {
      fd = fsImpl.openSync(temporary, 'wx', 0o600);
      fsImpl.writeFileSync(fd, content, 'utf8');
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd); fd = undefined;
      fsImpl.renameSync(temporary, filePath);
    } finally {
      if (fd !== undefined) fsImpl.closeSync(fd);
      if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary);
    }
  }
  function change(guildId, revision, fn) {
    if (!snowflake(guildId)) throw new Error('NEWS_GUILD_INVALID');
    const state = read();
    let row = state.guilds.find(item => item.guildId === guildId);
    if ((row?.revision || 0) !== revision) throw new Error('NEWS_PREVIEW_STALE');
    if (!row) {
      if (state.guilds.length >= 100) throw new Error('NEWS_GUILD_LIMIT');
      row = { guildId, revision: 0, enabled: false, tested: false, receipts: [], seen: [] };
      state.guilds.push(row);
    }
    fn(row);
    row.revision += 1; row.updatedAt = now();
    row.receipts = row.receipts.filter(x => now() - x.at < 30 * DAY).slice(-93);
    row.seen = row.seen.filter(x => now() - x.at < 30 * DAY).slice(-90);
    write(state);
    return structuredClone(row);
  }
  return {
    list: () => read().guilds,
    get: guildId => read().guilds.find(row => row.guildId === guildId) || null,
    save(guildId, revision, settings) {
      if (!validSettings(settings)) throw new Error('NEWS_SETTINGS_INVALID');
      return change(guildId, revision, row => {
        row.settings = structuredClone(settings); row.enabled = false; row.tested = false;
      });
    },
    revise(guildId, revision, settings) {
      if (!validSettings(settings)) throw new Error('NEWS_SETTINGS_INVALID');
      return change(guildId, revision, row => {
        // Delivery proof belongs to the destination, not its editorial preferences.
        if (!row.tested || row.settings?.channelId !== settings.channelId) throw new Error('NEWS_TEST_REQUIRED');
        row.settings = structuredClone(settings);
      });
    },
    pause(guildId) {
      const row = this.get(guildId);
      if (!row) return null;
      return change(guildId, row.revision, item => { item.enabled = false; });
    },
    enable(guildId, revision) {
      return change(guildId, revision, row => {
        if (!row.tested) throw new Error('NEWS_TEST_REQUIRED');
        row.enabled = true;
      });
    },
    claim(guildId, revision, day, hashes, status = 'claimed', slot = -1, publisher = null) {
      return change(guildId, revision, row => {
        if (row.receipts.some(x => x.day === day && (slot === -1 || x.slot === -1 || x.slot === slot))) throw new Error('NEWS_DAY_USED');
        if (row.receipts.some(x => now() - x.at < 3_600_000)) throw new Error('NEWS_GAP_REQUIRED');
        row.receipts.push({ day, status, at: now(), hashes, slot, publisher });
        row.seen.push(...hashes.map(value => ({ hash: value, at: now() })));
      });
    },
    finish(guildId, revision, day, status, slot = -1) {
      return change(guildId, revision, row => {
        const receipt = row.receipts.find(x => x.day === day && x.slot === slot && x.status === 'claimed');
        if (!receipt) throw new Error('NEWS_RECEIPT_INVALID');
        receipt.status = status;
        receipt.at = now();
        if (status === 'sent') row.tested = true;
      });
    },
  };
}

function wibClock(nowMs) {
  const iso = new Date(nowMs + 7 * 60 * 60 * 1000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

module.exports = { TOPICS, DAY, MAX_BYTES, snowflake, validSettings, validateState, upgradeState, downgradeState, createNewsStore, wibClock };
