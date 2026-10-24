'use strict';

// Hengs Coach memory per guild: the team's current practice target (/scrim target) and the WIB day of the last debrief
// nudge. Its own small file next to scrim-games.json, strict like the notebook: a broken file fails closed.
// ponytail: one small JSON file rewritten per change; fine for a few targets a week.
const fs = require('node:fs');
const path = require('node:path');

const MAX_GUILDS = 20;
const MAX_TARGET = 120;
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join(',') === keys.split(' ').sort().join(',');
const validTarget = value => value === null || (exact(value, 'text setBy at') && typeof value.text === 'string'
  && value.text.trim().length > 0 && value.text.length <= MAX_TARGET && !/[\x00-\x1f\x7f<>@]/.test(value.text)
  && snowflake(value.setBy) && Number.isSafeInteger(value.at) && value.at > 0);

function validateState(value) {
  if (!exact(value, 'schemaVersion guilds') || value.schemaVersion !== 1 || !Array.isArray(value.guilds)
    || value.guilds.length > MAX_GUILDS) throw new Error('COACH_STATE_INVALID');
  const ids = new Set();
  for (const row of value.guilds) {
    if (!exact(row, 'guildId target debriefDay') || !snowflake(row.guildId) || ids.has(row.guildId) || !validTarget(row.target)
      || !(row.debriefDay === null || Number.isSafeInteger(row.debriefDay))) throw new Error('COACH_STATE_INVALID');
    ids.add(row.guildId);
  }
  return value;
}

function createCoachStore({ filePath = path.join(__dirname, '..', '..', 'data', 'scrim-coach.json'), fsImpl = fs } = {}) {
  function read() {
    let raw;
    try { raw = fsImpl.readFileSync(filePath, 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 1, guilds: [] };
      throw new Error('COACH_STATE_READ_FAILED');
    }
    try { return validateState(JSON.parse(raw)); } catch { throw new Error('COACH_STATE_INVALID'); }
  }
  function update(guildId, change) {
    if (!snowflake(guildId)) throw new Error('COACH_STATE_INVALID');
    const state = read();
    let row = state.guilds.find(item => item.guildId === guildId);
    if (!row) {
      if (state.guilds.length >= MAX_GUILDS) throw new Error('COACH_GUILD_LIMIT');
      row = { guildId, target: null, debriefDay: null };
      state.guilds.push(row);
    }
    change(row);
    const content = JSON.stringify(validateState(state));
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temp = `${filePath}.${process.pid}.tmp`;
    fsImpl.writeFileSync(temp, content, { mode: 0o600 });
    fsImpl.renameSync(temp, filePath);
  }
  return {
    get(guildId) {
      const row = read().guilds.find(item => item.guildId === guildId);
      return { target: row?.target ?? null, debriefDay: row?.debriefDay ?? null };
    },
    setTarget(guildId, target) { update(guildId, row => { row.target = target; }); },
    markDebrief(guildId, day) { update(guildId, row => { row.debriefDay = day; }); },
  };
}

module.exports = { MAX_TARGET, createCoachStore };
