'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const { createVoiceRooms } = require('../src/voice-rooms/service');
const { createVoiceRoomStore } = require('../src/voice-rooms/store');
const { createStudyStats, weekOf } = require('../src/voice-rooms/study-stats');

const GUILD = '223456789012345678';
const SEC = 1000; const MIN = 60 * SEC;
const PEOPLE = { u1: 'Raka', u2: 'Dara', u3: 'Sky', u4: 'Budi', u5: 'Eko', u6: 'Fajar' };
const home = { classify: () => ({ kind: 'home' }) };

function rig(t, { perms = true, failMove = false, board = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-voice-rooms-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createVoiceRoomStore({ filePath: path.join(dir, 'rooms.json') });
  const clock = { now: Date.UTC(2026, 10, 4, 12) };
  const stats = createStudyStats({ filePath: path.join(dir, 'study.json'), now: () => clock.now });
  const timers = []; const reports = []; const created = []; const deleted = []; const posts = []; const boardPosts = [];
  const repeats = []; const roleList = []; const rolesMade = []; const roleLog = [];
  const cache = new Map(); const where = new Map(); const people = new Map();
  let rooms = 0; let messages = 0;
  const messageIn = (list, payload) => {
    const message = { id: `m${++messages}`, payload, async edit(p) { message.payload = p; }, async delete() { message.deleted = true; } };
    list.push(message); return message;
  };
  const fetchFrom = list => async id => { const found = list.find(m => m.id === id && !m.deleted); if (!found) throw new Error('gone'); return found; };
  function member(id) {
    if (!people.has(id)) {
      people.set(id, { id, displayName: PEOPLE[id] || id, user: { bot: id.startsWith('bot') }, voice: { async setChannel(channel) {
        if (failMove) throw Object.assign(new Error('private-provider'), { code: 50013 });
        await voice(id, channel.id);
      } }, roles: { async add(role) { roleLog.push(['add', id, role.id]); }, async remove(role) { roleLog.push(['remove', id, role.id]); } } });
    }
    return people.get(id);
  }
  function voiceChannel(id, name, extra = {}) {
    const channel = { id, name, type: ChannelType.GuildVoice, guildId: GUILD, sent: [], edits: [], ...extra,
      get members() { return new Map([...where].filter(([, at]) => at === id).map(([user]) => [user, member(user)])); },
      async send(payload) { return messageIn(channel.sent, payload); },
      messages: { fetch: fetchFrom(extra.sentList || []) },
      permissionOverwrites: { cache: new Map(), async edit(target, options, more) { channel.edits.push([target, options, more?.type]); } },
      async setName(value) { channel.name = value; },
      async setUserLimit(value) { channel.userLimit = value; },
      async delete() { cache.delete(id); deleted.push(id); } };
    channel.messages.fetch = fetchFrom(channel.sent);
    cache.set(id, channel); return channel;
  }
  const category = { id: 'cat', type: ChannelType.GuildCategory, name: '🎛️ Bikin Room', permissionOverwrites: { cache: new Map([
    ['mods', { id: 'mods', type: 0, allow: { bitfield: P.ViewChannel }, deny: { bitfield: 0n } }]]) } };
  cache.set(category.id, category);
  for (const [key, label, emoji] of [['mabar', 'Mabar', '🎮'], ['scrim', 'Scrim', '⚔️'], ['diskusi', 'Diskusi', '💬'],
    ['belajar', 'Belajar', '📚'], ['privat', 'Privat', '🔒']]) voiceChannel(`door-${key}`, `${emoji}・Bikin ${label}`, { parentId: 'cat', parent: category });
  cache.set('mabar-text', { id: 'mabar-text', type: ChannelType.GuildText, name: '🎮・mabar',
    async send(payload) { return messageIn(posts, payload); }, messages: { fetch: fetchFrom(posts) } });
  if (board) {
    cache.set('board-text', { id: 'board-text', type: ChannelType.GuildText, name: '📚・belajar-bareng',
      async send(payload) { return messageIn(boardPosts, payload); }, messages: { fetch: fetchFrom(boardPosts) } });
  }
  const guild = { id: GUILD,
    roles: { everyone: { id: GUILD }, async fetch() { return new Map(roleList.map(role => [role.id, role])); },
      async create(options) { const role = { id: `role${rolesMade.length + 1}`, name: options.name, editable: true }; rolesMade.push(options); roleList.push(role); return role; } },
    channels: { cache, async create(options) {
      const room = voiceChannel(`room${++rooms}`, options.name, { parentId: options.parent, userLimit: options.userLimit });
      created.push(options); return room;
    } },
    // Members whose id starts with "left" have left the server.
    members: { me: { id: 'hengs', permissions: { has: () => perms } }, cache: people,
      async fetch(options) { return new Map(options.user.filter(id => !id.startsWith('left')).map(id => [id, member(id)])); } } };
  // A fresh service on the same fakes, as after a restart.
  const make = () => createVoiceRooms({ guildAccess: home, store, stats, now: () => clock.now, logger: { error() {} },
    setTimer: (fn, ms) => { const timer = { fn, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; }, reportFailure: async (g, details) => { reports.push(details); },
    repeat: fn => { repeats.push(fn); return {}; } });
  const service = make();
  // A voice move as the gateway reports it: the cache changes first, then the event.
  async function voice(userId, channelId) {
    const before = where.get(userId) || null;
    if (channelId) where.set(userId, channelId); else where.delete(userId);
    const state = at => ({ id: userId, guild, channelId: at, channel: at ? cache.get(at) || null : null, member: member(userId) });
    await service.handleVoiceState(state(before), state(channelId));
  }
  async function advance(ms) {
    clock.now += ms;
    for (const timer of timers.filter(x => !x.cleared && !x.ran && x.at <= clock.now)) { timer.ran = true; await timer.fn(); }
  }
  return { service, make, store, stats, clock, guild, cache, created, deleted, posts, boardPosts, reports, voice, advance, where,
    timers, repeats, roleList, rolesMade, roleLog };
}

function press(r, user, action, channelId, extra = {}) {
  const replies = []; const modals = [];
  return r.service.handleInteraction({ customId: `voice-room:${action}:${channelId}`, guildId: GUILD, guild: r.guild, user: { id: user },
    async reply(p) { replies.push(p); }, async showModal(m) { modals.push(m); }, ...extra }).then(() => ({ replies, modals }));
}

test('joining a door creates the room, moves the member in, posts the owner panel and the #mabar post', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-mabar');
  assert.equal(r.created.length, 1);
  assert.deepEqual([r.created[0].name, r.created[0].userLimit, r.created[0].parent, r.created[0].type], ['🎮 Mabar · Raka', 5, 'cat', ChannelType.GuildVoice]);
  assert.ok(r.created[0].permissionOverwrites.some(o => o.id === 'mods')); // the category's overwrites stay
  const id = r.where.get('u1'); const room = r.cache.get(id);
  assert.equal(id, 'room1');
  assert.deepEqual(r.store.get(id), { guildId: GUILD, ownerId: 'u1', type: 'mabar', createdAt: r.clock.now, panelId: room.sent[0].id,
    postId: r.posts[0].id, renames: [], locked: false, limit: 5 });
  assert.match(room.sent[0].payload.content, /Room Mabar punya <@u1>/); assert.deepEqual(room.sent[0].payload.allowedMentions, { parse: [] });
  assert.deepEqual(room.sent[0].payload.components.flatMap(row => row.toJSON().components.map(c => c.custom_id)),
    [`voice-room:rename:${id}`, `voice-room:lock:${id}`, `voice-room:slot:${id}`, `voice-room:invite:${id}`]);
  assert.equal(r.posts[0].payload.content, `🎮 **Raka** buka room Mabar · 1/5 · gas join: <#${id}>`);
  assert.deepEqual(r.posts[0].payload.allowedMentions, { parse: [] });
});

test('one room per member, 30 seconds between rooms, and at most 20 rooms', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-mabar'); const room = r.where.get('u1');
  await r.voice('u1', 'door-diskusi');
  assert.equal(r.where.get('u1'), room); assert.equal(r.created.length, 1); // back to the own room
  r.cache.delete(room); // an admin deleted it
  r.clock.now += 10 * SEC; await r.voice('u1', 'door-mabar');
  assert.equal(r.created.length, 1); assert.match(r.cache.get('door-mabar').sent.at(-1).payload.content, /tunggu 30 detik/);
  assert.deepEqual(r.cache.get('door-mabar').sent.at(-1).payload.allowedMentions, { parse: [] });
  r.clock.now += 21 * SEC; await r.voice('u1', null); await r.voice('u1', 'door-mabar');
  assert.equal(r.created.length, 2);
  const full = rig(t);
  for (let i = 0; i < 20; i++) full.store.put(`x${i}`, { guildId: GUILD, ownerId: `o${i}`, type: 'diskusi', renames: [] });
  await full.voice('u1', 'door-diskusi');
  assert.equal(full.created.length, 0); assert.match(full.cache.get('door-diskusi').sent.at(-1).payload.content, /lagi penuh \(20\)/);
});

test('the room passes to whoever is inside longest, and an empty room goes after 60 seconds unless someone comes back', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-diskusi'); const room = r.where.get('u1');
  r.clock.now += SEC; await r.voice('u3', room); r.clock.now += SEC; await r.voice('u2', room);
  await r.voice('u1', null);
  assert.equal(r.store.get(room).ownerId, 'u3'); assert.match(r.cache.get(room).sent[0].payload.content, /punya <@u3>/);
  await r.voice('u3', null); await r.voice('u2', null);
  await r.advance(30 * SEC); await r.voice('u2', room); await r.advance(40 * SEC);
  assert.deepEqual(r.deleted, []); // u2 came back in time
  await r.voice('u2', null); await r.advance(60 * SEC);
  assert.deepEqual(r.deleted, [room]); assert.equal(r.store.get(room), null);
});

test('a restart drops rooms that are gone, closes empty ones and keeps the rest with an owner inside', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-diskusi'); const kept = r.where.get('u1'); await r.voice('u2', kept);
  await r.voice('u3', 'door-belajar'); const empty = r.where.get('u3'); await r.voice('u3', null);
  await r.voice('u4', 'door-scrim'); const gone = r.where.get('u4'); const post = r.posts.find(p => p.id === r.store.get(gone).postId);
  r.cache.delete(gone); r.where.delete('u4'); r.where.delete('u1'); // while Hengs was down
  await r.make().start({ guilds: { cache: new Map([[GUILD, r.guild]]) } });
  assert.equal(r.store.get(gone), null); assert.equal(post.deleted, true);
  assert.equal(r.store.get(empty), null); assert.ok(r.deleted.includes(empty));
  assert.equal(r.store.get(kept).ownerId, 'u2');
});

test('privat rooms start locked and belajar rooms are push-to-talk', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-privat'); await r.voice('u2', 'door-belajar');
  const [privat, belajar] = r.created.map(o => o.permissionOverwrites);
  const find = (list, id) => list.find(o => o.id === id);
  assert.ok(BigInt(find(privat, GUILD).deny) & P.Connect);
  assert.ok(BigInt(find(privat, 'u1').allow) & P.Connect);
  assert.ok(BigInt(find(privat, 'hengs').allow) & P.MoveMembers);
  assert.ok(BigInt(find(belajar, GUILD).deny) & P.UseVAD);
  assert.equal(find(belajar, 'u2'), undefined);
  assert.equal(r.store.get(r.where.get('u1')).locked, true);
  assert.match(r.cache.get(r.where.get('u1')).sent[0].payload.content, /dikunci/);
});

test('the panel is for the owner: rename twice per 10 minutes, slot, lock and unlock, invite', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-mabar'); const id = r.where.get('u1'); const room = r.cache.get(id);
  assert.match((await press(r, 'u2', 'lock', id)).replies[0].content, /khusus pemilik room/);
  assert.equal((await press(r, 'u1', 'rename', id)).modals[0].toJSON().custom_id, `voice-room:renamed:${id}`);
  const submit = name => press(r, 'u1', 'renamed', id, { fields: { getTextInputValue: () => name } });
  assert.match((await submit('cek https://x.y')).replies[0].content, /tanpa mention atau link/);
  await submit('Push rank'); assert.equal(room.name, '🎮 Push rank');
  await submit('Push rank 2');
  assert.match((await press(r, 'u1', 'rename', id)).replies[0].content, /2 kali per 10 menit/);
  r.clock.now += 11 * 60 * SEC; assert.equal((await press(r, 'u1', 'rename', id)).modals.length, 1);
  await press(r, 'u1', 'slot', id, { values: ['10'] });
  assert.equal(room.userLimit, 10); assert.equal(r.store.get(id).limit, 10);
  await press(r, 'u1', 'lock', id);
  assert.deepEqual(room.edits.at(-1).slice(0, 2), [GUILD, { Connect: false }]); assert.equal(r.store.get(id).locked, true);
  await press(r, 'u1', 'unlock', id); assert.deepEqual(room.edits.at(-1).slice(0, 2), [GUILD, { Connect: null }]);
  await press(r, 'u1', 'invite', id, { values: ['u2', 'u3', 'u1'] });
  assert.deepEqual(room.edits.slice(-2).map(e => e[0]), ['u2', 'u3']);
  assert.match(room.sent.at(-1).payload.content, /<@u2> <@u3> diundang/);
  assert.deepEqual(room.sent.at(-1).payload.allowedMentions, { users: ['u2', 'u3'] });
  assert.match((await press(r, 'u1', 'lock', 'missing')).replies[0].content, /udah tutup/);
});

test('#mabar posts follow Mabar and Scrim rooms only: debounced, full, locked, and deleted on close', async t => {
  const r = rig(t);
  await r.voice('u6', 'door-diskusi'); assert.equal(r.posts.length, 0); // Diskusi is not announced
  await r.voice('u1', 'door-mabar'); const id = r.where.get('u1'); const post = r.posts[0];
  for (const user of ['u2', 'u3', 'u4']) await r.voice(user, id);
  assert.equal(post.payload.content, `🎮 **Raka** buka room Mabar · 1/5 · gas join: <#${id}>`); // debounced
  await r.advance(10 * SEC);
  assert.equal(post.payload.content, `🎮 **Raka** buka room Mabar · 4/5 · gas join: <#${id}>`);
  await r.voice('u5', id); await r.advance(10 * SEC);
  assert.equal(post.payload.content, '🎮 **Raka** buka room Mabar · penuh 5/5');
  await press(r, 'u1', 'lock', id); await r.advance(10 * SEC);
  assert.equal(post.payload.content, '🎮 **Raka** buka room Mabar · 🔒 dikunci');
  for (const user of ['u1', 'u2', 'u3', 'u4', 'u5']) await r.voice(user, null);
  await r.advance(60 * SEC);
  assert.equal(post.deleted, true); assert.equal(r.posts.length, 1);
});

test('missing permissions are reported, a failed move removes the new room, and bots never open rooms', async t => {
  const r = rig(t, { perms: false });
  await r.voice('u1', 'door-mabar');
  assert.equal(r.created.length, 0); assert.deepEqual(r.reports.map(x => x.feature), ['Room voice']);
  assert.match(r.reports[0].reason, /Move Members/);
  const f = rig(t, { failMove: true });
  await f.voice('u1', 'door-mabar');
  assert.equal(f.created.length, 1); assert.deepEqual(f.deleted, ['room1']); assert.deepEqual(f.store.all(), {});
  assert.equal(f.reports[0].code, 50013);
  const b = rig(t); await b.voice('bot1', 'door-mabar'); assert.equal(b.created.length, 0);
});

test('index routes voice events and voice-room interactions to the service and tidies rooms on ready', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(index, /client\.on\(Events\.VoiceStateUpdate, \(oldState, newState\) => \{/);
  assert.match(index, /startsWith\('voice-room:'\)\) \{\n\s+try \{ await voiceRooms\.handleInteraction\(interaction\); \}/);
  assert.match(index, /await voiceRooms\.start\(c\)/);
});

// Henry, 2026-10-27: "Gw coba bikin lainnya tapi tetep bikin voice mabar."
test('another door closes the empty old room and opens the new type; the same door brings you back', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-mabar'); const mabar = r.where.get('u1');
  await r.voice('u1', 'door-mabar');
  assert.equal(r.where.get('u1'), mabar); assert.equal(r.created.length, 1); // same door: back to the own room
  r.clock.now += 31 * SEC;
  await r.voice('u1', 'door-diskusi');
  const diskusi = r.where.get('u1');
  assert.notEqual(diskusi, mabar); assert.deepEqual(r.deleted, [mabar]); assert.equal(r.store.get(mabar), null);
  assert.equal(r.created.at(-1).name, '💬 Diskusi · Raka'); assert.equal(r.store.get(diskusi).type, 'diskusi');
  assert.equal(r.posts[0].deleted, true); // the Mabar post went with its room
});

test('switching within 30 seconds keeps the old room, and a room with people stays with them', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-mabar'); const mabar = r.where.get('u1');
  await r.voice('u1', 'door-scrim');
  assert.equal(r.where.get('u1'), mabar); assert.equal(r.created.length, 1); assert.deepEqual(r.deleted, []);
  assert.match(r.cache.get('door-scrim').sent.at(-1).payload.content, /tunggu 30 detik/);
  r.clock.now += SEC; await r.voice('u2', mabar);
  r.clock.now += 31 * SEC; await r.voice('u1', 'door-scrim');
  assert.equal(r.store.get(mabar).ownerId, 'u2'); assert.deepEqual(r.deleted, []); // u2 keeps the Mabar room
  assert.equal(r.store.get(r.where.get('u1')).type, 'scrim');
});

// Pomodoro in Belajar rooms and the weekly Rajin Belajar board (2026-10-28).
const unix = at => Math.floor(at / 1000);
const lastRow = message => message.payload.components.at(-1).toJSON().components[0].custom_id;
const startAt = r => r.make().start({ guilds: { cache: new Map([[GUILD, r.guild]]) } });

test('the Belajar owner starts Pomodoro from the panel, and each phase mentions only the members inside', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-belajar'); const id = r.where.get('u1'); const room = r.cache.get(id); const panel = room.sent[0];
  await r.voice('u2', id);
  assert.match(panel.payload.content, /Pomodoro belum jalan/);
  assert.match(panel.payload.content, /papan Rajin Belajar mingguan di <#board-text>\.$/);
  assert.equal(lastRow(panel), `voice-room:pomodoro:${id}`);
  assert.match((await press(r, 'u2', 'pomodoro', id, { values: ['klasik'] })).replies[0].content, /khusus pemilik room/);
  const started = r.clock.now;
  assert.match((await press(r, 'u1', 'pomodoro', id, { values: ['klasik'] })).replies[0].content, /Klasik 25\/5 jalan/);
  assert.equal(room.sent.at(-1).payload.content, `🍅 <@u1> <@u2> Fokus putaran 1/8 mulai. Selesai <t:${unix(started + 25 * MIN)}:t>.`);
  assert.deepEqual(room.sent.at(-1).payload.allowedMentions, { users: ['u1', 'u2'] });
  assert.match(panel.payload.content, /🍅 Fokus putaran 1\/8 · selesai <t:\d+:t> \(<t:\d+:R>\)/);
  assert.equal(lastRow(panel), `voice-room:pomodoro-stop:${id}`);
  assert.match((await press(r, 'u1', 'pomodoro', id, { values: ['panjang'] })).replies[0].content, /udah jalan/);
  await r.advance(10 * SEC);
  assert.equal(r.boardPosts[0].payload.content,
    `📚 **Raka** buka room Belajar · 2 orang · 🍅 fokus putaran 1/8 sampai <t:${unix(started + 25 * MIN)}:t> · gas join: <#${id}>`);
  await r.advance(25 * MIN);
  assert.equal(room.sent.at(-1).payload.content, `☕ <@u1> <@u2> Istirahat 5 menit. Fokus lagi <t:${unix(started + 30 * MIN)}:t>.`);
  assert.deepEqual(r.store.get(id).pomodoro.tally, { u1: 1500, u2: 1500 });
  assert.deepEqual(r.stats.week(GUILD, weekOf(r.clock.now)), { u1: 1500, u2: 1500 });
  await r.advance(5 * MIN);
  assert.match(room.sent.at(-1).payload.content, /^🍅 <@u1> <@u2> Fokus putaran 2\/8 mulai\./);
});

test('leaving mid-focus keeps the minutes inside, and Stop posts the summary and brings back the start select', async t => {
  const r = rig(t);
  await r.voice('u3', 'door-mabar'); const mabar = r.where.get('u3');
  assert.match((await press(r, 'u3', 'pomodoro', mabar, { values: ['klasik'] })).replies[0].content, /cuma ada di room Belajar/);
  await r.voice('u1', 'door-belajar'); const id = r.where.get('u1'); const room = r.cache.get(id);
  await r.voice('u2', id);
  await press(r, 'u1', 'pomodoro', id, { values: ['klasik'] });
  await r.advance(10 * MIN); await r.voice('u2', null);
  await r.advance(5 * MIN);
  assert.match((await press(r, 'u1', 'pomodoro-stop', id)).replies[0].content, /dihentiin/);
  const summary = '✅ Sesi Pomodoro selesai: 0 putaran fokus. Raka 15 menit, Dara 10 menit.';
  assert.equal(room.sent.at(-1).payload.content, summary); assert.deepEqual(room.sent.at(-1).payload.allowedMentions, { parse: [] });
  assert.equal(r.store.get(id).pomodoro, null); assert.equal(lastRow(room.sent[0]), `voice-room:pomodoro:${id}`);
  assert.deepEqual(r.stats.week(GUILD, weekOf(r.clock.now)), { u1: 900, u2: 600 });
  assert.match((await press(r, 'u1', 'pomodoro-stop', id)).replies[0].content, /lagi nggak jalan/);
  await r.advance(30 * MIN);
  assert.equal(room.sent.at(-1).payload.content, summary); // the stopped timer never fires
});

test('a session stops by itself after the last round', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-belajar'); const id = r.where.get('u1'); const room = r.cache.get(id);
  await press(r, 'u1', 'pomodoro', id, { values: ['panjang'] });
  for (const minutes of [50, 10, 50, 10, 50, 10, 50]) await r.advance(minutes * MIN);
  assert.equal(room.sent.at(-1).payload.content, '✅ Sesi Pomodoro selesai: 4 putaran fokus. Raka 200 menit.');
  assert.equal(r.store.get(id).pomodoro, null);
  assert.deepEqual(r.stats.week(GUILD, weekOf(r.clock.now)), { u1: 12000 });
});

test('after a restart a running phase keeps its end, and one that ended while Hengs was down moves on from now', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-belajar'); const id = r.where.get('u1'); const room = r.cache.get(id);
  const started = r.clock.now;
  await press(r, 'u1', 'pomodoro', id, { values: ['klasik'] });
  for (const timer of r.timers) timer.cleared = true; // Hengs restarts: its timers are gone
  await startAt(r);
  await r.advance(25 * MIN);
  assert.equal(room.sent.at(-1).payload.content, `☕ <@u1> Istirahat 5 menit. Fokus lagi <t:${unix(started + 30 * MIN)}:t>.`);
  for (const timer of r.timers) timer.cleared = true;
  r.clock.now = started + 35 * MIN; // down past the end of the break
  await startAt(r);
  assert.equal(room.sent.at(-1).payload.content,
    `Hengs sempat restart, timer lanjut. 🍅 <@u1> Fokus putaran 2/8 mulai. Selesai <t:${unix(started + 60 * MIN)}:t>.`);
});

test('an empty Belajar room closes with its timer and its belajar-bareng post', async t => {
  const r = rig(t);
  await r.voice('u1', 'door-belajar'); const id = r.where.get('u1'); const room = r.cache.get(id);
  await press(r, 'u1', 'pomodoro', id, { values: ['klasik'] });
  await r.voice('u1', null); await r.advance(60 * SEC);
  assert.deepEqual(r.deleted, [id]); assert.equal(r.boardPosts[0].deleted, true);
  const sent = room.sent.length; await r.advance(30 * MIN);
  assert.equal(room.sent.length, sent);
});

test('the Monday board posts once with the members still here, moves the role, and Menitku answers privately', async t => {
  const r = rig(t);
  r.stats.add(GUILD, { u1: 9000, u2: 3000, u3: 600, left1: 20000 }, Date.parse('2026-11-04T20:00:00+07:00'));
  r.clock.now = Date.parse('2026-11-09T06:59:00+07:00');
  await startAt(r);
  assert.equal(r.boardPosts.length, 0); // not before 07:00 WIB
  r.clock.now = Date.parse('2026-11-09T07:00:00+07:00');
  await r.repeats.at(-1)(); await r.repeats.at(-1)();
  assert.equal(r.boardPosts.length, 1);
  const board = r.boardPosts[0].payload;
  assert.equal(board.content, ['📚 **Rajin Belajar** · 2-8 Nov', '🥇 <@u1> · 2 jam 30 menit', '🥈 <@u2> · 50 menit',
    'Total server: 9 jam 3 menit fokus bareng.', 'Role **Rajin Belajar** pindah ke <@u1>.'].join('\n'));
  assert.deepEqual(board.allowedMentions, { parse: [] });
  assert.equal(board.components[0].toJSON().components[0].custom_id, `voice-room:menitku:${GUILD}`);
  assert.deepEqual(r.rolesMade.map(o => [o.name, o.color, o.permissions]), [['Rajin Belajar', 0x2ECC71, []]]);
  assert.deepEqual(r.roleLog, [['add', 'u1', 'role1']]); assert.deepEqual(r.stats.role(GUILD), { roleId: 'role1', holders: ['u1'] });
  r.stats.add(GUILD, { u2: 4500, u3: 600 }, r.clock.now);
  const ask = (user, id = GUILD) => press(r, user, 'menitku', id).then(x => x.replies[0]);
  assert.equal((await ask('u2')).content, 'Minggu ini: 1 jam 15 menit fokus (peringkat 1 dari 1). Minggu lalu: 50 menit.');
  assert.equal((await ask('u3')).content, 'Minggu ini: 10 menit fokus. Belum masuk papan, minimal 25 menit. Minggu lalu: 10 menit.');
  assert.equal((await ask('u2')).flags, MessageFlags.Ephemeral);
  assert.match((await ask('u1', 'another-server')).content, /udah nggak berlaku/);
});

test('without belajar-bareng the board is skipped with one note, and a role above Hengs is reported', async t => {
  const r = rig(t, { board: false });
  r.stats.add(GUILD, { u1: 3000 }, Date.parse('2026-11-04T20:00:00+07:00'));
  r.clock.now = Date.parse('2026-11-09T08:00:00+07:00');
  await startAt(r); await r.repeats.at(-1)();
  assert.deepEqual(r.reports.map(x => x.feature), ['Papan Rajin Belajar']); assert.match(r.reports[0].reason, /belajar-bareng belum ada/);
  assert.deepEqual(r.roleLog, [['add', 'u1', 'role1']]);
  const s = rig(t);
  s.roleList.push({ id: 'r9', name: '🌱 Rajin Belajar', editable: false });
  s.stats.add(GUILD, { u1: 3000 }, Date.parse('2026-11-04T20:00:00+07:00'));
  s.clock.now = Date.parse('2026-11-09T08:00:00+07:00');
  await startAt(s);
  assert.deepEqual(s.reports.map(x => x.feature), ['Role Rajin Belajar']); assert.match(s.reports[0].reason, /Manage Roles/);
  assert.doesNotMatch(s.boardPosts[0].payload.content, /pindah ke/);
});
