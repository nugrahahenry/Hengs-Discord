'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection, ChannelType, ComponentType, PermissionFlagsBits: P } = require('discord.js');
const { createScrimStore, MAX_GAMES } = require('../src/scrim/store');
const { createScrimResults, readSubmission, RESULT_CHOICES, MESSAGES, CHANNEL_NAME, findTeamRole } = require('../src/scrim/service');
const scrimCommand = require('../src/commands/scrim');
const hengsCommand = require('../src/commands/hengs');
const { buildCommunityHelp } = require('../src/community-help');
const { buildCommandPlan } = require('../src/deploy-commands');
const { COACH_RULES } = require('../src/scrim/coach');

const G = '223456789012345678', U = '323456789012345678', BOT = '623456789012345678', SRC = '423456789012345678';
const T2 = '523456789012345678', OUT = '923456789012345670'; // a second team member and someone outside the team
const IMG = 'https://cdn.discordapp.com/attachments/1/2/ss.png';
const NOW = Date.UTC(2026, 9, 21, 5, 0); // 12:00 WIB
const EMOJI = String.fromCodePoint(0x1f600);
const deps = { guildAccess: { classify: () => ({ kind: 'home' }) } };
const loneSurrogate = text => [...text].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff);

function game(n, extra = {}) {
  return { messageId: String(800000000000000000n + BigInt(n)), at: 1000 + n, submitterId: U,
    opponent: 'Tim Contoh', outcome: 'menang', reason: null, lineup: [U], note: '', ...extra };
}

function options(over = {}) {
  const value = { ss: { url: IMG, contentType: 'image/png', size: 1000 }, lawan: 'Tim Contoh', hasil: 'menang',
    catatan: null, ...over };
  return { getAttachment: key => value[key] ?? null, getString: key => value[key] ?? null,
    getFocused: full => (full ? { name: 'lawan', value: value.lawan } : value.lawan) };
}

function rigService({ teamMember = true, roleExists = true, channelExists = true, botAllowed = true, everyoneCanView = false,
  store, games = [], agent = null, coachStore = null, proPages = null, clock = () => NOW } = {}) {
  const role = { id: '700000000000000001', name: 'Hengs Family' };
  const sends = []; const records = []; const downloads = []; const dms = []; const removals = []; const cardDeletes = [];
  const team = new Set(teamMember ? [U, T2] : [T2]);
  const memberOf = id => ({ id, roles: { cache: new Collection(team.has(id) ? [[role.id, role]] : []) } });
  const channel = { id: '700000000000000002', name: CHANNEL_NAME, type: ChannelType.GuildText, guildId: G,
    permissionsFor: target => ({ has: () => (target?.id === G ? everyoneCanView : botAllowed) }),
    messages: { async delete(id) { cardDeletes.push(id); } },
    async send(payload) { sends.push(payload); return { id: String(900000000000000000n + BigInt(sends.length)) }; } };
  const guild = { id: G,
    roles: { everyone: { id: G }, cache: new Collection(roleExists ? [[role.id, role]] : []),
      async fetch() { return new Collection(roleExists ? [[role.id, role]] : []); } },
    channels: { async fetch() { return new Collection(channelExists ? [[channel.id, channel]] : []); } },
    members: { async fetch(query) {
      if (Array.isArray(query?.user)) return new Collection(query.user.filter(id => team.has(id)).map(id => [id, memberOf(id)]));
      return memberOf(U);
    }, async fetchMe() { return { id: BOT }; } } };
  const saved = structuredClone(games);
  const service = createScrimResults({ store: store || { list: () => structuredClone(saved),
    add: (guildId, row) => { records.push([guildId, row]); saved.push(structuredClone(row)); },
    remove: (guildId, messageId) => {
      const at = saved.findIndex(row => row.messageId === messageId);
      if (at < 0) return false;
      removals.push([guildId, messageId]);
      saved.splice(at, 1);
      return true;
    } },
  agent, coachStore, proPages, logger: { error() {} }, now: clock,
  fetchImpl: async (url, init) => { downloads.push([url, init]); return { ok: true,
    headers: { get: key => ({ 'content-type': 'image/png', 'content-length': '4' })[key] },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; } });
  function interaction(over = {}) {
    return { id: '999999999999999991', guild, guildId: G, channelId: SRC, member: memberOf(U),
      user: { id: U, bot: false, async send(payload) { dms.push(payload); } },
      options: options(), replies: [], edits: [], updates: [], responses: [], deferred: false, replied: false,
      isButton: () => false, isUserSelectMenu: () => false,
      async reply(payload) { this.replied = true; this.replies.push(payload); },
      async deferReply() { this.deferred = true; }, async deferUpdate() { this.deferred = true; },
      async editReply(payload) { this.edits.push(payload); }, async update(payload) { this.updates.push(payload); },
      async respond(choices) { this.responses.push(choices); }, ...over };
  }
  // A mention of Hengs in a guild channel (hasil-scrim unless the test swaps the channel).
  function message(over = {}) {
    return { id: '999999999999999981', guild, guildId: G, channel, channelId: channel.id, author: { id: U, bot: false },
      member: memberOf(U), replies: [], async reply(payload) { this.replies.push(payload); }, ...over };
  }
  return { service, guild, channel, role, sends, records, downloads, dms, removals, cardDeletes, saved, team, memberOf, interaction,
    message };
}

const buttonId = (payload, index) => payload.components[1].toJSON().components[index].custom_id;
const selectOf = payload => payload.components[0].toJSON().components[0];

async function previewed(r) {
  const i = r.interaction();
  await r.service.preview(i, deps);
  return i.edits.at(-1);
}

test('scrim store keeps one validated row per game, rejects duplicates and keeps the newest 500', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrim-'));
  const file = path.join(dir, 'scrim-games.json');
  try {
    const store = createScrimStore({ filePath: file });
    assert.deepEqual(store.list(G), []);
    const loss = game(2, { outcome: 'kalah', reason: 'teamfight', lineup: [] });
    store.add(G, game(1));
    store.add(G, loss);
    assert.deepEqual(store.list(G), [game(1), loss]);
    assert.throws(() => store.add(G, game(1)), /SCRIM_RESULT_DUPLICATE/);
    const six = ['1', '2', '3', '4', '5', '6'].map(digit => digit.repeat(18));
    for (const bad of [{ ...game(3), opponent: '<@1>' }, { ...game(4), outcome: 'seri' },
      { ...game(5), outcome: 'kalah', reason: null }, { ...game(6), reason: 'draft' },
      { ...game(7), outcome: 'kalah', reason: 'ngantuk' }, { ...game(8), lineup: [U, U] },
      { ...game(9), lineup: six }, { ...game(10), lineup: ['abc'] }, { ...game(11), extra: 1 },
      { ...game(12), score: [2, 1] }]) {
      assert.throws(() => store.add(G, bad), /SCRIM_RESULT_INVALID/);
    }
    const full = Array.from({ length: MAX_GAMES }, (_, n) => game(n + 20));
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, guilds: [{ guildId: G, games: full }] }));
    store.add(G, game(9999));
    const kept = store.list(G);
    assert.equal(kept.length, MAX_GAMES);
    assert.equal(kept[0].messageId, game(21).messageId);
    assert.equal(kept.at(-1).messageId, game(9999).messageId);
    assert.deepEqual(fs.readdirSync(dir), ['scrim-games.json']);
    // The v1.64 per-series shape is never read as games.
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, guilds: [{ guildId: G, results: [] }] }));
    assert.throws(() => store.list(G), /SCRIM_STATE_INVALID/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const seen = [];
  const missing = { lstatSync(file) { seen.push(file); throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } };
  assert.deepEqual(createScrimStore({ fsImpl: missing }).list(G), []);
  assert.ok(seen[0].endsWith(path.join('data', 'scrim-games.json')), 'games live in their own file, not scrim-results.json');
});

test('one hasil dropdown gives outcome and loss reason, the screenshot is optional and text is sanitized', () => {
  const bidi = String.fromCharCode(0x202e);
  assert.deepEqual(readSubmission(options({ lawan: `Tim <@1> @everyone${bidi}X`, catatan: 'draft **lemah**' })),
    { opponent: 'Tim 1 everyone X', outcome: 'menang', reason: null, note: 'draft **lemah**', image: { url: IMG, type: 'image/png' } });
  assert.deepEqual(RESULT_CHOICES.map(choice => choice.value),
    ['menang', 'kalah-early', 'kalah-objective', 'kalah-teamfight', 'kalah-draft', 'kalah-lainnya']);
  for (const reason of ['early', 'objective', 'teamfight', 'draft', 'lainnya']) {
    assert.deepEqual(readSubmission(options({ hasil: `kalah-${reason}`, ss: null })),
      { opponent: 'Tim Contoh', outcome: 'kalah', reason, note: '', image: null });
  }
  for (const [over, code] of [[{ ss: { url: 'https://evil.example/ss.png', contentType: 'image/png', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: 'http://cdn.discordapp.com/a.png', contentType: 'image/png', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: IMG, contentType: 'image/gif', size: 1 } }, /SCRIM_IMAGE_INVALID/],
    [{ ss: { url: IMG, contentType: 'image/png', size: 9 * 1024 * 1024 } }, /SCRIM_IMAGE_INVALID/],
    [{ lawan: '  @  ' }, /SCRIM_FIELDS_INVALID/], [{ hasil: 'seri' }, /SCRIM_FIELDS_INVALID/],
    [{ hasil: '__proto__' }, /SCRIM_FIELDS_INVALID/], [{ hasil: 'constructor' }, /SCRIM_FIELDS_INVALID/]]) {
    assert.throws(() => readSubmission(options(over)), code);
  }
});

test('scrim store removes one game by message ID and leaves everything else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrim-'));
  const file = path.join(dir, 'scrim-games.json');
  const OTHER = '723456789012345678';
  try {
    const store = createScrimStore({ filePath: file });
    assert.equal(store.remove(G, game(1).messageId), false);
    assert.deepEqual(fs.readdirSync(dir), [], 'nothing to remove never creates the file');
    store.add(G, game(1));
    store.add(G, game(2));
    store.add(OTHER, game(3));
    assert.equal(store.remove(G, game(1).messageId), true);
    assert.deepEqual(store.list(G), [game(2)]);
    assert.deepEqual(store.list(OTHER), [game(3)]);
    assert.equal(store.remove(G, game(1).messageId), false);
    assert.equal(store.remove(OTHER, game(2).messageId), false);
    assert.equal(store.remove(G, 'not-a-snowflake'), false);
    assert.deepEqual(fs.readdirSync(dir), ['scrim-games.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scrim hapus previews only the requester\'s own last game, then one confirm removes it and pulls the card', async () => {
  const mine = game(1, { at: NOW - 3_600_000, outcome: 'kalah', reason: 'teamfight', lineup: [U, T2] });
  const r = rigService({ games: [game(0, { at: NOW - 7_200_000 }), mine, game(2, { at: NOW - 600_000, submitterId: T2 })] });
  const ask = r.interaction();
  await r.service.remove(ask, deps);
  const preview = ask.edits.at(-1);
  assert.match(preview.content, /Hapus game terakhir yang kamu catat\?/);
  assert.match(preview.content, /MLBB vs Tim Contoh: L \(teamfight\), 21 Okt 11:00 WIB\nLineup: <@323456789012345678> <@523456789012345678>/);
  assert.deepEqual(preview.allowedMentions, { parse: [] });
  const [remove, keep] = preview.components[0].toJSON().components.map(component => component.custom_id);
  assert.match(remove, /^hengs-scrim:[a-f0-9]{24}:delete$/);
  assert.match(keep, /^hengs-scrim:[a-f0-9]{24}:keep$/);
  assert.equal(r.removals.length + r.cardDeletes.length, 0);
  const confirm = r.interaction({ customId: remove, isButton: () => true });
  assert.equal(await r.service.handleComponent(confirm), true);
  assert.deepEqual(r.removals, [[G, mine.messageId]]);
  assert.deepEqual(r.cardDeletes, [mine.messageId]);
  assert.match(confirm.edits.at(-1).content, /Beres, game itu udah dihapus dari rekap dan kartunya di hasil-scrim ikut ditarik/);
  const again = r.interaction({ customId: remove, isButton: () => true });
  await r.service.handleComponent(again);
  assert.equal(r.removals.length, 1);
  assert.match(again.replies.at(-1).content, /Jalanin \/scrim hapus lagi/);
});

test('scrim hapus keeps on Batal, says when nothing is left and reports a card it could not pull', async () => {
  const removeId = payload => payload.components[0].toJSON().components[0].custom_id;
  async function asked(r) { const i = r.interaction(); await r.service.remove(i, deps); return i.edits.at(-1); }
  let r = rigService({ games: [game(1, { submitterId: T2 })] });
  let preview = await asked(r);
  assert.match(preview.content, /Belum ada game yang kamu catat/);
  assert.deepEqual(preview.components, []);

  r = rigService({ games: [game(1)] });
  preview = await asked(r);
  const kept = r.interaction({ customId: preview.components[0].toJSON().components[1].custom_id, isButton: () => true });
  await r.service.handleComponent(kept);
  assert.equal(r.removals.length, 0);
  assert.match(kept.edits.at(-1).content, /nggak jadi dihapus/);

  r = rigService({ games: [game(1)] });
  preview = await asked(r);
  r.channel.messages.delete = async () => { throw Object.assign(new Error('private-network'), { code: 50013 }); };
  let click = r.interaction({ customId: removeId(preview), isButton: () => true });
  await r.service.handleComponent(click);
  assert.equal(r.removals.length, 1);
  assert.match(click.edits.at(-1).content, /kartunya di hasil-scrim belum bisa ditarik/);
  assert.doesNotMatch(JSON.stringify(click.edits), /private-/);

  r = rigService({ games: [game(1)] });
  preview = await asked(r);
  r.channel.messages.delete = async () => { throw Object.assign(new Error('gone'), { code: 10008 }); };
  click = r.interaction({ customId: removeId(preview), isButton: () => true });
  await r.service.handleComponent(click);
  assert.match(click.edits.at(-1).content, /Beres, game itu udah dihapus dari rekap/);

  r = rigService({ games: [game(1)] });
  preview = await asked(r);
  r.saved.length = 0; // an admin deleted the card in the meantime
  click = r.interaction({ customId: removeId(preview), isButton: () => true });
  await r.service.handleComponent(click);
  assert.equal(r.cardDeletes.length, 0);
  assert.match(click.edits.at(-1).content, /udah nggak ada di rekap/);

  r = rigService({ games: [game(1)] });
  preview = await asked(r);
  r.guild.members.fetch = async () => ({ id: U, roles: { cache: new Collection() } });
  click = r.interaction({ customId: removeId(preview), isButton: () => true });
  await r.service.handleComponent(click);
  assert.equal(r.removals.length, 0);
  assert.match(click.edits.at(-1).content, /khusus anggota role Hengs Family/);
});

test('deleting one Hengs card in hasil-scrim drops its game; other channels and unknown messages change nothing', () => {
  const r = rigService({ games: [game(1), game(2)] });
  const scrimChannel = { name: CHANNEL_NAME };
  assert.equal(r.service.forget({ guildId: G, id: game(1).messageId, channel: scrimChannel }), true);
  assert.deepEqual(r.removals, [[G, game(1).messageId]]);
  assert.equal(r.service.forget({ guildId: G, id: game(2).messageId, channel: { name: 'general' } }), false);
  assert.equal(r.service.forget({ guildId: G, id: '999999999999999999', channel: scrimChannel }), false);
  assert.equal(r.service.forget({ id: game(2).messageId, channel: scrimChannel }), false);
  assert.equal(r.removals.length, 1);
});

test('/scrim hapus is registered without options and routed to the service', async () => {
  const hapus = scrimCommand.data.toJSON().options.find(option => option.name === 'hapus');
  assert.deepEqual(hapus.options ?? [], []);
  const calls = [];
  await scrimCommand.execute({ options: { getSubcommand: () => 'hapus' } },
    { scrimResults: { remove: async () => calls.push('remove') }, guildAccess: deps.guildAccess });
  assert.deepEqual(calls, ['remove']);
});

test('coach messages and result choices stay kid-safe and free of long dashes', () => {
  const unsafe = /anjay|anjir|bjir|goblok|bego|tolol|beban|noob|feeder|cupu|ampas/i;
  const longDash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
  for (const text of [...Object.values(MESSAGES), ...RESULT_CHOICES.map(choice => choice.name)]) {
    assert.doesNotMatch(text, unsafe);
    assert.doesNotMatch(text, longDash);
  }
  assert.deepEqual(RESULT_CHOICES.map(choice => choice.name.split(/[ :]/)[0]), ['W', 'L', 'L', 'L', 'L', 'L']);
});

test('opponent and note cuts never leave half an emoji behind', () => {
  const parsed = readSubmission(options({ lawan: `${'A'.repeat(59)}${EMOJI}`, catatan: `${'b'.repeat(299)}${EMOJI}` }));
  assert.equal(parsed.opponent, 'A'.repeat(59));
  assert.equal(parsed.note, 'b'.repeat(299));
  assert.equal(loneSurrogate(parsed.opponent + parsed.note), false);
});

test('a second Kirim while the first is still posting says busy, not that nothing was sent', async () => {
  const r = rigService();
  const preview = await previewed(r);
  let release;
  const posting = new Promise(resolve => { release = resolve; });
  const send = r.channel.send.bind(r.channel);
  r.channel.send = async payload => { await posting; return send(payload); };
  const first = r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  const second = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleComponent(second);
  assert.match(second.replies.at(-1).content, /masih diproses, sabar bentar/);
  release();
  await first;
  assert.equal(r.sends.length, 1);
  assert.equal(r.records.length, 1);
});

test('a team member previews one game with the last team lineup prefilled, then one Kirim posts and records it', async () => {
  const r = rigService({ games: [game(1, { at: NOW - 3_600_000, opponent: 'tim contoh', lineup: [U, OUT, T2] })] });
  const preview = await previewed(r);
  assert.match(preview.content, /MLBB vs Tim Contoh: W\*\*\nSkor hari ini vs mereka: 2-0\nLineup: <@323456789012345678> <@523456789012345678>\n/);
  assert.match(preview.content, /belum kekirim apa-apa/);
  assert.deepEqual(preview.allowedMentions, { parse: [] });
  assert.equal(preview.embeds[0].image.url, IMG);
  const select = selectOf(preview);
  assert.match(select.custom_id, /^hengs-scrim:[a-f0-9]{24}:lineup$/);
  assert.deepEqual([select.type, select.min_values, select.max_values], [ComponentType.UserSelect, 0, 5]);
  assert.deepEqual(select.default_values, [{ id: U, type: 'user' }, { id: T2, type: 'user' }]);
  assert.match(buttonId(preview, 0), /^hengs-scrim:[a-f0-9]{24}:send$/);
  assert.equal(r.sends.length, 0);
  const click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  assert.equal(await r.service.handleComponent(click), true);
  assert.equal(r.sends.length, 1);
  assert.match(r.sends[0].content, /Skor hari ini vs mereka: 2-0\nLineup: <@323456789012345678> <@523456789012345678>\nDicatat sama <@323456789012345678>/);
  assert.deepEqual(r.sends[0].allowedMentions, { parse: [] });
  assert.equal(r.sends[0].enforceNonce, true);
  assert.equal(r.sends[0].files[0].name, 'hasil-scrim.png');
  assert.deepEqual(r.downloads.map(([url, init]) => [url, init.redirect]), [[IMG, 'error']]);
  assert.deepEqual(r.records, [[G, { messageId: '900000000000000001', at: NOW, submitterId: U, opponent: 'Tim Contoh',
    outcome: 'menang', reason: null, lineup: [U, T2], note: '' }]]);
  assert.match(click.edits.at(-1).content, /kecatat buat rekap/);
  const again = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleComponent(again);
  assert.equal(r.sends.length, 1);
  assert.match(again.replies.at(-1).content, /udah basi/);
});

test('the lineup select keeps only Hengs Family members and mismatched components are refused', async () => {
  const r = rigService();
  const preview = await previewed(r);
  assert.equal(selectOf(preview).default_values, undefined);
  assert.match(preview.content, /Lineup: belum dipilih/);
  const pick = r.interaction({ customId: selectOf(preview).custom_id, isUserSelectMenu: () => true, values: [T2, OUT, U],
    members: new Collection([[T2, r.memberOf(T2)], [OUT, r.memberOf(OUT)], [U, { roles: [r.role.id] }]]) });
  assert.equal(await r.service.handleComponent(pick), true);
  const updated = pick.updates.at(-1);
  assert.match(updated.content, /Lineup: <@523456789012345678> <@323456789012345678>\n/);
  assert.match(updated.content, /1 pilihan di-skip karena bukan Hengs Family/);
  assert.deepEqual(selectOf(updated).default_values.map(value => value.id), [T2, U]);
  const buttonAsLineup = r.interaction({ customId: buttonId(preview, 0).replace(':send', ':lineup'), isButton: () => true });
  await r.service.handleComponent(buttonAsLineup);
  assert.match(buttonAsLineup.replies.at(-1).content, /udah basi/);
  const selectAsSend = r.interaction({ customId: buttonId(preview, 0), isUserSelectMenu: () => true, values: [], members: new Collection() });
  await r.service.handleComponent(selectAsSend);
  assert.match(selectAsSend.replies.at(-1).content, /udah basi/);
  assert.equal(r.sends.length, 0);
  await r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  assert.deepEqual(r.records[0][1].lineup, [T2, U]);
});

test('a loss without a screenshot posts its reason as text only, with no download', async () => {
  const r = rigService();
  const i = r.interaction({ options: options({ hasil: 'kalah-objective', ss: null, catatan: 'telat rotasi ke lord' }) });
  await r.service.preview(i, deps);
  const preview = i.edits.at(-1);
  assert.deepEqual(preview.embeds, []);
  assert.match(preview.content, /MLBB vs Tim Contoh: L \(objective\)\*\*\nSkor hari ini vs mereka: 0-1\n/);
  await r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  assert.deepEqual(r.sends[0].files, []);
  assert.match(r.sends[0].content, /Catatan: telat rotasi ke lord/);
  assert.equal(r.downloads.length, 0);
  assert.deepEqual(r.records[0][1], { messageId: '900000000000000001', at: NOW, submitterId: U, opponent: 'Tim Contoh',
    outcome: 'kalah', reason: 'objective', lineup: [], note: 'telat rotasi ke lord' });
});

test('non-team members, missing setup, other guilds and bad images never reach the channel', async () => {
  for (const [setup, message] of [[{ teamMember: false }, /khusus anggota role Hengs Family/],
    [{ roleExists: false }, /Role Hengs Family belum ada/], [{ channelExists: false }, /Channel hasil-scrim belum ada/],
    [{ botAllowed: false }, /Hengs butuh izin/], [{ everyoneCanView: true }, /masih bisa dilihat semua member/]]) {
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
  await r.service.handleComponent(click);
  assert.equal(r.sends.length, 0);
  assert.match(click.edits.at(-1).content, /dibatalin/);

  r = rigService();
  preview = await previewed(r);
  r.guild.members.fetch = async () => ({ id: U, roles: { cache: new Collection() } });
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleComponent(click);
  assert.equal(r.sends.length, 0);
  assert.match(click.edits.at(-1).content, /khusus anggota/);

  r = rigService({ store: { list: () => [], add() { throw new Error('private-disk'); } } });
  preview = await previewed(r);
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleComponent(click);
  assert.equal(r.sends.length, 1);
  assert.match(click.edits.at(-1).content, /belum kesimpan buat rekap/);

  r = rigService({ store: { list() { throw new Error('SCRIM_STATE_INVALID'); }, add() {} } });
  preview = await previewed(r);
  assert.equal(preview.components.length, 0);
  assert.match(preview.content, /belum bisa dibuat/);

  r = rigService();
  preview = await previewed(r);
  let attempts = 0;
  r.channel.send = async () => { attempts += 1; throw new Error('private-network'); };
  click = r.interaction({ customId: buttonId(preview, 0), isButton: () => true });
  await r.service.handleComponent(click);
  await r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  assert.equal(attempts, 1);
  assert.match(click.edits.at(-1).content, /belum bisa dipastiin/);
  assert.doesNotMatch(JSON.stringify(click.edits), /private-/);
});

test('/scrim hasil logs one game: lawan with autocomplete and one hasil dropdown first, screenshot optional', () => {
  const json = scrimCommand.data.toJSON();
  const hasil = json.options.find(option => option.name === 'hasil');
  assert.deepEqual(hasil.options.map(option => [option.name, Boolean(option.required)]),
    [['lawan', true], ['hasil', true], ['ss', false], ['catatan', false]]);
  assert.equal(hasil.options[0].autocomplete, true);
  assert.deepEqual(hasil.options[1].choices.map(({ name, value }) => ({ name, value })), RESULT_CHOICES.map(choice => ({ ...choice })));
  assert.ok(hasil.options[1].choices.every(choice => choice.name.length <= 100));
  const plan = buildCommandPlan([{ name: 'hengs' }, { name: 'setup' }, json]);
  assert.deepEqual(plan.home.map(command => command.name), ['scrim']);
});

test('a game logged through the service lands in the real store and shows up in rekap and statku', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrim-flow-'));
  try {
    const store = createScrimStore({ filePath: path.join(dir, 'scrim-games.json') });
    const r = rigService({ store });
    const i = r.interaction({ options: options({ hasil: 'kalah-teamfight', catatan: 'war di lord telat' }) });
    await r.service.preview(i, deps);
    const preview = i.edits.at(-1);
    await r.service.handleComponent(r.interaction({ customId: selectOf(preview).custom_id, isUserSelectMenu: () => true,
      values: [U, T2], members: new Collection([[U, r.memberOf(U)], [T2, r.memberOf(T2)]]) }));
    await r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
    assert.deepEqual(store.list(G).map(row => [row.outcome, row.reason, row.lineup, row.note]),
      [['kalah', 'teamfight', [U, T2], 'war di lord telat']]);
    const recap = r.interaction({ options: options({ lawan: null }) });
    await r.service.recap(recap, deps);
    assert.match(recap.edits.at(-1).content, /Semua: W 0 dari 1 game, datanya masih dikit, belum bisa dinilai/);
    assert.match(recap.edits.at(-1).content, /war di lord telat/);
    await r.service.stats(r.interaction(), deps);
    assert.match(r.dms.at(-1).content, /Kalah \(1\): teamfight 1\./);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rekap answers a team member privately with honest numbers, filtered by a sanitized lawan', async () => {
  const games = [game(1, { at: NOW - 3_600_000 }),
    game(2, { at: NOW - 7_200_000, outcome: 'kalah', reason: 'draft', opponent: 'Lawan Lain', note: 'ban Fanny' })];
  const r = rigService({ games });
  const all = r.interaction({ options: options({ lawan: null }) });
  await r.service.recap(all, deps);
  assert.equal(all.deferred, true);
  assert.match(all.edits.at(-1).content, /^📒 \*\*Rekap scrim Hengs Family \(MLBB\)\*\*\nSemua: W 1 dari 2 game, datanya masih dikit, belum bisa dinilai/);
  assert.deepEqual(all.edits.at(-1).allowedMentions, { parse: [] });
  const one = r.interaction({ options: options({ lawan: `LAWAN${String.fromCharCode(0x202e)} lain` }) });
  await r.service.recap(one, deps);
  assert.match(one.edits.at(-1).content, /^📒 \*\*Rekap scrim vs Lawan Lain\*\*/);
  assert.match(one.edits.at(-1).content, /ban Fanny/);
  assert.doesNotMatch(one.edits.at(-1).content, /Per lawan/);
  const outsider = rigService({ teamMember: false, games });
  const denied = outsider.interaction({ options: options({ lawan: null }) });
  await outsider.service.recap(denied, deps);
  assert.match(denied.edits.at(-1).content, /khusus anggota role Hengs Family/);
  assert.doesNotMatch(denied.edits.at(-1).content, /dari \d+ game/);
  const elsewhere = r.interaction();
  await r.service.recap(elsewhere, { guildAccess: { classify: () => ({ kind: 'public' }) } });
  assert.match(elsewhere.replies.at(-1).content, /server utama/);
});

test('statku sends only the requester\'s own numbers by DM and never shows them in the server', async () => {
  const games = [game(1, { lineup: [U, T2] }), game(2, { outcome: 'kalah', reason: 'teamfight', lineup: [T2] })];
  const r = rigService({ games });
  const i = r.interaction();
  await r.service.stats(i, deps);
  assert.equal(r.dms.length, 1);
  assert.match(r.dms[0].content, /^📒 \*\*Stat scrim kamu/);
  assert.match(r.dms[0].content, /Semua: W 1 dari 1 game, datanya masih dikit, belum bisa dinilai/);
  assert.doesNotMatch(r.dms[0].content, /teamfight/);
  assert.deepEqual(r.dms[0].allowedMentions, { parse: [] });
  assert.match(i.edits.at(-1).content, /udah dikirim lewat DM/);
  assert.doesNotMatch(i.edits.at(-1).content, /dari \d+ game/);
  const closed = r.interaction({ user: { id: U, bot: false, async send() { throw new Error('Cannot send messages to this user'); } } });
  await r.service.stats(closed, deps);
  assert.match(closed.edits.at(-1).content, /belum bisa DM kamu/);
  assert.doesNotMatch(closed.edits.at(-1).content, /dari \d+ game|Cannot/);
  const outsider = rigService({ teamMember: false, games });
  const denied = outsider.interaction();
  await outsider.service.stats(denied, deps);
  assert.equal(outsider.dms.length, 0);
  assert.match(denied.edits.at(-1).content, /khusus anggota role Hengs Family/);
});

test('lawan autocomplete suggests distinct opponents, newest first, to team members only', async () => {
  const games = [game(1, { opponent: 'Tim Garuda' }), game(2, { opponent: 'Rajawali' }), game(3, { opponent: 'TIM GARUDA' }),
    game(4, { opponent: 'Elang' })];
  const r = rigService({ games });
  // Discord gives autocomplete 3 seconds; the cached role is enough, no REST call per keystroke.
  r.guild.roles.fetch = async () => { throw new Error('REST is not needed here'); };
  const typed = r.interaction({ options: options({ lawan: 'GA' }) });
  await r.service.autocomplete(typed);
  assert.deepEqual(typed.responses.at(-1), [{ name: 'TIM GARUDA', value: 'TIM GARUDA' }]);
  const empty = r.interaction({ options: options({ lawan: '' }) });
  await r.service.autocomplete(empty);
  assert.deepEqual(empty.responses.at(-1).map(choice => choice.value), ['Elang', 'TIM GARUDA', 'Rajawali']);
  const outsider = r.interaction({ member: { roles: [] } });
  await r.service.autocomplete(outsider);
  assert.deepEqual(outsider.responses.at(-1), []);
});

test('/scrim rekap and /scrim statku are registered and routed, and autocomplete reaches the service', async () => {
  const json = scrimCommand.data.toJSON();
  const rekap = json.options.find(option => option.name === 'rekap');
  assert.deepEqual(rekap.options.map(option => [option.name, Boolean(option.required), option.autocomplete]), [['lawan', false, true]]);
  assert.deepEqual(json.options.find(option => option.name === 'statku').options ?? [], []);
  const calls = [];
  const scrimResults = { recap: async () => calls.push('recap'), stats: async () => calls.push('stats'),
    autocomplete: async () => calls.push('autocomplete') };
  for (const sub of ['rekap', 'statku']) {
    await scrimCommand.execute({ options: { getSubcommand: () => sub } }, { scrimResults, guildAccess: deps.guildAccess });
  }
  await scrimCommand.autocomplete({}, { scrimResults });
  assert.deepEqual(calls, ['recap', 'stats', 'autocomplete']);
});

test('help and privacy describe the per-game notebook, the private recap and DM-only player stats', async () => {
  const help = buildCommunityHelp({ home: true, guild: { channels: { cache: new Map() } } });
  assert.match(help, /`\/scrim hasil` tiap game/);
  assert.match(help, /`\/scrim rekap` buat rekap tim/);
  assert.match(help, /`\/scrim statku` kirim statistikmu lewat DM/);
  assert.match(help, /Salah catat\? `\/scrim hapus`/);
  assert.match(help, /Ngobrol sama coach: mention Hengs di hasil-scrim, atau `\/scrim tanya` \(privat\)\. Target tim: `\/scrim target`/);
  const privacy = { guildId: G, channelId: SRC, user: { id: U }, inGuild: () => true,
    options: { getSubcommand: () => 'privacy', getString: () => null }, async reply(payload) { this.payload = payload; } };
  await hengsCommand.execute(privacy, deps);
  assert.match(privacy.payload.content, /lineup \(ID Discord anggota Hengs Family\)/);
  assert.match(privacy.payload.content, /cuma dikirim ke pemain itu lewat DM/);
  assert.match(privacy.payload.content, /Pencatat bisa menghapus game terakhirnya lewat \/scrim hapus/);
  assert.match(privacy.payload.content, /pertanyaan ke coach dikirim ke penyedia AI bersama rekap scrim tim/);
  assert.match(privacy.payload.content, /untuk \/scrim tanya juga stat penanya sendiri/);
  assert.match(privacy.payload.content, /target tim \(\/scrim target, disimpan sampai diganti\)/);
  assert.doesNotMatch(privacy.payload.content, /skor, hasil, game/);
  assert.ok(privacy.payload.content.length <= 2000);
});

test('runtime routes scrim buttons and the lineup select to the service and hands autocomplete the service', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(source.includes("(interaction.isButton() || interaction.isUserSelectMenu()) && String(interaction.customId || '').startsWith('hengs-scrim:')"));
  assert.ok(source.includes('await scrimResults.handleComponent(interaction);'));
  assert.ok(source.includes('await cmd.autocomplete(interaction, { scrimResults });'));
  assert.doesNotMatch(source, /scrimResults\.handleButton/);
  // One deleted card drops its game; a bulk purge never wipes the notebook.
  assert.match(source, /client\.on\(Events\.MessageDelete, [\s\S]{0,200}scrimResults\.forget\(message\)/);
  assert.doesNotMatch(source, /MessageBulkDelete[\s\S]{0,300}scrimResults/);
});

test('the team role is found with or without an emoji prefix, and two candidates still conflict', async () => {
  const guildWith = (...names) => ({ roles: { fetch: async () => new Collection(names.map((name, index) => [
    `73000000000000000${index}`, { id: `73000000000000000${index}`, name }])) } });
  assert.equal((await findTeamRole(guildWith('\u{1FAC2} Hengs Family', 'Member'))).name, '\u{1FAC2} Hengs Family');
  assert.equal((await findTeamRole(guildWith('Hengs Family'))).name, 'Hengs Family');
  assert.equal(await findTeamRole(guildWith('Hengs Family Fans', 'Member')), null);
  await assert.rejects(findTeamRole(guildWith('Hengs Family', '\u{1FAC2} Hengs Family')), /SCRIM_ROLE_CONFLICT/);
});

// Stands in for agent.chat: a real model answer goes through context.guard; fixed replies (cooldown, outage) do not.
function coachAgent(reply = 'Gas, satu fokus dulu: early game.', { answered = true } = {}) {
  const calls = [];
  return { calls, buildConversationKey: (guildId, userId) => `${guildId}:${userId}`,
    async chat(text, key, context) {
      calls.push({ text, key, context });
      return answered ? context.guard(reply) : 'Sabar bentar ya 😅 jangan spam, coba lagi beberapa detik lagi.';
    } };
}

test('a team member mentioning Hengs in hasil-scrim gets the coach, which reads the team notebook', async () => {
  const agent = coachAgent('Gas, satu fokus dulu: early game. [[BANTUAN]]');
  const games = [game(1, { at: NOW - 3_600_000, lineup: [U, T2] }),
    game(2, { at: NOW - 7_200_000, outcome: 'kalah', reason: 'early', lineup: [T2], note: `gank awal, ${T2} telat` })];
  const r = rigService({ games, agent });
  const msg = r.message();
  assert.equal(await r.service.coach(msg, 'kita kalah mulu, latihan apa?'), true);
  assert.equal(agent.calls.length, 1);
  const { text, key, context } = agent.calls[0];
  assert.equal(text, 'kita kalah mulu, latihan apa?');
  assert.equal(key, `${G}:${U}`);
  assert.deepEqual([context.kind, context.visibility, Boolean(context.stateless)], ['home', 'coach', false]);
  assert.ok(context.system.startsWith(`${COACH_RULES}\nCONTOH JAWABAN`));
  assert.equal(context.temperature, 0.3);
  assert.match(context.data, /Semua: W 1 dari 2 game/);
  assert.match(context.data, /gank awal, \(anggota\) telat/);
  assert.doesNotMatch(context.data, /STAT KAMU/);
  assert.doesNotMatch(`${context.system}${context.data}`, /\d{17,20}/);
  assert.equal(msg.replies.length, 1);
  assert.match(msg.replies[0].content, /^Gas, satu fokus dulu: early game\.\n\nKamu nggak sendirian/);
  assert.deepEqual(msg.replies[0].allowedMentions, { parse: [] });
});

test('the coach answers only in the real hasil-scrim or its threads, for team members, and never where everyone can read', async () => {
  const agent = coachAgent();
  const r = rigService({ agent });
  assert.equal(await r.service.coach(r.message({ channel: { ...r.channel, name: 'general' } }), 'halo'), false);
  assert.equal(await r.service.coach(r.message({ author: { id: U, bot: true } }), 'halo'), false);
  const thread = { id: '700000000000000009', name: 'review early', parentId: r.channel.id, parent: r.channel };
  assert.equal(await r.service.coach(r.message({ channel: thread, channelId: thread.id }), 'review dong'), true);
  assert.equal(agent.calls.length, 1);
  // A thread named hasil-scrim somewhere else is not the team channel, whatever its parent's permissions say.
  const fake = { id: '700000000000000010', name: 'hasil-scrim', parentId: '700000000000000099', parent: { name: 'mods' } };
  assert.equal(await r.service.coach(r.message({ channel: fake, channelId: fake.id }), 'halo'), false);
  const outsider = rigService({ agent, teamMember: false });
  assert.equal(await outsider.service.coach(outsider.message(), 'halo'), false);
  const noRole = rigService({ agent, roleExists: false });
  assert.equal(await noRole.service.coach(noRole.message(), 'halo'), false);
  const open = rigService({ agent, everyoneCanView: true });
  const msg = open.message();
  assert.equal(await open.service.coach(msg, 'halo'), true);
  assert.equal(msg.replies[0].content, MESSAGES.SCRIM_CHANNEL_PUBLIC);
  // Unknown permissions count as public.
  const unknown = rigService({ agent });
  unknown.channel.permissionsFor = target => (target?.id === G ? null : { has: () => true });
  const unsure = unknown.message();
  assert.equal(await unknown.service.coach(unsure, 'halo'), true);
  assert.equal(unsure.replies[0].content, MESSAGES.SCRIM_CHANNEL_PUBLIC);
  assert.equal(agent.calls.length, 1);
  const unwired = rigService();
  assert.equal(await unwired.service.coach(unwired.message(), 'halo'), false);
});

test('a Discord error during the team check answers with an error instead of falling back to shared chat', async () => {
  const agent = coachAgent();
  const r = rigService({ agent });
  r.guild.roles.fetch = async () => { throw new Error('Discord 500'); };
  const msg = r.message();
  assert.equal(await r.service.coach(msg, 'halo'), true);
  assert.match(msg.replies[0].content, /Coach lagi error/);
  assert.equal(agent.calls.length, 0);
});

test('/scrim tanya answers privately, once, with the asker\'s own stats on top of the team recap', async () => {
  const agent = coachAgent('Fokus satu hal dulu ya.');
  const games = [game(1, { lineup: [U] }), game(2, { outcome: 'kalah', reason: 'teamfight', lineup: [T2] })];
  const r = rigService({ games, agent });
  const i = r.interaction({ options: options({ pertanyaan: `aku vs <@${T2}> siapa lebih jago?` }) });
  await r.service.ask(i, deps);
  assert.equal(i.deferred, true);
  const { text, context } = agent.calls[0];
  assert.equal(text, 'aku vs (anggota) siapa lebih jago?');
  assert.deepEqual([context.visibility, context.stateless], ['coach', true]);
  assert.match(context.data, /STAT KAMU \(cuma buat penanya\):\n📒 \*\*Stat scrim kamu, Hengs Family \(MLBB\)\*\*\nSemua: W 1 dari 1 game/);
  assert.match(context.data, /Semua: W 1 dari 2 game/);
  assert.doesNotMatch(`${text}${context.data}`, /\d{17,20}/);
  assert.equal(i.edits.at(-1).content, 'Fokus satu hal dulu ya.');
  assert.deepEqual(i.edits.at(-1).allowedMentions, { parse: [] });
  const outsider = rigService({ games, agent, teamMember: false });
  const denied = outsider.interaction({ options: options({ pertanyaan: 'halo' }) });
  await outsider.service.ask(denied, deps);
  assert.match(denied.edits.at(-1).content, /khusus anggota role Hengs Family/);
  const elsewhere = r.interaction({ options: options({ pertanyaan: 'halo' }) });
  await r.service.ask(elsewhere, { guildAccess: { classify: () => ({ kind: 'public' }) } });
  assert.match(elsewhere.replies.at(-1).content, /server utama/);
  assert.equal(agent.calls.length, 1);
});

test('coach replies have swearing and blame labels masked before the team sees them', async () => {
  const r = rigService({ agent: coachAgent('Jangan main kayak noob ya') });
  const msg = r.message();
  await r.service.coach(msg, 'gimana?');
  assert.equal(msg.replies[0].content, 'Jangan main kayak n*** ya');
});

test('the coach allows 15 answered questions per person per day across mentions and /scrim tanya', async () => {
  const agent = coachAgent();
  const r = rigService({ agent });
  for (let n = 0; n < 15; n++) assert.equal(await r.service.coach(r.message(), `tanya ${n}`), true);
  const msg = r.message();
  await r.service.coach(msg, 'satu lagi');
  assert.equal(msg.replies[0].content, MESSAGES.COACH_QUOTA);
  const i = r.interaction({ options: options({ pertanyaan: 'boleh nanya?' }) });
  await r.service.ask(i, deps);
  assert.equal(i.edits.at(-1).content, MESSAGES.COACH_QUOTA);
  assert.equal(agent.calls.length, 15);
  // Cooldown or outage replies are not answers, so they cost nothing.
  const idle = coachAgent('x', { answered: false });
  const s = rigService({ agent: idle });
  for (let n = 0; n < 16; n++) await s.service.coach(s.message(), `spam ${n}`);
  assert.equal(idle.calls.length, 16);
});

test('/scrim tanya is registered with one required question and routed to the service', async () => {
  const json = scrimCommand.data.toJSON();
  const tanya = json.options.find(option => option.name === 'tanya');
  assert.deepEqual(tanya.options.map(option => [option.name, Boolean(option.required), option.max_length]), [['pertanyaan', true, 500]]);
  const calls = [];
  await scrimCommand.execute({ options: { getSubcommand: () => 'tanya' } },
    { scrimResults: { ask: async () => calls.push('ask') }, guildAccess: deps.guildAccess });
  assert.deepEqual(calls, ['ask']);
  assert.deepEqual(buildCommandPlan([{ name: 'hengs' }, { name: 'setup' }, json]).home.map(command => command.name), ['scrim']);
});

// In-memory stand-in for src/scrim/coach-store.js.
function coachMemory(initial = {}) {
  const state = { target: null, debriefDay: null, ...initial };
  return { state, get: () => ({ ...state }), setTarget: (guildId, target) => { state.target = target; },
    markDebrief: (guildId, day) => { state.debriefDay = day; } };
}

test('/scrim target sets the team target, announces it in hasil-scrim and shows it back', async () => {
  const memory = coachMemory();
  const r = rigService({ coachStore: memory, games: [game(1, { at: NOW - 3_600_000 })] });
  const set = r.interaction({ options: options({ isi: 'semua kumpul sebelum objective, jangan noob' }) });
  await r.service.target(set, deps);
  assert.deepEqual(memory.state.target, { text: 'semua kumpul sebelum objective, jangan n***', setBy: U, at: NOW });
  // Member text is markdown-escaped on display, so the masked word shows as n*** in Discord.
  assert.ok(r.sends.at(-1).content.startsWith(
    '🎯 **Target tim baru**: "semua kumpul sebelum objective, jangan n\\*\\*\\*"\nDipasang sama <@323456789012345678>'));
  assert.deepEqual(r.sends.at(-1).allowedMentions, { parse: [] });
  assert.match(set.edits.at(-1).content, /Target tim kepasang/);
  const show = r.interaction({ options: options({ isi: null }) });
  await r.service.target(show, deps);
  assert.ok(show.edits.at(-1).content.startsWith('🎯 Target tim: "semua kumpul sebelum objective, jangan n\\*\\*\\*" '
    + '(dipasang 21 Okt sama <@323456789012345678>, 0 game kecatat sejak itu)'));
  const old = rigService({ coachStore: coachMemory({ target: { text: 'call info', setBy: U, at: NOW - 15 * 86_400_000 } }) });
  const stale = old.interaction({ options: options({ isi: null }) });
  await old.service.target(stale, deps);
  assert.match(stale.edits.at(-1).content, /udah lewat 2 minggu/i);
  const outsider = rigService({ coachStore: coachMemory(), teamMember: false });
  const denied = outsider.interaction({ options: options({ isi: 'apa aja' }) });
  await outsider.service.target(denied, deps);
  assert.match(denied.edits.at(-1).content, /khusus anggota role Hengs Family/);
  const empty = rigService({ coachStore: coachMemory() });
  const none = empty.interaction({ options: options({ isi: null }) });
  await empty.service.target(none, deps);
  assert.match(none.edits.at(-1).content, /Belum ada target tim/);
});

test('the third game logged on one WIB day brings one debrief nudge in hasil-scrim, never late at night', async () => {
  const today = [game(1, { at: NOW - 3_600_000 }), game(2, { at: NOW - 7_200_000, outcome: 'kalah', reason: 'early' })];
  const memory = coachMemory({ target: { text: 'call info pendek', setBy: U, at: NOW - 86_400_000 } });
  const r = rigService({ games: today, coachStore: memory });
  const preview = await previewed(r);
  await r.service.handleComponent(r.interaction({ customId: buttonId(preview, 0), isButton: () => true }));
  assert.equal(r.sends.length, 2);
  assert.match(r.sends[1].content, /^🧠 \*\*Debrief bentar yuk\*\* \(hari ini W 2 dari 3 game\)/);
  assert.match(r.sends[1].content, /Target sekarang: "call info pendek"/);
  assert.deepEqual(r.sends[1].allowedMentions, { parse: [] });
  assert.equal(memory.state.debriefDay, Math.floor((NOW + 7 * 3_600_000) / 86_400_000));
  const again = await previewed(r);
  await r.service.handleComponent(r.interaction({ customId: buttonId(again, 0), isButton: () => true }));
  assert.equal(r.sends.length, 3);
  const late = Date.UTC(2026, 9, 21, 15, 30); // 22:30 WIB
  const night = rigService({ games: [game(1, { at: late - 3_600_000 }), game(2, { at: late - 7_200_000 })],
    coachStore: coachMemory(), clock: () => late });
  const nightPreview = await previewed(night);
  await night.service.handleComponent(night.interaction({ customId: buttonId(nightPreview, 0), isButton: () => true }));
  assert.equal(night.sends.length, 1);
});

test('the coach reads the team target into its data card', async () => {
  const agent = coachAgent();
  const r = rigService({ agent, coachStore: coachMemory({ target: { text: 'call info pendek', setBy: U, at: NOW - 3_600_000 } }) });
  await r.service.coach(r.message(), 'target kita jalan nggak?');
  assert.match(agent.calls[0].context.data, /TARGET TIM: "call info pendek"/);
});

test('a meta question brings the pro draft card into the coach data and the Liquipedia credit under the reply', async () => {
  const draft = { winner: 1, picks: [['Fanny', 'Lolita', 'Valentina', 'Claude', 'Chou'], ['Ling', 'Tigreal', 'Pharsa', 'Beatrix', 'Paquito']],
    bans: [['Joy'], ['Lancelot']] };
  const proPages = () => ({ 'MPL/Indonesia/Season 18/Playoffs': { revid: 1, matches: [{ games: [draft] }] } });
  const agent = coachAgent('Fanny lagi sering dipick di pro, tapi cek dulu cocok nggak buat tim kita.');
  const r = rigService({ agent, proPages });
  const msg = r.message();
  await r.service.coach(msg, 'hero meta pro sekarang apa?');
  assert.match(agent.calls[0].context.data, /META PRO \(data draft Liquipedia: MPL ID S18 Playoffs; 1 game dengan draft lengkap\)/);
  assert.ok(msg.replies[0].content.endsWith('\n-# Data: Liquipedia (CC-BY-SA 3.0). Pola draft pro belum tentu cocok buat tim sendiri.'));
  const plain = r.message();
  await r.service.coach(plain, 'kita kalah mulu, latihan apa?');
  assert.doesNotMatch(agent.calls[1].context.data, /META PRO/);
  assert.doesNotMatch(plain.replies[0].content, /Liquipedia/);
  const broken = rigService({ agent: coachAgent(), proPages: () => { throw new Error('ESPORTS_READ_FAILED'); } });
  const still = broken.message();
  assert.equal(await broken.service.coach(still, 'meta apa?'), true);
  assert.doesNotMatch(still.replies[0].content, /Liquipedia/);
});

test('a question naming a hero brings the Liquipedia hero facts into the coach data, with the credit', async () => {
  const agent = coachAgent('Fanny itu Assassin di Jungle, cocok buat yang suka chase.');
  const r = rigService({ agent });
  const msg = r.message();
  await r.service.coach(msg, 'Fanny cocoknya buat siapa?');
  assert.match(agent.calls[0].context.data, /KAMUS MLBB \(Liquipedia, dicek \d{4}-\d{2}-\d{2}, patch [\w.]+\)\nFanny \(Blade Dancer\): role Assassin, lane versi Liquipedia Jungle/);
  assert.ok(msg.replies[0].content.endsWith('\n-# Data: Liquipedia (CC-BY-SA 3.0)'));
});

test('/scrim target is registered with one optional text and routed to the service', async () => {
  const json = scrimCommand.data.toJSON();
  const target = json.options.find(option => option.name === 'target');
  assert.deepEqual(target.options.map(option => [option.name, Boolean(option.required), option.max_length]), [['isi', false, 120]]);
  const calls = [];
  await scrimCommand.execute({ options: { getSubcommand: () => 'target' } },
    { scrimResults: { target: async () => calls.push('target') }, guildAccess: deps.guildAccess });
  assert.deepEqual(calls, ['target']);
});

test('runtime hands mentions in hasil-scrim to the coach before any other prompt route', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.ok(source.includes('createScrimResults({ store: createScrimStore(), agent, coachStore: createCoachStore(),\n  proPages: esportsPages.pages })')
    || source.includes('createScrimResults({ store: createScrimStore(), agent, coachStore: createCoachStore(),\r\n  proPages: esportsPages.pages })'));
  const coachAt = source.indexOf("if (messageScope.kind === 'home' && await scrimResults.coach(msg, text)) return;");
  assert.ok(coachAt > source.indexOf('if (text.length > MAX_PROMPT_LENGTH)'));
  assert.ok(coachAt < source.indexOf('const promptRoute = resolvePrompt({'));
});
