'use strict';

// Structured scrim results submitted through Hengs: the data a future coach reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 2 * 1024 * 1024;
// ponytail: newest 500 per guild, oldest dropped; move to a database if the coach needs history.
const MAX_RESULTS = 500;
const MAX_GUILDS = 20;
const GAMES = Object.freeze(['MLBB', 'Valorant', 'Roblox', 'Lainnya']);
const OUTCOMES = Object.freeze(['menang', 'kalah', 'seri']);
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const epoch = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f<>@]/.test(value);

function validResult(value) {
  return exact(value, 'messageId at submitterId game opponent score outcome note')
    && snowflake(value.messageId) && epoch(value.at) && snowflake(value.submitterId)
    && GAMES.includes(value.game) && text(value.opponent, 60) && value.opponent.trim().length > 0
    && Array.isArray(value.score) && value.score.length === 2
    && value.score.every(n => Number.isInteger(n) && n >= 0 && n <= 99)
    && OUTCOMES.includes(value.outcome) && text(value.note, 300);
}

function validateState(value) {
  if (!exact(value, 'schemaVersion guilds') || value.schemaVersion !== 1
    || !Array.isArray(value.guilds) || value.guilds.length > MAX_GUILDS) throw new Error('SCRIM_STATE_INVALID');
  const ids = new Set();
  for (const row of value.guilds) {
    if (!exact(row, 'guildId results') || !snowflake(row.guildId) || ids.has(row.guildId)
      || !Array.isArray(row.results) || row.results.length > MAX_RESULTS
      || !row.results.every(validResult)
      || new Set(row.results.map(item => item.messageId)).size !== row.results.length) throw new Error('SCRIM_STATE_INVALID');
    ids.add(row.guildId);
  }
  return value;
}

function createScrimStore({ filePath = path.join(__dirname, '..', '..', 'data', 'scrim-results.json'), fsImpl = fs } = {}) {
  function read() {
    let stat;
    try { stat = fsImpl.lstatSync(filePath); } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 1, guilds: [] };
      throw new Error('SCRIM_STATE_READ_FAILED');
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('SCRIM_STATE_INVALID');
    try { return validateState(JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))); }
    catch { throw new Error('SCRIM_STATE_INVALID'); }
  }
  function write(value) {
    const content = JSON.stringify(validateState(value));
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('SCRIM_STATE_LIMIT');
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
  return {
    list(guildId) { return structuredClone(read().guilds.find(row => row.guildId === guildId)?.results || []); },
    add(guildId, result) {
      if (!snowflake(guildId) || !validResult(result)) throw new Error('SCRIM_RESULT_INVALID');
      const state = read();
      let row = state.guilds.find(item => item.guildId === guildId);
      if (!row) {
        if (state.guilds.length >= MAX_GUILDS) throw new Error('SCRIM_GUILD_LIMIT');
        row = { guildId, results: [] };
        state.guilds.push(row);
      }
      if (row.results.some(item => item.messageId === result.messageId)) throw new Error('SCRIM_RESULT_DUPLICATE');
      row.results = [...row.results, structuredClone(result)].slice(-MAX_RESULTS);
      write(state);
    },
  };
}

module.exports = { GAMES, OUTCOMES, MAX_RESULTS, validResult, validateState, createScrimStore };
