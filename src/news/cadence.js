'use strict';

const { wibClock } = require('./store');
const GAP = 60 * 60_000; // minimum spacing between two sends of the same kind
const CADENCE = 2 * GAP; // one slot window every two hours
const PLAN = Object.freeze({ news: { time: 'time', count: 'count' }, meme: { time: 'memeTime', count: 'memeCount' } });
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// Windows belong to their starting WIB day. A late restart never catches up old slots.
function dueSlot(row, now, kind = 'news') {
  const clock = wibClock(now);
  const plan = PLAN[kind];
  const slot = Math.floor((minutes(clock.time) - minutes(row.settings[plan.time])) / (CADENCE / 60_000));
  if (slot < 0 || slot >= row.settings[plan.count]) return null;
  const same = row.receipts.filter(x => (x.kind || 'news') === kind);
  if (same.some(x => x.day === clock.day && (x.slot === -1 || x.slot === slot))) return null;
  if (same.some(x => now - x.at < GAP)) return null;
  return { day: clock.day, slot, kind };
}

function scheduleTimes(settings, kind = 'news') {
  const plan = PLAN[kind];
  return Array.from({ length: settings[plan.count] }, (_, slot) => minutes(settings[plan.time]) + slot * (CADENCE / 60_000))
    .filter(value => value < 1440)
    .map(value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
}

module.exports = { GAP, CADENCE, dueSlot, scheduleTimes };
