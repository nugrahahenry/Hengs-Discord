'use strict';

const { validSettings } = require('./store');
const { compositionLimits } = require('./selection');
const LABELS = Object.freeze({ tech: 'teknologi', ai: 'AI', gaming: 'gaming', memes: 'hiburan/komik' });
const TOPIC = /\b(teknologi|tech|ai|gaming|game|memes?|hiburan|komik)\b/gi;
const topicId = word => /^(?:tech|teknologi)$/i.test(word) ? 'tech'
  : /^ai$/i.test(word) ? 'ai' : /^(?:gaming|game)$/i.test(word) ? 'gaming' : 'memes';
const DEFAULTS = Object.freeze({ channelId: null, topics: ['tech', 'ai'], time: '08:00', count: 3, tone: 'casual' });
class NewsPromptError extends Error {}
const HELP = [
  '🗞️ Hengs News: bacaan pilihan harian, lengkap dengan sumber dan tanggal.',
  'Pilihan awal: teknologi + AI, jam 08:00 WIB, maksimal 3 item. Gaming dan hiburan/komik juga tersedia.',
  'Mulai: `atur berita teknologi AI jam 08:00 ke #hengs-news` (channel harus sudah ada).',
  'Lalu `preview berita`. Revisi bisa `tambah gaming`, `lebih santai`, atau `ubah jam 09:00`.',
  '`simpan berita` menyimpan dalam keadaan jeda. `kirim berita sekali` memakai preview terbaru.',
  'Setelah kiriman uji berhasil, `preview berita` lalu `aktifkan berita` untuk jadwal harian.',
  'Channel yang sudah diuji: ubah draft, `preview berita`, lalu `terapkan berita`. Status aktif/jeda tetap; tidak mengirim ulang.',
  'Campuran: `atur berita 2 berita 1 meme`. Slot hiburan memakai komik xkcd, bukan katalog meme viral.',
  '`jeda berita` menghentikan jadwal. `status berita` melihat pengaturan dan hasil terakhir.',
  'Ringkasan Indonesia memakai AI dari judul/cuplikannya saja. Jika tidak tersedia, tampil bahasa sumber. Hiburan bukan berita faktual.',
].join('\n');

const clean = value => String(value || '').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/\s+/g, ' ').trim();

function isNewsIntent(value) {
  return /\b(?:berita|news)\b/i.test(clean(value));
}

function parsePrompt(value, hasDraft = false) {
  const text = clean(value);
  const contextual = hasDraft && /^(?:lebih |(?:ubah|ganti|tambah(?:kan|in)?|kurangi|hapus|pakai|pilih|pindah(?:kan)?)\b)/i.test(text)
    && /\b(?:santai|formal|netral|jam|pukul|teknologi|tech|ai|gaming|game|meme|hiburan|komik|item|channel)\b|<#\d|#hengs-news/i.test(text);
  if (!isNewsIntent(text) && !contextual) return null;
  if (!text || text.length > 1800 || /[?"“”]|\b(?:jangan|jgn|tidak|gak|ga|nggak|enggak|bukan|kalau|kalo|jika|kenapa|mengapa|apakah|gimana|bagaimana|cara|bisa|belum)\b/i.test(text)) return { action: 'help' };
  const command = text.replace(/^(?:(?:oke|tolong|coba)\s+)+/i, '').replace(/[.!]+$/, '').toLowerCase();
  if (/^(?:jeda|pause|hentikan|nonaktifkan|matikan)\s+(?:berita|news)$/.test(command)) return { action: 'pause' };
  if (/^(?:status|lihat status|cek status)\s+(?:berita|news)$/.test(command)) return { action: 'status' };
  if (/^(?:preview|pratinjau|contoh|lihat contoh)\s+(?:berita|news)$/.test(command)) return { action: 'preview' };
  if (/^simpan\s+(?:berita|news)$/.test(command)) return { action: 'save' };
  if (/^terapkan\s+(?:berita|news)$/.test(command)) return { action: 'apply' };
  if (/^kirim\s+(?:berita|news)\s+sekali$/.test(command)) return { action: 'send' };
  if (/^aktifkan\s+(?:berita|news)$/.test(command)) return { action: 'enable' };
  if (/^(?:atur|buat|bikin|ubah|ganti|tambah(?:kan|in)?|kurangi|hapus|pakai|pilih|pindah(?:kan)?|lebih)\b/i.test(command)) return { action: 'edit', text: command };
  return { action: 'help' };
}

function editSettings(text, previous = DEFAULTS, channels = []) {
  const settings = structuredClone(previous);
  if (/\b(?:politik|ekonomi|saham|crypto|kripto|olahraga|custom|otomotif)\b|https?:\/\//i.test(text)) {
    throw new NewsPromptError('Pilih teknologi, AI, gaming, atau hiburan dulu. URL sumber bebas belum didukung.');
  }
  const entertainmentCounts = [...text.matchAll(/\b(\d+)\s+(?:memes?|hiburan|komik)\b/gi)];
  const newsCounts = [...text.matchAll(/\b(\d+)\s+(?:berita|item|artikel)\b/gi)];
  const mixedRequest = entertainmentCounts.length > 0;
  if (mixedRequest) {
    if (entertainmentCounts.length !== 1 || entertainmentCounts[0][1] !== '1'
      || newsCounts.length !== 1 || newsCounts[0][1] !== '2'
      || /\b(?:hapus|kurangi|tanpa)\b/i.test(text)) {
      throw new NewsPromptError('Untuk campuran, pakai 2 berita + 1 meme (maksimal 3 item). Draft belum diubah.');
    }
    // Parse the news topics separately; the numeric meme clause must not replace them.
    text = text.replace(/\b\d+\s+(?:memes?|hiburan|komik)\b/gi, '').replace(/\b2\s+(?:berita|item|artikel)\b/gi, '');
    settings.topics = settings.topics.filter(topic => topic !== 'memes');
    if (!settings.topics.length) settings.topics = [...DEFAULTS.topics];
  }
  let changed = false;
  const clauses = text.split(/[,;]|\bdan\b/i);
  let replaced = false;
  let topicMode = 'replace';
  for (const clause of clauses) {
    const topics = [...clause.matchAll(TOPIC)].map(x => topicId(x[1]));
    if (!topics.length) continue;
    if (/\b(?:kurangi|hapus|tanpa)\b/i.test(clause)) topicMode = 'remove';
    else if (/\btambah(?:kan|in)?\b/i.test(clause)) topicMode = 'add';
    else if (/\b(?:atur|ubah|ganti|pilih|pakai)\b/i.test(clause)) topicMode = 'replace';
    if (topicMode === 'remove') settings.topics = settings.topics.filter(x => !topics.includes(x));
    else if (topicMode === 'add') settings.topics = [...new Set([...settings.topics, ...topics])];
    else { settings.topics = [...new Set([...(replaced ? settings.topics : []), ...topics])]; replaced = true; }
    changed = true;
  }
  if (mixedRequest) { settings.topics = [...new Set([...settings.topics, 'memes'])]; settings.count = 3; changed = true; }
  if (!settings.topics.length) throw new NewsPromptError('Sisakan minimal satu topik berita ya.');
  const times = [...text.matchAll(/\b(?:jam|pukul)\s+(\d{1,2})[:.](\d{2})\b/g)];
  if (/\b(?:jam|pukul)\b/.test(text)) {
    if (times.length !== 1 || Number(times[0][1]) > 23 || Number(times[0][2]) > 59) throw new NewsPromptError('Pakai satu waktu WIB, misalnya jam 09:00. Draft belum diubah.');
    settings.time = `${times[0][1].padStart(2, '0')}:${times[0][2]}`; changed = true;
  }
  const counts = [...text.matchAll(/\b(\d+)\s+(?:berita|item|artikel)\b/g)];
  if (counts.length) {
    if (counts.length !== 1 || Number(counts[0][1]) < 1 || Number(counts[0][1]) > 3) throw new NewsPromptError('Pilih 1 sampai 3 item per hari.');
    settings.count = Number(counts[0][1]); changed = true;
  }
  if (/\b(?:santai|formal|netral)\b/.test(text)) { settings.tone = /\bsantai\b/.test(text) ? 'casual' : 'neutral'; changed = true; }
  const targets = [...text.matchAll(/<#(\d{17,20})>|(?<!<)#([\p{L}\p{N}_-]+)/gu)];
  if (targets.length) {
    if (targets.length !== 1) throw new NewsPromptError('Pilih satu channel tujuan.');
    const matches = channels.filter(channel => targets[0][1] ? channel.id === targets[0][1] : channel.name === targets[0][2]);
    if (matches.length !== 1) throw new NewsPromptError('Channel belum ditemukan. Mention channel teks yang sudah ada, misalnya #hengs-news.');
    settings.channelId = matches[0].id; changed = true;
  }
  if (!changed && !/^(?:atur|buat|bikin)\s+(?:berita|news)$/.test(text)) throw new NewsPromptError('Revisi belum jelas. Contoh: tambah gaming, lebih santai, atau ubah jam 09:00.');
  return settings;
}

function describe(settings, status = 'draft') {
  const mix = compositionLimits(settings);
  return [`🗞️ Hengs News (${status})`, `Topik: ${settings.topics.map(x => LABELS[x]).join(', ')}`,
    `Setiap hari ${settings.time} WIB, maksimal ${settings.count} item. Gaya: ${settings.tone === 'casual' ? 'santai' : 'netral'}.`,
    ...(mix ? [`Komposisi: maksimal ${mix.news} berita + ${mix.entertainment} hiburan. Slot kosong tidak diisi ulang dengan jenis lain.`] : []),
    settings.channelId ? `Tujuan: <#${settings.channelId}>.` : 'Tujuan: belum dipilih. Mention channel teks yang sudah ada.',
  ].join('\n');
}

module.exports = { DEFAULTS, HELP, LABELS, NewsPromptError, clean, isNewsIntent, parsePrompt, editSettings, describe, validSettings };
