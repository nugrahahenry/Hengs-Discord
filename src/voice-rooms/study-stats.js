'use strict';

// Focus seconds per member per WIB week for the Rajin Belajar board, which boards went out, and who holds the role.
// Only Discord ids and seconds; 12 weeks kept. ponytail: one small JSON file rewritten per credit event, fine for one
// server's study rooms.
const fs = require('node:fs');
const path = require('node:path');

const WIB = 7 * 3_600_000; const DAY = 86_400_000; const KEEP_WEEKS = 12;

// The Monday (YYYY-MM-DD, WIB) of the week `at` falls in.
function weekOf(at) {
  const day = new Date(at + WIB);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - ((day.getUTCDay() + 6) % 7) * DAY)
    .toISOString().slice(0, 10);
}

function createStudyStats({ filePath = path.join(__dirname, '..', '..', 'data', 'study-stats.json'), fsImpl = fs, now = Date.now } = {}) {
  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (data?.version === 1 && data.weeks && data.boards && data.roles) return data;
    } catch { /* missing or broken: start empty */ }
    return { version: 1, weeks: {}, boards: {}, roles: {} };
  }
  function write(state) {
    const cutoff = weekOf(now() - (KEEP_WEEKS - 1) * 7 * DAY);
    for (const week of Object.keys(state.weeks)) if (week < cutoff) delete state.weeks[week];
    for (const boards of Object.values(state.boards)) for (const week of Object.keys(boards)) if (week < cutoff) delete boards[week];
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fsImpl.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fsImpl.renameSync(temp, filePath);
  }
  return {
    filePath,
    // credits: { userId: seconds }; one write per event.
    add(guildId, credits, at) {
      const given = Object.entries(credits).filter(([, seconds]) => seconds > 0);
      if (!given.length) return;
      const state = read(); const week = weekOf(at);
      const totals = ((state.weeks[week] ||= {})[guildId] ||= {});
      for (const [user, seconds] of given) totals[user] = (totals[user] || 0) + seconds;
      write(state);
    },
    week: (guildId, monday) => ({ ...read().weeks[monday]?.[guildId] }),
    claimBoard(guildId, monday) {
      const state = read();
      if (state.boards[guildId]?.[monday]) return false;
      (state.boards[guildId] ||= {})[monday] = true;
      write(state);
      return true;
    },
    role: guildId => read().roles[guildId] || null,
    setRole(guildId, value) { const state = read(); state.roles[guildId] = value; write(state); },
  };
}

module.exports = { weekOf, createStudyStats };
