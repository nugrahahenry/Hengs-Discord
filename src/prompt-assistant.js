'use strict';

// Prompt-first helper untuk Discord.
// Modul ini sengaja tidak memanggil Discord API dan tidak menulis state.
// Ia hanya mengenali permintaan yang aman untuk dijawab sebagai rancangan.

const MAX_PROMPT_LENGTH = 1800;
const { ChannelType } = require('discord.js');
const { isEditor } = require('./ops/permissions');
const { parseOperationPrompt, operationReply } = require('./prompt-operations');
const { parsePersonalPrompt } = require('./personal-assistant');

const COMMUNITY_ACTION = /\b(?:buat|buatkan|bikin|rancang|siapkan|susun|atur|desain|rapikan)\b/i;
const COMMUNITY_OBJECT = /\b(?:server|channel|kategori|ruang|komunitas|struktur|lobi|gaming|mabar|creator|galeri|core|voice|text)\b/i;
const HELP_PROMPT = /\b(?:apa yang bisa|bisa apa|cara pakai|contoh prompt|prompt apa|help)\b/i;
const FOCUS_SIGNAL = /\b(?:fokus|jagain|jaga|mode|study|scrim|belajar|latihan|turnamen|tournament)\b/i;
const FOCUS_NEGATION = /[?"“”]|\b(?:jangan|jgn|tidak|nggak|gak|ga|enggak|belum|bukan|kalau|kalo|jika|seandainya|kenapa|mengapa|bagaimana|gimana|cara|apakah|apa|siapa|kapan|mana|harus|bisa|bantu|jelaskan|ajarin|ajari)\b/i;
const FOCUS_SCHEDULE = /\b(?:besok|nanti|jam|pukul|menit|durasi|selama)\b|\d+\s*(?:j|h|m)\b/i;
const CHANNEL_STYLE_EMOJI = /\b(?:emoji|ikon|icon|estetik|aesthetic)\b/i;
const CHANNEL_STYLE_PLAIN = /\b(?:polos|plain|sederhana|minimal)\b/i;
const COMMUNITY_LAYOUT_AURORA = /\b(?:aurora|neon|glow|bercahaya)\b/i;
const COMMUNITY_LAYOUT_MIDNIGHT = /\b(?:midnight|gelap|dark|malam)\b/i;
const COMMUNITY_LAYOUT_MINIMAL = /\b(?:minimal|clean|bersih|rapi)\b/i;
const COMMUNITY_LABEL_BLOCKED = /(?:@|https?:\/\/|discord\.gg|\b(?:permission|permis|izin|webhook|token|hapus|delete|pindah|move|rename)\b|```|[<>]|\d{17,20})/i;
const COMMUNITY_LABEL_MAX = 90;
const COMMUNITY_COPY_MAX = 180;
const COMMUNITY_REVISION_MAX = 8;

const FOCUS_MODES = Object.freeze([
  Object.freeze({ mode: 'study', words: /\b(?:belajar|study)\b/i }),
  Object.freeze({ mode: 'scrim', words: /\b(?:scrim|latihan|turnamen|tournament)\b/i }),
]);

const BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: 'lobby',
    title: 'LOBI MASUK',
    categoryName: 'LOBI MASUK',
    emojiCategoryName: '🎉・LOBI MASUK',
    cues: [],
    channels: ['announcements', 'selamat-datang', 'aturan-server', 'verify-here', 'ambil-role', 'intro-dulu-ngab'],
    emojiChannels: ['📢・announcements', '👋・selamat-datang', '📜・aturan-server', '✅・verify-here', '🎭・ambil-role', '👋・intro-dulu-ngab'],
    voiceChannels: ['ruang-tunggu'],
    emojiVoiceChannels: ['🛋️・ruang-tunggu'],
  }),
  Object.freeze({
    key: 'core',
    title: 'SERVER CORE',
    categoryName: 'SERVER CORE',
    emojiCategoryName: '🖥️・SERVER CORE',
    cues: ['boost', 'server core'],
    channels: ['boost'],
    emojiChannels: ['💎・boost'],
    voiceChannels: ['AFK'],
    emojiVoiceChannels: ['💤・AFK'],
  }),
  Object.freeze({
    key: 'gaming',
    title: 'AREA GAMING',
    categoryName: 'AREA GAMING',
    emojiCategoryName: '🎮・AREA GAMING',
    cues: ['gaming', 'game', 'mabar', 'moba', 'roblox', 'valorant', 'mobile legend'],
    channels: ['ngobrol-santai', 'info-mabar', 'galeri-mix', 'galeri-moba', 'galeri-roblox'],
    emojiChannels: ['💬・ngobrol-santai', '⚔️・info-mabar', '📸・galeri-mix', '📸・galeri-moba', '📸・galeri-roblox'],
    voiceChannels: ['mabar-1', 'mabar-2', 'tournament-room'],
    emojiVoiceChannels: ['🎮・mabar-1', '🎮・mabar-2', '🏆・tournament-room'],
  }),
  Object.freeze({
    key: 'creator',
    title: 'CREATOR STUDIO',
    categoryName: 'CREATOR STUDIO',
    emojiCategoryName: '🎥・CREATOR STUDIO',
    cues: ['creator', 'stream', 'live', 'showcase', 'promosi-konten'],
    channels: ['live-stream', 'showcase', 'promosi-konten'],
    emojiChannels: ['📺・live-stream', '📷・showcase', '🔗・promosi-konten'],
    voiceChannels: ['live-room'],
    emojiVoiceChannels: ['🎙️・live-room'],
  }),
]);

const CHANNEL_NAME_STYLES = Object.freeze(['plain', 'emoji']);
const COMMUNITY_LAYOUT_STYLES = Object.freeze(['aurora', 'midnight', 'minimal']);
const COMMUNITY_LAYOUT_LABELS = Object.freeze({
  aurora: 'Aurora neon',
  midnight: 'Midnight gelap',
  minimal: 'Minimal bersih',
});
const TEXT_MODES = Object.freeze(['full', 'essential', 'none']);
const ESSENTIAL_TEXT = Object.freeze({ lobby: [0, 1, 2], core: [0], gaming: [0, 1], creator: [0, 1] });

function normalizeCommunitySelection(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['textMode', 'voiceCount'].includes(key))) {
    throw new Error('COMMUNITY_SELECTION_INVALID');
  }
  const textMode = value.textMode === undefined ? 'full' : value.textMode;
  const voiceCount = value.voiceCount === undefined ? null : value.voiceCount;
  if (!TEXT_MODES.includes(textMode) || (voiceCount !== null
    && (!Number.isInteger(voiceCount) || voiceCount < 0 || voiceCount > 6))) {
    throw new Error('COMMUNITY_SELECTION_INVALID');
  }
  return { textMode, voiceCount };
}

function communityChannelSlots(blueprintKeys, selection = {}) {
  const selected = BLUEPRINTS.filter(blueprint => blueprintKeys.includes(blueprint.key));
  const choices = normalizeCommunitySelection(selection);
  const voiceOrder = [...selected.filter(blueprint => blueprint.key !== 'lobby'),
    ...selected.filter(blueprint => blueprint.key === 'lobby')];
  const voiceSlots = voiceOrder.flatMap(blueprint => blueprint.voiceChannels.map((_, index) => (
    { blueprintKey: blueprint.key, kind: 'voice', index }
  )));
  if (choices.voiceCount !== null && choices.voiceCount > voiceSlots.length) {
    throw new Error('COMMUNITY_VOICE_LIMIT');
  }
  const voiceKeys = new Set(voiceSlots.slice(0, choices.voiceCount ?? voiceSlots.length)
    .map(slot => `${slot.blueprintKey}:${slot.index}`));
  return selected.flatMap(blueprint => [
    ...blueprint.channels.flatMap((_, index) => choices.textMode === 'none'
      || (choices.textMode === 'essential' && !ESSENTIAL_TEXT[blueprint.key].includes(index))
      ? [] : [{ blueprintKey: blueprint.key, kind: 'text', index }]),
    ...blueprint.voiceChannels.flatMap((_, index) => voiceKeys.has(`${blueprint.key}:${index}`)
      ? [{ blueprintKey: blueprint.key, kind: 'voice', index }] : []),
  ]);
}

function parseCommunitySelection(value, previous = {}) {
  const prompt = normalizePrompt(value).replace(/["“][^"”]*["”]/gu, '');
  const selection = normalizeCommunitySelection(previous);
  const modes = [];
  if (/\b(?:text|teks)\s+(?:lengkap|full|semua)\b/i.test(prompt)) modes.push('full');
  if (/\b(?:text|teks)\s+(?:inti|essential|ringkas)\b/i.test(prompt)) modes.push('essential');
  if (/\b(?:tanpa|nol|0)\s+(?:text|teks)\b/i.test(prompt)) modes.push('none');
  const voiceMatches = [...prompt.matchAll(/\b(\d+|nol|satu|dua|tiga|empat|lima|enam)\s+(?:voice(?:\s+room)?|ruang\s+suara)\b/gi)];
  const counts = voiceMatches.map(match => /^\d+$/.test(match[1]) ? Number(match[1])
    : ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam'].indexOf(match[1].toLowerCase()));
  if (/\btanpa\s+(?:voice|ruang\s+suara)\b/i.test(prompt)) counts.push(0);
  if (new Set(modes).size > 1 || new Set(counts).size > 1 || counts.some(count => count > 6)) {
    return { selection, changed: true, error: 'Pilih satu cakupan text dan satu jumlah voice dari 0 sampai 6. Belum ada perubahan.' };
  }
  if (modes.length) selection.textMode = modes[0];
  if (counts.length) selection.voiceCount = counts[0];
  return { selection, changed: modes.length > 0 || counts.length > 0, error: null };
}

function normalizePrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCustomLabel(value, kind = 'channel') {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
  let label = value.replace(/[\u2013\u2014]/g, '-').trim();
  if (kind === 'text') label = label.replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
  else label = label.replace(/\s+/g, ' ');
  const limit = kind === 'copy' ? COMMUNITY_COPY_MAX : COMMUNITY_LABEL_MAX;
  if (!label || label.length > limit || COMMUNITY_LABEL_BLOCKED.test(label)) return null;
  if (/^[.\-_]+$/.test(label) || /[*`\[\]\\]/.test(label)) return null;
  return label;
}

function normalizeCommunityCustomization(value) {
  const input = value && typeof value === 'object' ? value : {};
  const categoryNames = {};
  const channelNames = {};
  let count = 0;
  for (const [key, name] of Object.entries(input.categoryNames || {})) {
    if (count >= COMMUNITY_REVISION_MAX) break;
    const normalized = normalizeCustomLabel(name, 'category');
    if (normalized && BLUEPRINTS.some(blueprint => blueprint.key === key)) {
      categoryNames[key] = normalized;
      count += 1;
    }
  }
  for (const [key, name] of Object.entries(input.channelNames || {})) {
    if (count >= COMMUNITY_REVISION_MAX) break;
    const slot = key.match(/^([a-z]+):(text|voice):(\d+)$/);
    const blueprint = BLUEPRINTS.find(item => item.key === slot?.[1]);
    const names = slot?.[2] === 'text' ? blueprint?.channels : blueprint?.voiceChannels;
    const normalized = normalizeCustomLabel(name, slot?.[2]);
    if (normalized && names?.[Number(slot[3])] !== undefined) {
      channelNames[key] = normalized;
      count += 1;
    }
  }
  const welcomeCopy = normalizeCustomLabel(input.welcomeCopy, 'copy');
  return {
    categoryNames,
    channelNames,
    welcomeCopy: welcomeCopy || null,
    warnings: Array.isArray(input.warnings) ? input.warnings.filter(item => typeof item === 'string').slice(0, COMMUNITY_REVISION_MAX).map(item => item.slice(0, 140)) : [],
  };
}

function isCommunityRevisionPrompt(value) {
  const prompt = normalizePrompt(value).replace(/^(?:(?:oke|tolong|coba|sekarang)\s+)+/i, '');
  if (/\b(?:jangan|jgn|jika|kalau|kalo)\b/i.test(prompt.split(/["“]/)[0])) return false;
  return /^(?:(?:pakai|pilih|ambil)\s+)?(?:opsi|template|preset)\b/i.test(prompt)
    || /^(?:ubah|ganti|revisi|sesuaikan)\b.*(?:\b(?:kategori|channel|kanal|voice|text|welcome|sambutan|sapaan)\b|["“])/i.test(prompt)
    || /^(?:welcome|sambutan|sapaan)(?:\s+(?:message|pesan))?\s*(?:jadi|menjadi|:|=>)/i.test(prompt)
    || /^(?:pakai|pilih|gunakan|ubah|ganti)\s+(?:tema|gaya|emoji|ikon|polos|text|teks|\d+\s+voice|tanpa\s+voice)\b/i.test(prompt);
}

function parseHomeWelcomePrompt(value) {
  const prompt = normalizePrompt(value).replace(/^(?:(?:oke|tolong|coba|sekarang)\s+)+/i, '');
  if (!/\b(?:welcome|sambutan|sapaan)\b/i.test(prompt)) return null;
  const header = prompt.split(/["“]/)[0];
  if (/[?]/.test(header) || /\b(?:jangan|jgn|tidak|nggak|gak|belum|bukan|kalau|kalo|jika|kenapa|gimana|cara|apakah|bisa)\b/i.test(header)) return null;
  if (/\b(?:server|struktur|kategori|channel|kanal|opsi|template|preset)\b/i.test(header)) return null;
  if (/^(?:reset|hapus|matikan|nonaktifkan|disable)\s+(?:(?:pesan|custom)\s+)?(?:welcome|sambutan|sapaan)(?:\s+custom)?[.!]*$/i.test(prompt)) {
    return { action: 'clear' };
  }
  if (/^(?:lihat|cek|tampilkan|status)\s+(?:(?:pesan|custom)\s+)?(?:welcome|sambutan|sapaan)(?:\s+(?:custom|sekarang|saat ini))?[.!?]*$/i.test(prompt)) {
    return { action: 'show' };
  }
  const match = prompt.match(/^(?:(?:ubah|ganti|set|jadikan|buat)\s+)?(?:custom\s+)?(?:welcome|sambutan|sapaan)(?:\s+(?:message|pesan|custom))?\s*(?:jadi|menjadi|ke|:|=>)\s*["“]([^"”]+)["”][.!]*$/iu);
  if (!match) {
    if (/^(?:ubah|ganti|set|jadikan|buat)\s+(?:welcome|sambutan|sapaan)\b/i.test(prompt)
      && !/\b(?:opsi|kategori|channel|kanal)\b/i.test(header)) return { action: 'invalid' };
    return null;
  }
  const welcomeCopy = normalizeCustomLabel(match[1], 'copy');
  return welcomeCopy ? { action: 'set', welcomeCopy } : { action: 'invalid' };
}

function buildFocusClarify() {
  return 'Belum ada mode yang diubah. Pilih satu: **fokus belajar** atau **mulai scrim**. Untuk mematikan, bilang **selesai fokus**. Jadwal dan durasi belum dijalankan dari prompt natural.';
}

function parseFocusPrompt(value) {
  const prompt = normalizePrompt(value);
  if (!FOCUS_SIGNAL.test(prompt) || FOCUS_NEGATION.test(prompt) || FOCUS_SCHEDULE.test(prompt)) return null;

  if (/^\s*(?:status|cek|lihat|apa)\s+(?:mode|fokus)\b/i.test(prompt)
      || /\b(?:status|cek)\b.*\b(?:mode|fokus)\b/i.test(prompt)) {
    return { action: 'status' };
  }

  const matches = FOCUS_MODES.filter(item => item.words.test(prompt));
  const modes = [...new Set(matches.map(item => item.mode))];
  const isStop = /\b(?:selesai|matikan|nonaktifkan|berhenti|stop|off)\b/i.test(prompt);
  const hasStart = /\b(?:aktifkan|nyalakan|mulai|jagain|jaga|mau|ingin|pengen|fokus)\b/i.test(prompt);

  if (isStop) {
    return modes.length > 1
      ? { action: 'clarify' }
      : { action: 'off', mode: modes[0] || null };
  }
  if (!hasStart || modes.length !== 1) return { action: 'clarify' };

  const topic = prompt.match(/\b(?:topik|tentang|materi)\s+(.+)$/i)?.[1]?.trim().slice(0, 100) || null;
  return { action: 'start', mode: modes[0], topic };
}

function classifyPrompt(value) {
  const prompt = normalizePrompt(value);
  if (!prompt) return { kind: 'empty', prompt };
  if (prompt.length > MAX_PROMPT_LENGTH) return { kind: 'too_long', prompt };
  if (HELP_PROMPT.test(prompt)) return { kind: 'help', prompt };
  const homeWelcome = parseHomeWelcomePrompt(prompt);
  if (homeWelcome) return { kind: 'home_welcome_action', prompt, ...homeWelcome };
  const isCommunityPlan = COMMUNITY_ACTION.test(prompt) && COMMUNITY_OBJECT.test(prompt);
  const isCommunityRevision = isCommunityRevisionPrompt(prompt);
  if (isCommunityPlan || isCommunityRevision) {
    return {
      kind: isCommunityRevision || hasSpecificCommunityCue(prompt) ? 'community_plan' : 'community_questions',
      prompt,
    };
  }
  const focus = parseFocusPrompt(prompt);
  if (focus) return { kind: 'focus_action', prompt, ...focus };
  return { kind: 'chat', prompt };
}

function hasSpecificCommunityCue(prompt) {
  const lower = normalizePrompt(prompt).toLowerCase();
  return BLUEPRINTS.slice(1).some(blueprint => (
    blueprint.cues.some(cue => lower.includes(cue))
  )) || /\b(?:text|voice|suara|kategori|lobi|ruang|campuran|opsi\s*[1-4]|template|preset)\b/i.test(lower)
    || parseCommunityCustomization(prompt).entries.length > 0;
}

function resolveChannelNameStyle(prompt) {
  const normalized = normalizePrompt(prompt);
  if (CHANNEL_STYLE_EMOJI.test(normalized)) return 'emoji';
  if (CHANNEL_STYLE_PLAIN.test(normalized)) return 'plain';
  return 'plain';
}

function resolveCommunityLayoutStyle(prompt) {
  const normalized = normalizePrompt(prompt);
  if (COMMUNITY_LAYOUT_MIDNIGHT.test(normalized)) return 'midnight';
  if (COMMUNITY_LAYOUT_MINIMAL.test(normalized)) return 'minimal';
  return 'aurora';
}

function communityLayoutLabel(style = 'aurora') {
  return COMMUNITY_LAYOUT_LABELS[style] || COMMUNITY_LAYOUT_LABELS.aurora;
}

function channelName(blueprint, kind, index, style = 'plain') {
  const names = kind === 'voice' ? blueprint.voiceChannels : blueprint.channels;
  const emojiNames = kind === 'voice' ? blueprint.emojiVoiceChannels : blueprint.emojiChannels;
  if (style === 'emoji' && Array.isArray(emojiNames) && emojiNames[index]) return emojiNames[index];
  return names[index];
}

function channelNameAliases(blueprint, kind, index) {
  return [...new Set([
    channelName(blueprint, kind, index, 'plain'),
    channelName(blueprint, kind, index, 'emoji'),
  ].filter(Boolean))];
}

function customizationKey(blueprintKey, kind, index) {
  return `${blueprintKey}:${kind}:${index}`;
}

function customizedCategoryName(blueprint, style, customization) {
  const normalized = normalizeCommunityCustomization(customization);
  return normalized.categoryNames[blueprint.key] || categoryName(blueprint, style);
}

function customizedChannelName(blueprint, kind, index, style, customization) {
  const normalized = normalizeCommunityCustomization(customization);
  return normalized.channelNames[customizationKey(blueprint.key, kind, index)]
    || channelName(blueprint, kind, index, style);
}

function customizedCategoryAliases(blueprint, customization) {
  const normalized = normalizeCommunityCustomization(customization);
  return [...new Set([
    normalized.categoryNames[blueprint.key],
    ...categoryNameAliases(blueprint),
  ].filter(Boolean))];
}

function customizedChannelAliases(blueprint, kind, index, customization) {
  const normalized = normalizeCommunityCustomization(customization);
  return [...new Set([
    normalized.channelNames[customizationKey(blueprint.key, kind, index)],
    ...channelNameAliases(blueprint, kind, index),
  ].filter(Boolean))];
}

function parseCommunityCustomization(prompt, previous = {}) {
  const normalized = normalizePrompt(prompt);
  const base = normalizeCommunityCustomization(previous);
  const categoryNames = { ...base.categoryNames };
  const channelNames = { ...base.channelNames };
  const warnings = [];
  let entries = 0;
  const sourceBlueprints = BLUEPRINTS;

  function addWarning(message) {
    if (!warnings.includes(message) && warnings.length < COMMUNITY_REVISION_MAX) warnings.push(message);
  }

  function resolveSource(source, declaredKind = null) {
    const needle = String(source || '').trim().toLowerCase().replace(/^#+/, '');
    if (!needle) return null;
    for (const blueprint of sourceBlueprints) {
      if (!declaredKind || declaredKind === 'category') {
        if (customizedCategoryAliases(blueprint, base).some(alias => alias.toLowerCase() === needle)) {
          return { blueprint, kind: 'category', index: null };
        }
      }
      if (!declaredKind || declaredKind === 'channel') {
        for (const kind of ['text', 'voice']) {
          const length = kind === 'text' ? blueprint.channels.length : (blueprint.voiceChannels || []).length;
          for (let index = 0; index < length; index += 1) {
            if (customizedChannelAliases(blueprint, kind, index, base).some(alias => alias.toLowerCase() === needle)) {
              return { blueprint, kind, index };
            }
          }
        }
      }
    }
    return null;
  }

  function addPair(source, target, declaredKind = null) {
    if (entries >= COMMUNITY_REVISION_MAX) {
      addWarning('Maksimal delapan revisi nama dalam satu draft.');
      return;
    }
    const resolved = resolveSource(source, declaredKind);
    const normalizedTarget = normalizeCustomLabel(target, resolved?.kind);
    if (!resolved || !normalizedTarget) {
      addWarning('Ada revisi nama yang belum dikenali atau tidak aman. Pakai nama persis dari preview dan label maksimal 90 karakter.');
      return;
    }
    if (resolved.kind === 'category') categoryNames[resolved.blueprint.key] = normalizedTarget;
    else channelNames[customizationKey(resolved.blueprint.key, resolved.kind, resolved.index)] = normalizedTarget;
    entries += 1;
  }

  const quotedPairs = /(?:\b(kategori|category|channel|kanal|text|voice|ruang(?:\s+suara)?)\s+)?["“]([^"”]+)["”]\s+(?:jadi|menjadi|ke)\s+["“]([^"”]+)["”]/giu;
  for (const match of normalized.matchAll(quotedPairs)) {
    const prefix = (match[1] || '').toLowerCase();
    const declaredKind = /kategori|category/.test(prefix) ? 'category' : /channel|kanal|text|voice|ruang/.test(prefix) ? 'channel' : null;
    addPair(match[2], match[3], declaredKind);
  }

  const genericPairs = /\b(?:ubah|ganti)\s+(?:kategori|category|channel|kanal)?\s*([a-z0-9][a-z0-9 _-]{1,63})\s+(?:jadi|menjadi)\s+([a-z0-9][a-z0-9 _-]{1,63})(?=$|[,;]|\s+dan\b)/giu;
  for (const match of normalized.matchAll(genericPairs)) addPair(match[1], match[2]);

  let welcomeCopy = base.welcomeCopy;
  const welcomeMatch = normalized.match(/\b(?:welcome|sambutan|sapaan)(?:\s+(?:message|pesan))?\s*(?:jadi|menjadi|:|=>)\s*["“]([^"”]+)["”]/iu);
  if (welcomeMatch) {
    welcomeCopy = normalizeCustomLabel(welcomeMatch[1], 'copy');
    if (!welcomeCopy) addWarning('Copy sambutan ditolak karena mengandung format yang tidak aman.');
    else entries += 1;
  }
  if (Object.keys(categoryNames).length + Object.keys(channelNames).length > COMMUNITY_REVISION_MAX) {
    addWarning('Maksimal delapan revisi nama dalam satu draft.');
  }
  if (entries === 0 && warnings.length === 0 && /\b(?:ubah|ganti|revisi|sesuaikan)\b/i.test(normalized)
    && !/^(?:ubah|ganti)\s+(?:tema|gaya|text|teks)\b/i.test(normalized)) {
    addWarning('Revisi belum terbaca. Contoh: ubah channel "ngobrol-santai" jadi "nongkrong".');
  }

  return {
    entries,
    customization: normalizeCommunityCustomization({ categoryNames, channelNames, welcomeCopy, warnings }),
    warnings,
  };
}

function categoryName(blueprint, style = 'plain') {
  return style === 'emoji' ? blueprint.emojiCategoryName : blueprint.categoryName;
}

function categoryNameAliases(blueprint) {
  return [...new Set([blueprint.categoryName, blueprint.emojiCategoryName].filter(Boolean))];
}

function isGuildManager({ actor, guild } = {}) {
  if (!actor || !guild) return false;
  const userId = actor.user?.id || actor.author?.id;
  if (String(userId || '') === String(guild.ownerId || '')) return true;
  const permissions = actor.memberPermissions || actor.member?.permissions;
  return permissions?.has?.('Administrator') === true
    || permissions?.has?.(0x0000000000000008n) === true;
}

function isOperationsManager({ actor, guild } = {}) {
  if (!process.env.OWNER_ID) return false;
  return isGuildManager({ actor, guild }) || isEditor(actor);
}

function selectBlueprints(prompt) {
  const lower = prompt.toLowerCase();
  const options = [...lower.matchAll(/\b(?:opsi|template|preset)\s*([1-4](?:\s*(?:,|dan|&|\+)\s*[1-4])*)\b/gi)];
  if (options.length) {
    const selected = new Set(['lobby', ...options.flatMap(match => match[1].match(/[1-4]/g)
      .map(number => BLUEPRINTS[Number(number) - 1].key))]);
    return BLUEPRINTS.filter(blueprint => selected.has(blueprint.key));
  }
  if (/\b(?:campuran|semua\s+area)\b/i.test(lower)) return [...BLUEPRINTS];
  const requested = BLUEPRINTS.filter((blueprint) => (
    blueprint.cues.length === 0
      || blueprint.cues.some(cue => lower.includes(cue))
  ));
  const revision = parseCommunityCustomization(prompt).customization;
  const referenced = new Set([
    ...Object.keys(revision.categoryNames),
    ...Object.keys(revision.channelNames).map(key => key.split(':')[0]),
  ]);
  for (const blueprint of BLUEPRINTS) {
    if (referenced.has(blueprint.key) && !requested.includes(blueprint)) requested.push(blueprint);
  }
  const hasSpecificArea = BLUEPRINTS.slice(1).some(blueprint => blueprint.cues.some(cue => lower.includes(cue)));
  return hasSpecificArea
    ? [BLUEPRINTS[0], ...requested.filter(blueprint => blueprint.key !== 'lobby')]
    : requested;
}

function existingChannelNames(guild) {
  const channels = guild?.channels?.cache;
  if (!channels?.values) return new Set();
  return new Set([...channels.values()]
    .filter(channel => channel?.viewable !== false)
    .filter(channel => typeof channel?.isTextBased !== 'function' || channel.isTextBased())
    .map(channel => String(channel?.name || '').trim().toLowerCase())
    .filter(Boolean));
}

function existingAlias(guild, kind, aliases) {
  const channels = guild?.channels?.cache;
  if (!channels?.values) return null;
  const entries = [...channels.values()].filter(channel => channel?.viewable !== false);
  const types = kind === 'category' ? [ChannelType.GuildCategory]
    : kind === 'voice' ? [ChannelType.GuildVoice, ChannelType.GuildStageVoice]
      : [ChannelType.GuildText, ChannelType.GuildAnnouncement];
  for (const alias of aliases) {
    const found = entries.find(channel => (
      (types.includes(channel.type) || (kind === 'text' && channel.type === undefined
        && (typeof channel.isTextBased !== 'function' || channel.isTextBased())))
      && String(channel.name || '').trim().toLowerCase() === alias.toLowerCase()
    ));
    if (found) return String(found.name).trim();
  }
  return null;
}

function plannedCategoryName(blueprint, guild, style, customization) {
  return existingAlias(guild, 'category', customizedCategoryAliases(blueprint, customization))
    || customizedCategoryName(blueprint, style, customization);
}

function plannedChannel(blueprint, kind, index, guild, style, customization) {
  const actualName = existingAlias(guild, kind, customizedChannelAliases(blueprint, kind, index, customization));
  return {
    name: actualName || customizedChannelName(blueprint, kind, index, style, customization),
    present: Boolean(actualName),
  };
}

function selectBlueprintKeys(prompt) {
  return selectBlueprints(prompt).map(blueprint => blueprint.key);
}

function buildCommunityPlanFromKeys(blueprintKeys, guild, nameStyle = 'plain', customization = {}, layoutStyle = 'aurora', selection = {}) {
  const selected = new Set(Array.isArray(blueprintKeys) ? blueprintKeys : []);
  const revision = normalizeCommunityCustomization(customization);
  const safeLayoutStyle = COMMUNITY_LAYOUT_STYLES.includes(layoutStyle) ? layoutStyle : 'aurora';
  const slots = communityChannelSlots([...selected], selection);
  const sections = BLUEPRINTS
    .filter(blueprint => selected.has(blueprint.key))
    .map(blueprint => {
      const textChannels = slots.filter(slot => slot.blueprintKey === blueprint.key && slot.kind === 'text').map(({ index }) => {
        const { name, present } = plannedChannel(blueprint, 'text', index, guild, nameStyle, revision);
        const marker = present ? 'sudah ada' : 'disarankan';
        return '  ├─ 💬 #' + name + ' (' + marker + ')';
      });
      const voiceChannels = slots.filter(slot => slot.blueprintKey === blueprint.key && slot.kind === 'voice').map(({ index }) => {
        const { name, present } = plannedChannel(blueprint, 'voice', index, guild, nameStyle, revision);
        const marker = present ? 'sudah ada' : 'disarankan';
        return '  └─ 🔊 ' + name + ' (' + marker + ')';
      });
      if (!textChannels.length && !voiceChannels.length) return null;
      const category = plannedCategoryName(blueprint, guild, nameStyle, revision);
      return ['**' + category + '**', ...textChannels, ...voiceChannels].join('\n');
    }).filter(Boolean);

  const revisionLines = [];
  if (Object.keys(revision.categoryNames).length || Object.keys(revision.channelNames).length) {
    revisionLines.push('Revisi draft aktif hanya untuk bagian baru. Channel lama tidak akan di-rename atau dipindah.');
  }
  for (const [key, name] of Object.entries(revision.categoryNames)) {
    revisionLines.push(`Kategori ${key} memakai nama "${name}" hanya jika kategori lama belum ada.`);
  }
  for (const [key, name] of Object.entries(revision.channelNames)) {
    revisionLines.push(`Slot ${key} memakai nama "${name}" hanya jika channel lama belum ada.`);
  }
  if (revision.welcomeCopy) revisionLines.push(`Draft sapaan: "${revision.welcomeCopy}" akan dipasang satu kali setelah Apply.`);
  for (const warning of revision.warnings) revisionLines.push(`Catatan: ${warning}`);

  return [
    '🧭 **Rancangan komunitas Hengs**',
    `Tema preview: **${communityLayoutLabel(safeLayoutStyle)}**`,
    `Pilihan: ${slots.filter(slot => slot.kind === 'text').length} text, ${slots.filter(slot => slot.kind === 'voice').length} voice. Tema hanya untuk kartu preview.`,
    '',
    ...sections,
    ...(revisionLines.length ? ['', ...revisionLines] : []),
    '',
    'Status: ini baru rancangan. Belum ada channel, role, permission, atau pesan yang diubah.',
  ].join('\n').slice(0, 1900);
}

function buildCommunityPlan(prompt, guild) {
  const nameStyle = resolveChannelNameStyle(prompt);
  const layoutStyle = resolveCommunityLayoutStyle(prompt);
  const revision = parseCommunityCustomization(prompt).customization;
  const selection = parseCommunitySelection(prompt);
  if (selection.error) return selection.error;
  return [
    buildCommunityPlanFromKeys(selectBlueprintKeys(prompt), guild, nameStyle, revision, layoutStyle, selection.selection),
    `Gaya nama: **${nameStyle === 'emoji' ? 'ikon dan emoji' : 'polos'}**. Kalau sudah cocok, tekan tombol **Tinjau sekarang** untuk membuka preview privat.`,
  ].join('\n').slice(0, 1900);
}

function buildCommunityQuestions() {
  return [
    '🧩 **Biar rancangan servernya sesuai selera kamu, jawab tiga hal utama dan satu pilihan nama:**',
    '',
    '1. Fokus komunitasnya apa: gaming, creator, belajar, atau campuran?',
    '2. Area text apa yang wajib ada: lobi, mabar, karya, promosi, atau lainnya?',
    '3. Text mau lengkap, inti saja, atau tanpa text? Voice room mau berapa? Pilih 0 sampai jumlah yang tersedia di template.',
    '4. Nama channel mau polos atau pakai ikon dan emoji?',
    '5. Tema preview mau aurora neon, midnight gelap, atau minimal bersih?',
    '',
    'Pilihan cepat: opsi 1 = lobi masuk, opsi 2 = server core, opsi 3 = area gaming, opsi 4 = creator studio.',
    'Text inti = pengumuman, sambutan, rules, dan ruang utama tiap area. Voice dipilih dari area utama dulu, lalu lobi.',
    'Contoh: "rancang opsi 3, text inti, 2 voice room, pakai ikon, tema midnight".',
    'Opsi boleh digabung, misalnya "rancang opsi 2 dan 3, text lengkap, tanpa voice".',
    'Contoh revisi: ubah channel "ngobrol-santai" jadi "nongkrong", pakai emoji.',
    'Setelah itu Hengs kirim preview visual privat. Belum ada channel yang diubah.',
  ].join('\n');
}

function buildPromptHelp() {
  return [
    '💬 **Prompt yang bisa kamu pakai ke Hengs**',
    '',
    '• "Rancang struktur server gaming dengan area mabar dan creator."',
    '• Tambahkan "tema aurora", "tema midnight", atau "tema minimal" untuk memilih gaya kartu preview.',
    '• "Rapikan lobi masuk dan tunjukkan channel yang masih kurang."',
    '• "Buatkan rancangan area creator untuk live stream dan showcase."',
    '• "Buat pengumuman maintenance server malam ini" untuk membuat draft privat di Ops Hub.',
    '• "Buat event mabar jam 20:00" untuk membuat draft reminder di Event Hub.',
    '• "Buat tugas proyek landing page: rapikan hero dan cek mobile" untuk membuat rencana tugas privat di Ops Hub.',
    '• "Catat daftar tugas" atau "ingatkan aku besok jam 7 pagi cek tugas" untuk memori pribadi owner.',
    '• "Fokus belajar topik AI" atau "selesai fokus" untuk kontrol mode pemilik.',
    '• Pertanyaan biasa tetap bisa langsung ditulis tanpa format khusus.',
    '',
    'Untuk sekarang Hengs hanya membuat rancangan. Perubahan server tetap menunggu review dan konfirmasi owner.',
  ].join('\n');
}

function modeLabel(mode) {
  return mode === 'study' ? '📚 BELAJAR' : mode === 'scrim' ? '🎮 SCRIM' : '🔴 OFF';
}

function applyFocusAction({ route, state } = {}) {
  if (!route || route.kind !== 'focus_action') return 'Prompt fokus tidak dikenali.';
  if (route.action === 'clarify') return buildFocusClarify();
  if (!state || typeof state.getMode !== 'function' || typeof state.setMode !== 'function') {
    return 'Mode fokus belum tersedia di runtime ini.';
  }
  if (route.action === 'status') {
    const mode = state.getMode();
    const topic = typeof state.getTopic === 'function' ? state.getTopic() : null;
    const duration = typeof state.getDuration === 'function' ? state.getDuration() : null;
    const topicLine = topic ? `\nTopik: ${topic}` : '';
    const durationLine = Number.isFinite(duration) ? `\nDurasi: ${duration} menit` : '';
    return `📊 Status mode Discord\nMode: ${modeLabel(mode)}${topicLine}${durationLine}`;
  }
  if (route.action === 'off') {
    const current = state.getMode();
    if (current === 'off') return 'Mode fokus Discord memang sudah OFF.';
    if (route.mode && current !== route.mode) return 'Mode itu bukan yang sedang aktif. Belum ada yang diubah.';
    state.setMode('off');
    return '✅ Mode fokus Discord dimatikan. Pengelolaan chat kembali normal.';
  }
  if (route.action !== 'start' || !FOCUS_MODES.some(item => item.mode === route.mode)) {
    return buildFocusClarify();
  }
  const boundedTopic = typeof route.topic === 'string' ? route.topic.trim().slice(0, 100) || null : null;
  state.setMode(route.mode, boundedTopic);
  const topic = boundedTopic ? ` Topik: ${boundedTopic}.` : '';
  return `✅ ${modeLabel(route.mode)} aktif di Discord.${topic}`;
}

function resolvePrompt({ prompt, scopeKind, actor, guild, privateReply = false, personalPending = false, communityDraft = null } = {}) {
  const result = classifyPrompt(prompt);
  if (result.kind === 'help') return { handled: true, kind: 'help', content: buildPromptHelp() };
  if (result.kind === 'home_welcome_action') {
    if (scopeKind !== 'home' || !privateReply) {
      return {
        handled: true,
        kind: 'permission',
        content: 'Kontrol welcome custom hanya tersedia privat lewat `/hengs ask` di server utama.',
      };
    }
    if (!isGuildManager({ actor, guild })) {
      return {
        handled: true,
        kind: 'permission',
        content: 'Welcome custom hanya bisa diubah owner atau Administrator server utama.',
      };
    }
    return { handled: true, ...result };
  }
  const personal = parsePersonalPrompt(prompt);
  if ((personal && personal.kind !== 'follow_up') || personalPending) {
    if (!privateReply || scopeKind !== 'home' || !isGuildManager({ actor, guild })) {
      return {
        handled: true,
        kind: 'permission',
        content: 'Catatan dan pengingat pribadi hanya diproses lewat `/hengs ask` di server utama supaya hasilnya tetap privat.',
      };
    }
    return { handled: true, ...personal, kind: 'personal_action' };
  }
  const operation = parseOperationPrompt(prompt);
  if (operation) {
    if (scopeKind !== 'home') return { handled: false, kind: operation.kind };
    if (!isOperationsManager({ actor, guild })) {
      return {
        handled: true,
        kind: 'permission',
        content: 'Draft pengumuman dan event hanya bisa dibuat owner atau editor Ops Hub. Pertanyaan biasa tetap bisa kamu ajukan ke Hengs.',
      };
    }
    if (operation.kind === 'operation_questions') {
      return {
        handled: true,
        kind: operation.kind,
        operation: operation.operation,
        content: operationReply(operation),
      };
    }
    return { handled: true, ...operation };
  }
  if (result.kind === 'focus_action') {
    if (scopeKind !== 'home') return { handled: false, kind: result.kind };
    if (!isGuildManager({ actor, guild })) {
      return {
        handled: true,
        kind: 'permission',
        content: 'Perubahan mode fokus Discord hanya bisa dilakukan pemilik server atau Administrator. Pertanyaan biasa tetap bisa kamu ajukan ke Hengs.',
      };
    }
    return { handled: true, ...result };
  }
  if (!['community_plan', 'community_questions'].includes(result.kind)) {
    return { handled: false, kind: result.kind };
  }
  if (scopeKind !== 'home') return { handled: false, kind: result.kind };
  if (!isGuildManager({ actor, guild })) {
    return {
      handled: true,
      kind: 'permission',
      content: 'Rancangan struktur server hanya bisa diminta pemilik server atau Administrator. Pertanyaan biasa tetap bisa kamu ajukan ke Hengs.',
    };
  }
  if (result.kind === 'community_questions') return { handled: true, kind: result.kind, content: buildCommunityQuestions() };
  const continuing = communityDraft && isCommunityRevisionPrompt(result.prompt);
  const parsed = parseCommunityCustomization(result.prompt, continuing ? communityDraft.customization : {});
  if (parsed.warnings.length) {
    return { handled: true, kind: 'community_revision_invalid', content: parsed.warnings.join('\n') + '\nDraft sebelumnya tetap utuh. Belum ada yang diterapkan.' };
  }
  const hasOption = /\b(?:opsi|template|preset)\s*([1-4])\b/i.test(result.prompt);
  const blueprintKeys = continuing && !hasOption ? communityDraft.blueprintKeys : selectBlueprintKeys(result.prompt);
  const chosen = parseCommunitySelection(result.prompt, continuing ? communityDraft.selection : {});
  if (chosen.error) return { handled: true, kind: 'community_selection_invalid', content: chosen.error };
  let slots;
  try { slots = communityChannelSlots(blueprintKeys, chosen.selection); } catch {
    const available = BLUEPRINTS.filter(blueprint => blueprintKeys.includes(blueprint.key))
      .reduce((total, blueprint) => total + blueprint.voiceChannels.length, 0);
    return { handled: true, kind: 'community_selection_invalid', content: `Template area ini menyediakan maksimal ${available} voice room. Pilih jumlah dari 0 sampai ${available}. Belum ada perubahan.` };
  }
  if (!slots.length || (parsed.customization.welcomeCopy && !slots.some(slot => slot.blueprintKey === 'lobby' && slot.kind === 'text' && slot.index === 1))) {
    return { handled: true, kind: 'community_selection_invalid', content: 'Pilih minimal satu channel. Untuk memasang sapaan, sertakan text inti atau text lengkap. Belum ada perubahan.' };
  }
  const hasStyle = CHANNEL_STYLE_EMOJI.test(result.prompt) || CHANNEL_STYLE_PLAIN.test(result.prompt);
  const nameStyle = continuing && !hasStyle ? communityDraft.nameStyle : resolveChannelNameStyle(result.prompt);
  const hasLayoutStyle = COMMUNITY_LAYOUT_AURORA.test(result.prompt)
    || COMMUNITY_LAYOUT_MIDNIGHT.test(result.prompt)
    || COMMUNITY_LAYOUT_MINIMAL.test(result.prompt);
  const layoutStyle = continuing && !hasLayoutStyle
    ? (communityDraft.layoutStyle || 'aurora')
    : resolveCommunityLayoutStyle(result.prompt);
  return {
    handled: true,
    kind: result.kind,
    content: `${buildCommunityPlanFromKeys(blueprintKeys, guild, nameStyle, parsed.customization, layoutStyle, chosen.selection)}\nGaya nama: **${nameStyle === 'emoji' ? 'ikon dan emoji' : 'polos'}**. Tinjau lalu konfirmasi owner sebelum menerapkan.`.slice(0, 1900),
    blueprintKeys,
    nameStyle,
    layoutStyle,
    selection: chosen.selection,
    customization: parsed.customization,
    replaceTicketId: continuing ? communityDraft.id : null,
  };
}

module.exports = {
  MAX_PROMPT_LENGTH,
  BLUEPRINTS,
  CHANNEL_NAME_STYLES,
  COMMUNITY_LAYOUT_STYLES,
  normalizeCommunitySelection,
  parseCommunitySelection,
  communityChannelSlots,
  isGuildManager,
  normalizePrompt,
  classifyPrompt,
  buildCommunityPlan,
  buildCommunityPlanFromKeys,
  buildCommunityQuestions,
  buildPromptHelp,
  applyFocusAction,
  existingChannelNames,
  parseFocusPrompt,
  resolvePrompt,
  selectBlueprintKeys,
  hasSpecificCommunityCue,
  channelName,
  channelNameAliases,
  categoryName,
  categoryNameAliases,
  resolveChannelNameStyle,
  resolveCommunityLayoutStyle,
  communityLayoutLabel,
  COMMUNITY_REVISION_MAX,
  normalizeCommunityCustomization,
  parseCommunityCustomization,
  parseHomeWelcomePrompt,
  customizationKey,
  customizedCategoryName,
  customizedChannelName,
  customizedCategoryAliases,
  customizedChannelAliases,
  isCommunityRevisionPrompt,
  plannedCategoryName,
  plannedChannel,
};
