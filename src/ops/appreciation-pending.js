'use strict';

// Appreciation details Hengs already has while it asks for the rest (tournament, date, players). RAM-only for five
// minutes and bound to the requester; after a restart the Lengkapi form simply opens empty.
const crypto = require('node:crypto');

const TTL = 5 * 60_000;
const SWEEP_INTERVAL = 5 * 60_000;
const MAX = 200;
const pending = new Map();

function sweep(now) {
  for (const [key, entry] of pending) if (now >= entry.expires) pending.delete(key);
}

function remember(requesterId, data, now = Date.now()) {
  sweep(now);
  if (pending.size >= MAX) pending.delete(pending.keys().next().value);
  const key = crypto.randomBytes(4).toString('hex');
  pending.set(key, { requesterId, data, expires: now + TTL });
  return key;
}

function recall(key, requesterId, now = Date.now()) {
  sweep(now);
  const entry = pending.get(key);
  return entry && entry.requesterId === requesterId ? entry.data : null;
}

const forget = key => { pending.delete(key); };

const sweepTimer = setInterval(() => sweep(Date.now()), SWEEP_INTERVAL);
sweepTimer.unref?.();

module.exports = { TTL, SWEEP_INTERVAL, remember, recall, forget, sweep };
