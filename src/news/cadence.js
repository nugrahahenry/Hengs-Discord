'use strict';

const { wibClock } = require('./store');
const GAP = 60 * 60_000;
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// Windows belong to their starting WIB day. A late restart never catches up old slots.
function dueSlot(row, now) {
  const clock = wibClock(now);
  const delta = minutes(clock.time) - minutes(row.settings.time);
  const slot = Math.floor(delta / 60);
  if (slot < 0 || slot >= row.settings.count) return null;
  if (row.receipts.some(x => x.day === clock.day && (x.slot === -1 || x.slot === slot))) return null;
  if (row.receipts.some(x => now - x.at < GAP)) return null;
  return { day: clock.day, slot };
}

function slotSettings(settings, slot) {
  const mixed = settings.topics.includes('memes') && settings.topics.some(x => x !== 'memes') && settings.count >= 2;
  const topics = mixed ? (slot === settings.count - 1 ? ['memes'] : settings.topics.filter(x => x !== 'memes')) : settings.topics;
  return { ...settings, topics, count: 1 };
}

function scheduleTimes(settings) {
  return Array.from({ length: settings.count }, (_, slot) => minutes(settings.time) + slot * 60)
    .filter(value => value < 1440)
    .map(value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
}

module.exports = { GAP, dueSlot, slotSettings, scheduleTimes };
