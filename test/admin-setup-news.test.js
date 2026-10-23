'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection, ChannelType, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const { createAdminSetupFlow, ensureNewsChannel } = require('../src/guilds/admin-setup');
const admin = require('../src/commands/admin');

const GUILD = '223456789012345678';
const OWNER = '323456789012345678';
const CHANNEL = '423456789012345678';
const OTHER = '523456789012345678';
const BOT = '623456789012345678';
function rig() {
  let time = 1000; let count = 0; let manageChannels = true; let sendPermissions = true; let kind = 'home';
  let fetchHook = null; let createHook = null;
  const created = []; const legacy = []; const logs = [];
  const channels = new Collection();
  const guild = { id: GUILD, ownerId: OWNER, memberCount: 2,
    members: { me: { id: BOT, permissions: { has: p => (Array.isArray(p) || p === P.ManageChannels) && manageChannels } },
      async fetchMe() { return this.me; },
      async fetch() { return { permissions: { has: () => true } }; },
      cache: new Collection([[BOT, { user: { bot: true } }], [OWNER, { user: { bot: false } }]]) },
    roles: { everyone: { id: GUILD } },
  };
  function channel(name, type = ChannelType.GuildText, parentId = null) {
    const value = { id: String(700000000000000000n + BigInt(++count)), guildId: GUILD, name, type, parentId,
      permissionsFor: () => ({ has: () => sendPermissions }),
      permissionOverwrites: { cache: new Collection(), async edit() {} },
      async setName(n) { this.name = n; return this; },
      async setParent(p) { this.parentId = p; return this; },
      async setPosition() {}, async delete() { channels.delete(this.id); },
      async fetchWebhooks() { return new Collection([['existing', {}]]); },
    };
    channels.set(value.id, value); return value;
  }
  guild.channels = { cache: channels,
    async fetch() { if (fetchHook) await fetchHook(); return channels; },
    async create(options) {
      created.push(options);
      if (createHook) await createHook(options);
      return channel(options.name, options.type, options.parent || null);
    },
  };
  const deps = { guildAccess: { classify: () => ({ kind }) } };
  const flow = createAdminSetupFlow({ now: () => time, logger: { error: code => logs.push(code) },
    applyLegacy: async (interaction, choices) => { legacy.push(choices); await interaction.editReply({ content: 'LEGACY_TEST' }); },
  });
  function interaction(overrides = {}) {
    return { guild, guildId: GUILD, channelId: CHANNEL, user: { id: OWNER },
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => 'setup' },
      isButton: () => true, replied: false, deferred: false, replies: [], edits: [],
      async reply(p) { this.replied = true; this.replies.push(p); },
      async deferUpdate() { this.deferred = true; },
      async deferReply() { this.deferred = true; },
      async editReply(p) { this.edits.push(p); },
      ...overrides };
  }
  return { flow, deps, guild, created, legacy, logs, channels, channel, interaction,
    advance: ms => { time += ms; }, denyCreate: () => { manageChannels = false; },
    denySend: () => { sendPermissions = false; }, scope: value => { kind = value; },
    fetch: fn => { fetchHook = fn; }, create: fn => { createHook = fn; } };
}

test('community setup makes news and memes read-only for members, only Hengs posts, beside existing news', async () => {
  const r = rig(); const parent = r.channel('ANNOUNCEMENTS', ChannelType.GuildCategory);
  const news = r.channel('📰・hengs-news', ChannelType.GuildText, parent.id);
  const writes = []; news.permissionOverwrites.edit = async (...args) => { writes.push(args); };
  const p = await preview(r, 'community'); assert.match(p.content, /Cuma Hengs yang posting/); assert.match(p.content, /\/kirim meme/);
  assert.equal(r.created.length, 0); assert.equal(writes.length, 0);
  const i = await click(r, p, 'split');
  assert.equal(r.created.length, 1); assert.equal(r.legacy.length, 0); assert.equal(writes.length, 2);
  assert.equal(r.created[0].name, '😂・hengs-memes'); assert.equal(r.created[0].parent, parent.id);
  assert.equal(writes[0][0], GUILD); assert.equal(news.parentId, parent.id);
  assert.deepEqual(writes[0][1], { ViewChannel: true, ReadMessageHistory: true, AddReactions: true, SendMessages: false,
    SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false });
  assert.equal(writes[1][0], BOT);
  assert.deepEqual(writes[1][1], { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true });
  const [everyone, bot] = r.created[0].permissionOverwrites;
  assert(everyone.deny.includes(P.SendMessages) && !everyone.allow.includes(P.SendMessages));
  assert(bot.allow.includes(P.SendMessages) && bot.allow.includes(P.AttachFiles));
  assert.match(i.edits.at(-1).content, /Routing bot belum berubah/);
  await click(r, p, 'split'); assert.equal(r.created.length, 1); assert.equal(writes.length, 2);
});

test('community fresh setup creates two separate channels, reuses exact existing ones without moves', async () => {
  const r = rig(); await click(r, await preview(r, 'community'), 'split');
  assert.equal(r.created.length, 2); assert.equal(r.legacy.length, 0);
  await click(r, await preview(r, 'community'), 'split'); assert.equal(r.created.length, 2);
});

test('community preview rejects duplicate memes, inventory drift and hidden forged actions', async () => {
  const r = rig(); r.channel('hengs-memes'); r.channel('😂・hengs-memes');
  assert.equal((await preview(r, 'community')).components.length, 0);
  assert.equal(r.created.length, 0);
  const fresh = rig(); const p = await preview(fresh, 'community'); fresh.channel('new-channel');
  await click(fresh, p, 'split'); assert.equal(fresh.created.length, 0);
  const news = await preview(fresh, 'yes');
  const forged = fresh.interaction({ customId: button(news, 'news').replace(/:news$/, ':split') });
  await fresh.flow.handle(forged, fresh.deps); assert.equal(fresh.created.length, 0);
});

test('community setup checks fresh manager/bot permissions and does not retry partial failure', async () => {
  const r = rig(); const p = await preview(r, 'community'); r.denyCreate();
  await click(r, p, 'split'); assert.equal(r.created.length, 0);
  const revoked = rig(); const other = { user: { id: OTHER }, memberPermissions: { has: () => true } };
  const a = await preview(revoked, 'community', other);
  revoked.guild.members.fetch = async () => ({ permissions: { has: () => false } });
  await click(revoked, a, 'split', other); assert.equal(revoked.created.length, 0);
  const partial = rig(); const b = await preview(partial, 'community');
  partial.create(() => { if (partial.created.length === 2) throw new Error('private-provider'); });
  const i = await click(partial, b, 'split'); await click(partial, b, 'split');
  assert.equal(partial.created.length, 2); assert.equal(partial.channels.size, 1);
  assert.match(i.edits.at(-1).content, /sebagian perubahan mungkin/);
  assert(!JSON.stringify([i.edits, partial.logs]).includes('private-provider'));
});

test('community setup refuses changed inventory while apply acknowledgement is awaited', async () => {
  const r = rig(); const p = await preview(r, 'community');
  const i = await click(r, p, 'split', { async editReply(payload) {
    this.edits.push(payload);
    if (payload.content.startsWith('Menerapkan')) r.channel('concurrent-channel');
  } });
  assert.equal(r.created.length, 0); assert.match(i.edits.at(-1).content, /belum bisa dipastikan/);
});
function button(payload, action) {
  return payload.components.flatMap(row => row.toJSON().components).find(c => c.custom_id.endsWith(':' + action)).custom_id;
}
async function open(r, overrides = {}, command = r.flow) {
  const i = r.interaction(overrides);
  if (command === admin) await command.execute(i, r.deps); else await command.open(i, r.deps);
  return i.replies.at(-1);
}
async function click(r, payload, action, overrides = {}, command = r.flow) {
  const i = r.interaction({ ...overrides, customId: button(payload, action) });
  if (command === admin) await command.handleSetupComponent(i, r.deps); else await command.handle(i, r.deps);
  return i;
}
async function preview(r, choice = 'yes', overrides = {}) {
  const question = await open(r, overrides);
  const i = await click(r, question, choice, overrides);
  return i.edits.at(-1);
}

test('admin setup asks optional news then previews without creating or scheduling anything', async () => {
  const r = rig();
  const question = await open(r);
  assert.equal(question.flags, MessageFlags.Ephemeral);
  assert.match(question.content, /Mau tambahkan Hengs News/);
  const chosen = await click(r, question, 'yes');
  assert.match(chosen.edits.at(-1).content, /Preview setup/);
  assert.match(chosen.edits.at(-1).content, /Berita harian tidak diaktifkan/);
  assert.equal(r.created.length, 0); assert.equal(r.legacy.length, 0);
  assert.deepEqual(chosen.edits.at(-1).allowedMentions, { parse: [] });
});

test('news-only confirmation creates exactly one read-only text channel without legacy setup', async () => {
  const r = rig();
  const i = await click(r, await preview(r), 'news');
  assert.equal(r.created.length, 1); assert.equal(r.legacy.length, 0);
  const options = r.created[0];
  assert.equal(options.name, '📰・hengs-news'); assert.equal(options.type, ChannelType.GuildText);
  assert.equal(options.parent, undefined);
  assert(options.permissionOverwrites[0].deny.includes(P.SendMessages));
  assert(options.permissionOverwrites[1].allow.includes(P.EmbedLinks));
  assert.match(i.edits.at(-1).content, /Jadwal berita belum diaktifkan/);
  assert.match(i.edits.at(-1).content, /atur berita teknologi AI jam 08:00/);
});

test('declining news never creates or deletes channels before explicit full setup confirmation', async () => {
  const r = rig(); const existing = r.channel('hengs-news');
  const p = await preview(r, 'no');
  assert.match(p.content, /tidak dihapus atau dimatikan/);
  assert.equal(r.created.length, 0);
  assert(!p.components[0].toJSON().components.some(c => c.custom_id.endsWith(':news')));
  await click(r, p, 'full');
  assert.deepEqual(r.legacy, [{ includeNews: false, newsChannelId: null }]);
  assert(r.channels.has(existing.id)); assert.equal(r.created.length, 0);
});

test('full setup confirmation passes the explicit include-news choice', async () => {
  const r = rig(); const existing = r.channel('📰・hengs-news');
  await click(r, await preview(r), 'full');
  assert.deepEqual(r.legacy, [{ includeNews: true, newsChannelId: existing.id }]);
});

test('existing uniquely named news is reused with original name parent and overwrites', async () => {
  const r = rig(); const existing = r.channel('📰・hengs-news', ChannelType.GuildText, 'saved-parent');
  const old = { name: existing.name, parentId: existing.parentId, overwrites: existing.permissionOverwrites };
  const p = await preview(r); r.denyCreate();
  await click(r, p, 'news');
  assert.equal(r.created.length, 0);
  assert.equal(existing.name, old.name); assert.equal(existing.parentId, old.parentId);
  assert.equal(existing.permissionOverwrites, old.overwrites);
});

test('duplicate or wrong-type news channel stops preview rather than creating a duplicate', async () => {
  for (const duplicate of [true, false]) {
    const r = rig(); r.channel('hengs-news', duplicate ? ChannelType.GuildText : ChannelType.GuildVoice);
    if (duplicate) r.channel('📰・hengs-news');
    const p = await preview(r);
    assert.match(p.content, /ganda atau dipakai jenis channel lain/);
    assert.equal(r.created.length, 0);
  }
});

test('cancel and back are nonmutating and a changed choice clears the old news selection', async () => {
  const r = rig(); const yes = await preview(r);
  const back = await click(r, yes, 'back');
  const no = await click(r, back.edits.at(-1), 'no');
  await click(r, no.edits.at(-1), 'cancel');
  assert.equal(r.created.length, 0); assert.equal(r.legacy.length, 0);
  const replay = await click(r, yes, 'news');
  assert.match(replay.replies.at(-1).content, /tidak tersedia/);
});

test('an old full-setup button cannot apply a newer preview with a different news choice', async () => {
  const r = rig(); const no = await preview(r, 'no');
  const question = (await click(r, no, 'back')).edits.at(-1);
  const yes = (await click(r, question, 'yes')).edits.at(-1);
  const denied = await click(r, no, 'full');
  assert.match(denied.replies.at(-1).content, /tidak tersedia/);
  assert.equal(r.legacy.length, 0); assert.equal(r.created.length, 0);
  await click(r, yes, 'news'); assert.equal(r.created.length, 1);
});

test('owner or Administrator in home guild only; DM public and regular member are denied', async () => {
  for (const scenario of ['public', 'member', 'dm']) {
    const r = rig();
    if (scenario === 'public') r.scope('public');
    const q = await open(r, scenario === 'member' ? { user: { id: OTHER } }
      : scenario === 'dm' ? { guild: null, guildId: null } : {});
    assert.equal(q.components.length, 0); assert.equal(r.created.length, 0);
  }
  const r = rig();
  const q = await open(r, { user: { id: OTHER }, memberPermissions: { has: p => p === P.Administrator } });
  assert.match(q.content, /Mau tambahkan/);
});

test('actor channel and guild binding reject forged clicks without consuming the owners ticket', async () => {
  const r = rig(); const p = await preview(r);
  for (const overrides of [{ user: { id: OTHER }, memberPermissions: { has: () => true } },
    { channelId: OTHER }, { guildId: OTHER }]) {
    const denied = await click(r, p, 'news', overrides);
    assert.match(denied.replies.at(-1).content, /tidak tersedia/);
  }
  assert.equal(r.created.length, 0);
  await click(r, p, 'news'); assert.equal(r.created.length, 1);
});

test('expired and replayed apply tickets never create twice', async () => {
  const r = rig(); const p = await preview(r);
  r.advance(600000); await click(r, p, 'news'); assert.equal(r.created.length, 0);
  const fresh = await preview(r);
  await click(r, fresh, 'news'); await click(r, fresh, 'news');
  assert.equal(r.created.length, 1);
});

test('permission loss and guild reclassification at apply fail closed', async () => {
  for (const change of ['manage', 'role', 'scope', 'send']) {
    const r = rig();
    const actor = { user: { id: OTHER }, memberPermissions: { has: () => true } };
    if (change === 'send') r.channel('hengs-news');
    const p = await preview(r, 'yes', actor);
    if (change === 'manage') r.denyCreate();
    if (change === 'scope') r.scope('denied');
    if (change === 'send') r.denySend();
    await click(r, p, 'news', change === 'role' ? { ...actor, memberPermissions: { has: () => false } } : actor);
    assert.equal(r.created.length, 0); assert.equal(r.legacy.length, 0);
  }
});

test('changed channel inventory or overwrites invalidates preview', async () => {
  for (const permissionOnly of [false, true]) {
    const r = rig(); const c = r.channel('existing'); const p = await preview(r);
    if (permissionOnly) c.permissionOverwrites.cache.set(GUILD, { id: GUILD, type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } });
    else r.channel('added-by-another-admin');
    const response = await click(r, p, 'news');
    assert.match(response.edits.at(-1).content, /berubah sejak preview/);
    assert.equal(r.created.length, 0);
  }
});

test('fresh inventory failure blocks without leaking the provider error', async () => {
  const r = rig(); const q = await open(r);
  r.fetch(async () => { throw new Error('private-raw-provider-detail'); });
  const i = await click(r, q, 'yes');
  assert(!JSON.stringify([i.edits, r.logs]).includes('private-raw-provider-detail'));
  assert.equal(r.created.length, 0);
});

test('uncertain create is consumed without automatic retry or delete', async () => {
  const r = rig(); const p = await preview(r);
  r.create(async opts => { r.channel(opts.name); throw new Error('private-create-response-lost'); });
  const i = await click(r, p, 'news');
  assert.match(i.edits.at(-1).content, /sebagian perubahan mungkin/);
  await click(r, p, 'news');
  assert.equal(r.created.length, 1); assert.equal(r.channels.size, 1);
  assert(!JSON.stringify([i.edits, r.logs]).includes('private-create-response-lost'));
});

test('concurrent admins cannot apply two channel writes for one guild', async () => {
  const r = rig(); const a = await preview(r);
  const other = { user: { id: OTHER }, memberPermissions: { has: () => true } };
  const b = await preview(r, 'yes', other);
  let release; let started;
  const wait = new Promise(resolve => { release = resolve; });
  const signal = new Promise(resolve => { started = resolve; });
  r.create(async () => { started(); await wait; });
  const pending = click(r, a, 'news'); await signal;
  const blocked = await click(r, b, 'news', other);
  assert.match(blocked.replies.at(-1).content, /sedang diproses/);
  release(); await pending; assert.equal(r.created.length, 1);
});

test('opening a new same-owner setup invalidates the old preview', async () => {
  const r = rig(); const old = await preview(r); await open(r);
  await click(r, old, 'news'); assert.equal(r.created.length, 0);
});

test('opening a replacement session while apply acknowledgement waits cancels the old apply', async () => {
  const r = rig(); const p = await preview(r);
  let release; let entered;
  const wait = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const applying = click(r, p, 'news', { async deferUpdate() {
    this.deferred = true; entered(); await wait;
  } });
  await started;
  await open(r);
  release(); await applying;
  assert.equal(r.created.length, 0); assert.equal(r.legacy.length, 0);
});

test('ensure-news does not silently reuse a channel created after the preview', async () => {
  const r = rig(); r.channel('hengs-news');
  await assert.rejects(ensureNewsChannel(r.guild), /NEWS_CHANNEL_CHANGED/);
  assert.equal(r.created.length, 0);
});

test('forged apply before preview and hidden news action after decline are rejected', async () => {
  for (const questionPhase of [true, false]) {
    const r = rig(); const p = questionPhase ? await open(r) : await preview(r, 'no');
    const reference = button(p, questionPhase ? 'yes' : 'full');
    const i = r.interaction({ customId: reference.replace(/:[^:]+$/, ':news') });
    await r.flow.handle(i, r.deps);
    assert.equal(r.created.length, 0); assert.equal(r.legacy.length, 0);
  }
});

test('expiration during fresh inventory validation prevents apply', async () => {
  const r = rig(); const p = await preview(r);
  r.fetch(async () => r.advance(600000));
  await click(r, p, 'news'); assert.equal(r.created.length, 0);
});

test('bounded sessions reject excess and reclaim expired tickets', async () => {
  const r = rig();
  for (let n = 0; n < 100; n++) {
    await open(r, { user: { id: String(n) }, memberPermissions: { has: () => true } });
  }
  assert.match((await open(r)).content, /penuh/);
  r.advance(600000);
  assert.match((await open(r)).content, /Mau tambahkan/);
});

test('a foreign channel inventory fails closed', async () => {
  const r = rig(); r.channel('hengs-news').guildId = OTHER;
  const p = await preview(r);
  assert.match(p.content, /belum diterapkan/); assert.equal(r.created.length, 0);
});

test('actual admin command and component route offer the optional question without legacy mutation', async () => {
  const r = rig(); const q = await open(r, {}, admin);
  assert.match(q.content, /Mau tambahkan Hengs News/);
  const p = (await click(r, q, 'yes', {}, admin)).edits.at(-1);
  await click(r, p, 'news', {}, admin);
  assert.equal(r.created.length, 1);
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert(source.includes("startsWith('hengs-admin-setup:')"));
  assert(source.includes("client.commands.get('admin').handleSetupComponent(interaction, {\n        guildAccess, postAnalystGuide: channel => esportsService.ensureGuide(channel) })"));
});

test('actual full admin setup adds optional news in announcements without enabling a news scheduler', async () => {
  const r = rig(); const q = await open(r, {}, admin);
  const p = (await click(r, q, 'yes', {}, admin)).edits.at(-1);
  const i = await click(r, p, 'full', {}, admin);
  const news = r.channels.find(c => c.name === '📰・hengs-news');
  assert(news); assert.equal(r.channels.get(news.parentId).name, '📢 ANNOUNCEMENTS');
  const embed = i.edits.at(-1).embeds[0].toJSON();
  assert(embed.fields.some(f => f.name.includes('Hengs News') && f.value.includes('belum diaktifkan')));
  const source = fs.readFileSync(path.join(__dirname, '../src/guilds/admin-setup.js'), 'utf8');
  assert(!/news\/store|news\/service|\.setEnabled\(|\.send\(/.test(source));
});

test('analyst setup previews first, then makes one read-only hengs-analis beside news and posts the pinned guide', async () => {
  const r = rig(); const parent = r.channel('GAMING', ChannelType.GuildCategory);
  r.channel('📰・hengs-news', ChannelType.GuildText, parent.id);
  const guides = []; r.deps.postAnalystGuide = async channel => { guides.push(channel.name); return { posted: true, pinned: true }; };
  const question = await open(r);
  assert.ok(button(question, 'analis'));
  const p = (await click(r, question, 'analis')).edits.at(-1);
  assert.match(p.content, /Preview channel analis/); assert.match(p.content, /Cuma Hengs yang posting/); assert.match(p.content, /Liquipedia/);
  assert.equal(r.created.length, 0); assert.deepEqual(guides, []);
  const i = await click(r, p, 'analisapply');
  assert.equal(r.created.length, 1); assert.equal(r.legacy.length, 0);
  const options = r.created[0];
  assert.equal(options.name, '📊・hengs-analis'); assert.equal(options.parent, parent.id); assert.match(options.topic, /Liquipedia/);
  const [everyone, bot] = options.permissionOverwrites;
  assert(everyone.deny.includes(P.SendMessages) && everyone.allow.includes(P.AddReactions) && everyone.allow.includes(P.ViewChannel));
  assert(bot.allow.includes(P.SendMessages) && bot.allow.includes(P.AttachFiles) && bot.allow.includes(P.EmbedLinks));
  assert(!bot.allow.includes(P.PinMessages)); // Hengs cannot grant itself a permission it lacks server-wide
  assert.deepEqual(guides, ['📊・hengs-analis']);
  assert.match(i.edits.at(-1).content, /Channel analis siap/); assert.match(i.edits.at(-1).content, /Panduan sudah dikirim dan di-pin/);
  // Running it again reuses the channel and lets the guide step decide whether anything is missing.
  r.deps.postAnalystGuide = async channel => { guides.push(channel.name); return { posted: true, pinned: false }; };
  const again = await click(r, (await click(r, await open(r), 'analis')).edits.at(-1), 'analisapply');
  assert.equal(r.created.length, 1); assert.equal(guides.length, 2);
  assert.match(again.edits.at(-1).content, /pin manual/);
});

test('analyst setup grants Hengs pinning only when the server already gave it, and reports a failed guide', async () => {
  const r = rig();
  r.guild.members.me.permissions.has = p => Array.isArray(p) || p === P.ManageChannels || p === P.PinMessages;
  r.deps.postAnalystGuide = async () => { throw new Error('private-provider'); };
  const i = await click(r, (await click(r, await open(r), 'analis')).edits.at(-1), 'analisapply');
  assert(r.created[0].permissionOverwrites[1].allow.includes(P.PinMessages));
  assert.equal(r.created[0].parent, undefined);
  assert.match(i.edits.at(-1).content, /Panduan belum terkirim/);
  assert(!JSON.stringify([i.edits, r.logs]).includes('private-provider'));
});
