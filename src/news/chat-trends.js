'use strict';

// What the home server talks about (owner request, 2026-10-30: "Topik rame jadi bahan meme"): words used by at least three
// different members in the last 24 hours, counted in memory only. No message text, author or count is written anywhere, a
// restart starts empty, and mentions, links, emoji, member names and sensitive words never count. A quiet server simply
// has no trend and the meme themes carry on.
const { PermissionFlagsBits: P } = require('discord.js');
const { slugOf } = require('../guilds/channel-style');
const { SENSITIVE, keywords } = require('./trending');

const WINDOW = 24 * 3_600_000;
const MIN_AUTHORS = 3;
const MAX_WORDS = 2000;
const NAMES_FOR = 10 * 60_000;
// Owner and team channels never feed jokes, even where @everyone happens to see them.
const EXCLUDED = new Set(['bot-settings', 'bot-logs', 'bot-log', 'bot-status', 'hasil-scrim', 'admin-chat', 'mod-logs']);

function createChatTrends({ now = Date.now } = {}) {
  const words = new Map(); // word -> Map(authorId -> last seen)
  let names = { at: 0, set: new Set() };

  // Text channels everyone can read, minus the owner and team channels.
  function allowed(channel) {
    if (!channel?.guild || typeof channel.isTextBased !== 'function' || !channel.isTextBased() || channel.isThread?.()) return false;
    if (EXCLUDED.has(slugOf(channel.name))) return false;
    try { return Boolean(channel.permissionsFor(channel.guild.roles.everyone)?.has(P.ViewChannel)); } catch { return false; }
  }
  // Every word of a member's display or user name, refreshed every 10 minutes, so a trend never names anyone.
  function memberWords(guild) {
    if (now() - names.at < NAMES_FOR) return names.set;
    const set = new Set();
    for (const member of guild.members?.cache?.values?.() || []) {
      for (const name of [member.displayName, member.user?.username, member.user?.globalName]) keywords(name).forEach(word => set.add(word));
    }
    names = { at: now(), set };
    return set;
  }
  function prune() {
    for (const [word, authors] of words) {
      for (const [author, at] of authors) if (now() - at > WINDOW) authors.delete(author);
      if (!authors.size) words.delete(word);
    }
  }
  return {
    allowed,
    observe(message) {
      if (!message?.guild || message.author?.bot || !allowed(message.channel)) return;
      const text = String(message.content || '').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/gi, ' ');
      const skip = memberWords(message.guild);
      for (const word of keywords(text)) {
        if (word.length < 4 || /\d/.test(word) || skip.has(word) || SENSITIVE.test(word)) continue;
        const authors = words.get(word) || new Map();
        authors.set(message.author.id, now());
        words.set(word, authors);
      }
      if (words.size > MAX_WORDS) prune();
    },
    // The word the most different members used in the last 24 hours, if at least three did.
    trend() {
      prune();
      return [...words].filter(([, authors]) => authors.size >= MIN_AUTHORS)
        .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0]?.[0] || null;
    },
  };
}

module.exports = { createChatTrends, MIN_AUTHORS, EXCLUDED };
