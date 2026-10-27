'use strict';

// Voice rooms, the pure part: which door a channel is, room names, renames, who owns a room next, the #mabar post.
const { escapeMarkdown } = require('discord.js');
const { slugOf } = require('../guilds/channel-style');
const { TYPES } = require('./types');

const RENAME_WINDOW = 10 * 60_000; // Discord allows 2 renames per channel per 10 minutes
const UNSAFE = /[@<>`]|https?:\/\/|discord\.gg/i;
const clean = value => String(value || '').replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '').replace(/[@<>`]/g, '').replace(/\s+/g, ' ').trim();

// "🎮・Bikin Mabar" (any decoration, spaces or hyphens) is the Mabar door.
function doorType(channelName) {
  const slug = slugOf(channelName).replace(/-/g, ' ');
  return TYPES.find(type => slug === `bikin ${type.label.toLowerCase()}`) || null;
}

const roomName = (type, displayName) => `${type.emoji} ${type.label} · ${clean(displayName) || 'Anggota'}`.slice(0, 100);

// The new name keeps the type emoji; null when it is empty, longer than 40 characters, or has a mention or link.
function renamed(type, input) {
  const value = String(input || '').replace(/\s+/g, ' ').trim();
  return !value || value.length > 40 || UNSAFE.test(value) ? null : `${type.emoji} ${value}`;
}

const renameAllowed = (renames = [], now) => renames.filter(at => now - at < RENAME_WINDOW).length < 2;

// joins: { userId: joinedAt }; the member inside longest owns the room next.
const nextOwner = joins => Object.entries(joins).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;

// status: the Pomodoro phase of a Belajar room, shown while the room is open to join.
function postText({ type, ownerName, channelId, count, limit, locked = false, status = null }) {
  const head = `${type.emoji} **${escapeMarkdown(clean(ownerName) || 'Anggota')}** buka room ${type.label}`;
  if (locked) return `${head} · 🔒 dikunci`;
  if (limit && count >= limit) return `${head} · penuh ${count}/${limit}`;
  return `${head} · ${count}${limit ? `/${limit}` : ' orang'}${status ? ` · ${status}` : ''} · gas join: <#${channelId}>`;
}

module.exports = { RENAME_WINDOW, clean, doorType, roomName, renamed, renameAllowed, nextOwner, postText };
