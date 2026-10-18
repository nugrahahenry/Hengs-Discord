'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, MessageFlags } = require('discord.js');
const { createCommunitySharing, parseShare, publicLink, TTL } = require('../src/news/sharing');
const hengs = require('../src/commands/hengs');

const G = '223456789012345678', U = '323456789012345678', C = '423456789012345678';
const N = '523456789012345678', M = '623456789012345678', MSG = '723456789012345678';
function rig(t) {
  const original = process.env.BOT_CHANNEL_ID;
  process.env.BOT_CHANNEL_ID = C;
  t.after(() => { if (original === undefined) delete process.env.BOT_CHANNEL_ID; else process.env.BOT_CHANNEL_ID = original; });
  let time = 1_000_000; let kind = 'home'; let hook = null;
  const sent = [], logs = [];
  const row = { revision: 1, settings: { channelId: N, memeChannelId: M } };
  const member = { id: U, user: { bot: false }, pending: false };
  const me = { id: '823456789012345678' };
  const message = { id: MSG, guildId: G, channelId: C, author: { id: U }, content: 'original',
    attachments: new Map([['a', { id: 'a', size: 120, contentType: 'image/webp', url: `https://cdn.discordapp.com/attachments/${C}/${MSG}/picture.webp` }]]) };
  const channels = new Map([C, N, M].map(id => [id, { id, guildId: G, type: ChannelType.GuildText,
    name: id === C ? 'bot-commands' : 'target', allowed: true,
    permissionsFor() { return { has: () => this.allowed }; },
    messages: { async fetch() { return message; } },
    async send(payload) { sent.push({ target: id, payload }); if (hook) await hook(); },
  }]));
  const guild = { id: G, ownerId: U, channels: { cache: channels, async fetch(id) { return channels.get(id); } },
    members: { async fetch() { return member; }, async fetchMe() { return me; } } };
  const config = { settings: { channelMode: 'current', channelId: C } };
  const guildAccess = { classify: () => ({ kind, config }) };
  const service = createCommunitySharing({ getSettings: () => row, guildAccess, now: () => time,
    logger: { error: value => logs.push(value) } });
  function interaction(extra = {}) {
    return { id: '923456789012345678', guildId: G, guild, channelId: C, user: { id: U },
      inGuild: () => true, isButton: () => true, replies: [], edits: [], deferred: false,
      async reply(p) { this.replies.push(p); }, async deferUpdate() { this.deferred = true; },
      async deferReply(p) { this.deferOptions = p; this.deferred = true; }, async editReply(p) { this.edits.push(p); }, ...extra };
  }
  const prepare = (text = 'bagikan berita: https://example.com/article') => service.handle(interaction(), text);
  async function click(preview, action = 'send', extra = {}) {
    const customId = preview.components[0].toJSON().components.find(b => b.custom_id.endsWith(':' + action)).custom_id;
    const i = interaction({ customId, ...extra }); await service.handleButton(i); return i;
  }
  return { service, row, member, me, message, channels, guild, guildAccess, sent, logs, interaction, prepare, click,
    config, scope: value => { kind = value; },
    advance: ms => { time += ms; }, disable: () => { kind = 'pending'; }, onSend: fn => { hook = fn; } };
}

test('sharing accepts explicit requests only and does not fetch unsafe link forms', () => {
  assert.equal(parseShare('apa berita terbaru?'), null);
  assert.equal(parseShare('jangan bagikan berita: https://example.com'), null);
  assert.equal(parseShare('tolong bagikan joke: halo').kind, 'joke');
  for (const link of ['http://example.com', 'https://127.0.0.1', 'https://[::1]', 'https://user:pass@example.com',
    'https://a.local', 'https://example.com:8080', 'https://example.com/a https://example.com/b']) assert.throws(() => publicLink(link));
  assert.equal(publicLink('https://example.com/a'), 'https://example.com/a');
});

test('member preview is private until same actor confirms, publishes once without pings/unfurls', async t => {
  const r = rig(t); const p = await r.prepare(); assert.equal(r.sent.length, 0);
  assert.match(p.content, /Belum dikirim/);
  const i = await r.click(p); assert.match(i.edits.at(-1).content, /sudah masuk/);
  await r.click(p); assert.equal(r.sent.length, 1);
  const { target, payload } = r.sent[0]; assert.equal(target, N);
  assert.deepEqual(payload.allowedMentions.parse, []);
  assert.equal(payload.flags, MessageFlags.SuppressEmbeds); assert.equal(payload.enforceNonce, true);
  assert.match(payload.content, /bukan verifikasi/); assert.match(payload.nonce, /^\d+$/);
});

test('meme forwarding validates ownership and sends a link, jokes use separate destination', async t => {
  const r = rig(t); const link = `https://discord.com/channels/${G}/${C}/${MSG}`;
  const p = await r.prepare('bagikan meme: ' + link); assert.match(p.content, /bukan salinan gambar/);
  await r.click(p); assert.equal(r.sent[0].target, M); assert.match(r.sent[0].payload.content, /discord.com\/channels/);
  r.advance(60_000); await r.click(await r.prepare('bagikan joke: **mantap**'));
  assert.equal(r.sent[1].target, M); assert(r.sent[1].payload.content.includes('\\*\\*mantap\\*\\*'));
});

for (const [name, mutate] of [
  ['permission revoked', r => { r.channels.get(N).allowed = false; }],
  ['timeout', r => { r.member.communicationDisabledUntilTimestamp = 2_000_000; }],
  ['pending member', r => { r.member.pending = true; }],
  ['guild disabled', r => r.disable()],
  ['route changed', r => { r.row.revision++; }],
  ['native slowmode', r => { r.channels.get(N).rateLimitPerUser = 30; }],
  ['expired', r => r.advance(TTL)],
  ['reset', r => r.service.clear(r.interaction())],
  ['shutdown', r => r.service.stop()],
  ['foreign target', r => { r.channels.get(N).guildId = U; }],
]) test(`confirmation fails closed after ${name}`, async t => {
  const r = rig(t); const p = await r.prepare(); mutate(r); await r.click(p); assert.equal(r.sent.length, 0);
});

test('other actor/channel, new draft and cancellation cannot reuse a preview', async t => {
  const r = rig(t); const p = await r.prepare();
  await r.click(p, 'send', { user: { id: N } }); await r.click(p, 'send', { channelId: N });
  const newer = await r.prepare(); await r.click(p); await r.click(newer, 'cancel'); await r.click(newer);
  assert.equal(r.sent.length, 0);
});

test('bad payload, hidden source, wrong author, changed media and foreign link cannot relay', async t => {
  const r = rig(t);
  for (const prompt of ['bagikan joke: @everyone yo', 'bagikan joke: https://example.com', 'bagikan berita: http://example.com',
    `bagikan meme: https://discord.com/channels/${U}/${C}/${MSG}`]) {
    assert.equal((await r.prepare(prompt)).components.length, 0);
  }
  const link = `bagikan meme: https://discord.com/channels/${G}/${C}/${MSG}`;
  r.message.author.id = N; assert.equal((await r.prepare(link)).components.length, 0);
  r.message.author.id = U; const p = await r.prepare(link); r.message.content = 'edited';
  await r.click(p); assert.equal(r.sent.length, 0);
  r.channels.get(C).allowed = false; assert.equal((await r.prepare()).components.length, 0);
});

test('send uncertainty consumes preview and cooldown, no raw error or retry', async t => {
  const r = rig(t); r.onSend(() => { throw new Error('PRIVATE_PROVIDER_DETAIL'); });
  const p = await r.prepare(); const i = await r.click(p); await r.click(p);
  await r.click(await r.prepare());
  assert.equal(r.sent.length, 1); assert.match(i.edits.at(-1).content, /belum bisa dipastikan/);
  assert(!JSON.stringify([i.edits, r.logs]).includes('PRIVATE_PROVIDER_DETAIL'));
});

test('public relay respects source allowlist and returns guidance without LLM on public mentions', async t => {
  const r = rig(t); r.scope('public'); const p = await r.prepare();
  r.config.settings.channelId = N; await r.click(p); assert.equal(r.sent.length, 0);
  r.config.settings.channelId = C; await r.click(await r.prepare()); assert.equal(r.sent.length, 1);
  const { resolvePrompt } = require('../src/prompt-assistant');
  const route = resolvePrompt({ prompt: 'bagikan berita: https://example.com', scopeKind: 'public', privateReply: false });
  assert.equal(route.kind, 'community_share_private'); assert.match(route.content, /konfirmasi/);
});

test('oversized formatted jokes and invalid media remain bounded', async t => {
  const r = rig(t);
  const huge = await r.prepare('bagikan joke: ' + '*'.repeat(1400));
  assert.equal(huge.components.length, 0); assert(huge.content.length < 2000);
  for (const changes of [{ size: 9 * 1024 * 1024 }, { contentType: 'image/svg+xml' }, { url: 'https://example.com/file.png' }]) {
    const a = r.message.attachments.get('a'); const saved = { ...a }; Object.assign(a, changes);
    assert.equal((await r.prepare(`bagikan meme: https://discord.com/channels/${G}/${C}/${MSG}`)).components.length, 0);
    Object.assign(a, saved);
  }
});

test('draft capacity is bounded and expires, and a guild cannot overlap in-flight sends', async t => {
  const r = rig(t);
  for (let n = 0; n < 100; n++) {
    const id = String(800000000000000000n + BigInt(n)); r.member.id = id;
    await r.service.handle(r.interaction({ user: { id } }), 'bagikan joke: hello');
  }
  r.member.id = U; assert.match((await r.prepare()).content, /penuh/);
  r.advance(TTL); const p = await r.prepare();
  let release; let enter;
  const wait = new Promise(resolve => { release = resolve; }); const entered = new Promise(resolve => { enter = resolve; });
  r.onSend(async () => { enter(); await wait; });
  const first = r.click(p); await entered;
  r.advance(60_000); r.member.id = N;
  const other = r.interaction({ user: { id: N } });
  const q = await r.service.handle(other, 'bagikan joke: hello');
  await r.click(q, 'send', { user: { id: N } }); assert.equal(r.sent.length, 1);
  release(); await first;
});

test('concurrent confirmation and reset during fresh check never double post', async t => {
  const r = rig(t); const p = await r.prepare();
  let release; let enter;
  const wait = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { enter = resolve; });
  const pending = r.click(p, 'send', { async deferUpdate() { this.deferred = true; enter(); await wait; } });
  await entered; await r.click(p); r.service.clear(r.interaction()); release(); await pending;
  assert.equal(r.sent.length, 0);
});

test('real slash command shares before manager-only news or LLM, and reset clears draft', async t => {
  const r = rig(t); let prompt = 'bagikan berita: https://example.com/article'; let sub = 'ask';
  const i = r.interaction({ options: { getSubcommand: () => sub, getString: () => prompt } });
  const deps = { guildAccess: r.guildAccess, communitySharing: r.service,
    agent: { clearHistory() {}, buildConversationKey: () => 'test' }, newsService: { clear() {}, canHandle() { throw new Error('must not enter news'); } },
    state: { publicConfigStore: {} } };
  await hengs.execute(i, deps);
  assert.equal(i.deferOptions.flags, MessageFlags.Ephemeral); assert.match(i.edits.at(-1).content, /Preview kiriman/);
  const preview = i.edits.at(-1); sub = 'reset'; await hengs.execute(i, deps); await r.click(preview);
  assert.equal(r.sent.length, 0);
});
