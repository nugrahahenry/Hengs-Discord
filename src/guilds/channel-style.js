'use strict';

// Channel themes for /admin setup v2 and the slug every channel lookup matches on. A name is decoration around a
// slug: "🤖┃tanya-hengs", "╰┈➤tanya-hengs🤖" and "tanya-hengs" are all the channel "tanya-hengs".
// Text channel names never use spaces (Discord turns them into "-"; fake Unicode spaces can show as boxes on phones).
// Voice channels may keep capitals and spaces, so built-in themes name them like text channels without lower-casing.
const theme = (id, label, channel, category) => ({ id, label, channel, voice: channel, category });
const THEMES = Object.freeze([
  theme('dot', 'Emoji + titik', (e, s) => `${e}・${s}`, (e, l) => `${e} ${l}`),
  theme('garis', 'Garis tegak', (e, s) => `${e}︱${s}`, (e, l) => `──── ${l} ────`),
  theme('pohon', 'Panah pohon', (e, s) => `╰┈➤${s}${e}`, (e, l) => `${l} ${e}`),
  theme('kurung', 'Kurung neon', (e, s) => `ˌ${e}ˈ${s}`, (e, l) => `【${e} ${l} ${e}】`),
  theme('plain', 'Polos', (e, s) => s, (e, l) => l),
]);

function themeById(id) {
  const theme = THEMES.find(item => item.id === id);
  if (!theme) throw new Error('THEME_UNKNOWN');
  return theme;
}

// An owner's own theme: patterns with {emoji} and {nama}. Channel names come out the way Discord stores them.
function customTheme({ channel, category } = {}) {
  const fill = (pattern, e, n) => String(pattern).replace(/\{emoji\}/gi, e).replace(/\{nama\}/gi, n);
  const ok = pattern => typeof pattern === 'string' && /\{nama\}/i.test(pattern) && fill(pattern, '', '').length <= 60;
  if (!ok(channel) || !ok(category)) throw new Error('THEME_PATTERN_INVALID');
  return { id: 'custom', label: 'Custom',
    channel: (e, s) => fill(channel, e, s).toLowerCase().replace(/\s+/g, '-').slice(0, 100),
    voice: (e, s) => fill(channel, e, s).slice(0, 100),
    category: (e, l) => fill(category, e, l).slice(0, 100) };
}

const CATALOG = Object.freeze([
  { key: 'tanya', emoji: '🤖', slug: 'tanya-hengs', label: 'Tanya Hengs', about: 'ngobrol sama Hengs' },
  { key: 'analis', emoji: '📊', slug: 'hengs-analis', label: 'Analis MLBB', about: 'rekap MPL dan pro match' },
  { key: 'scrim', emoji: '📸', slug: 'hasil-scrim', label: 'Hasil Scrim', about: 'privat tim Hengs Family' },
  { key: 'news', emoji: '📰', slug: 'hengs-news', label: 'Hengs News', about: 'berita harian' },
  { key: 'memes', emoji: '😂', slug: 'hengs-memes', label: 'Hengs Memes', about: 'meme harian' },
]);

const slugOf = name => String(name || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, '');

const SEPARATORS = new Set(['・', '┃', '︱', '【', '】', '│', '|']);
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
// Emoji drawn as pictures: default emoji presentation, an explicit VS16 or a ZWJ sequence. Symbols such as ➤ or ✦
// stay text.
const isEmoji = segment => /\p{Emoji_Presentation}|️|‍/u.test(segment);

// Drawable parts for the sidebar preview: emoji (Twemoji code), separators drawn as shapes, and text runs.
function nameParts(name) {
  const parts = [];
  let run = '';
  const flush = () => { if (run) parts.push({ kind: 'text', text: run }); run = ''; };
  for (const { segment } of segmenter.segment(String(name || ''))) {
    if (isEmoji(segment)) {
      flush();
      parts.push({ kind: 'emoji', code: [...segment].map(c => c.codePointAt(0)).filter(cp => cp !== 0xfe0f)
        .map(cp => cp.toString(16)).join('-') });
    } else if (SEPARATORS.has(segment)) { flush(); parts.push({ kind: 'sep', mark: segment }); }
    else run += segment;
  }
  flush();
  return parts;
}

// The first emoji exactly as written (variation selector kept), so a rename keeps the channel's own emoji.
function firstEmoji(name) {
  for (const { segment } of segmenter.segment(String(name || ''))) if (isEmoji(segment)) return segment;
  return null;
}
// A category or voice name without its decoration, case kept: "【📌 INFO 📌】" → "INFO".
const labelOf = name => String(name || '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/gu, '');

module.exports = { THEMES, CATALOG, themeById, customTheme, slugOf, nameParts, firstEmoji, labelOf };
