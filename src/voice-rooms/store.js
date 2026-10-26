'use strict';

// Hengs-made voice rooms that are open now, so a restart can tidy them: owner, type, slot, lock, panel and #mabar post.
// ponytail: one small JSON file rewritten per change; fine for a few rooms at a time.
const fs = require('node:fs');
const path = require('node:path');

function createVoiceRoomStore({ filePath = path.join(__dirname, '..', '..', 'data', 'voice-rooms.json'), fsImpl = fs } = {}) {
  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (data?.version === 1 && data.rooms && typeof data.rooms === 'object') return data;
    } catch { /* missing or broken: start empty */ }
    return { version: 1, rooms: {} };
  }
  function write(state) {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fsImpl.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fsImpl.renameSync(temp, filePath);
  }
  return {
    filePath,
    all: () => read().rooms,
    get: id => read().rooms[id] || null,
    put(id, room) { const state = read(); state.rooms[id] = room; write(state); },
    update(id, patch) {
      const state = read();
      if (state.rooms[id]) { Object.assign(state.rooms[id], patch); write(state); }
    },
    remove(id) { const state = read(); delete state.rooms[id]; write(state); },
  };
}

module.exports = { createVoiceRoomStore };
