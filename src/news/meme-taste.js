'use strict';

// Hengs learns which meme templates and situations this server laughs at. Each Hengs-made meme is
// remembered with its message; members' reactions are read between 2 hours and 3 days after posting,
// then frozen into per-template and per-situation totals. Only counts are stored, never user IDs.
// ponytail: a small JSON file rewritten on each change; fine for 5 memes a day, move into the news
// store if this ever needs migrations.
const fs = require('node:fs');
const path = require('node:path');

const HOUR = 3_600_000;
const SETTLE_MS = 2 * HOUR;
const WINDOW_MS = 72 * HOUR;
const MAX_PENDING = 50;
const MAX_KEYS = 200;
// Hengs adds these under every meme so members can vote with one tap; the meh face counts against.
const MEME_REACTIONS = Object.freeze(['😂', '😐', '💀']);
const MEH = '😐';

// Every reaction except the one Hengs itself added; meh faces subtract, never below zero.
function memberReactions(message) {
  const cache = message?.reactions?.cache;
  if (!cache || typeof cache.values !== 'function') return null;
  let total = 0;
  for (const reaction of cache.values()) {
    const members = Math.max(0, Number(reaction?.count || 0) - (reaction?.me ? 1 : 0));
    total += reaction?.emoji?.name === MEH ? -members : members;
  }
  return Math.max(0, total);
}

const emptyGuild = () => ({ pending: [], templates: {}, situations: {} });

function createMemeTaste({ filePath = path.join(__dirname, '..', '..', 'data', 'meme-taste.json'), now = Date.now, fsImpl = fs } = {}) {
  // A missing or broken file reads as "no taste yet": learning must never stop a meme.
  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (data?.version === 1 && data.guilds && typeof data.guilds === 'object' && !Array.isArray(data.guilds)) return data;
    } catch { /* fall through */ }
    return { version: 1, guilds: {} };
  }
  function write(state) {
    const temp = `${filePath}.${process.pid}.tmp`;
    fsImpl.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fsImpl.renameSync(temp, filePath);
  }
  function add(totals, key, reactions) {
    if (!key || (!totals[key] && Object.keys(totals).length >= MAX_KEYS)) return;
    const row = totals[key] || (totals[key] = { posts: 0, reactions: 0 });
    row.posts += 1;
    row.reactions += reactions;
  }
  // Reactions per post, pulled towards the server average so one lucky post does not dominate.
  function scores(guild, key, pick) {
    const totals = new Map(Object.entries(guild[key]).map(([name, row]) => [name, { ...row }]));
    for (const post of guild.pending.filter(item => now() - item.at >= SETTLE_MS)) {
      const name = pick(post);
      if (!name) continue;
      const row = totals.get(name) || { posts: 0, reactions: 0 };
      totals.set(name, { posts: row.posts + 1, reactions: row.reactions + post.reactions });
    }
    const rows = [...totals.values()];
    const posts = rows.reduce((sum, row) => sum + row.posts, 0);
    const mean = posts ? rows.reduce((sum, row) => sum + row.reactions, 0) / posts : 0;
    return new Map([...totals].map(([name, row]) => [name, (row.reactions + mean) / (row.posts + 1)]));
  }
  return {
    filePath,
    remember(guildId, { messageId, channelId, template, situation } = {}) {
      if (!guildId || !messageId || !channelId || !template) return;
      const state = read();
      const guild = state.guilds[guildId] || (state.guilds[guildId] = emptyGuild());
      guild.pending = [...guild.pending, { messageId: String(messageId), channelId: String(channelId), template: String(template),
        situation: String(situation || '').slice(0, 120), at: now(), reactions: 0 }].slice(-MAX_PENDING);
      write(state);
    },
    async refresh(guildId, countReactions) {
      const state = read();
      const guild = state.guilds[guildId];
      if (!guild?.pending?.length) return;
      const keep = [];
      for (const post of guild.pending) {
        const age = now() - post.at;
        if (age >= WINDOW_MS) {
          add(guild.templates, post.template, post.reactions);
          add(guild.situations, post.situation, post.reactions);
          continue;
        }
        if (age >= SETTLE_MS) {
          try {
            const count = await countReactions(post);
            if (Number.isInteger(count) && count >= 0) post.reactions = count;
          } catch { /* keep the last count; a later refresh tries again */ }
        }
        keep.push(post);
      }
      guild.pending = keep;
      write(state);
    },
    weights(guildId) {
      const guild = read().guilds[guildId] || emptyGuild();
      return { templates: scores(guild, 'templates', post => post.template), situations: scores(guild, 'situations', post => post.situation) };
    },
  };
}

module.exports = { createMemeTaste, memberReactions, MEME_REACTIONS, SETTLE_MS, WINDOW_MS };
