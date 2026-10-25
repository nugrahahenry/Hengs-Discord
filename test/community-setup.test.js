'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PACKAGES, buildPlan } = require('../src/guilds/community-setup');
const { themeById, customTheme } = require('../src/guilds/channel-style');

// A small server: a community category with ngobrol, a bot center with bot-commands, a voice category, one plain text.
const inventory = [
  { id: 'c1', name: '💬 COMMUNITY', type: 4, position: 1 },
  { id: 't1', name: '💬・ngobrol', type: 0, parentId: 'c1', position: 0 },
  { id: 'c2', name: '🤖 BOT CENTER', type: 4, position: 2 },
  { id: 't2', name: '🤖・bot-commands', type: 0, parentId: 'c2', position: 0 },
  { id: 'c3', name: '🔊 VOICE', type: 4, position: 3 },
  { id: 'v1', name: '🔊・Lounge', type: 2, parentId: 'c3', position: 0 },
  { id: 't3', name: 'general', type: 0, parentId: null, position: 0 },
];

test('the packages match the approved list', () => {
  assert.deepEqual(PACKAGES.map(p => p.key), ['lobby', 'komunitas', 'gaming', 'hengs', 'tim', 'creator', 'voice', 'admin']);
});

test('a plan reuses categories and channels by slug, puts new channels in their package category and renames nothing', () => {
  const plan = buildPlan({ inventory, packages: ['lobby', 'komunitas', 'hengs', 'voice'], extras: { news: true, memes: false },
    theme: themeById('garis'), rename: false });
  const cats = Object.fromEntries(plan.categories.map(c => [c.key, [c.id, c.name]]));
  assert.deepEqual(cats, { lobby: [null, '──── Lobby ────'], komunitas: ['c1', '💬 COMMUNITY'], hengs: ['c2', '🤖 BOT CENTER'],
    voice: ['c3', '🔊 VOICE'] });
  const rows = plan.channels.map(c => [c.slug, c.id, c.name, c.categoryKey, c.type]);
  assert.deepEqual(rows, [
    ['welcome', null, '👋︱welcome', 'lobby', 'text'], ['rules', null, '📜︱rules', 'lobby', 'text'],
    ['ambil-role', null, '🎭︱ambil-role', 'lobby', 'text'],
    ['ngobrol', 't1', '💬・ngobrol', 'komunitas', 'text'], ['media', null, '📷︱media', 'komunitas', 'text'],
    ['tanya-hengs', null, '🤖︱tanya-hengs', 'hengs', 'text'], ['hengs-analis', null, '📊︱hengs-analis', 'hengs', 'text'],
    ['hengs-news', null, '📰︱hengs-news', 'hengs', 'text'],
    ['lounge', 'v1', '🔊・Lounge', 'voice', 'voice'], ['afk', null, '💤︱AFK', 'voice', 'voice'],
  ]);
  assert.deepEqual(plan.renames, []);
  assert.deepEqual(plan.counts, { categories: 1, channels: 8, reused: 2, renames: 0 });
});

test('with rename on, only decorated channels and categories get the theme, plain ones stay, unchanged names are skipped', () => {
  const plan = buildPlan({ inventory, packages: ['komunitas'], extras: {}, theme: themeById('kurung'), rename: true });
  assert.deepEqual(plan.renames.map(r => [r.id, r.type, r.from, r.to]), [
    ['c1', 'category', '💬 COMMUNITY', '【💬 COMMUNITY 💬】'], ['t1', 'text', '💬・ngobrol', 'ˌ💬ˈngobrol'],
    ['c2', 'category', '🤖 BOT CENTER', '【🤖 BOT CENTER 🤖】'], ['t2', 'text', '🤖・bot-commands', 'ˌ🤖ˈbot-commands'],
    ['c3', 'category', '🔊 VOICE', '【🔊 VOICE 🔊】'], ['v1', 'voice', '🔊・Lounge', 'ˌ🔊ˈLounge'],
  ]);
  // Reused rows show their new names in the plan; the preview marks them as renamed.
  assert.equal(plan.channels.find(c => c.slug === 'ngobrol').name, 'ˌ💬ˈngobrol');
  const same = buildPlan({ inventory, packages: ['komunitas'], extras: {}, theme: themeById('dot'), rename: true });
  assert.ok(!same.renames.some(r => r.id === 't1')); // already 💬・ngobrol
  const bare = buildPlan({ inventory: [...inventory, { id: 'e1', name: '🎮', type: 4, position: 9 }], packages: ['komunitas'], extras: {},
    theme: themeById('garis'), rename: true });
  assert.ok(!bare.renames.some(r => r.id === 'e1')); // nothing but an emoji: no "──── ────"
});

test('the preview sections keep the server order, mark new and renamed rows, and add new categories at the end', () => {
  const plan = buildPlan({ inventory, packages: ['lobby', 'komunitas'], extras: {}, theme: themeById('garis'), rename: true });
  const titles = plan.sections.map(s => s.category);
  assert.deepEqual(titles, [null, '──── COMMUNITY ────', '──── BOT CENTER ────', '──── VOICE ────', '──── Lobby ────']);
  const community = plan.sections[1].channels;
  assert.deepEqual(community.map(c => [c.name, Boolean(c.isNew), Boolean(c.renamedFrom)]), [['💬︱ngobrol', false, true], ['📷︱media', true, false]]);
  assert.equal(plan.sections[0].channels[0].name, 'general');
  assert.deepEqual(plan.sections.at(-1).channels.map(c => c.isNew), [true, true, true]);
  const quiet = buildPlan({ inventory, packages: ['lobby'], extras: {}, theme: themeById('garis'), rename: false });
  // Without renames only the touched sections show; the rest are summed up.
  assert.deepEqual(quiet.sections.map(s => s.category), ['──── Lobby ────']); assert.equal(quiet.untouchedSections, 4);
});

test('News and Memes without the Hengs package still go to a Hengs category; tim adds hasil-scrim; custom themes work', () => {
  const bare = [{ id: 'x', name: 'general', type: 0, parentId: null, position: 0 }];
  const plan = buildPlan({ inventory: bare, packages: ['tim'], extras: { news: true, memes: true },
    theme: customTheme({ channel: '{emoji}✦{nama}', category: '✦ {nama} ✦' }), rename: false });
  assert.deepEqual(plan.categories.map(c => [c.key, c.name]), [['hengs', '✦ Hengs ✦']]);
  assert.deepEqual(plan.channels.map(c => [c.slug, c.kind, c.name]), [['hasil-scrim', 'scrim', '📸✦hasil-scrim'],
    ['hengs-news', 'news', '📰✦hengs-news'], ['hengs-memes', 'memes', '😂✦hengs-memes']]);
  assert.throws(() => buildPlan({ inventory: bare, packages: [], extras: {}, theme: themeById('dot') }), /SETUP_NOTHING_SELECTED/);
  assert.throws(() => buildPlan({ inventory: bare, packages: ['castle'], extras: {}, theme: themeById('dot') }), /SETUP_PACKAGE_UNKNOWN/);
});

test('a text channel never stands in for a voice channel with the same slug', () => {
  const mixed = [{ id: 'x', name: 'lounge', type: 0, parentId: null, position: 0 }];
  const plan = buildPlan({ inventory: mixed, packages: ['voice'], extras: {}, theme: themeById('plain') });
  assert.equal(plan.channels.find(c => c.slug === 'lounge').id, null);
});

const { applyPlan } = require('../src/guilds/community-setup');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');

function guildRig({ pin = false, failOn = null, roles = [], items = inventory } = {}) {
  let next = 900; const created = []; const renamed = []; const roleMade = []; const edits = [];
  const cache = new Map(items.map(c => [c.id, { ...c, async setName(name) { renamed.push([c.id, name]); this.name = name; return this; },
    permissionOverwrites: { async edit(id, bits) { edits.push([c.id, id, bits]); } } }]));
  const guild = { id: 'g1', roles: { everyone: { id: 'g1' }, cache: new Map(roles.map(r => [r.id, r])),
    async fetch() { return this.cache; }, async create(o) { const r = { id: `r${++next}`, ...o }; roleMade.push(r); return r; } },
    members: { async fetchMe() { return { id: 'me', permissions: { has: p => Array.isArray(p) || p !== P.PinMessages || pin } }; } },
    channels: { cache, async fetch(id) { return cache.get(id); },
      async create(o) { if (failOn && o.name === failOn) throw new Error('private-provider'); const made = { id: `n${++next}`, guildId: 'g1', ...o, type: o.type };
        created.push(made); cache.set(made.id, made); return made; } } };
  return { guild, created, renamed, roleMade, edits };
}

test('apply creates new categories first, then channels inside them with permissions by kind, and posts the Hengs guides', async () => {
  const plan = buildPlan({ inventory, packages: ['lobby', 'komunitas', 'hengs', 'tim', 'voice'], extras: { news: true },
    theme: themeById('garis') });
  const r = guildRig(); const guides = [];
  const result = await applyPlan(r.guild, plan, { postChatGuide: async c => { guides.push(['chat', c.name]); return { posted: true, pinned: true }; },
    postAnalystGuide: async c => { guides.push(['analis', c.name]); return { posted: true, pinned: false }; } });
  assert.equal(r.created[0].type, ChannelType.GuildCategory); assert.equal(r.created[0].name, '──── Lobby ────');
  const byName = Object.fromEntries(r.created.map(c => [c.name, c]));
  assert.equal(byName['👋︱welcome'].parent, r.created[0].id);
  assert.equal(byName['📷︱media'].parent, 'c1'); // reused COMMUNITY
  assert.equal(byName['🤖︱tanya-hengs'].parent, 'c2'); // reused BOT CENTER
  assert.equal(byName['💤︱AFK'].type, ChannelType.GuildVoice);
  const everyone = c => c.permissionOverwrites.find(o => o.id === 'g1');
  // Read and Hengs-only channels: members view and react, never send. Chat channels keep the server defaults.
  for (const name of ['👋︱welcome', '📊︱hengs-analis', '📰︱hengs-news']) {
    assert(everyone(byName[name]).deny.includes(P.SendMessages) && everyone(byName[name]).allow.includes(P.AddReactions), name);
  }
  assert.equal(everyone(byName['📷︱media']), undefined); assert.equal(everyone(byName['🤖︱tanya-hengs']), undefined);
  assert.equal(byName['💤︱AFK'].permissionOverwrites, undefined);
  // Private team channel: hidden from @everyone, open to a new Hengs Family role.
  const scrim = byName['📸︱hasil-scrim'];
  assert(everyone(scrim).deny.includes(P.ViewChannel)); assert.equal(r.roleMade[0].name, 'Hengs Family');
  assert(scrim.permissionOverwrites.some(o => o.id === r.roleMade[0].id && o.allow.includes(P.SendMessages)));
  assert.match(byName['🤖︱tanya-hengs'].topic, /mention/i);
  assert.deepEqual(guides, [['chat', '🤖︱tanya-hengs'], ['analis', '📊︱hengs-analis']]);
  assert.equal(result.created.length, 1 + 9); assert.deepEqual(result.failed, []);
  assert.equal(result.guides.length, 2);
});

test('apply renames only the listed channels, records failures without retrying, and stops when the lease ends', async () => {
  const plan = buildPlan({ inventory, packages: ['komunitas'], extras: {}, theme: themeById('kurung'), rename: true });
  const r = guildRig({ failOn: 'ˌ📷ˈmedia' });
  const result = await applyPlan(r.guild, plan, {});
  assert.deepEqual(r.renamed.map(([id]) => id), ['c1', 't1', 'c2', 't2', 'c3', 'v1']);
  assert.deepEqual(result.failed, ['ˌ📷ˈmedia']); assert.equal(result.renamed.length, 6);
  assert(!JSON.stringify(result).includes('private-provider'));
  let calls = 0;
  const stopped = guildRig();
  await assert.rejects(applyPlan(stopped.guild, plan, { assertLease: async () => { if (++calls > 1) throw new Error('SETUP_PREVIEW_STALE'); } }),
    /SETUP_PREVIEW_STALE/);
  assert.equal(stopped.created.length + stopped.renamed.length, 1);
});

test('apply gives reused Hengs channels the permissions of new ones, edits only those overwrites and checks the analyst guide', async () => {
  const items = [...inventory, { id: 'h1', name: '📰・hengs-news', type: 0, parentId: 'c2', position: 1 },
    { id: 'h2', name: 'hasil-scrim', type: 0, parentId: null, position: 1 }, { id: 'h3', name: '📊・hengs-analis', type: 0, parentId: 'c2', position: 2 }];
  const plan = buildPlan({ inventory: items, packages: ['hengs', 'tim'], extras: { news: true }, theme: themeById('dot') });
  const r = guildRig({ items }); const guides = [];
  const result = await applyPlan(r.guild, plan, { postChatGuide: async c => { guides.push(['chat', c.name]); return { posted: true, pinned: true }; },
    postAnalystGuide: async c => { guides.push(['analis', c.id]); return { exists: true }; } });
  assert.deepEqual(r.created.map(c => c.name), ['🤖・tanya-hengs']);
  assert.deepEqual(result.tightened.map(c => c.id), ['h3', 'h2', 'h1']);
  assert.deepEqual(r.edits.map(([channel, id]) => [channel, id]), [['h3', 'g1'], ['h3', 'me'], ['h2', 'g1'], ['h2', r.roleMade[0].id], ['h2', 'me'],
    ['h1', 'g1'], ['h1', 'me']]);
  const bits = (channel, id) => r.edits.find(e => e[0] === channel && e[1] === id)[2];
  assert.equal(bits('h1', 'g1').SendMessages, false); assert.equal(bits('h1', 'g1').AddReactions, true);
  assert.equal(bits('h2', 'g1').ViewChannel, false); assert.equal(bits('h2', r.roleMade[0].id).SendMessages, true);
  assert.equal(bits('h1', 'me').SendMessages, true);
  assert.deepEqual(r.roleMade.map(role => [role.name, role.permissions, role.mentionable]), [['Hengs Family', [], false]]);
  assert.deepEqual(guides, [['chat', '🤖・tanya-hengs'], ['analis', 'h3']]);
  assert.deepEqual(result.failed, []);
});

test('apply records a hasil-scrim failure when the team role is ambiguous, and creates no second role', async () => {
  const plan = buildPlan({ inventory, packages: ['tim'], extras: {}, theme: themeById('dot') });
  const r = guildRig({ roles: [{ id: 'r1', name: 'Hengs Family' }, { id: 'r2', name: 'hengs family' }] });
  const result = await applyPlan(r.guild, plan, { logger: { error() {} } });
  assert.deepEqual(result.failed, ['📸・hasil-scrim']); assert.equal(r.roleMade.length, 0);
  assert.equal(r.created.length, 0);
});

test('Admin Hengs puts bot-settings, bot-log and bot-status in a private Admin category and reuses what exists', async () => {
  const items = [...inventory, { id: 'p1', name: '🔒 PRIVATE', type: 4, position: 9 },
    { id: 's1', name: '⚙️︱bot-settings', type: 0, parentId: 'p1', position: 0 }];
  const plan = buildPlan({ inventory: items, packages: ['admin'], extras: {}, theme: themeById('dot') });
  assert.deepEqual(plan.categories.map(c => [c.key, c.id]), [['admin', 'p1']]);
  assert.deepEqual(plan.channels.map(c => [c.slug, c.id, c.kind]), [['bot-settings', 's1', 'admin'], ['bot-log', null, 'admin'],
    ['bot-status', null, 'admin']]);
  const r = guildRig({ items });
  const result = await applyPlan(r.guild, plan, {});
  assert.deepEqual(r.created.map(c => [c.name, c.parent]), [['📋・bot-log', 'p1'], ['📡・bot-status', 'p1']]);
  for (const made of r.created) {
    assert(made.permissionOverwrites.find(o => o.id === 'g1').deny.includes(P.ViewChannel), made.name);
    assert(made.permissionOverwrites.find(o => o.id === 'me').allow.includes(P.SendMessages), made.name);
  }
  // The existing bot-settings keeps its other overwrites; only @everyone and Hengs are set.
  assert.deepEqual(result.tightened.map(c => c.id), ['s1']);
  assert.deepEqual(r.edits.map(([channel, id, bits]) => [channel, id, bits.ViewChannel]), [['s1', 'g1', false], ['s1', 'me', true]]);
  assert.deepEqual(result.failed, []);
});
