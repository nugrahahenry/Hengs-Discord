'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection, ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { createScrimStore, MAX_RESULTS } = require('../src/scrim/store');
const { createScrimResults, parseScore, readSubmission, CHANNEL_NAME, findTeamRole } = require('../src/scrim/service');
const { createAdminSetupFlow, ensureScrimSetup } = require('../src/guilds/admin-setup');
const scrimCommand = require('../src/commands/scrim');
const { buildCommandPlan } = require('../src/deploy-commands');

const G = '223456789012345678', U = '323456789012345678', BOT = '623456789012345678', SRC = '423456789012345678';
const IMG = 'https://cdn.discordapp.com/attachments/1/2/ss.png';
const deps = { guildAccess: { classify: () => ({ kind: 'home' }) } };

function result(n, extra = {}) {
  return { messageId: String(800000000000000000n + BigInt(n)), at: 1000 + n, submitterId: U, game: 'MLBB',
    opponent: 'Tim Contoh', score: [2, 1], outcome: 'menang', note: '', ...extra };
}

function options(over = {}) {
  const value = { ss: { url: IMG, contentType: 'image/png', size: 1000 }, lawan: 'Tim Contoh', skor: '2-1',
    hasil: 'menang', game: null, catatan: null, ...over };
  return { getAttachment: key => value[key], getString: key => value[key] ?? null };
}

function rigService({ teamMember = true, roleExists = true, channelExists = true, botAllowed = true, store } = {}) {
  const role = { id: '700000000000000001', name: 'Hengs Family' };
  const sends = []; const records = []; const downloads = [];
  const channel = { id: '700000000000000002', name: CHANNEL_NAME, type: ChannelType.GuildText, guildId: G,
    permissionsFor: () => ({ has: () => botAllowed }),
    async send(payload) { sends.push(payload); return { id: String(900000000000000000n + BigInt(sends.length)) }; } };
  const guild = { id: G,
    roles: { async fetch() { return new Collection(roleExists ? [[role.id, role]] : []); } },
    channels: { async fetch() { return new Collection(channelExists ? [[channel.id, channel]] : []); } },
    members: { async fetch() { return { id: U, roles: { cache: new Collection(teamMember ? [[role.id, role]] : []) } }; },
      async fetchMe() { return { id: BOT }; } } };
  const service = createScrimResults({ store: store || { add: (guildId, row) => records.push([guildId, row]) },
    logger: { error() {} }, now: () => 5000,
    fetchImpl: async (url, init) => { downloads.push([url, init]); return { ok: true,
      headers: { get: key => ({ 'content-type': 'image/png', 'content-length': '4' })[key] },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; } });
  function interaction(over = {}) {
    return { id: '999999999999999991', guild, guildId: G, channelId: SRC, user: { id: U, bot: false },
      options: options(), replies: [], edits: [], deferred: false, replied: false, isButton: () => false,
      async reply(payload) { this.replied = true; this.replies.push(payload); },
      async deferReply() { this.deferred = true; }, async deferUpdate() { this.deferred = true; },
      async editReply(payload) { this.edits.push(payload); }, ...over };
  }
  return { service, guild, channel, role, sends, records, downloads, interaction };
}

const buttonId = (payload, index) => payload.components[0].toJSON().components[index].custom_id;

async function previewed(r) {
  const i = r.interaction();
  await r.service.preview(i, deps);
  return i.edits.at(-1);
}

test('scrim store keeps validated results, rejects duplicates and keeps the newest 500', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrim-'));
  const file = path.join(dir, 'scrim-results.json');
  try {
    const store = createScrimStore({ filePath: file });
    assert.deepEqual(store.list(G), []);
    store.add(G, result(1));
    assert.deepEqual(store.list(G), [result(1)]);
    assert.throws(() => store.add(G, result(1)), /SCRIM_RESULT_DUPLICATE/);
    for (const bad of [{ ...result(2), opponent: '<@1>' }, { ...result(3), score: [2] },
      { ...result(4), outcome: 'win' }, { ...result(5), extra: 1 }, { ...result(6), game: 'Dota' }]) {
      assert.throws(() => store.add(G, bad), /SCRIM_RESULT_INVALID/);
    }
    const full = Array.from({ length: MAX_RESULTS }, (_, n) => result(n + 10));
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, guilds: [{ guildId: G, results: full }] }));
    store.add(G, result(9999));
    const kept = store.list(G);
    assert.equal(kept.length, MAX_RESULTS);
    assert.equal(kept[0].messageId, result(11).messageId);
    assert.equal(kept.at(-1).messageId, result(9999).messageId);
    assert.deepEqual(fs.readdirSync(dir), ['scrim-results.json']);
    fs.writeFileSync(file, '{"schemaVersion":2,"guilds":[]}');
    assert.throws(() => store.list(G), /SCRIM_STATE_INVALID/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('submissions accept only N-N scores, Discord CDN images and sanitized text', () => {
  assert.deepEqual(parseScore('2-1'), [2, 1]);
  assert.deepEqual(parseScore(' 13 : 7 '), [13, 7]);
  for (const bad of ['2', '2-', 'a-b', '100-1', '2-1-0']) assert.equal(parseScore(bad), null, bad);
  const bidi = String.fromCharCode(0x202e);
  const parsed = readSubmission(options({ lawan: `Tim <@1> @everyone${bidi}X`, catatan: 'draft **lemah**' }));
  assert.deepEqual(parsed, { opponent: 'Tim 1 everyone X', score: [2, 1], outcome: 'menang', game: 'MLBB',
    note: 'draft **lemah**', image: { url: IMG, type: 'image/png' } });
  for (const [over, code] of [[{ ss: { url: 'https://evil.example/ss.png', contentType: 'image/png', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: 'http://cdn.discordapp.com/a.png', contentType: 'image/png', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: IMG, contentType: 'image/gif', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: IMG, contentType: 'image/png', size: 9 * 1024 * 1024 } }, /SCRIM_IMAGE_INVALID/],
    [{ lawan: '  @  ' }, /SCRIM_FIELDS_INVALID/], [{ skor: 'x' }, /SCRIM_FIELDS_INVALID/],
    [{ hasil: 'win' }, /SCRIM_FIELDS_INVALID/], [{ game: 'Dota' }, /SCRIM_FIELDS_INVALID/]]) {
    assert.throws(() => readSubmission(options(over)), code);
  }
});

test('team member previews privately, then one Kirim posts the image without pings and records it', async () => {
  const r = rigService();
  const preview = await previewed(r);
  assert.match(preview.content, /Hasil scrim MLBB: Menang 2-1/);
  assert.match(preview.content, /Belum dikirim/);
  assert.deepEqual(preview.allowedMentions, { parse: [] });
  assert.equal(preview.embeds[0].image.url, IMG);
  assert.equal(r.sends.length, 0);
  assert.match(buttonId(preview, 0), /^hengs-scrim:[a-f0-9]{24}:send$/);
  const click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  assert.equal(await r.service.handleButton(click), true);
  assert.equal(r.sends.length, 1);
  assert.match(r.sends[0].content, /Lawan: Tim Contoh\nDikirim oleh <@323456789012345678>/);
  assert.deepEqual(r.sends[0].allowedMentions, { parse: [] });
  assert.equal(r.sends[0].enforceNonce, true);
  assert.equal(r.sends[0].files[0].name, 'hasil-scrim.png');
  assert.deepEqual(r.downloads.map(([url, init]) => [url, init.redirect]), [[IMG, 'error']]);
  assert.deepEqual(r.records, [[G, { messageId: '900000000000000001', at: 5000, submitterId: U, game: 'MLBB',
    opponent: 'Tim Contoh', score: [2, 1], outcome: 'menang', note: '' }]]);
  assert.match(click.edits.at(-1).content, /tercatat untuk rekap/);
  const again = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleButton(again);
  assert.equal(r.sends.length, 1);
  assert.match(again.replies.at(-1).content, /kedaluwarsa/);
});

test('non-team members, missing setup, other guilds and bad images never reach the channel', async () => {
  for (const [setup, message] of [[{ teamMember: false }, /khusus anggota role Hengs Family/],
    [{ roleExists: false }, /Role Hengs Family belum ada/], [{ channelExists: false }, /Channel hasil-scrim belum ada/],
    [{ botAllowed: false }, /Hengs perlu izin/]]) {
    const r = rigService(setup);
    const preview = await previewed(r);
    assert.match(preview.content, message);
    assert.deepEqual(preview.components, []);
    assert.equal(r.sends.length, 0);
  }
  const r = rigService();
  const other = r.interaction();
  await r.service.preview(other, { guildAccess: { classify: () => ({ kind: 'public' }) } });
  assert.match(other.replies.at(-1).content, /server utama/);
  const gif = r.interaction({ options: options({ ss: { url: IMG, contentType: 'image/gif', size: 10 } }) });
  await r.service.preview(gif, deps);
  assert.match(gif.replies.at(-1).content, /PNG, JPG atau WebP/);
  assert.equal(r.sends.length + r.downloads.length, 0);
});

test('cancel, revoked role, failed record and uncertain sends are reported honestly without retry', async () => {
  let r = rigService();
  let preview = await previewed(r);
  let click = r.interaction({ customId: buttonId(preview, 1), isButton: () => true });
  await r.service.handleButton(click);
  assert.equal(r.sends.length, 0);
  assert.match(click.edits.at(-1).content, /Dibatalkan/);

  r = rigService();
  preview = await previewed(r);
  r.guild.members.fetch = async () => ({ id: U, roles: { cache: new Collection() } });
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleButton(click);
  assert.equal(r.sends.length, 0);
  assert.match(click.edits.at(-1).content, /khusus anggota/);

  r = rigService({ store: { add() { throw new Error('private-disk'); } } });
  preview = await previewed(r);
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleButton(click);
  assert.equal(r.sends.length, 1);
  assert.match(click.edits.at(-1).content, /belum tersimpan untuk rekap/);

  r = rigService();
  preview = await previewed(r);
  let attempts = 0;
  r.channel.send = async () => { attempts += 1; throw new Error('private-network'); };
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleButton(click);
  await r.service.handleButton(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  assert.equal(attempts, 1);
  assert.match(click.edits.at(-1).content, /belum bisa dipastikan/);
  assert.doesNotMatch(JSON.stringify(click.edits), /private-/);
});

function rigGuild({ role = null, channel = null, gaming = true } = {}) {
  const created = { roles: [], channels: [] }; const edits = [];
  const channels = new Collection();
  const add = value => { channels.set(value.id, value); return value; };
  const overwrites = () => ({ cache: new Collection(), async edit(...args) { edits.push(args); } });
  if (gaming) add({ id: '710000000000000001', name: '🎮 GAMING', type: ChannelType.GuildCategory, guildId: G, permissionOverwrites: overwrites() });
  if (channel) add({ ...channel, guildId: G, type: ChannelType.GuildText, permissionOverwrites: overwrites() });
  const roles = new Collection(role ? [[role.id, role]] : []);
  const me = { id: BOT, permissions: { has: () => true } };
  const guild = { id: G, ownerId: U,
    roles: { everyone: { id: G }, async fetch() { return roles; },
      async create(options) { created.roles.push(options); const value = { id: '720000000000000001', ...options }; roles.set(value.id, value); return value; } },
    channels: { async fetch() { return channels; },
      async create(options) { created.channels.push(options);
        return add({ id: '730000000000000001', guildId: G, name: options.name, type: options.type,
          parentId: options.parent || null, permissionOverwrites: overwrites() }); } },
    members: { me, async fetchMe() { return me; }, async fetch() { return { permissions: { has: () => true } }; } } };
  return { guild, created, edits, channels };
}

test('scrim setup creates a permissionless team role and a team-only channel under Gaming', async () => {
  const r = rigGuild();
  const { role, channel } = await ensureScrimSetup(r.guild, {});
  assert.equal(r.created.roles.length, 1);
  assert.equal(r.created.roles[0].name, 'Hengs Family');
  assert.deepEqual(r.created.roles[0].permissions, []);
  assert.equal(r.created.roles[0].mentionable, false);
  const created = r.created.channels[0];
  assert.equal(created.name, CHANNEL_NAME);
  assert.equal(created.parent, '710000000000000001');
  const [everyone, team, bot] = created.permissionOverwrites;
  assert.equal(everyone.id, G);
  assert(everyone.deny.includes(P.SendMessages) && !everyone.allow.includes(P.SendMessages));
  assert.equal(team.id, role.id);
  assert(team.allow.includes(P.SendMessages) && team.allow.includes(P.AttachFiles));
  assert.equal(bot.id, BOT);
  assert.equal(channel.id, '730000000000000001');
});

test('scrim setup reuses existing pieces, edits only three overwrites and refuses drift or duplicates', async () => {
  const role = { id: '720000000000000009', name: 'Hengs Family' };
  const r = rigGuild({ role, channel: { id: '730000000000000009', name: 'hasil-scrim' } });
  await ensureScrimSetup(r.guild, { roleId: role.id, channelId: '730000000000000009' });
  assert.equal(r.created.roles.length + r.created.channels.length, 0);
  assert.deepEqual(r.edits.map(edit => edit[0]), [G, role.id, BOT]);
  assert.equal(r.edits[0][1].SendMessages, false);
  assert.equal(r.edits[1][1].SendMessages, true);
  await assert.rejects(ensureScrimSetup(r.guild, { roleId: null, channelId: '730000000000000009' }), /SETUP_PREVIEW_STALE/);
  const duplicate = rigGuild({ role });
  duplicate.guild.roles.fetch = async () => new Collection([[role.id, role], ['720000000000000010', { id: '720000000000000010', name: 'Hengs Family' }]]);
  await assert.rejects(ensureScrimSetup(duplicate.guild, {}), /SCRIM_ROLE_CONFLICT/);
  assert.equal(duplicate.created.roles.length, 0);
});

test('owner setup flow previews Scrim tim first and applies role plus channel only after confirmation', async () => {
  const r = rigGuild();
  const flow = createAdminSetupFlow({ applyLegacy: async () => { throw new Error('must not run full setup'); }, logger: { error() {} } });
  const interaction = (over = {}) => ({ guild: r.guild, guildId: G, channelId: SRC, user: { id: U },
    memberPermissions: { has: () => true }, isButton: () => true, replies: [], edits: [], deferred: false, replied: false,
    async reply(payload) { this.replied = true; this.replies.push(payload); },
    async deferUpdate() { this.deferred = true; }, async editReply(payload) { this.edits.push(payload); }, ...over });
  const opened = interaction();
  await flow.open(opened, deps);
  const question = opened.replies.at(-1);
  const scrim = question.components[0].toJSON().components.find(c => c.custom_id.endsWith(':scrim')).custom_id;
  const choose = interaction({ customId: scrim });
  await flow.handle(choose, deps);
  const preview = choose.edits.at(-1);
  assert.match(preview.content, /Preview channel hasil scrim/);
  assert.match(preview.content, /Buat role Hengs Family/);
  assert.equal(r.created.roles.length + r.created.channels.length, 0);
  const apply = preview.components[0].toJSON().components.find(c => c.custom_id.endsWith(':scrimapply')).custom_id;
  const confirmed = interaction({ customId: apply });
  await flow.handle(confirmed, deps);
  assert.equal(r.created.roles.length, 1);
  assert.equal(r.created.channels.length, 1);
  assert.match(confirmed.edits.at(-1).content, /Siap: role <@&720000000000000001> dan channel <#730000000000000001>/);
  assert.deepEqual(confirmed.edits.at(-1).allowedMentions, { parse: [] });
});

test('/scrim registers hasil in the home guild with required screenshot and fields first', () => {
  const json = scrimCommand.data.toJSON();
  const hasil = json.options.find(option => option.name === 'hasil');
  assert.deepEqual(hasil.options.map(option => [option.name, Boolean(option.required)]),
    [['ss', true], ['lawan', true], ['skor', true], ['hasil', true], ['game', false], ['catatan', false]]);
  const plan = buildCommandPlan([{ name: 'hengs' }, { name: 'setup' }, json]);
  assert.deepEqual(plan.home.map(command => command.name), ['scrim']);
});

test('the team role is found with or without an emoji prefix, and two candidates still conflict', async () => {
  const guildWith = (...names) => ({ roles: { fetch: async () => new Collection(names.map((name, index) => [
    `73000000000000000${index}`, { id: `73000000000000000${index}`, name }])) } });
  assert.equal((await findTeamRole(guildWith('\u{1FAC2} Hengs Family', 'Member'))).name, '\u{1FAC2} Hengs Family');
  assert.equal((await findTeamRole(guildWith('Hengs Family'))).name, 'Hengs Family');
  assert.equal(await findTeamRole(guildWith('Hengs Family Fans', 'Member')), null);
  await assert.rejects(findTeamRole(guildWith('Hengs Family', '\u{1FAC2} Hengs Family')), /SCRIM_ROLE_CONFLICT/);
});
