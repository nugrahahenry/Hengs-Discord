'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { createVoiceRooms } = require('../src/voice-rooms/service');
const { createVoiceRoomStore } = require('../src/voice-rooms/store');

const GUILD = '223456789012345678';
const SEC = 1000;
const PEOPLE = { u1: 'Raka', u2: 'Dara', u3: 'Sky', u4: 'Budi', u5: 'Eko', u6: 'Fajar' };
const home = { classify: () => ({ kind: 'home' }) };

function rig(t, { perms = true, failMove = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-voice-rooms-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createVoiceRoomStore({ filePath: path.join(dir, 'rooms.json') });
  const clock = { now: Date.UTC(2026, 10, 4, 12) };
  const timers = []; const reports = []; const created = []; const deleted = []; const posts = [];
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
      } } });
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
  const guild = { id: GUILD, roles: { everyone: { id: GUILD } },
    channels: { cache, async create(options) {
      const room = voiceChannel(`room${++rooms}`, options.name, { parentId: options.parent, userLimit: options.userLimit });
      created.push(options); return room;
    } },
    members: { me: { id: 'hengs', permissions: { has: () => perms } }, cache: people } };
  const service = createVoiceRooms({ guildAccess: home, store, now: () => clock.now, logger: { error() {} },
    setTimer: (fn, ms) => { const timer = { fn, at: clock.now + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; }, reportFailure: async (g, details) => { reports.push(details); } });
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
  return { service, store, clock, guild, cache, created, deleted, posts, reports, voice, advance, where };
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
  const fresh = createVoiceRooms({ guildAccess: home, store: r.store, now: () => r.clock.now, logger: { error() {} },
    setTimer: () => ({}), clearTimer: () => {}, reportFailure: async () => {} });
  await fresh.start({ guilds: { cache: new Map([[GUILD, r.guild]]) } });
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
