'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TOPICS = Object.freeze(['tech', 'ai', 'gaming', 'memes']);
const NEWS_TOPICS = Object.freeze(['tech', 'ai', 'gaming']);
const DEFAULT_TOPICS = Object.freeze(['tech', 'ai']);
const KINDS = Object.freeze(['news', 'meme']);
const STATUSES = Object.freeze(['claimed', 'sent', 'empty', 'failed', 'cancelled']);
const SCHEMA = 4;
const DAY = 86_400_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECEIPTS = Object.freeze({ 1: 31, 2: 93, 3: 93, 4: 341 });
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const epoch = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const clock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');

// v1-v3: one clock, at most three items, memes mixed into topics.
function validLegacySettings(value) {
  return (exact(value, 'channelId topics time count tone') || exact(value, 'channelId memeChannelId topics time count tone')) && snowflake(value.channelId)
    && (value.memeChannelId == null || (snowflake(value.memeChannelId) && value.memeChannelId !== value.channelId))
    && Array.isArray(value.topics) && value.topics.length >= 1 && value.topics.length <= 4
    && new Set(value.topics).size === value.topics.length && value.topics.every(x => TOPICS.includes(x))
    && clock(value.time) && Number.isInteger(value.count) && value.count >= 1 && value.count <= 3
    && ['casual', 'neutral'].includes(value.tone);
}

function validSettings(value) {
  return exact(value, 'channelId memeChannelId topics time count memeTime memeCount tone') && snowflake(value.channelId)
    && (value.memeChannelId === null || (snowflake(value.memeChannelId) && value.memeChannelId !== value.channelId))
    && Array.isArray(value.topics) && value.topics.length >= 1 && value.topics.length <= 3
    && new Set(value.topics).size === value.topics.length && value.topics.every(x => NEWS_TOPICS.includes(x))
    && clock(value.time) && clock(value.memeTime)
    && Number.isInteger(value.count) && value.count >= 1 && value.count <= 5
    && Number.isInteger(value.memeCount) && value.memeCount >= 0 && value.memeCount <= 5
    && ['casual', 'neutral'].includes(value.tone);
}

function validateState(value) {
  if (!exact(value, 'schemaVersion guilds') || ![1, 2, 3, 4].includes(value.schemaVersion)
    || !Array.isArray(value.guilds) || value.guilds.length > 100) throw new Error('NEWS_STATE_INVALID');
  const version = value.schemaVersion;
  const ids = new Set();
  for (const row of value.guilds) {
    if (!exact(row, 'guildId revision settings enabled tested updatedAt receipts seen')
      || !snowflake(row.guildId) || ids.has(row.guildId)
      || !(version === SCHEMA ? validSettings(row.settings) : validLegacySettings(row.settings))
      || !Number.isSafeInteger(row.revision) || row.revision < 1 || !epoch(row.updatedAt)
      || typeof row.enabled !== 'boolean' || typeof row.tested !== 'boolean'
      || (row.enabled && !row.tested) || !Array.isArray(row.receipts) || row.receipts.length > MAX_RECEIPTS[version]
      || !Array.isArray(row.seen) || row.seen.length > (version === SCHEMA ? 330 : 90)) throw new Error('NEWS_STATE_INVALID');
    if ((version === 3 && !exact(row.settings, 'channelId memeChannelId topics time count tone'))
      || (version < 3 && !exact(row.settings, 'channelId topics time count tone'))) throw new Error('NEWS_STATE_INVALID');
    ids.add(row.guildId);
    const keys = new Set();
    for (const receipt of row.receipts) {
      const fields = version === 1 ? 'day status at hashes'
        : version === SCHEMA ? 'day status at hashes slot publisher kind' : 'day status at hashes slot publisher';
      const key = version === 1 ? receipt.day : `${receipt.day}:${receipt.kind || 'news'}:${receipt.slot}`;
      if (!exact(receipt, fields) || typeof receipt.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.day)
        || keys.has(key) || !STATUSES.includes(receipt.status) || !epoch(receipt.at) || !Array.isArray(receipt.hashes)
        || receipt.hashes.length > 3 || !receipt.hashes.every(hash)) throw new Error('NEWS_STATE_INVALID');
      if (version >= 2 && (!Number.isInteger(receipt.slot) || receipt.slot < -1 || receipt.slot > (version === SCHEMA ? 4 : 2)
        || !(receipt.publisher === null || (typeof receipt.publisher === 'string' && /^[a-z0-9-]{1,64}$/.test(receipt.publisher)))
        || (receipt.slot >= 0 && receipt.hashes.length > 1))) throw new Error('NEWS_STATE_INVALID');
      if (version === SCHEMA && (!KINDS.includes(receipt.kind) || (receipt.kind === 'meme' && receipt.slot === -1))) {
        throw new Error('NEWS_STATE_INVALID');
      }
      keys.add(key);
    }
    // A test send (slot -1) closes that day's news slots; memes keep their own slots.
    if (version >= 2 && row.receipts.some(x => x.slot === -1
      && row.receipts.some(y => y.day === x.day && y.slot !== -1 && (y.kind || 'news') === 'news'))) throw new Error('NEWS_STATE_INVALID');
    if (row.seen.some(item => !exact(item, 'hash at') || !hash(item.hash) || !epoch(item.at))) throw new Error('NEWS_STATE_INVALID');
  }
  return value;
}

function upgradeState(value) {
  const copy = structuredClone(validateState(value));
  if (copy.schemaVersion === 1) {
    copy.schemaVersion = 2;
    for (const row of copy.guilds) for (const receipt of row.receipts) Object.assign(receipt, { slot: -1, publisher: null });
  }
  if (copy.schemaVersion === 2) {
    copy.schemaVersion = 3;
    for (const row of copy.guilds) row.settings.memeChannelId = null;
  }
  if (copy.schemaVersion === 3) {
    copy.schemaVersion = SCHEMA;
    for (const row of copy.guilds) {
      const old = row.settings;
      const news = old.topics.filter(topic => topic !== 'memes');
      const memes = old.topics.includes('memes');
      const settings = { channelId: old.channelId, memeChannelId: old.memeChannelId, topics: news.length ? news : [...DEFAULT_TOPICS],
        time: old.time, count: old.count, memeTime: '13:00', memeCount: 0, tone: old.tone };
      if (memes && news.length && old.count >= 2) { settings.count = old.count - 1; settings.memeCount = 1; }
      // A memes-only schedule never sent news; keep it paused until a manager previews the new split.
      if (memes && !news.length) { settings.count = 1; settings.memeCount = old.count; row.enabled = false; }
      row.settings = settings;
      for (const receipt of row.receipts) receipt.kind = receipt.slot !== -1 && receipt.publisher === 'xkcd' ? 'meme' : 'news';
    }
  }
  return validateState(copy);
}

function mergeDays(receipts, slotted) {
  const days = new Map();
  for (const receipt of receipts) {
    const old = days.get(receipt.day);
    days.set(receipt.day, { day: receipt.day, status: 'cancelled', at: Math.max(old?.at || 0, receipt.at),
      hashes: [...new Set([...(old?.hashes || []), ...receipt.hashes])].slice(0, 3), ...(slotted && { slot: -1, publisher: null }) });
  }
  return [...days.values()].slice(-93);
}

// Explicit rollback adapter: conservatively consume each affected day, never erase delivery proof.
function downgradeState(value, version = 1) {
  if (![1, 2, 3].includes(version)) throw new Error('NEWS_ROLLBACK_VERSION_INVALID');
  const copy = upgradeState(value);
  for (const row of copy.guilds) {
    const settings = row.settings;
    // v3 runtimes know one clock and at most three items. Pause rather than send a schedule they cannot follow.
    if (settings.memeCount > 0 || settings.count > 3) row.enabled = false;
    row.settings = { channelId: settings.channelId, memeChannelId: settings.memeChannelId, topics: settings.topics,
      time: settings.time, count: Math.min(settings.count, 3), tone: settings.tone };
    row.receipts = mergeDays(row.receipts, true);
    row.seen = row.seen.slice(-90);
  }
  copy.schemaVersion = 3;
  validateState(copy);
  for (const row of copy.guilds) {
    if (version === 3) continue;
    // Older runtimes cannot enforce split destinations. Pause entertainment on downgrade.
    if (row.settings.topics.includes('memes')) row.enabled = false;
    delete row.settings.memeChannelId;
    if (version === 1) row.receipts = mergeDays(row.receipts, false).slice(-31);
  }
  copy.schemaVersion = version;
  return validateState(copy);
}

function createNewsStore({ filePath = path.join(__dirname, '..', '..', 'data', 'news-state.json'),
  fsImpl = fs, now = Date.now } = {}) {
  function read() {
    let stat;
    try { stat = fsImpl.lstatSync(filePath); } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: SCHEMA, guilds: [] };
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
    row.receipts = row.receipts.filter(x => now() - x.at < 30 * DAY).slice(-MAX_RECEIPTS[SCHEMA]);
    row.seen = row.seen.filter(x => now() - x.at < 30 * DAY).slice(-330);
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
    claim(guildId, revision, day, hashes, status = 'claimed', slot = -1, publisher = null, kind = 'news') {
      return change(guildId, revision, row => {
        const same = row.receipts.filter(x => x.kind === kind);
        if (same.some(x => x.day === day && (slot === -1 || x.slot === -1 || x.slot === slot))) throw new Error('NEWS_DAY_USED');
        if (same.some(x => now() - x.at < 3_600_000)) throw new Error('NEWS_GAP_REQUIRED');
        row.receipts.push({ day, status, at: now(), hashes, slot, publisher, kind });
        row.seen.push(...hashes.map(value => ({ hash: value, at: now() })));
      });
    },
    finish(guildId, revision, day, status, slot = -1, kind = 'news') {
      return change(guildId, revision, row => {
        const receipt = row.receipts.find(x => x.day === day && x.slot === slot && x.kind === kind && x.status === 'claimed');
        if (!receipt) throw new Error('NEWS_RECEIPT_INVALID');
        receipt.status = status;
        receipt.at = now();
        if (status === 'sent' && kind === 'news') row.tested = true;
      });
    },
  };
}

function wibClock(nowMs) {
  const iso = new Date(nowMs + 7 * 60 * 60 * 1000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

module.exports = { TOPICS, NEWS_TOPICS, DAY, MAX_BYTES, SCHEMA, snowflake, validSettings, validateState, upgradeState,
  downgradeState, createNewsStore, wibClock };
