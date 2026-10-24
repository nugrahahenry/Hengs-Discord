'use strict';

// Hengs Analis state: the last parsed Liquipedia pages and, per guild, which series cards were claimed or sent, plus
// the match-day claims (previews, recaps), member predictions and discovered stage pages. A claim is written before the
// Discord send, so an uncertain send is never repeated.
// ponytail: one small JSON file rewritten per change; fine for a few cards a day.
const fs = require('node:fs');
const path = require('node:path');

const KEEP_MS = 30 * 86_400_000;
const VOTE_KEEP_MS = 7 * 86_400_000;

function createEsportsStore({ filePath = path.join(__dirname, '..', '..', 'data', 'esports-state.json'), now = Date.now,
  fsImpl = fs } = {}) {
  function read() {
    try {
      const data = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (data?.version === 1 && data.pages && data.guilds) return { guides: {}, daily: {}, votes: {}, discovered: [], lastDiscovery: 0, ...data };
    } catch { /* missing or broken: start empty */ }
    return { version: 1, pages: {}, lastCheck: 0, guilds: {}, guides: {}, daily: {}, votes: {}, discovered: [], lastDiscovery: 0 };
  }
  function write(state) {
    for (const posts of Object.values(state.guilds)) {
      for (const [id, post] of Object.entries(posts)) if (now() - post.at > KEEP_MS) delete posts[id];
    }
    for (const claims of Object.values(state.daily)) {
      for (const [key, claim] of Object.entries(claims)) if (now() - claim.at > KEEP_MS) delete claims[key];
    }
    // Votes go 7 days after their event recap, and in any case 30 days after the last vote.
    for (const [guildId, matches] of Object.entries(state.votes)) {
      for (const [id, entry] of Object.entries(matches)) {
        const recap = entry.event && state.daily[guildId]?.[`event:${entry.event}`];
        if ((recap && now() - recap.at > VOTE_KEEP_MS) || now() - entry.at > KEEP_MS) delete matches[id];
      }
    }
    const temp = `${filePath}.${process.pid}.tmp`;
    fsImpl.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fsImpl.renameSync(temp, filePath);
  }
  function change(guildId, fn) {
    const state = read();
    const posts = state.guilds[guildId] || (state.guilds[guildId] = {});
    fn(posts);
    write(state);
  }
  return {
    filePath,
    pages: () => read().pages,
    lastCheck: () => read().lastCheck || 0,
    savePages(pages, checkedAt) {
      const state = read();
      state.pages = pages; state.lastCheck = checkedAt;
      write(state);
    },
    guide: guildId => read().guides[guildId] || null,
    setGuide(guildId, messageId) {
      const state = read();
      state.guides[guildId] = messageId;
      write(state);
    },
    post: (guildId, id) => read().guilds[guildId]?.[id] || null,
    claim(guildId, id, { hash }) {
      change(guildId, posts => {
        if (posts[id]) throw new Error('ESPORTS_ALREADY_CLAIMED');
        posts[id] = { status: 'claimed', hash, messageId: null, channelId: null, at: now(), reported: false };
      });
    },
    finish(guildId, id, { status, messageId = null, channelId = null }) {
      change(guildId, posts => { if (posts[id]) Object.assign(posts[id], { status, messageId, channelId }); });
    },
    update(guildId, id, patch) {
      change(guildId, posts => { if (posts[id]) Object.assign(posts[id], patch); });
    },
    daily: (guildId, key) => read().daily[guildId]?.[key] || null,
    claimDaily(guildId, key, extra = {}) {
      const state = read();
      const claims = state.daily[guildId] || (state.daily[guildId] = {});
      if (claims[key]) throw new Error('ESPORTS_ALREADY_CLAIMED');
      claims[key] = { at: now(), messageIds: [], ...extra };
      write(state);
    },
    updateDaily(guildId, key, patch) {
      const state = read();
      const claim = state.daily[guildId]?.[key];
      if (claim) { Object.assign(claim, patch); write(state); }
    },
    vote(guildId, matchId, userId, team, event) {
      const state = read();
      const matches = state.votes[guildId] || (state.votes[guildId] = {});
      const entry = matches[matchId] || (matches[matchId] = { event: event || null, users: {}, at: now() });
      entry.users[userId] = team; entry.at = now();
      write(state);
    },
    votes: (guildId, matchId) => read().votes[guildId]?.[matchId]?.users || {},
    allVotes: guildId => Object.fromEntries(Object.entries(read().votes[guildId] || {}).map(([id, entry]) => [id, entry.users])),
    discovered: () => read().discovered,
    lastDiscovery: () => read().lastDiscovery || 0,
    saveDiscovered(entries, at) {
      const state = read();
      state.discovered = [...state.discovered, ...entries]; state.lastDiscovery = at;
      write(state);
    },
    recent(guildId, windowMs) {
      return Object.entries(read().guilds[guildId] || {})
        .filter(([, post]) => post.status === 'sent' && now() - post.at <= windowMs).map(([id, post]) => ({ id, ...post }));
    },
  };
}

module.exports = { createEsportsStore };
