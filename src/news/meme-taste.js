'use strict';

// Hengs learns which meme templates and situations this server laughs at (shared reaction taste in ./taste, file format
// unchanged): reactions are read between 2 hours and 3 days after posting, then frozen into per-template and
// per-situation totals. Only counts are stored, never user IDs.
const path = require('node:path');
const { createReactionTaste, memberReactions: count, SETTLE_MS, WINDOW_MS } = require('./taste');

// Hengs adds these under every meme so members can vote with one tap; the meh face counts against.
const MEME_REACTIONS = Object.freeze(['😂', '😐', '💀']);
const MEH = '😐';

const memberReactions = message => count(message, MEH);

// weights() keeps its name for the meme maker but now returns liked keys only: at least 3 settled memes, net +2 and above
// the server average (2026-10-31).
function createMemeTaste({ filePath = path.join(__dirname, '..', '..', 'data', 'meme-taste.json'), now, fsImpl } = {}) {
  const taste = createReactionTaste({ filePath, fields: ['template', 'situation'], evidence: { posts: 3, net: 2 }, now, fsImpl });
  return { ...taste, weights: guildId => taste.liked(guildId) };
}

module.exports = { createMemeTaste, memberReactions, MEME_REACTIONS, SETTLE_MS, WINDOW_MS };
