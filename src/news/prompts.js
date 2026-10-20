'use strict';

const { validSettings } = require('./store');
const { scheduleTimes } = require('./cadence');
const LABELS = Object.freeze({ tech: 'teknologi', ai: 'AI', gaming: 'gaming' });
const TOPIC = /\b(teknologi|tech|ai|gaming|game)\b/gi;
const topicId = word => /^(?:tech|teknologi)$/i.test(word) ? 'tech' : /^ai$/i.test(word) ? 'ai' : 'gaming';
const DEFAULTS = Object.freeze({ channelId: null, memeChannelId: null, topics: ['tech', 'ai'], time: '08:00', count: 3,
  memeTime: '13:00', memeCount: 0, tone: 'casual' });
const channelName = value => String(value).toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '');
const TIME = /\b(?:jam|pukul)\s+(\d{1,2})[:.](\d{2})\b/g;
class NewsPromptError extends Error {}
const HELP = [
  '🗞️ Hengs News: bacaan pilihan harian, lengkap dengan sumber dan tanggal.',
  'Pilihan awal: teknologi + AI, 3 berita pukul 08:00, 10:00, 12:00 WIB. Satu item tiap kiriman, tiap dua jam.',
  'Berita dipilih dari yang lagi rame: poin per jam di Hacker News, jumlah media yang memuat cerita yang sama, dan Google Trends Indonesia.',
  'Mulai: `atur berita teknologi AI gaming 5 berita jam 08:00 ke #hengs-news` (channel harus sudah ada).',
  'Lalu `preview berita`. Revisi bisa `tambah gaming`, `lebih santai`, atau `ubah jam 09:00`.',
  'Meme: `atur berita meme 5 jam 13:00 ke #hengs-memes`. `atur berita meme 0` mematikan meme. Channel news dan meme harus berbeda.',
  'Meme memakai komik xkcd yang baru. Tanpa tujuan meme, slot meme dilewati, bukan masuk news.',
  '`simpan berita` menyimpan dalam keadaan jeda. `kirim berita sekali` memakai preview terbaru.',
  'Setelah kiriman uji berhasil, `preview berita` lalu `aktifkan berita` untuk jadwal harian.',
  'Channel yang sudah diuji: ubah draft, `preview berita`, lalu `terapkan berita`. Status aktif/jeda tetap; tidak mengirim ulang.',
  'Anggota bisa posting langsung sesuai izin channel, atau `/hengs ask` → `bagikan berita: https://contoh.com/artikel` untuk preview dan konfirmasi sendiri.',
  '`jeda berita` menghentikan jadwal. `status berita` melihat pengaturan dan hasil terakhir.',
  'Ringkasan Indonesia memakai AI dari judul/cuplikannya saja. Jika tidak tersedia, tampil bahasa sumber. Hiburan bukan berita faktual.',
].join('\n');

const clean = value => String(value || '').replace(/[​-‏‪-‮⁦-⁩]/g, '')
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

function channelIdFor(target, channels, message) {
  const id = /^<#(\d+)>$/.exec(target)?.[1];
  const matches = channels.filter(channel => id ? channel.id === id : channelName(channel.name) === target.slice(1));
  if (matches.length !== 1) throw new NewsPromptError(message);
  return matches[0].id;
}

function clockFrom(text, message) {
  const times = [...text.matchAll(TIME)];
  if (times.length !== 1 || Number(times[0][1]) > 23 || Number(times[0][2]) > 59) throw new NewsPromptError(message);
  return { value: `${times[0][1].padStart(2, '0')}:${times[0][2]}`, match: times[0][0] };
}

// "atur berita meme ...": every number, clock and channel in the command belongs to memes.
function editMemes(text, settings, channels) {
  let body = text.replace(/^\S+\s+(?:berita|news)\s+(?:memes?|hiburan|komik)\b/i, ' ');
  let changed = false;
  const targets = [...body.matchAll(/(?:\bke\s+)?(<#\d{17,20}>|(?<!<)#[\p{L}\p{N}_-]+)/gu)];
  if (targets.length) {
    if (targets.length !== 1) throw new NewsPromptError('Pilih satu channel meme.');
    settings.memeChannelId = channelIdFor(targets[0][1], channels, 'Channel meme belum ditemukan. Mention channel teks yang sudah ada.');
    body = body.replace(targets[0][0], ' '); changed = true;
  }
  if (/\b(?:jam|pukul)\b/.test(body)) {
    const time = clockFrom(body, 'Pakai satu waktu WIB untuk meme, misalnya jam 13:00. Draft belum diubah.');
    settings.memeTime = time.value; body = body.replace(time.match, ' '); changed = true;
  }
  const counts = [...body.matchAll(/\b(\d+)\b/g)];
  if (counts.length) {
    if (counts.length !== 1 || Number(counts[0][1]) > 5) throw new NewsPromptError('Pilih 0 sampai 5 meme per hari. Draft belum diubah.');
    settings.memeCount = Number(counts[0][1]); changed = true;
  }
  if (!changed) throw new NewsPromptError('Contoh: atur berita meme 5 jam 13:00 ke #hengs-memes.');
  if (settings.memeChannelId && settings.channelId === settings.memeChannelId) throw new NewsPromptError('Channel news dan meme harus berbeda. Draft belum diubah.');
  return settings;
}

function editSettings(text, previous = DEFAULTS, channels = []) {
  const settings = structuredClone(previous);
  if (/^(?:atur|ubah|ganti|pakai|pilih)\s+(?:berita|news)\s+(?:memes?|hiburan|komik)\b/i.test(text)) return editMemes(text, settings, channels);
  const memeTargets = [...text.matchAll(/\b(?:memes?|hiburan|komik|jokes?)\s+ke\s+(<#\d{17,20}>|#[\p{L}\p{N}_-]+)/giu)]
    .filter(match => !/\d\s+$/.test(text.slice(0, match.index)));
  let changed = false;
  if (memeTargets.length) {
    if (memeTargets.length !== 1) throw new NewsPromptError('Pilih satu channel meme.');
    settings.memeChannelId = channelIdFor(memeTargets[0][1], channels, 'Channel meme belum ditemukan. Mention channel teks yang sudah ada.');
    changed = true;
    text = text.replace(memeTargets[0][0], '');
  }
  if (/\b(?:politik|ekonomi|saham|crypto|kripto|olahraga|custom|otomotif)\b|https?:\/\//i.test(text)) {
    throw new NewsPromptError('Pilih teknologi, AI, atau gaming dulu. URL sumber bebas belum didukung.');
  }
  const memeCounts = [...text.matchAll(/\b(\d+)\s+(?:memes?|hiburan|komik)\b/gi)];
  if (memeCounts.length) {
    if (memeCounts.length !== 1 || Number(memeCounts[0][1]) > 5) throw new NewsPromptError('Pilih 0 sampai 5 meme per hari. Draft belum diubah.');
    settings.memeCount = Number(memeCounts[0][1]); changed = true;
    text = text.replace(memeCounts[0][0], '');
  }
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
  if (!settings.topics.length) throw new NewsPromptError('Sisakan minimal satu topik berita ya.');
  if (/\b(?:jam|pukul)\b/.test(text)) {
    settings.time = clockFrom(text, 'Pakai satu waktu WIB, misalnya jam 09:00. Draft belum diubah.').value; changed = true;
  }
  const counts = [...text.matchAll(/\b(\d+)\s+(?:berita|item|artikel)\b/g)];
  if (counts.length) {
    if (counts.length !== 1 || Number(counts[0][1]) < 1 || Number(counts[0][1]) > 5) throw new NewsPromptError('Pilih 1 sampai 5 berita per hari.');
    settings.count = Number(counts[0][1]); changed = true;
  }
  if (/\b(?:santai|formal|netral)\b/.test(text)) { settings.tone = /\bsantai\b/.test(text) ? 'casual' : 'neutral'; changed = true; }
  const targets = [...text.matchAll(/<#(\d{17,20})>|(?<!<)#([\p{L}\p{N}_-]+)/gu)];
  if (targets.length) {
    if (targets.length !== 1) throw new NewsPromptError('Pilih satu channel tujuan.');
    settings.channelId = channelIdFor(targets[0][0], channels, 'Channel belum ditemukan. Mention channel teks yang sudah ada, misalnya #hengs-news.');
    changed = true;
  }
  if (!changed && !/^(?:atur|buat|bikin)\s+(?:berita|news)$/.test(text.trim())) throw new NewsPromptError('Revisi belum jelas. Contoh: tambah gaming, lebih santai, atau ubah jam 09:00.');
  if (settings.memeChannelId && settings.channelId === settings.memeChannelId) throw new NewsPromptError('Channel news dan meme harus berbeda. Draft belum diubah.');
  return settings;
}

function describe(settings, status = 'draft') {
  return [`🗞️ Hengs News (${status})`, `Topik: ${settings.topics.map(x => LABELS[x]).join(', ')}`,
    `Berita: ${scheduleTimes(settings, 'news').join(', ')} WIB, maksimal ${settings.count} per hari. Satu item per kiriman. Gaya: ${settings.tone === 'casual' ? 'santai' : 'netral'}.`,
    settings.memeCount
      ? `Meme: ${scheduleTimes(settings, 'meme').join(', ')} WIB, maksimal ${settings.memeCount} per hari.`
      : 'Meme: mati. Nyalakan dengan `atur berita meme 5 jam 13:00 ke #hengs-memes`.',
    'Slot yang terlewat atau melewati tengah malam tidak dirapel.',
    settings.channelId ? `Tujuan berita: <#${settings.channelId}>.` : 'Tujuan: belum dipilih. Mention channel teks yang sudah ada.',
    settings.memeChannelId ? `Tujuan meme: <#${settings.memeChannelId}>.` : 'Tujuan meme belum dipilih; meme tidak dikirim ke channel berita.',
  ].join('\n');
}

module.exports = { DEFAULTS, HELP, LABELS, NewsPromptError, clean, isNewsIntent, parsePrompt, editSettings, describe, validSettings };
