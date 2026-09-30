'use strict';

// Prompt-first helper untuk Discord.
// Modul ini sengaja tidak memanggil Discord API dan tidak menulis state.
// Ia hanya mengenali permintaan yang aman untuk dijawab sebagai rancangan.

const MAX_PROMPT_LENGTH = 1800;

const COMMUNITY_ACTION = /\b(?:buat|buatkan|bikin|rancang|siapkan|susun|atur|desain|rapikan)\b/i;
const COMMUNITY_OBJECT = /\b(?:server|channel|kategori|ruang|komunitas|struktur|lobi|gaming|mabar|creator|galeri)\b/i;
const HELP_PROMPT = /\b(?:apa yang bisa|bisa apa|cara pakai|contoh prompt|prompt apa|help)\b/i;

const BLUEPRINTS = Object.freeze([
  Object.freeze({
    key: 'lobby',
    title: 'LOBI MASUK',
    cues: [],
    channels: ['announcements', 'selamat-datang', 'aturan-server', 'verify-here', 'ambil-role', 'intro-dulu-ngab'],
  }),
  Object.freeze({
    key: 'core',
    title: 'SERVER CORE',
    cues: ['boost', 'server core'],
    channels: ['boost'],
  }),
  Object.freeze({
    key: 'gaming',
    title: 'AREA GAMING',
    cues: ['gaming', 'game', 'mabar', 'moba', 'roblox', 'valorant', 'mobile legend'],
    channels: ['ngobrol-santai', 'info-mabar', 'galeri-mix', 'galeri-moba', 'galeri-roblox'],
  }),
  Object.freeze({
    key: 'creator',
    title: 'CREATOR STUDIO',
    cues: ['creator', 'stream', 'live', 'showcase', 'promosi-konten'],
    channels: ['live-stream', 'showcase', 'promosi-konten'],
  }),
]);

function normalizePrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function classifyPrompt(value) {
  const prompt = normalizePrompt(value);
  if (!prompt) return { kind: 'empty', prompt };
  if (prompt.length > MAX_PROMPT_LENGTH) return { kind: 'too_long', prompt };
  if (HELP_PROMPT.test(prompt)) return { kind: 'help', prompt };
  if (COMMUNITY_ACTION.test(prompt) && COMMUNITY_OBJECT.test(prompt)) {
    return { kind: 'community_plan', prompt };
  }
  return { kind: 'chat', prompt };
}

function isGuildManager({ actor, guild } = {}) {
  if (!actor || !guild) return false;
  const userId = actor.user?.id || actor.author?.id;
  if (String(userId || '') === String(guild.ownerId || '')) return true;
  const permissions = actor.memberPermissions || actor.member?.permissions;
  return permissions?.has?.('Administrator') === true
    || permissions?.has?.(0x0000000000000008n) === true;
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
    .map(channel => String(channel?.name || '').trim().toLowerCase())
    .filter(Boolean));
}

function buildCommunityPlan(prompt, guild) {
  const existing = existingChannelNames(guild);
  const sections = selectBlueprints(prompt).map(blueprint => {
    const channels = blueprint.channels.map(name => {
      const marker = existing.has(name) ? 'sudah ada' : 'disarankan';
      return `  • #${name} (${marker})`;
    });
    return `**${blueprint.title}**\n${channels.join('\n')}`;
  });

  return [
    '🧭 **Rancangan komunitas Hengs**',
    '',
    ...sections,
    '',
    'Status: ini baru rancangan. Belum ada channel, role, permission, atau pesan yang diubah.',
    'Kalau sudah cocok, lanjutkan dengan prompt: "Hengs, buatkan draft penerapannya".',
  ].join('\n').slice(0, 1900);
}

function buildPromptHelp() {
  return [
    '💬 **Prompt yang bisa kamu pakai ke Hengs**',
    '',
    '• "Rancang struktur server gaming dengan area mabar dan creator."',
    '• "Rapikan lobi masuk dan tunjukkan channel yang masih kurang."',
    '• "Buatkan rancangan area creator untuk live stream dan showcase."',
    '• Pertanyaan biasa tetap bisa langsung ditulis tanpa format khusus.',
    '',
    'Untuk sekarang Hengs hanya membuat rancangan. Perubahan server tetap menunggu review dan konfirmasi owner.',
  ].join('\n');
}

function resolvePrompt({ prompt, scopeKind, actor, guild } = {}) {
  const result = classifyPrompt(prompt);
  if (result.kind === 'help') return { handled: true, kind: 'help', content: buildPromptHelp() };
  if (result.kind !== 'community_plan') return { handled: false, kind: result.kind };
  if (scopeKind !== 'home') return { handled: false, kind: result.kind };
  if (!isGuildManager({ actor, guild })) {
    return {
      handled: true,
      kind: 'permission',
      content: 'Rancangan struktur server hanya bisa diminta pemilik server atau Administrator. Pertanyaan biasa tetap bisa kamu ajukan ke Hengs.',
    };
  }
  return { handled: true, kind: 'community_plan', content: buildCommunityPlan(result.prompt, guild) };
}

module.exports = {
  MAX_PROMPT_LENGTH,
  BLUEPRINTS,
  normalizePrompt,
  classifyPrompt,
  buildCommunityPlan,
  buildPromptHelp,
  resolvePrompt,
};
