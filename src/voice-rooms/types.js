'use strict';

// The seven room types (owner request, 2026-10-26: "dibanyakkin buat bervariasi"), one door per type in the sidebar.
// Emojis come from the bundled setup twemoji set (assets/setup/twemoji), so the /admin setup preview can draw them.
// Announced rooms post in #mabar unless postSlugs names another channel; Belajar rooms carry the Pomodoro timer; Nobar
// rooms have mode siaran (2026-10-30).
const TYPES = Object.freeze([
  { key: 'mabar', label: 'Mabar', emoji: '🎮', limit: 5, announce: true },
  { key: 'scrim', label: 'Scrim', emoji: '⚔️', limit: 10, announce: true },
  { key: 'diskusi', label: 'Diskusi', emoji: '💬', limit: 0 },
  { key: 'belajar', label: 'Belajar', emoji: '📚', limit: 0, pushToTalk: true, announce: true, postSlugs: ['belajar-bareng'], pomodoro: true },
  { key: 'nobar', label: 'Nobar', emoji: '🎬', limit: 0, broadcast: true },
  { key: 'karaoke', label: 'Karaoke', emoji: '🎵', limit: 0 },
  { key: 'privat', label: 'Privat', emoji: '🔒', limit: 0, locked: true },
].map(type => Object.freeze(type)));

const typeOf = key => TYPES.find(type => type.key === key) || null;

module.exports = { TYPES, typeOf };
