'use strict';

// Appreciation details Hengs already has while it asks for the rest (tournament, date, players). In memory for 15
// minutes and bound to the requester; after a restart the Lengkapi form simply opens empty.
const crypto = require('node:crypto');

const TTL = 15 * 60_000;
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

module.exports = { remember, recall, forget };
