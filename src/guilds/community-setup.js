'use strict';

// /admin setup v2 plan: from the server's current channels and the owner's choices (packages, News/Memes, theme,
// rename), work out which categories and channels to create or reuse and, when asked, which decorated names to
// rename. Pure, so the preview image and the apply step use exactly the same plan.
const { slugOf, firstEmoji, labelOf } = require('./channel-style');
const { TYPES: ROOM_TYPES } = require('../voice-rooms/types');

const CATEGORIES = Object.freeze({
  lobby: { emoji: '🚪', label: 'Lobby', aliases: ['lobby', 'welcome', 'get started', 'start here'] },
  komunitas: { emoji: '💬', label: 'Community', aliases: ['community', 'komunitas'] },
  gaming: { emoji: '🎮', label: 'Area Gaming', aliases: ['area gaming', 'gaming'] },
  hengs: { emoji: '🤖', label: 'Hengs', aliases: ['hengs', 'bot center', 'bot'] },
  creator: { emoji: '🎬', label: 'Creator Studio', aliases: ['creator studio', 'creator'] },
  voice: { emoji: '🔊', label: 'Voice', aliases: ['voice', 'voice channels'] },
  room: { emoji: '🎛️', label: 'Bikin Room', aliases: ['bikin room', 'room', 'voice room', 'room voice'] },
  admin: { emoji: '🔒', label: 'Admin', aliases: ['admin', 'private', 'privat', 'staff', 'mod', 'bot admin'] },
});
const ORDER = ['lobby', 'komunitas', 'gaming', 'hengs', 'creator', 'voice', 'room', 'admin'];

// kind: read (members read and react), chat (server defaults), tanya/analis/news/memes/scrim (Hengs' own), voice.
const PACKAGES = Object.freeze([
  { key: 'lobby', label: 'Lobby', about: 'welcome, rules, ambil-role', category: 'lobby',
    channels: [['👋', 'welcome', 'read'], ['📜', 'rules', 'read'], ['🎭', 'ambil-role', 'read']] },
  { key: 'komunitas', label: 'Komunitas', about: 'ngobrol, media', category: 'komunitas', channels: [['💬', 'ngobrol', 'chat'], ['📷', 'media', 'chat']] },
  { key: 'gaming', label: 'Gaming', about: 'mabar, info-scrim', category: 'gaming', channels: [['🎮', 'mabar', 'chat'], ['⚔️', 'info-scrim', 'chat']] },
  { key: 'hengs', label: 'Hengs', about: 'tanya-hengs, hengs-analis', category: 'hengs', channels: [['🤖', 'tanya-hengs', 'tanya'], ['📊', 'hengs-analis', 'analis']] },
  { key: 'tim', label: 'Tim scrim', about: 'hasil-scrim, privat Hengs Family', category: 'hengs', channels: [['📸', 'hasil-scrim', 'scrim']] },
  { key: 'creator', label: 'Creator', about: 'live-stream, showcase', category: 'creator', channels: [['🎥', 'live-stream', 'chat'], ['✨', 'showcase', 'chat']] },
  { key: 'voice', label: 'Voice', about: 'Lounge, AFK', category: 'voice', channels: [['🔊', 'Lounge', 'voice'], ['💤', 'AFK', 'voice']] },
  // Doors of the voice rooms (2026-10-26): joining one makes a room of that type (src/voice-rooms). belajar-bareng
  // (2026-10-28) carries the Belajar room posts and the weekly Rajin Belajar board, and members chat there.
  { key: 'room', label: 'Bikin Room', about: 'pintu room voice: Mabar, Scrim, Diskusi, Belajar, Nobar, Karaoke, Privat, plus belajar-bareng',
    category: 'room', channels: [...ROOM_TYPES.map(type => [type.emoji, `Bikin ${type.label}`, 'door']), ['📚', 'belajar-bareng', 'chat']] },
  // Owner channels (2026-10-26): decisions in bot-settings, failure notes in bot-logs, online notices and status in bot-status.
  { key: 'admin', label: 'Admin Hengs', about: 'bot-settings, bot-logs, bot-status (privat)', category: 'admin',
    channels: [['⚙️', 'bot-settings', 'admin'], ['📋', 'bot-logs', 'admin'], ['📡', 'bot-status', 'admin']] },
]);
const EXTRAS = Object.freeze({ news: ['📰', 'hengs-news', 'news'], memes: ['😂', 'hengs-memes', 'memes'] });

const TEXT_TYPES = [0, 5, 15];
const VOICE_TYPES = [2, 13];
const CATEGORY_TYPE = 4;
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

function buildPlan({ inventory = [], packages = [], extras = {}, theme, rename = false } = {}) {
  const chosen = packages.map(key => PACKAGES.find(p => p.key === key) || (() => { throw new Error('SETUP_PACKAGE_UNKNOWN'); })());
  const wanted = Object.keys(EXTRAS).filter(key => extras[key]);
  if (!chosen.length && !wanted.length) throw new Error('SETUP_NOTHING_SELECTED');
  const categoriesIn = inventory.filter(c => c.type === CATEGORY_TYPE);
  const channelsIn = inventory.filter(c => c.type !== CATEGORY_TYPE);

  // Renames first, so reused rows and sections show the names they will end up with.
  const renamed = new Map();
  if (rename) {
    for (const item of inventory) {
      const emoji = firstEmoji(item.name);
      // A name that is only decoration ("🎮") has nothing to keep, so it is never renamed.
      if (!emoji || !slugOf(item.name)) continue;
      const to = item.type === CATEGORY_TYPE ? theme.category(emoji, labelOf(item.name))
        : VOICE_TYPES.includes(item.type) ? theme.voice(emoji, labelOf(item.name))
          : TEXT_TYPES.includes(item.type) ? theme.channel(emoji, slugOf(item.name)) : null;
      if (to && to !== item.name) renamed.set(item.id, to);
    }
  }
  const nameOf = item => renamed.get(item.id) || item.name;

  const keys = ORDER.filter(key => chosen.some(p => p.category === key) || (key === 'hengs' && wanted.length));
  const categories = keys.map(key => {
    const def = CATEGORIES[key];
    const existing = categoriesIn.filter(c => def.aliases.includes(slugOf(c.name))).sort(byPosition)[0];
    return { key, id: existing?.id || null, name: existing ? nameOf(existing) : theme.category(def.emoji, def.label) };
  });

  const channels = [];
  for (const key of keys) {
    const defs = chosen.filter(p => p.category === key).flatMap(p => p.channels);
    if (key === 'hengs') defs.push(...wanted.map(extra => EXTRAS[extra]));
    for (const [emoji, label, kind] of defs) {
      const type = kind === 'voice' || kind === 'door' ? 'voice' : 'text';
      const slug = slugOf(label);
      const existing = channelsIn.filter(c => (type === 'voice' ? VOICE_TYPES : TEXT_TYPES).includes(c.type) && slugOf(c.name) === slug)
        .sort(byPosition)[0];
      channels.push({ key, categoryKey: key, slug, emoji, kind, type, id: existing?.id || null,
        name: existing ? nameOf(existing) : type === 'voice' ? theme.voice(emoji, label) : theme.channel(emoji, label) });
    }
  }

  // Preview sections in sidebar order: loose channels, then categories by position, then new categories.
  const row = item => ({ name: nameOf(item), kind: VOICE_TYPES.includes(item.type) ? 'voice' : 'text',
    ...(renamed.has(item.id) ? { renamedFrom: item.name } : {}) });
  const children = parentId => channelsIn.filter(c => (c.parentId || null) === parentId)
    .sort((a, b) => (VOICE_TYPES.includes(a.type) - VOICE_TYPES.includes(b.type)) || byPosition(a, b)).map(row);
  const sections = [{ id: null, category: null, channels: children(null) },
    ...categoriesIn.sort(byPosition).map(c => ({ id: c.id, category: nameOf(c), channels: children(c.id) }))];
  for (const category of categories.filter(c => !c.id)) sections.push({ id: `new:${category.key}`, category: category.name, channels: [] });
  for (const channel of channels.filter(c => !c.id)) {
    const category = categories.find(c => c.key === channel.categoryKey);
    sections.find(s => s.id === (category.id || `new:${category.key}`)).channels.push({ name: channel.name, kind: channel.type, isNew: true });
  }
  // With renames every section can change, so all show; otherwise only the sections that get something new.
  const present = sections.filter(s => s.category || s.channels.length);
  const shown = rename ? present : sections.filter(s => String(s.id).startsWith('new:') || s.channels.some(c => c.isNew));
  // Renames in sidebar order: each category, then its channels.
  const flat = sections.flatMap(s => [s.id, ...channelsIn.filter(c => (c.parentId || null) === s.id).sort(byPosition).map(c => c.id)]);
  const renames = inventory.filter(item => renamed.has(item.id)).sort((a, b) => flat.indexOf(a.id) - flat.indexOf(b.id))
    .map(item => ({ id: item.id, type: item.type === CATEGORY_TYPE ? 'category' : VOICE_TYPES.includes(item.type) ? 'voice' : 'text',
      from: item.name, to: renamed.get(item.id) }));
  return {
    categories, channels, renames, sections: shown, untouchedSections: present.length - shown.length,
    counts: { categories: categories.filter(c => !c.id).length, channels: channels.filter(c => !c.id).length,
      reused: channels.filter(c => c.id).length, renames: renames.length },
  };
}

const TOPICS = Object.freeze({
  tanya: 'Ngobrol sama Hengs: mention @Hengs + pertanyaanmu. Kirim meme atau berita juga bisa di sini. Panduan ada di pesan yang di-pin.',
  analis: 'Rekap MLBB pro dari Hengs: hasil series, draft hero, catatan dari angka. Data: Liquipedia (CC-BY-SA 3.0). Panduan ada di pesan yang di-pin.',
  news: 'Berita pilihan Hengs dan kiriman anggota lewat /kirim berita. Kiriman anggota bukan verifikasi fakta.',
  memes: 'Meme dari Hengs dan anggota. Kirim punyamu lewat /kirim meme di tanya-hengs.',
  scrim: 'Hasil scrim tim, privat untuk Hengs Family. Kirim lewat /scrim hasil atau mention Hengs di sini.',
});

// Channels only Hengs posts in, plus the owner channels. An existing one is reused but gets the same @everyone and Hengs
// overwrites a new one would.
const HENGS_OWNED = Object.freeze(['analis', 'news', 'memes', 'scrim', 'admin']);

// Writes the plan: new categories, new channels with permissions by kind, permissions on reused Hengs channels, then
// the renames. Each write checks the lease first; a failed write is recorded and skipped, never retried; a lost lease
// stops everything.
async function applyPlan(guild, plan, { assertLease = async () => {}, postChatGuide, postAnalystGuide, logger = console } = {}) {
  const { ChannelType, PermissionFlagsBits: P, PermissionsBitField } = require('discord.js');
  const { ROLE_NAME, BOT_PERMISSIONS, findTeamRole } = require('../scrim/service');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) throw new Error('COMMUNITY_SETUP_PERMISSIONS');
  const pin = me.permissions.has(P.PinMessages) === true;
  const reason = { reason: 'Hengs setup: owner confirmed the previewed community setup' };
  const everyone = guild.roles.everyone.id;
  const bot = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.AddReactions, ...(pin ? [P.PinMessages] : [])];
  const result = { created: [], renamed: [], tightened: [], failed: [], guides: [] };
  let teamRole = null;
  // Overwrites by kind as [id, allow, deny]. Voice and chat channels keep the server defaults for members.
  async function rules(kind) {
    if (kind === 'voice' || kind === 'door') return null;
    if (['read', 'analis', 'news', 'memes'].includes(kind)) {
      return [[everyone, [P.ViewChannel, P.ReadMessageHistory, P.AddReactions],
        [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads]], [me.id, bot, []]];
    }
    // Owner channels: hidden from members; server admins see them through Administrator.
    if (kind === 'admin') return [[everyone, [], [P.ViewChannel]], [me.id, bot, []]];
    if (kind !== 'scrim') return [[me.id, bot, []]];
    // The role carries no server permissions; it only opens hasil-scrim. Scrim results must not leak (2026-10-20).
    teamRole = teamRole || await findTeamRole(guild) || await guild.roles.create({ name: ROLE_NAME, permissions: [], mentionable: false,
      hoist: false, ...reason });
    return [[everyone, [], [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads,
      P.SendMessagesInThreads, P.AddReactions]], [teamRole.id, BOT_PERMISSIONS, []], [me.id, BOT_PERMISSIONS, []]];
  }
  const names = bits => new PermissionsBitField(bits).toArray();
  async function attempt(label, write) {
    await assertLease();
    try { return await write(); } catch { logger.error('[admin-setup] SETUP_WRITE_FAILED'); result.failed.push(label); return null; }
  }
  async function guide(post, channel, name) {
    if (!post) return;
    try { result.guides.push({ id: channel.id, name, ...await post(channel) }); } catch {
      logger.error('[admin-setup] SETUP_GUIDE_FAILED'); result.guides.push({ id: channel.id, name, failed: true });
    }
  }
  const fetchChannel = async id => guild.channels.cache.get(id) || guild.channels.fetch(id);

  const parents = new Map(plan.categories.map(c => [c.key, c.id]));
  for (const category of plan.categories.filter(c => !c.id)) {
    const made = await attempt(category.name, () => guild.channels.create({ name: category.name, type: ChannelType.GuildCategory, ...reason }));
    if (made) { parents.set(category.key, made.id); result.created.push({ id: made.id, name: category.name, kind: 'category' }); }
  }
  for (const channel of plan.channels.filter(c => !c.id)) {
    const parent = parents.get(channel.categoryKey);
    if (!parent) { result.failed.push(channel.name); continue; }
    const made = await attempt(channel.name, async () => guild.channels.create({ name: channel.name,
      type: channel.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText, parent, ...reason,
      ...(TOPICS[channel.kind] ? { topic: TOPICS[channel.kind] } : {}),
      permissionOverwrites: (await rules(channel.kind))?.map(([id, allow, deny]) => ({ id, allow, deny })) }));
    if (!made) continue;
    result.created.push({ id: made.id, name: channel.name, kind: channel.kind });
    await guide(channel.kind === 'tanya' ? postChatGuide : channel.kind === 'analis' ? postAnalystGuide : null, made, channel.name);
  }
  // Only these overwrites change on a reused Hengs channel; other roles and members keep theirs.
  for (const channel of plan.channels.filter(c => c.id && HENGS_OWNED.includes(c.kind))) {
    const target = await attempt(channel.name, async () => {
      const found = await fetchChannel(channel.id);
      for (const [id, allow, deny] of await rules(channel.kind)) {
        await found.permissionOverwrites.edit(id, Object.fromEntries([...names(allow).map(n => [n, true]),
          ...names(deny).map(n => [n, false])]), reason);
      }
      return found;
    });
    if (!target) continue;
    result.tightened.push({ id: channel.id, name: channel.name, kind: channel.kind });
    // The analyst guide step checks for its own pinned guide, so a reused channel only gets one when it is missing.
    if (channel.kind === 'analis') await guide(postAnalystGuide, target, channel.name);
  }
  for (const item of plan.renames) {
    const done = await attempt(item.to, async () => (await fetchChannel(item.id)).setName(item.to, reason.reason));
    if (done) result.renamed.push(item);
  }
  return result;
}

module.exports = { PACKAGES, CATEGORIES, EXTRAS, TOPICS, HENGS_OWNED, buildPlan, applyPlan };
