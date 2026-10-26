'use strict';

// Voice rooms (owner request, 2026-10-26: "server rame tiap hari"): one door per room type; joining a door creates the
// room, moves the member in and posts the owner panel in the room's text chat. The member inside longest takes over
// when the owner leaves; an empty room goes after 60 seconds. Mabar and Scrim rooms are announced in #mabar. Humans
// only: bots never open, own or keep a room.
const { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits: P } = require('discord.js');
const { slugOf } = require('../guilds/channel-style');
const { typeOf } = require('./types');
const { doorType, roomName, renamed, renameAllowed, nextOwner, postText, RENAME_WINDOW } = require('./rules');
const { SLOTS, panelPayload, renameModal } = require('./panel');
const { createVoiceRoomStore } = require('./store');

const EMPTY_GRACE = 60_000; const POST_EVERY = 10_000; const GAP = 30_000; const MAX_ROOMS = 20;
const NEEDS = [P.ManageChannels, P.MoveMembers, P.ManageRoles];
const POST_SLUGS = ['mabar', 'info-mabar', 'lfg'];

function createVoiceRooms({ guildAccess, store = createVoiceRoomStore(), reportFailure = async () => {}, logger = console,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const joins = new Map(); const emptyTimers = new Map(); const postTimers = new Map(); const lastCreated = new Map();
  const busy = new Set();

  const isHome = guild => Boolean(guild) && guildAccess?.classify(guild.id)?.kind === 'home';
  const report = (guild, reason, code = null) => reportFailure(guild, { feature: 'Room voice', reason, code });
  const roomsOf = guildId => Object.entries(store.all()).filter(([, room]) => room.guildId === guildId);
  const humans = channel => [...(channel?.members?.values?.() || [])].filter(m => !m.user?.bot);
  const postChannel = guild => [...guild.channels.cache.values()]
    .find(c => c.type === ChannelType.GuildText && POST_SLUGS.includes(slugOf(c.name)));
  const note = (door, content) => door?.send?.({ content, allowedMentions: { parse: [] } }).catch(() => {});

  async function handleVoiceState(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!isHome(guild) || member?.user?.bot) return;
    const left = oldState.channelId !== newState.channelId ? oldState.channelId : null;
    const joined = oldState.channelId !== newState.channelId ? newState.channelId : null;
    if (left && store.get(left)) await leftRoom(guild, left, member.id);
    if (!joined) return;
    if (store.get(joined)) joinedRoom(guild, joined, member.id);
    else {
      const type = doorType(newState.channel?.name);
      if (type) await openRoom(guild, newState.channel, member, type);
    }
  }

  async function openRoom(guild, door, member, type) {
    if (busy.has(member.id)) return;
    busy.add(member.id);
    try {
      const own = roomsOf(guild.id).find(([, room]) => room.ownerId === member.id)?.[0];
      if (own) {
        const channel = guild.channels.cache.get(own);
        if (channel) { await member.voice.setChannel(channel).catch(() => {}); return; }
        await closeRoom(guild, own, null); // deleted by someone else
      }
      if (now() - (lastCreated.get(member.id) || 0) < GAP) {
        await note(door, `${member.displayName}, tunggu 30 detik dulu sebelum bikin room lagi ya.`); return;
      }
      if (roomsOf(guild.id).length >= MAX_ROOMS) { await note(door, `Room voice lagi penuh (${MAX_ROOMS}). Coba lagi nanti ya.`); return; }
      if (!guild.members.me?.permissions?.has(NEEDS)) {
        await report(guild, 'Hengs butuh izin Manage Channels, Move Members dan Manage Roles buat bikin room voice'); return;
      }
      let room;
      try {
        room = await guild.channels.create({ name: roomName(type, member.displayName), type: ChannelType.GuildVoice,
          parent: door.parentId || undefined, userLimit: type.limit, permissionOverwrites: overwrites(guild, door, type, member.id),
          reason: `Hengs: room ${type.label}` });
      } catch (error) {
        logger.error('[voice-rooms] ROOM_CREATE_FAILED');
        await report(guild, 'room voice belum bisa dibuat', error?.code || null); return;
      }
      lastCreated.set(member.id, now());
      // Recorded before the move, so the move's own voice event finds the room.
      store.put(room.id, { guildId: guild.id, ownerId: member.id, type: type.key, createdAt: now(), panelId: null, postId: null,
        renames: [], locked: Boolean(type.locked), limit: type.limit });
      joins.set(room.id, { [member.id]: now() });
      try { await member.voice.setChannel(room); } catch (error) {
        logger.error('[voice-rooms] ROOM_MOVE_FAILED');
        store.remove(room.id); joins.delete(room.id);
        await room.delete('Hengs: member could not be moved in').catch(() => {});
        await report(guild, 'member belum bisa dipindah ke room barunya', error?.code || null); return;
      }
      try {
        const panel = await room.send(panelPayload({ type, ownerId: member.id, channelId: room.id, limit: type.limit, locked: Boolean(type.locked) }));
        store.update(room.id, { panelId: panel.id });
      } catch { logger.error('[voice-rooms] PANEL_FAILED'); }
      if (type.announce) await syncPost(guild, room.id);
    } finally { busy.delete(member.id); }
  }

  // The category's overwrites, plus the type's: privat locked (owner and Hengs may connect; Discord needs Connect in the
  // target channel to move someone in), belajar push-to-talk.
  function overwrites(guild, door, type, ownerId) {
    const list = new Map([...(door.parent?.permissionOverwrites?.cache?.values?.() || [])]
      .map(o => [o.id, { id: o.id, type: o.type, allow: BigInt(o.allow.bitfield), deny: BigInt(o.deny.bitfield) }]));
    const set = (id, kind, allow = 0n, deny = 0n) => {
      const o = list.get(id) || { id, type: kind, allow: 0n, deny: 0n };
      o.allow = (o.allow | allow) & ~deny; o.deny = (o.deny | deny) & ~allow;
      list.set(id, o);
    };
    const everyone = guild.roles.everyone.id;
    if (type.locked) {
      set(everyone, OverwriteType.Role, 0n, P.Connect);
      set(ownerId, OverwriteType.Member, P.Connect);
      set(guild.members.me.id, OverwriteType.Member, P.ViewChannel | P.Connect | P.ManageChannels | P.MoveMembers);
    }
    if (type.pushToTalk) set(everyone, OverwriteType.Role, 0n, P.UseVAD);
    return [...list.values()];
  }

  function joinedRoom(guild, channelId, userId) {
    const map = joins.get(channelId) || {};
    if (!map[userId]) map[userId] = now();
    joins.set(channelId, map);
    cancelEmpty(channelId);
    if (typeOf(store.get(channelId).type)?.announce) schedulePost(guild, channelId);
  }

  async function leftRoom(guild, channelId, userId) {
    const map = joins.get(channelId) || {};
    delete map[userId]; joins.set(channelId, map);
    const channel = guild.channels.cache.get(channelId);
    if (!channel) { await closeRoom(guild, channelId, null); return; }
    const inside = humans(channel).map(m => m.id);
    const room = store.get(channelId);
    if (!inside.length) scheduleEmpty(guild, channelId);
    else if (room.ownerId === userId || !inside.includes(room.ownerId)) {
      store.update(channelId, { ownerId: nextOwner(Object.fromEntries(inside.map(id => [id, map[id] || now()]))) });
      await refreshPanel(guild, channelId);
    }
    if (typeOf(room.type)?.announce) schedulePost(guild, channelId);
  }

  function scheduleEmpty(guild, channelId) {
    if (emptyTimers.has(channelId)) return;
    emptyTimers.set(channelId, setTimer(() => { emptyTimers.delete(channelId); return closeIfEmpty(guild, channelId); }, EMPTY_GRACE));
  }

  function cancelEmpty(channelId) {
    const timer = emptyTimers.get(channelId);
    if (timer) { clearTimer(timer); emptyTimers.delete(channelId); }
  }

  async function closeIfEmpty(guild, channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (channel && humans(channel).length) return;
    await closeRoom(guild, channelId, channel);
  }

  async function closeRoom(guild, channelId, channel) {
    const room = store.get(channelId);
    if (!room) return;
    store.remove(channelId); joins.delete(channelId); cancelEmpty(channelId);
    const timer = postTimers.get(channelId);
    if (timer) { clearTimer(timer); postTimers.delete(channelId); }
    if (room.postId) {
      try { await (await postChannel(guild)?.messages.fetch(room.postId))?.delete(); } catch { /* already gone */ }
    }
    if (!channel) return;
    try { await channel.delete('Hengs: room kosong'); } catch (error) {
      logger.error('[voice-rooms] ROOM_DELETE_FAILED');
      await report(guild, 'room kosong belum bisa dihapus', error?.code || null);
    }
  }

  // #mabar: the first post goes out at once; later changes are folded into one edit at most every 10 seconds.
  function schedulePost(guild, channelId) {
    if (postTimers.has(channelId)) return;
    postTimers.set(channelId, setTimer(() => { postTimers.delete(channelId); return syncPost(guild, channelId); }, POST_EVERY));
  }

  async function syncPost(guild, channelId) {
    const room = store.get(channelId); const type = room && typeOf(room.type);
    const target = postChannel(guild); const channel = guild.channels.cache.get(channelId);
    if (!type?.announce || !target || !channel) return;
    const content = postText({ type, ownerName: guild.members.cache.get(room.ownerId)?.displayName, channelId,
      count: humans(channel).length, limit: room.limit, locked: room.locked });
    try {
      if (room.postId) await (await target.messages.fetch(room.postId)).edit({ content, allowedMentions: { parse: [] } });
      else store.update(channelId, { postId: (await target.send({ content, allowedMentions: { parse: [] } })).id });
    } catch { logger.error('[voice-rooms] POST_FAILED'); }
  }

  async function refreshPanel(guild, channelId) {
    const room = store.get(channelId); const channel = guild.channels.cache.get(channelId);
    if (!room?.panelId || !channel) return;
    try {
      await (await channel.messages.fetch(room.panelId)).edit(panelPayload({ type: typeOf(room.type), ownerId: room.ownerId, channelId,
        limit: room.limit, locked: room.locked }));
    } catch { logger.error('[voice-rooms] PANEL_EDIT_FAILED'); }
  }

  async function handleInteraction(interaction) {
    const [, action, channelId] = String(interaction.customId || '').split(':');
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    const guild = interaction.guild; const room = store.get(channelId); const channel = guild?.channels.cache.get(channelId);
    if (!room || !channel || room.guildId !== interaction.guildId) { await reply('Room ini udah tutup.'); return true; }
    if (interaction.user.id !== room.ownerId) { await reply('Panel ini khusus pemilik room.'); return true; }
    const type = typeOf(room.type);
    const tooMany = 'Nama room cuma bisa diganti 2 kali per 10 menit (aturan Discord). Coba lagi nanti ya.';
    if (action === 'rename') {
      if (!renameAllowed(room.renames, now())) await reply(tooMany);
      else await interaction.showModal(renameModal(channelId));
      return true;
    }
    if (action === 'renamed') {
      const name = renamed(type, interaction.fields.getTextInputValue('name'));
      if (!name) { await reply('Namanya belum bisa dipakai: maksimal 40 huruf, tanpa mention atau link.'); return true; }
      if (!renameAllowed(room.renames, now())) { await reply(tooMany); return true; }
      try { await channel.setName(name, 'Hengs: ganti nama room'); } catch { await reply('Nama room belum bisa diganti. Coba lagi sebentar lagi.'); return true; }
      store.update(channelId, { renames: [...room.renames.filter(at => now() - at < RENAME_WINDOW), now()] });
      await reply(`Nama room jadi ${name}.`);
      return true;
    }
    if (action === 'slot') {
      const limit = Number(interaction.values?.[0]);
      if (!SLOTS.includes(limit)) { await reply('Pilihan slot nggak dikenal.'); return true; }
      try { await channel.setUserLimit(limit, 'Hengs: atur slot room'); } catch { await reply('Slot room belum bisa diubah.'); return true; }
      store.update(channelId, { limit });
      await refreshPanel(guild, channelId);
      if (type.announce) schedulePost(guild, channelId);
      await reply(limit ? `Slot room jadi ${limit} orang.` : 'Slot room jadi bebas.');
      return true;
    }
    if (action === 'lock' || action === 'unlock') {
      const locked = action === 'lock';
      try {
        await channel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: locked ? false : null },
          { type: OverwriteType.Role, reason: 'Hengs: kunci room' });
      } catch { await reply('Room belum bisa dikunci. Cek izin Manage Roles Hengs.'); return true; }
      store.update(channelId, { locked });
      await refreshPanel(guild, channelId);
      if (type.announce) schedulePost(guild, channelId);
      await reply(locked ? 'Room dikunci. Yang udah di dalam tetap di sini, yang lain perlu diundang.' : 'Room dibuka lagi.');
      return true;
    }
    if (action === 'invite') {
      const ids = [...new Set(interaction.values || [])].filter(id => id !== interaction.user.id).slice(0, 5);
      if (!ids.length) { await reply('Pilih anggota lain selain kamu ya.'); return true; }
      try {
        for (const id of ids) {
          await channel.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true }, { type: OverwriteType.Member, reason: 'Hengs: undang ke room' });
        }
      } catch { await reply('Undangannya belum bisa dikirim. Cek izin Manage Roles Hengs.'); return true; }
      await channel.send({ content: `${ids.map(id => `<@${id}>`).join(' ')} diundang ke room ini sama <@${interaction.user.id}>.`,
        allowedMentions: { users: ids } }).catch(() => {});
      await reply(`${ids.length} anggota diundang.`);
      return true;
    }
    await reply('Tombol ini udah nggak berlaku.');
    return true;
  }

  // After a restart: rooms whose channel is gone are dropped, empty rooms close, the rest go on with an owner inside.
  async function start(client) {
    for (const [channelId, room] of Object.entries(store.all())) {
      const guild = client.guilds.cache.get(room.guildId);
      if (!guild) { store.remove(channelId); continue; }
      const channel = guild.channels.cache.get(channelId);
      const inside = humans(channel).map(m => m.id);
      if (!channel || !inside.length) { await closeRoom(guild, channelId, channel || null); continue; }
      joins.set(channelId, Object.fromEntries(inside.map(id => [id, now()])));
      if (!inside.includes(room.ownerId)) {
        store.update(channelId, { ownerId: nextOwner(joins.get(channelId)) });
        await refreshPanel(guild, channelId);
      }
      if (typeOf(room.type)?.announce) await syncPost(guild, channelId);
    }
  }

  return { handleVoiceState, handleInteraction, start };
}

module.exports = { createVoiceRooms };
