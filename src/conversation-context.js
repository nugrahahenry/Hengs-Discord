'use strict';

const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const ENTRY_LIMIT = 1200;
const LIMITS = Object.freeze({
  private: Object.freeze({ entries: 64, chars: 48000, requestEntries: 24, recent: 16, requestChars: 16000 }),
  shared: Object.freeze({ entries: 24, chars: 24000, requestEntries: 16, recent: 12, requestChars: 10000 }),
});
const STOP_WORDS = new Set(('aku saya gw gue kamu yang itu ini tadi dong deh kok apa kenapa '
  + 'gimana bagaimana tolong coba jelaskan jelasin dengan buat untuk dan atau dari ke di '
  + 'lagi sama tentang bahas bilang pesan jawaban sudah belum masih').split(' '));

function cleanText(value, limit = ENTRY_LIMIT) {
  return typeof value === 'string' ? value.slice(0, limit * 4)
    .replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ')
    .replace(/[\u2013\u2014]/g, '-').trim().slice(0, limit) : '';
}

function keywords(text) {
  return new Set(cleanText(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)
    ?.filter(word => !STOP_WORDS.has(word)) || []);
}

function appendExchange(history, user, assistant, visibility) {
  const limits = Object.hasOwn(LIMITS, visibility) ? LIMITS[visibility] : null;
  const pair = [{ role: 'user', content: cleanText(user) },
    { role: 'assistant', content: cleanText(assistant) }];
  if (!limits || pair.some(entry => !entry.content)) return;
  history.push(...pair);
  let chars = history.reduce((sum, entry) => sum + entry.content.length, 0);
  while (history.length > limits.entries || chars > limits.chars) {
    const removed = history.splice(0, 2);
    chars -= removed.reduce((sum, entry) => sum + entry.content.length, 0);
  }
}

function selectHistory(history, message, visibility) {
  const limits = Object.hasOwn(LIMITS, visibility) ? LIMITS[visibility] : null;
  if (!limits) return [];
  const source = (Array.isArray(history) ? history : []).slice(-limits.entries)
    .filter(entry => entry && ['user', 'assistant'].includes(entry.role))
    .map(entry => ({ role: entry.role, content: cleanText(entry.content) }))
    .filter(entry => entry.content);
  const pairs = [];
  for (let index = 0; index + 1 < source.length; index++) {
    if (source[index].role === 'user' && source[index + 1].role === 'assistant') {
      pairs.push(source.slice(index, index + 2));
      index += 1;
    }
  }
  const recentStart = Math.max(0, pairs.length - limits.recent / 2);
  const selected = new Set(pairs.slice(recentStart).map((_, index) => recentStart + index));
  const wanted = keywords(message);
  const ranked = pairs.slice(0, recentStart).map((pair, index) => ({ index,
    score: [...keywords(pair.map(entry => entry.content).join(' '))].filter(word => wanted.has(word)).length,
  })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || b.index - a.index);
  for (const { index } of ranked) {
    if (selected.size * 2 >= limits.requestEntries) break;
    selected.add(index);
  }
  let remaining = limits.requestChars;
  const output = [];
  for (const index of [...selected].sort((a, b) => b - a)) {
    const pair = pairs[index];
    const chars = pair.reduce((sum, entry) => sum + entry.content.length, 0);
    if (chars > remaining) continue;
    output.unshift(...pair);
    remaining -= chars;
  }
  return output;
}

const FEATURE_LABELS = Object.freeze({ notes: 'catatan', reminders: 'pengingat', focus: 'mode fokus',
  operations: 'status operasi' });
const FEATURE_CODES = new Set(['RESPONDED', 'SAVED', 'FAILED', 'PENDING_CONFIRMATION', 'CANCELLED']);

function featureReceipt(family, code = 'RESPONDED') {
  const label = Object.hasOwn(FEATURE_LABELS, family) ? FEATURE_LABELS[family] : null;
  if (!label || !FEATURE_CODES.has(code)) return null;
  return { user: `Aku meminta fitur ${label}.`, assistant: `Hasil fitur ${label}: ${code}. `
    + 'Isi privat dan detail hasil tidak disertakan. Jangan mengarang isinya atau menganggap aksi berhasil hanya dari RESPONDED.' };
}

module.exports = { HISTORY_TTL_MS, ENTRY_LIMIT, LIMITS, cleanText, appendExchange, selectHistory, featureReceipt };
