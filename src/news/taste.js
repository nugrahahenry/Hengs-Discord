'use strict';

// What this server reacts to, learned from the reactions members add under Hengs posts (memes since v1.66, news since
// 2026-10-31). Each remembered post is read between 2 hours and 3 days after posting, then frozen into totals per key;
// only counts are stored, never user ids. A key counts as liked only with enough posts, a clearly positive net and a
// smoothed score above the server average: zero reactions used to count as liked and kept the first three meme
// templates on repeat (owner report, 2026-10-30).
// ponytail: a small JSON file rewritten on each change; fine for a few posts a day.
const fs = require('node:fs');
const path = require('node:path');

const HOUR = 3_600_000;
const SETTLE_MS = 2 * HOUR;
const WINDOW_MS = 72 * HOUR;
const MAX_PENDING = 50;
const MAX_KEYS = 200;

// Every reaction except the one Hengs itself added; the meh emoji counts against, never below zero.
function memberReactions(message, meh) {
  const cache = message?.reactions?.cache;
  if (!cache || typeof cache.values !== 'function') return null;
  let total = 0;
  for (const reaction of cache.values()) {
    const members = Math.max(0, Number(reaction?.count || 0) - (reaction?.me ? 1 : 0));
    total += reaction?.emoji?.name === meh ? -members : members;
  }
  return Math.max(0, total);
}

// fields: the two post fields totalled, e.g. ['template', 'situation'] (kept as 'templates' and 'situations' in the file).
// evidence: the least posts and net reactions before a key counts as liked.
function createReactionTaste({ filePath, fields, evidence, now = Date.now, fsImpl = fs }) {
  const groups = fields.map(field => `${field}s`);
  const emptyGuild = () => ({ pending: [], ...Object.fromEntries(groups.map(group => [group, {}])) });
  // A missing or broken file reads as "no taste yet": learning must never stop a post.
  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (data?.version === 1 && data.guilds && typeof data.guilds === 'object' && !Array.isArray(data.guilds)) return data;
    } catch { /* fall through */ }
    return { version: 1, guilds: {} };
  }
  function write(state) {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
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
  // Settled pending posts count with their current reactions; frozen totals stay.
  function totalsOf(guild, group, field) {
    const totals = new Map(Object.entries(guild[group] || {}).map(([name, row]) => [name, { ...row }]));
    for (const post of guild.pending.filter(item => now() - item.at >= SETTLE_MS)) {
      const name = post[field];
      if (!name) continue;
      const row = totals.get(name) || { posts: 0, reactions: 0 };
      totals.set(name, { posts: row.posts + 1, reactions: row.reactions + post.reactions });
    }
    return totals;
  }
  // Reactions per post pulled towards the server average, so one lucky post does not dominate; only keys with evidence.
  function liked(guild, group, field) {
    const totals = totalsOf(guild, group, field);
    const rows = [...totals.values()];
    const posts = rows.reduce((sum, row) => sum + row.posts, 0);
    const mean = posts ? rows.reduce((sum, row) => sum + row.reactions, 0) / posts : 0;
    return new Map([...totals]
      .map(([name, row]) => [name, row, (row.reactions + mean) / (row.posts + 1)])
      .filter(([, row, score]) => row.posts >= evidence.posts && row.reactions >= evidence.net && score > mean)
      .map(([name, , score]) => [name, score]));
  }
  return {
    filePath,
    remember(guildId, post = {}) {
      if (!guildId || !post.messageId || !post.channelId || !post[fields[0]]) return;
      const state = read();
      const guild = state.guilds[guildId] || (state.guilds[guildId] = emptyGuild());
      guild.pending = [...guild.pending, { messageId: String(post.messageId), channelId: String(post.channelId),
        ...Object.fromEntries(fields.map(field => [field, String(post[field] || '').slice(0, 120)])), at: now(), reactions: 0 }]
        .slice(-MAX_PENDING);
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
          fields.forEach((field, i) => add(guild[groups[i]] || (guild[groups[i]] = {}), post[field], post.reactions));
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
    // { templates: Map(name -> score), situations: Map } (or the news keys), liked keys only.
    liked(guildId) {
      const guild = { ...emptyGuild(), ...(read().guilds[guildId] || {}) };
      return Object.fromEntries(groups.map((group, i) => [group, liked(guild, group, fields[i])]));
    },
    // The newest values of one field among the posts still pending (about the last 3 days), newest first.
    recent(guildId, field, count) {
      const pending = read().guilds[guildId]?.pending || []; // kept in posting order
      return [...pending].reverse().map(post => post[field]).filter(Boolean).slice(0, count);
    },
  };
}

// News reactions (2026-10-31): 🔥 menarik, 😴 biasa (counts against), totalled per desk and per source.
const NEWS_REACTIONS = Object.freeze(['🔥', '😴']);
const createNewsTaste = ({ filePath = path.join(__dirname, '..', '..', 'data', 'news-taste.json'), now, fsImpl } = {}) =>
  createReactionTaste({ filePath, fields: ['desk', 'source'], evidence: { posts: 5, net: 3 }, now, fsImpl });

module.exports = { createReactionTaste, createNewsTaste, memberReactions, NEWS_REACTIONS, SETTLE_MS, WINDOW_MS };
