'use strict';

// Hengs chat mode (home server). Where Hengs talks, and how a casual message maps to a feature. The classifier only
// names an intent; fixed guides answer it, so chat never posts news, memes or analyst content and never shows team
// data outside hasil-scrim.
const { botCommands } = require('./community-help');

const INTENTS = Object.freeze(['chat', 'help', 'news', 'memes', 'analis', 'scrim', 'kirim', 'lapor', 'caster', 'event']);
const named = (name, label) => new RegExp(`(?:^|[・│|\\s])${label}$`, 'u').test(String(name || ''));
const isChatChannelName = name => ['tanya-hengs', 'bot-commands', 'bot-settings'].some(label => named(name, label));

// chat: full chat mode. coach: hasil-scrim (and its threads). silent: the gallery. wave: everywhere else gets 👋.
function chatPlacement(channel) {
  const base = channel?.isThread?.() ? channel.parent : channel;
  const name = base?.name;
  if (named(name, 'hall-of-fame')) return 'silent';
  if (named(name, 'hasil-scrim')) return 'coach';
  return isChatChannelName(name) ? 'chat' : 'wave';
}

const CLASSIFIER = [
  'Classify one message a Discord member sent to the community bot Hengs (Indonesian gaming community).',
  'Reply with JSON only: {"intent":"<one of chat, help, news, memes, analis, scrim, kirim, lapor, caster, event>"}.',
  '- news: wants news or "berita", or asks what is new in tech, AI or gaming news.',
  '- memes: wants to see memes or jokes from the meme channel.',
  '- analis: asks about pro MLBB matches: MPL, M-series, MSC, pro teams, results, drafts.',
  '- scrim: asks about their own team\'s scrim results, stats, recap, mistakes or coaching.',
  '- kirim: wants to submit or share a meme or a news link to the server.',
  '- lapor: wants to report a member, harassment, a problem or a bug to the moderators.',
  '- caster: wants the AI caster to hype a moment.',
  '- event: asks about this server\'s events, schedules or community tournaments.',
  '- help: asks what Hengs can do or how to use Hengs.',
  '- chat: anything else: questions, small talk, homework, advice. When unsure, use chat.',
].join('\n');

function parseIntent(raw) {
  const match = /\{[\s\S]*\}/.exec(String(raw || ''));
  try {
    const intent = JSON.parse(match?.[0] || '')?.intent;
    return typeof intent === 'string' && INTENTS.includes(intent) ? intent : 'chat';
  } catch { return 'chat'; }
}

// Stateless: the message text alone, no history or username. Any failure means plain chat.
function createIntentClassifier({ complete } = {}) {
  return async text => {
    if (typeof complete !== 'function') return 'chat';
    try {
      return parseIntent(await complete({ temperature: 0, messages: [{ role: 'system', content: CLASSIFIER },
        { role: 'user', content: String(text || '').slice(0, 1500) }] }));
    } catch { return 'chat'; }
  };
}

function channelRef(guild, label) {
  const found = [...(guild?.channels?.cache?.values?.() || [])].filter(c => c?.type === 0 && named(c.name, label));
  return found.length === 1 && /^\d{17,20}$/.test(found[0].id) ? `<#${found[0].id}>` : null;
}

function guideFor(intent, guild) {
  const ref = label => channelRef(guild, label) || `\`${label}\``;
  switch (intent) {
    case 'help': return `Aku bisa ngobrol dan bantu di ${botCommands(guild)}. Coba tanya apa aja, atau bilang "berita terbaru", "meme", "hasil MPL", "cara kirim meme". Data scrim tim dibahas di ${ref('hasil-scrim')}.`;
    case 'news': return `Berita pilihan Hengs ada di ${ref('hengs-news')}. Mau bagi berita? Pakai \`/kirim berita\` di sini, kamu lihat preview dulu.`;
    case 'memes': return `Meme dari Hengs dan anggota ada di ${ref('hengs-memes')}. Kirim punyamu lewat \`/kirim meme\` di sini, lampirkan gambarnya.`;
    case 'analis': {
      const analis = channelRef(guild, 'hengs-analis');
      return analis ? `Rekap MPL dan pertandingan pro ada di ${analis}. Datanya dari Liquipedia, kartunya dibuat Hengs.`
        : 'Channel analis MPL belum dibuat. Pengurus bisa bikin lewat `/admin setup` > Analis MLBB.';
    }
    case 'scrim': return `Data scrim tim cuma dibahas di ${ref('hasil-scrim')} biar tetap privat. Statistikmu sendiri: \`/scrim statku\` (dikirim lewat DM). Tanya coach secara privat: \`/scrim tanya\`.`;
    case 'kirim': return 'Mau kirim meme atau berita? Pakai `/kirim meme` (lampirkan gambar) atau `/kirim berita` (link) di sini. Kamu dapat preview dulu, baru konfirmasi.';
    case 'lapor': return 'Buat lapor masalah atau anggota, pakai `/report`. Laporanmu masuk privat ke owner dan moderator.';
    case 'caster': return 'Mau diteriakin caster AI? Pakai `/caster` terus ceritain momennya, misalnya "Henry savage pakai Ling".';
    case 'event': return 'Event dan jadwal komunitas diumumkan pengurus. Pengurus bisa bikin draft event dengan bilang "bikin event ..." di sini.';
    default: return null;
  }
}

module.exports = { INTENTS, CLASSIFIER, chatPlacement, isChatChannelName, parseIntent, createIntentClassifier, guideFor };
