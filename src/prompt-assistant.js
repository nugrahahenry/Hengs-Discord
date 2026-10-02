'use strict';

// Prompt-first helper untuk Discord.
// Modul ini sengaja tidak memanggil Discord API dan tidak menulis state.
// Ia hanya mengenali permintaan yang aman untuk dijawab sebagai rancangan.

const MAX_PROMPT_LENGTH = 1800;
const { isEditor } = require('./ops/permissions');
const { parseOperationPrompt, operationReply } = require('./prompt-operations');

const COMMUNITY_ACTION = /\b(?:buat|buatkan|bikin|rancang|siapkan|susun|atur|desain|rapikan)\b/i;
const COMMUNITY_OBJECT = /\b(?:server|channel|kategori|ruang|komunitas|struktur|lobi|gaming|mabar|creator|galeri)\b/i;
const HELP_PROMPT = /\b(?:apa yang bisa|bisa apa|cara pakai|contoh prompt|prompt apa|help)\b/i;
const FOCUS_SIGNAL = /\b(?:fokus|jagain|jaga|mode|study|scrim|belajar|latihan|turnamen|tournament)\b/i;
const FOCUS_NEGATION = /[?"“”]|\b(?:jangan|jgn|tidak|nggak|gak|ga|enggak|belum|bukan|kalau|kalo|jika|seandainya|kenapa|mengapa|bagaimana|gimana|cara|apakah|apa|siapa|kapan|mana|harus|bisa|bantu|jelaskan|ajarin|ajari)\b/i;
const FOCUS_SCHEDULE = /\b(?:besok|nanti|jam|pukul|menit|durasi|selama)\b|\d+\s*(?:j|h|m)\b/i;

const FOCUS_MODES = Object.freeze([
  Object.freeze({ mode: 'study', words: /\b(?:belajar|study)\b/i }),
  Object.freeze({ mode: 'scrim', words: /\b(?:scrim|latihan|turnamen|tournament)\b/i }),
]);

const BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: 'lobby',
    title: 'LOBI MASUK',
    cues: [],
    channels: ['announcements', 'selamat-datang', 'aturan-server', 'verify-here', 'ambil-role', 'intro-dulu-ngab'],
    voiceChannels: ['ruang-tunggu'],
  }),
  Object.freeze({
    key: 'core',
    title: 'SERVER CORE',
    cues: ['boost', 'server core'],
    channels: ['boost'],
    voiceChannels: ['AFK'],
  }),
  Object.freeze({
    key: 'gaming',
    title: 'AREA GAMING',
    cues: ['gaming', 'game', 'mabar', 'moba', 'roblox', 'valorant', 'mobile legend'],
    channels: ['ngobrol-santai', 'info-mabar', 'galeri-mix', 'galeri-moba', 'galeri-roblox'],
    voiceChannels: ['mabar-1', 'mabar-2', 'tournament-room'],
  }),
  Object.freeze({
    key: 'creator',
    title: 'CREATOR STUDIO',
    cues: ['creator', 'stream', 'live', 'showcase', 'promosi-konten'],
    channels: ['live-stream', 'showcase', 'promosi-konten'],
    voiceChannels: ['live-room'],
  }),
]);

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

function buildCommunityPlanFromKeys(blueprintKeys, guild) {
  const selected = new Set(Array.isArray(blueprintKeys) ? blueprintKeys : []);
  const existing = existingChannelNames(guild);
  const sections = BLUEPRINTS
    .filter(blueprint => selected.has(blueprint.key))
    .map(blueprint => {
      const textChannels = blueprint.channels.map(name => {
        const marker = existing.has(name) ? 'sudah ada' : 'disarankan';
        return '  ├─ 💬 #' + name + ' (' + marker + ')';
      });
      const voiceChannels = (blueprint.voiceChannels || []).map(name => {
        const marker = existing.has(name) ? 'sudah ada' : 'disarankan';
        return '  └─ 🔊 ' + name + ' (' + marker + ')';
      });
      return ['**' + blueprint.title + '**', ...textChannels, ...voiceChannels].join('\n');
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
  return [
    buildCommunityPlanFromKeys(selectBlueprintKeys(prompt), guild),
    'Kalau sudah cocok, tekan tombol **Tinjau sekarang** untuk membuka preview privat.',
  ].join('\n').slice(0, 1900);
}

function buildCommunityQuestions() {
  return [
    '🧩 **Biar rancangan servernya sesuai selera kamu, jawab tiga hal ini:**',
    '',
    '1. Fokus komunitasnya apa: gaming, creator, belajar, atau campuran?',
    '2. Area text apa yang wajib ada: lobi, mabar, karya, promosi, atau lainnya?',
    '3. Voice room-nya mau berapa dan untuk apa: santai, mabar, tournament, atau live?',
    '',
    'Contoh: "gaming santai, text mabar dan galeri, tiga voice room untuk mabar dan tournament".',
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

function resolvePrompt({ prompt, scopeKind, actor, guild } = {}) {
  const result = classifyPrompt(prompt);
  if (result.kind === 'help') return { handled: true, kind: 'help', content: buildPromptHelp() };
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
    ...(result.kind === 'community_plan' ? { blueprintKeys: selectBlueprintKeys(result.prompt) } : {}),
  };
}

module.exports = {
  MAX_PROMPT_LENGTH,
  BLUEPRINTS,
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
};
