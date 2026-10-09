'use strict';

// Prompt-first helper untuk Discord.
// Modul ini sengaja tidak memanggil Discord API dan tidak menulis state.
// Ia hanya mengenali permintaan yang aman untuk dijawab sebagai rancangan.

const MAX_PROMPT_LENGTH = 1800;
const { isEditor } = require('./ops/permissions');
const { parseOperationPrompt, operationReply } = require('./prompt-operations');
const { parsePersonalPrompt } = require('./personal-assistant');

const COMMUNITY_ACTION = /\b(?:buat|buatkan|bikin|rancang|siapkan|susun|atur|desain|rapikan)\b/i;
const COMMUNITY_OBJECT = /\b(?:server|channel|kategori|ruang|komunitas|struktur|lobi|gaming|mabar|creator|galeri)\b/i;
const HELP_PROMPT = /\b(?:apa yang bisa|bisa apa|cara pakai|contoh prompt|prompt apa|help)\b/i;
const FOCUS_SIGNAL = /\b(?:fokus|jagain|jaga|mode|study|scrim|belajar|latihan|turnamen|tournament)\b/i;
const FOCUS_NEGATION = /[?"“”]|\b(?:jangan|jgn|tidak|nggak|gak|ga|enggak|belum|bukan|kalau|kalo|jika|seandainya|kenapa|mengapa|bagaimana|gimana|cara|apakah|apa|siapa|kapan|mana|harus|bisa|bantu|jelaskan|ajarin|ajari)\b/i;
const FOCUS_SCHEDULE = /\b(?:besok|nanti|jam|pukul|menit|durasi|selama)\b|\d+\s*(?:j|h|m)\b/i;
const CHANNEL_STYLE_EMOJI = /\b(?:emoji|ikon|icon|estetik|aesthetic)\b/i;
const CHANNEL_STYLE_PLAIN = /\b(?:polos|plain|sederhana|minimal)\b/i;

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

function normalizePrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  if (COMMUNITY_ACTION.test(prompt) && COMMUNITY_OBJECT.test(prompt)) {
    return {
      kind: hasSpecificCommunityCue(prompt) ? 'community_plan' : 'community_questions',
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
  )) || /\b(?:text|voice|suara|kategori|lobi|ruang)\b/i.test(lower);
}

function resolveChannelNameStyle(prompt) {
  const normalized = normalizePrompt(prompt);
  if (CHANNEL_STYLE_EMOJI.test(normalized)) return 'emoji';
  if (CHANNEL_STYLE_PLAIN.test(normalized)) return 'plain';
  return 'plain';
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
  const requested = BLUEPRINTS.filter((blueprint) => (
    blueprint.cues.length === 0
      || blueprint.cues.some(cue => lower.includes(cue))
  ));
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

function selectBlueprintKeys(prompt) {
  return selectBlueprints(prompt).map(blueprint => blueprint.key);
}

function buildCommunityPlanFromKeys(blueprintKeys, guild, nameStyle = 'plain') {
  const selected = new Set(Array.isArray(blueprintKeys) ? blueprintKeys : []);
  const existing = existingChannelNames(guild);
  const sections = BLUEPRINTS
    .filter(blueprint => selected.has(blueprint.key))
    .map(blueprint => {
      const textChannels = blueprint.channels.map((_, index) => {
        const name = channelName(blueprint, 'text', index, nameStyle);
        const marker = channelNameAliases(blueprint, 'text', index).some(alias => existing.has(alias))
          ? 'sudah ada' : 'disarankan';
        return '  ├─ 💬 #' + name + ' (' + marker + ')';
      });
      const voiceChannels = (blueprint.voiceChannels || []).map((_, index) => {
        const name = channelName(blueprint, 'voice', index, nameStyle);
        const marker = channelNameAliases(blueprint, 'voice', index).some(alias => existing.has(alias))
          ? 'sudah ada' : 'disarankan';
        return '  └─ 🔊 ' + name + ' (' + marker + ')';
      });
      const category = categoryName(blueprint, nameStyle);
      return ['**' + category + '**', ...textChannels, ...voiceChannels].join('\n');
    });

  return [
    '🧭 **Rancangan komunitas Hengs**',
    '',
    ...sections,
    '',
    'Status: ini baru rancangan. Belum ada channel, role, permission, atau pesan yang diubah.',
  ].join('\n').slice(0, 1900);
}

function buildCommunityPlan(prompt, guild) {
  const nameStyle = resolveChannelNameStyle(prompt);
  return [
    buildCommunityPlanFromKeys(selectBlueprintKeys(prompt), guild, nameStyle),
    `Gaya nama: **${nameStyle === 'emoji' ? 'ikon dan emoji' : 'polos'}**. Kalau sudah cocok, tekan tombol **Tinjau sekarang** untuk membuka preview privat.`,
  ].join('\n').slice(0, 1900);
}

function buildCommunityQuestions() {
  return [
    '🧩 **Biar rancangan servernya sesuai selera kamu, jawab tiga hal ini:**',
    '',
    '1. Fokus komunitasnya apa: gaming, creator, belajar, atau campuran?',
    '2. Area text apa yang wajib ada: lobi, mabar, karya, promosi, atau lainnya?',
    '3. Voice room-nya mau berapa dan untuk apa: santai, mabar, tournament, atau live?',
    '4. Nama channel mau polos atau pakai ikon dan emoji?',
    '',
    'Contoh: "gaming santai, text mabar dan galeri, tiga voice room untuk mabar dan tournament".',
    'Contoh: "gaming santai, text mabar dan galeri, tiga voice room, pakai ikon".',
    'Setelah itu Hengs kirim preview visual privat. Belum ada channel yang diubah.',
  ].join('\n');
}

function buildPromptHelp() {
  return [
    '💬 **Prompt yang bisa kamu pakai ke Hengs**',
    '',
    '• "Rancang struktur server gaming dengan area mabar dan creator."',
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

function resolvePrompt({ prompt, scopeKind, actor, guild, privateReply = false, personalPending = false } = {}) {
  const result = classifyPrompt(prompt);
  if (result.kind === 'help') return { handled: true, kind: 'help', content: buildPromptHelp() };
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
  return {
    handled: true,
    kind: result.kind,
    content: result.kind === 'community_questions'
      ? buildCommunityQuestions()
      : buildCommunityPlan(result.prompt, guild),
    ...(result.kind === 'community_plan'
      ? {
        blueprintKeys: selectBlueprintKeys(result.prompt),
        nameStyle: resolveChannelNameStyle(result.prompt),
      }
      : {}),
  };
}

module.exports = {
  MAX_PROMPT_LENGTH,
  BLUEPRINTS,
  CHANNEL_NAME_STYLES,
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
};
