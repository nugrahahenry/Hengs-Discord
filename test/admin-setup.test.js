'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection, ChannelType, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const { createAdminSetupFlow } = require('../src/guilds/admin-setup');
const admin = require('../src/commands/admin');

const GUILD = '223456789012345678';
const OWNER = '323456789012345678';
const CHANNEL = '423456789012345678';
const OTHER = '523456789012345678';
const BOT = '623456789012345678';
function rig() {
  let time = 1000; let count = 0; let manageChannels = true; let kind = 'home';
  let fetchHook = null; let createHook = null;
  const created = []; const logs = [];
  const channels = new Collection();
  const roles = new Collection();
  const guild = { id: GUILD, ownerId: OWNER,
    members: { me: { id: BOT, permissions: { has: p => (Array.isArray(p) || p === P.ManageChannels) && manageChannels } },
      async fetchMe() { return this.me; },
      async fetch() { return { permissions: { has: () => true } }; } },
    roles: { everyone: { id: GUILD }, cache: roles, async fetch() { return roles; },
      async create(options) { const role = { id: String(800000000000000000n + BigInt(++count)), ...options }; roles.set(role.id, role); return role; } },
  };
  function channel(name, type = ChannelType.GuildText, parentId = null) {
    const value = { id: String(700000000000000000n + BigInt(++count)), guildId: GUILD, name, type, parentId,
      permissionOverwrites: { cache: new Collection(), async edit() {} },
      async setName(n) { this.name = n; return this; },
    };
    channels.set(value.id, value); return value;
  }
  guild.channels = { cache: channels,
    async fetch() { if (fetchHook) await fetchHook(); return channels; },
    async create(options) {
      created.push(options);
      if (createHook) await createHook(options);
      const made = channel(options.name, options.type, options.parent || null);
      made.topic = options.topic; made.permissionOverwrites.list = options.permissionOverwrites;
      return made;
    },
  };
  const deps = { guildAccess: { classify: () => ({ kind }) },
    postChatGuide: async () => ({ posted: true, pinned: true }), postAnalystGuide: async () => ({ posted: true, pinned: false }) };
  const flow = createAdminSetupFlow({ now: () => time, logger: { error: code => logs.push(code) } });
  function interaction(overrides = {}) {
    return { guild, guildId: GUILD, channelId: CHANNEL, user: { id: OWNER },
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => 'setup' },
      isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false,
      replied: false, deferred: false, replies: [], edits: [], modals: [],
      async reply(p) { this.replied = true; this.replies.push(p); },
      async deferUpdate() { this.deferred = true; },
      async editReply(p) { this.edits.push(p); },
      async showModal(m) { this.replied = true; this.modals.push(m); },
      ...overrides };
  }
  return { flow, deps, guild, created, logs, channels, roles, channel, interaction,
    advance: ms => { time += ms; }, denyCreate: () => { manageChannels = false; }, scope: value => { kind = value; },
    fetch: fn => { fetchHook = fn; }, create: fn => { createHook = fn; } };
}

const components = payload => payload.components.flatMap(row => row.toJSON().components);
function idFor(payload, action) {
  const found = components(payload).find(c => c.custom_id.endsWith(':' + action));
  assert(found, `no ${action} control`); return found.custom_id;
}
async function open(r, overrides = {}, command = r.flow) {
  const i = r.interaction(overrides);
  if (command === admin) await command.execute(i, r.deps); else await command.open(i, r.deps);
  return i.replies.at(-1);
}
async function click(r, payload, action, overrides = {}, command = r.flow) {
  const i = r.interaction({ ...overrides, customId: idFor(payload, action) });
  if (command === admin) await command.handleSetupComponent(i, r.deps); else await command.handle(i, r.deps);
  return i;
}
const pick = (r, payload, values, overrides = {}, command = r.flow) => click(r, payload, 'packages',
  { isButton: () => false, isStringSelectMenu: () => true, values, ...overrides }, command);
async function submit(r, modal, fields, overrides = {}) {
  const i = r.interaction({ customId: modal.toJSON().custom_id, isButton: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: key => fields[key] }, ...overrides });
  await r.flow.handle(i, r.deps); return i;
}
// Opens setup and walks the steps up to the step named by `to`; returns that step's panel.
async function walk(r, { packages = ['hengs'], extras = 'both', theme = 'theme-garis', to = 'preview' } = {}, overrides = {}, command = r.flow) {
  const chosen = (await pick(r, await open(r, overrides, command), packages, overrides, command)).edits.at(-1);
  const board = (await click(r, chosen, extras, overrides, command)).edits.at(-1);
  if (to === 'theme') return board;
  return (await click(r, board, theme, overrides, command)).edits.at(-1);
}

test('setup walks packages, News + Memes, a theme board and a sidebar preview without writing anything', async () => {
  const r = rig();
  const opened = await open(r);
  assert.equal(opened.flags, MessageFlags.Ephemeral); assert.match(opened.content, /1\/4/);
  const select = components(opened).find(c => c.custom_id.endsWith(':packages'));
  assert.deepEqual(select.options.map(o => o.value), ['lobby', 'komunitas', 'gaming', 'hengs', 'tim', 'creator', 'voice', 'admin']);
  assert.equal(select.min_values, 1);
  const extras = (await pick(r, opened, ['hengs', 'lobby'])).edits.at(-1);
  assert.match(extras.content, /2\/4/); assert.match(extras.content, /Paket: Lobby, Hengs\./);
  const board = (await click(r, extras, 'both')).edits.at(-1);
  assert.match(board.content, /3\/4/); assert.equal(board.files[0].name, 'tema-hengs.png');
  for (const action of ['theme-dot', 'theme-garis', 'theme-pohon', 'theme-kurung', 'theme-plain', 'custom']) assert.ok(idFor(board, action));
  const preview = (await click(r, board, 'theme-garis')).edits.at(-1);
  assert.match(preview.content, /4\/4/); assert.match(preview.content, /Tema: Garis tegak/);
  assert.match(preview.content, /Dibuat: 2 kategori, 7 channel/);
  assert.match(preview.content, /hengs-analis, hengs-news, hengs-memes: cuma Hengs yang posting/);
  assert.equal(preview.files[0].name, 'preview-hengs.png'); assert.deepEqual(preview.attachments, []);
  assert.deepEqual(preview.allowedMentions, { parse: [] });
  assert.ok(idFor(preview, 'apply'));
  assert.equal(r.created.length, 0);
});

test('Bikin sekarang creates the previewed channels with Hengs guides and cannot apply twice', async () => {
  const r = rig(); const preview = await walk(r, { packages: ['lobby', 'hengs'] });
  const i = await click(r, preview, 'apply');
  assert.deepEqual(r.created.map(c => c.name), ['──── Lobby ────', '──── Hengs ────', '👋︱welcome', '📜︱rules', '🎭︱ambil-role',
    '🤖︱tanya-hengs', '📊︱hengs-analis', '📰︱hengs-news', '😂︱hengs-memes']);
  const tanya = r.created.find(c => c.name === '🤖︱tanya-hengs');
  assert.equal(tanya.permissionOverwrites.length, 1);
  assert(!tanya.permissionOverwrites[0].allow.includes(P.PinMessages)); // Hengs cannot grant itself what the server did not give
  const done = i.edits.at(-1).content;
  assert.match(done, /Setup selesai/); assert.match(done, /Dibuat: 2 kategori, 7 channel/);
  assert.match(done, /Panduan <#\d+>: sudah dikirim dan di-pin/); assert.match(done, /pin manual/);
  assert.match(done, /jadwalnya belum nyala/);
  const again = await click(r, preview, 'apply');
  assert.match(again.replies.at(-1).content, /tidak tersedia/); assert.equal(r.created.length, 9);
});

test('the rename toggle previews GANTI names and the apply renames only those', async () => {
  const r = rig(); const category = r.channel('💬 COMMUNITY', ChannelType.GuildCategory);
  const chat = r.channel('💬・ngobrol', ChannelType.GuildText, category.id); const plain = r.channel('general');
  const off = await walk(r, { packages: ['komunitas'], extras: 'none', theme: 'theme-kurung' });
  assert.match(off.content, /Channel lama tidak diganti namanya/);
  assert.equal(components(off).find(c => c.custom_id.endsWith(':rename')).label, 'Samakan nama lama: mati');
  const on = (await click(r, off, 'rename')).edits.at(-1);
  assert.match(on.content, /Ganti nama: 2\./); assert.match(on.content, /GANTI = ganti nama/);
  assert.equal(components(on).find(c => c.custom_id.endsWith(':rename')).label, 'Samakan nama lama: nyala');
  await click(r, on, 'apply');
  assert.equal(category.name, '【💬 COMMUNITY 💬】'); assert.equal(chat.name, 'ˌ💬ˈngobrol'); assert.equal(plain.name, 'general');
  assert.deepEqual(r.created.map(c => c.name), ['ˌ📷ˈmedia']);
});

test('the custom theme opens a modal first, rejects a pattern without {nama}, then previews the owner pattern', async () => {
  const r = rig(); const board = await walk(r, { to: 'theme' });
  const custom = await click(r, board, 'custom');
  assert.equal(custom.deferred, false); assert.equal(custom.modals.length, 1);
  const modal = custom.modals[0];
  assert.match(modal.toJSON().custom_id, /:custommodal$/);
  const bad = await submit(r, modal, { channel: '{emoji}', category: '{nama}' });
  assert.match(bad.replies.at(-1).content, /wajib ada `\{nama\}`/);
  const good = await submit(r, modal, { channel: '{emoji}✦{nama}', category: '✦ {nama} ✦' });
  const preview = good.edits.at(-1);
  assert.match(preview.content, /Tema: Custom/);
  await click(r, preview, 'apply');
  assert.deepEqual(r.created.map(c => c.name).slice(0, 2), ['✦ Hengs ✦', '🤖✦tanya-hengs']);
});

test('a preview where everything already exists offers no Bikin sekarang', async () => {
  const r = rig(); const category = r.channel('Community', ChannelType.GuildCategory);
  r.channel('ngobrol', ChannelType.GuildText, category.id); r.channel('media', ChannelType.GuildText, category.id);
  const preview = await walk(r, { packages: ['komunitas'], extras: 'none', theme: 'theme-plain' });
  assert.match(preview.content, /Tidak ada yang perlu dibikin/);
  assert(!components(preview).some(c => c.custom_id.endsWith(':apply')));
});

test('owner or Administrator in the home guild only; DM, public guild and regular member are denied', async () => {
  for (const scenario of ['public', 'member', 'dm']) {
    const r = rig();
    if (scenario === 'public') r.scope('public');
    const q = await open(r, scenario === 'member' ? { user: { id: OTHER } }
      : scenario === 'dm' ? { guild: null, guildId: null } : {});
    assert.equal(q.components.length, 0); assert.equal(r.created.length, 0);
  }
  const r = rig();
  const q = await open(r, { user: { id: OTHER }, memberPermissions: { has: p => p === P.Administrator } });
  assert.match(q.content, /1\/4/);
});

test('forged clicks from another actor, channel or guild are rejected without consuming the owner ticket', async () => {
  const r = rig(); const preview = await walk(r);
  for (const overrides of [{ user: { id: OTHER }, memberPermissions: { has: () => true } }, { channelId: OTHER }, { guildId: OTHER }]) {
    const denied = await click(r, preview, 'apply', overrides);
    assert.match(denied.replies.at(-1).content, /tidak tersedia/);
  }
  assert.equal(r.created.length, 0);
  await click(r, preview, 'apply'); assert.equal(r.created.length, 5);
});

test('buttons from an earlier step stop working once the panel moves on, and a component of the wrong type is refused', async () => {
  const r = rig(); const opened = await open(r);
  const extras = (await pick(r, opened, ['hengs'])).edits.at(-1);
  assert.match((await click(r, opened, 'cancel')).replies.at(-1).content, /tidak tersedia/);
  const forged = r.interaction({ customId: idFor(extras, 'both').replace(/:both$/, ':packages') }); // a button posing as the select
  await r.flow.handle(forged, r.deps);
  assert.match(forged.replies.at(-1).content, /tidak tersedia/);
  const board = (await click(r, extras, 'none')).edits.at(-1);
  assert.match(board.content, /3\/4/);
});

test('expired and replayed apply tickets never create twice', async () => {
  const r = rig(); const preview = await walk(r);
  r.advance(600000); await click(r, preview, 'apply'); assert.equal(r.created.length, 0);
  const fresh = await walk(r);
  await click(r, fresh, 'apply'); await click(r, fresh, 'apply');
  assert.equal(r.created.length, 5);
});

test('changed channels or overwrites after the preview stop the apply', async () => {
  for (const permissionOnly of [false, true]) {
    const r = rig(); const c = r.channel('existing'); const preview = await walk(r);
    if (permissionOnly) c.permissionOverwrites.cache.set(GUILD, { id: GUILD, type: 0, allow: { bitfield: 1n }, deny: { bitfield: 0n } });
    else r.channel('added-by-another-admin');
    const i = await click(r, preview, 'apply');
    assert.match(i.edits.at(-1).content, /berubah sejak preview/); assert.equal(r.created.length, 0);
  }
  const r = rig(); const preview = await walk(r);
  const i = await click(r, preview, 'apply', { async editReply(payload) {
    this.edits.push(payload);
    if (payload.content.startsWith('Menerapkan')) r.channel('concurrent-channel');
  } });
  assert.equal(r.created.length, 0); assert.match(i.edits.at(-1).content, /berubah sejak preview/);
});

test('permission loss and guild reclassification at apply fail closed', async () => {
  for (const change of ['manage', 'role', 'scope', 'lease']) {
    const r = rig();
    const actor = { user: { id: OTHER }, memberPermissions: { has: () => true } };
    const preview = await walk(r, {}, actor);
    if (change === 'manage') r.denyCreate();
    if (change === 'scope') r.scope('denied');
    if (change === 'lease') r.guild.members.fetch = async () => ({ permissions: { has: () => false } });
    const i = await click(r, preview, 'apply', change === 'role' ? { ...actor, memberPermissions: { has: () => false } } : actor);
    assert.equal(r.created.length, 0, change);
    if (change === 'manage') assert.match(i.edits.at(-1).content, /Manage Channels dan Manage Roles/);
    if (change === 'lease') assert.match(i.edits.at(-1).content, /belum bisa dipastikan/);
  }
});

test('a failed write is reported by name without retry or provider text', async () => {
  const r = rig(); const preview = await walk(r);
  r.create(async options => { if (options.name === '🤖︱tanya-hengs') throw new Error('private-provider'); });
  const i = await click(r, preview, 'apply');
  assert.match(i.edits.at(-1).content, /Gagal, tidak dicoba ulang: `🤖︱tanya-hengs`/);
  await click(r, preview, 'apply');
  assert.equal(r.created.length, 5);
  assert(!JSON.stringify([i.edits, r.logs]).includes('private-provider'));
});

test('fresh inventory failure blocks without leaking the provider error', async () => {
  const r = rig(); const board = await walk(r, { to: 'theme' });
  r.fetch(async () => { throw new Error('private-raw-provider-detail'); });
  const i = await click(r, board, 'theme-dot');
  assert.match(i.edits.at(-1).content, /belum diterapkan/);
  assert(!JSON.stringify([i.edits, r.logs]).includes('private-raw-provider-detail'));
  assert.equal(r.created.length, 0);
});

test('concurrent admins cannot apply two setups for one guild', async () => {
  const r = rig(); const a = await walk(r);
  const other = { user: { id: OTHER }, memberPermissions: { has: () => true } };
  const b = await walk(r, {}, other);
  let release; let started;
  const wait = new Promise(resolve => { release = resolve; });
  const signal = new Promise(resolve => { started = resolve; });
  r.create(async () => { started(); await wait; });
  const pending = click(r, a, 'apply'); await signal;
  const blocked = await click(r, b, 'apply', other);
  assert.match(blocked.replies.at(-1).content, /sedang diproses/);
  release(); await pending; assert.equal(r.created.length, 5);
});

test('opening a new setup invalidates the old preview, also while its apply acknowledgement waits', async () => {
  const r = rig(); const old = await walk(r); await open(r);
  await click(r, old, 'apply'); assert.equal(r.created.length, 0);
  const preview = await walk(r);
  let release; let entered;
  const wait = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const applying = click(r, preview, 'apply', { async deferUpdate() { this.deferred = true; entered(); await wait; } });
  await started; await open(r); release(); await applying;
  assert.equal(r.created.length, 0);
});

test('bounded sessions reject excess and reclaim expired tickets; a foreign channel inventory fails closed', async () => {
  const r = rig();
  for (let n = 0; n < 100; n++) await open(r, { user: { id: String(n) }, memberPermissions: { has: () => true } });
  assert.match((await open(r)).content, /penuh/);
  r.advance(600000);
  assert.match((await open(r)).content, /1\/4/);
  const foreign = rig(); foreign.channel('hengs-news').guildId = OTHER;
  assert.match((await walk(foreign)).content, /belum diterapkan/); assert.equal(foreign.created.length, 0);
});

test('the real /admin command and component route run setup v2; the legacy full setup is gone', async () => {
  const r = rig(); const preview = await walk(r, {}, {}, admin);
  await click(r, preview, 'apply', {}, admin);
  assert.equal(r.created.length, 5);
  // Release archives come out of git archive with CRLF on Windows checkouts; compare with LF.
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
  const index = read('src/index.js');
  assert(index.includes("(interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())\n    && String(interaction.customId || '').startsWith('hengs-admin-setup:')"));
  assert(index.includes("client.commands.get('admin').handleSetupComponent(interaction, {\n        guildAccess, postAnalystGuide: channel => esportsService.ensureGuide(channel), postChatGuide })"));
  assert(!/applyLegacy|Setup server Henzzz/.test(read('src/commands/admin.js')));
  for (const file of ['src/guilds/admin-setup.js', 'src/guilds/community-setup.js']) {
    assert(!/news\/store|news\/service|\.setEnabled\(|\.send\(/.test(read(file)), file);
  }
});
