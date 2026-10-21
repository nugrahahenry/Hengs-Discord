'use strict';

// Scrim notebook: one row per MLBB game logged through Hengs, read by /scrim rekap and /scrim statku.
// Its own file: the v1.64 per-series scrim-results.json is left untouched, so rollback stays safe.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 2 * 1024 * 1024;
// ponytail: newest 500 games per guild (roughly 3-6 months), oldest dropped; move to a database for full seasons.
const MAX_GAMES = 500;
const MAX_GUILDS = 20;
const MAX_LINEUP = 5;
const OUTCOMES = Object.freeze(['menang', 'kalah']);
const REASONS = Object.freeze(['early', 'objective', 'teamfight', 'draft', 'lainnya']);
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const epoch = value => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f<>@]/.test(value);

// A win has no reason; a loss always has one. The lineup holds up to five unique team member IDs.
function validGame(value) {
  return exact(value, 'messageId at submitterId opponent outcome reason lineup note')
    && snowflake(value.messageId) && epoch(value.at) && snowflake(value.submitterId)
    && text(value.opponent, 60) && value.opponent.trim().length > 0 && OUTCOMES.includes(value.outcome)
    && (value.outcome === 'menang' ? value.reason === null : REASONS.includes(value.reason))
    && Array.isArray(value.lineup) && value.lineup.length <= MAX_LINEUP && value.lineup.every(snowflake)
    && new Set(value.lineup).size === value.lineup.length && text(value.note, 300);
}

function validateState(value) {
  if (!exact(value, 'schemaVersion guilds') || value.schemaVersion !== 1
    || !Array.isArray(value.guilds) || value.guilds.length > MAX_GUILDS) throw new Error('SCRIM_STATE_INVALID');
  const ids = new Set();
  for (const row of value.guilds) {
    if (!exact(row, 'guildId games') || !snowflake(row.guildId) || ids.has(row.guildId)
      || !Array.isArray(row.games) || row.games.length > MAX_GAMES
      || !row.games.every(validGame)
      || new Set(row.games.map(item => item.messageId)).size !== row.games.length) throw new Error('SCRIM_STATE_INVALID');
    ids.add(row.guildId);
  }
  return value;
}

function createScrimStore({ filePath = path.join(__dirname, '..', '..', 'data', 'scrim-games.json'), fsImpl = fs } = {}) {
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
    list(guildId) { return structuredClone(read().guilds.find(row => row.guildId === guildId)?.games || []); },
    add(guildId, game) {
      if (!snowflake(guildId) || !validGame(game)) throw new Error('SCRIM_RESULT_INVALID');
      const state = read();
      let row = state.guilds.find(item => item.guildId === guildId);
      if (!row) {
        if (state.guilds.length >= MAX_GUILDS) throw new Error('SCRIM_GUILD_LIMIT');
        row = { guildId, games: [] };
        state.guilds.push(row);
      }
      if (row.games.some(item => item.messageId === game.messageId)) throw new Error('SCRIM_RESULT_DUPLICATE');
      row.games = [...row.games, structuredClone(game)].slice(-MAX_GAMES);
      write(state);
    },
  };
}

module.exports = { OUTCOMES, REASONS, MAX_GAMES, MAX_LINEUP, validGame, validateState, createScrimStore };
