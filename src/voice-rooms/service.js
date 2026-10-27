'use strict';

// Voice rooms (owner request, 2026-10-26: "server rame tiap hari"): one door per room type; joining a door creates the
// room, moves the member in and posts the owner panel in the room's text chat. The member inside longest takes over
// when the owner leaves; an empty room goes after 60 seconds. Mabar and Scrim rooms are announced in #mabar. Humans
// only: bots never open, own or keep a room.
// Belajar rooms (2026-10-28: "Room Belajar + Pomodoro dulu") are announced in belajar-bareng and carry a Pomodoro timer
// on the owner panel. Focus minutes feed the weekly Rajin Belajar board there, posted from Monday 07:00 WIB, with a
// role for last week's best.
const { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits: P, escapeMarkdown } = require('discord.js');
const { slugOf } = require('../guilds/channel-style');
const { rotateRole } = require('../utils/rotating-role');
const { typeOf } = require('./types');
const { clean, doorType, roomName, renamed, renameAllowed, nextOwner, postText, RENAME_WINDOW } = require('./rules');
const { SLOTS, panelPayload, renameModal, boardRow } = require('./panel');
const { createVoiceRoomStore } = require('./store');
const { PRESETS, begin, next, credit, alertText, statusText, summaryText } = require('./pomodoro');
const { createStudyStats, weekOf } = require('./study-stats');
const { ranked, boardText, myMinutesText } = require('./study-board');

const EMPTY_GRACE = 60_000; const POST_EVERY = 10_000; const GAP = 30_000; const MAX_ROOMS = 20;
const WEEK = 7 * 86_400_000; const TICK_EVERY = 5 * 60_000;
const NEEDS = [P.ManageChannels, P.MoveMembers, P.ManageRoles];
const POST_SLUGS = ['mabar', 'info-mabar', 'lfg'];
const BOARD_SLUG = 'belajar-bareng';
const ROLE_REASON = 'Hengs butuh izin Manage Roles, dan role Hengs Bot harus ada di atas Rajin Belajar (Server Settings > Roles)';

function createVoiceRooms({ guildAccess, store = createVoiceRoomStore(), stats = createStudyStats(), reportFailure = async () => {},
  logger = console, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, repeat = setInterval } = {}) {
  const joins = new Map(); const emptyTimers = new Map(); const postTimers = new Map(); const phaseTimers = new Map();
  const lastCreated = new Map(); const busy = new Set();

  const isHome = guild => Boolean(guild) && guildAccess?.classify(guild.id)?.kind === 'home';
  const report = (guild, reason, code = null) => reportFailure(guild, { feature: 'Room voice', reason, code });
  const roomsOf = guildId => Object.entries(store.all()).filter(([, room]) => room.guildId === guildId);
  const humans = channel => [...(channel?.members?.values?.() || [])].filter(m => !m.user?.bot);
  const textChannel = (guild, slugs) => [...guild.channels.cache.values()]
    .find(c => c.type === ChannelType.GuildText && slugs.includes(slugOf(c.name)));
  const postChannel = (guild, type) => textChannel(guild, type?.postSlugs || POST_SLUGS);
  const note = (door, content) => door?.send?.({ content, allowedMentions: { parse: [] } }).catch(() => {});
  const panelOf = (guild, channelId, room) => panelPayload({ type: typeOf(room.type), ownerId: room.ownerId, channelId,
    limit: room.limit, locked: room.locked, pomodoro: room.pomodoro || null, boardId: textChannel(guild, [BOARD_SLUG])?.id || null });

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
      const own = roomsOf(guild.id).find(([, room]) => room.ownerId === member.id);
      const ownChannel = own ? guild.channels.cache.get(own[0]) || null : null;
      if (own && !ownChannel) await closeRoom(guild, own[0], null); // deleted by someone else
      // The same door brings the owner back to their room; another door swaps it for the new type (owner report,
      // 2026-10-27: "Gw coba bikin lainnya tapi tetep bikin voice mabar").
      const back = async () => { if (ownChannel) await member.voice.setChannel(ownChannel).catch(() => {}); };
      if (ownChannel && own[1].type === type.key) { await back(); return; }
      if (now() - (lastCreated.get(member.id) || 0) < GAP) {
        await back();
        await note(door, `${member.displayName}, tunggu 30 detik dulu sebelum bikin room lagi ya.`); return;
      }
      if (roomsOf(guild.id).length - (ownChannel ? 1 : 0) >= MAX_ROOMS) {
        await back();
        await note(door, `Room voice lagi penuh (${MAX_ROOMS}). Coba lagi nanti ya.`); return;
      }
      if (!guild.members.me?.permissions?.has(NEEDS)) {
        await back();
        await report(guild, 'Hengs butuh izin Manage Channels, Move Members dan Manage Roles buat bikin room voice'); return;
      }
      if (ownChannel) {
        // The old room stays with whoever is still inside, or closes now when it is empty.
        const inside = humans(ownChannel).map(m => m.id).filter(id => id !== member.id);
        if (inside.length) {
          store.update(own[0], { ownerId: nextOwner(Object.fromEntries(inside.map(id => [id, joins.get(own[0])?.[id] || now()]))) });
          await refreshPanel(guild, own[0]);
        } else await closeRoom(guild, own[0], ownChannel);
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
        const panel = await room.send(panelOf(guild, room.id, store.get(room.id)));
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
    creditFocus(guild, channelId, [userId], now()); // before the join time is dropped
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
    store.remove(channelId); joins.delete(channelId); cancelEmpty(channelId); disarm(channelId);
    const timer = postTimers.get(channelId);
    if (timer) { clearTimer(timer); postTimers.delete(channelId); }
    if (room.postId) {
      try { await (await postChannel(guild, typeOf(room.type))?.messages.fetch(room.postId))?.delete(); } catch { /* already gone */ }
    }
    if (!channel) return;
    try { await channel.delete('Hengs: room kosong'); } catch (error) {
      logger.error('[voice-rooms] ROOM_DELETE_FAILED');
      await report(guild, 'room kosong belum bisa dihapus', error?.code || null);
    }
  }

  // Room posts: the first goes out at once; later changes are folded into one edit at most every 10 seconds.
  function schedulePost(guild, channelId) {
    if (postTimers.has(channelId)) return;
    postTimers.set(channelId, setTimer(() => { postTimers.delete(channelId); return syncPost(guild, channelId); }, POST_EVERY));
  }

  async function syncPost(guild, channelId) {
    const room = store.get(channelId); const type = room && typeOf(room.type);
    const target = postChannel(guild, type); const channel = guild.channels.cache.get(channelId);
    if (!type?.announce || !target || !channel) return;
    const content = postText({ type, ownerName: guild.members.cache.get(room.ownerId)?.displayName, channelId,
      count: humans(channel).length, limit: room.limit, locked: room.locked, status: room.pomodoro ? statusText(room.pomodoro) : null });
    try {
      if (room.postId) await (await target.messages.fetch(room.postId)).edit({ content, allowedMentions: { parse: [] } });
      else store.update(channelId, { postId: (await target.send({ content, allowedMentions: { parse: [] } })).id });
    } catch { logger.error('[voice-rooms] POST_FAILED'); }
  }

  async function refreshPanel(guild, channelId) {
    const room = store.get(channelId); const channel = guild.channels.cache.get(channelId);
    if (!room?.panelId || !channel) return;
    try { await (await channel.messages.fetch(room.panelId)).edit(panelOf(guild, channelId, room)); } catch { logger.error('[voice-rooms] PANEL_EDIT_FAILED'); }
  }

  // Pomodoro. Focus credit for `ids` up to `until`, into the session tally and the weekly board, one write each.
  function creditFocus(guild, channelId, ids, until) {
    const state = store.get(channelId)?.pomodoro;
    if (state?.phase !== 'fokus') return state;
    const map = joins.get(channelId) || {};
    const credits = Object.fromEntries(ids.map(id => [id, credit(map[id] ?? until, state.phaseStart, until)]).filter(([, s]) => s > 0));
    if (!Object.keys(credits).length) return state;
    const tally = { ...state.tally };
    for (const [id, seconds] of Object.entries(credits)) tally[id] = (tally[id] || 0) + seconds;
    store.update(channelId, { pomodoro: { ...state, tally } });
    try { stats.add(guild.id, credits, until); } catch { logger.error('[voice-rooms] STUDY_STATS_FAILED'); }
    return { ...state, tally };
  }

  function arm(guild, channelId, state) {
    disarm(channelId);
    phaseTimers.set(channelId, setTimer(() => { phaseTimers.delete(channelId); return phaseEnded(guild, channelId); },
      Math.max(0, state.endsAt - now())));
  }

  function disarm(channelId) {
    const timer = phaseTimers.get(channelId);
    if (timer) { clearTimer(timer); phaseTimers.delete(channelId); }
  }

  async function phaseEnded(guild, channelId) {
    const channel = guild.channels.cache.get(channelId); let state = store.get(channelId)?.pomodoro;
    if (!state || !channel) return;
    if (state.phase === 'fokus') state = creditFocus(guild, channelId, humans(channel).map(m => m.id), state.endsAt);
    await enter(guild, channelId, next(state));
  }

  // A new phase: store, timer, panel, one message that mentions only the members inside, and the room post.
  async function enter(guild, channelId, state, lead = '') {
    if (state.phase === 'selesai') { await finish(guild, channelId, state); return; }
    store.update(channelId, { pomodoro: state });
    arm(guild, channelId, state);
    await refreshPanel(guild, channelId);
    const channel = guild.channels.cache.get(channelId); const ids = humans(channel).map(m => m.id);
    await channel?.send({ content: `${lead}${alertText(state, ids)}`, allowedMentions: { users: ids } })
      .catch(() => logger.error('[voice-rooms] POMODORO_ALERT_FAILED'));
    schedulePost(guild, channelId);
  }

  async function finish(guild, channelId, state) {
    disarm(channelId);
    store.update(channelId, { pomodoro: null });
    await refreshPanel(guild, channelId);
    const names = Object.entries(state.tally).sort((a, b) => b[1] - a[1])
      .map(([id, seconds]) => [escapeMarkdown(clean(guild.members.cache.get(id)?.displayName) || 'Anggota'), seconds]);
    await guild.channels.cache.get(channelId)?.send({ content: summaryText(state, names), allowedMentions: { parse: [] } })
      .catch(() => logger.error('[voice-rooms] POMODORO_SUMMARY_FAILED'));
    schedulePost(guild, channelId);
  }

  // After a restart: a phase still running keeps its end; one that ended while Hengs was down moves on from now.
  async function resume(guild, channelId, state) {
    if (state.endsAt > now()) arm(guild, channelId, state);
    else await enter(guild, channelId, next({ ...state, endsAt: now() }), 'Hengs sempat restart, timer lanjut. ');
  }

  // The weekly board, from Monday 07:00 WIB: claimed first so a failure never repeats; the role moves before the post,
  // which names the new holders only when that worked.
  async function boardTick(client) {
    const at = now();
    if (at < Date.parse(`${weekOf(at)}T07:00:00+07:00`)) return;
    const monday = weekOf(at - WEEK);
    for (const guild of client.guilds.cache.values()) {
      if (isHome(guild) && stats.claimBoard(guild.id, monday)) await postBoard(guild, monday);
    }
  }

  async function postBoard(guild, monday) {
    const totals = stats.week(guild.id, monday);
    const total = Object.values(totals).reduce((sum, seconds) => sum + seconds, 0);
    const eligible = ranked(totals).map(row => row.user);
    let present = new Map();
    if (eligible.length) {
      try { present = await guild.members.fetch({ user: eligible }); } catch {
        await reportFailure(guild, { feature: 'Papan Rajin Belajar', reason: 'data anggota belum kebaca dari Discord, jadi papan minggu ini dilewati' });
        return;
      }
    }
    const rows = ranked(Object.fromEntries(Object.entries(totals).filter(([id]) => present.has(id))));
    const winners = rows.filter(row => row.rank === 1).map(row => present.get(row.user));
    const previous = stats.role(guild.id)?.holders || [];
    let roleTo = [];
    if (winners.length || previous.length) {
      try {
        const result = await rotateRole({ guild, name: 'Rajin Belajar', color: 0x2ECC71, reason: 'Hengs: papan Rajin Belajar mingguan',
          previous, winners });
        stats.setRole(guild.id, result); roleTo = result.holders;
      } catch {
        logger.error('[voice-rooms] STUDY_ROLE_FAILED');
        await reportFailure(guild, { feature: 'Role Rajin Belajar', reason: ROLE_REASON });
      }
    }
    if (!rows.length) return;
    const target = textChannel(guild, [BOARD_SLUG]);
    if (!target) {
      await reportFailure(guild, { feature: 'Papan Rajin Belajar', reason: 'channel 📚・belajar-bareng belum ada. Jalanin /admin setup > Bikin Room' });
      return;
    }
    try {
      await target.send({ content: boardText({ monday, rows, total, roleTo }), components: [boardRow(guild.id)], allowedMentions: { parse: [] } });
    } catch (error) {
      logger.error('[voice-rooms] BOARD_FAILED');
      await reportFailure(guild, { feature: 'Papan Rajin Belajar', reason: 'papan minggu ini belum bisa dikirim', code: error?.code || null });
    }
  }

  function myMinutes(guildId, userId) {
    const at = now(); const mine = stats.week(guildId, weekOf(at)); const rows = ranked(mine);
    return myMinutesText({ seconds: mine[userId] || 0, rank: rows.find(row => row.user === userId)?.rank || null, count: rows.length,
      lastSeconds: stats.week(guildId, weekOf(at - WEEK))[userId] || 0 });
  }

  async function handleInteraction(interaction) {
    const [, action, channelId] = String(interaction.customId || '').split(':');
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    // The Menitku button under the weekly board carries the server id, not a room.
    if (action === 'menitku') {
      await reply(channelId === interaction.guildId ? myMinutes(channelId, interaction.user.id) : 'Tombol ini udah nggak berlaku.');
      return true;
    }
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
    if (action === 'pomodoro') {
      if (!type.pomodoro) { await reply('Pomodoro cuma ada di room Belajar.'); return true; }
      if (room.pomodoro) { await reply('Pomodoro udah jalan. Stop dulu kalau mau ganti preset.'); return true; }
      const state = begin(interaction.values?.[0], now());
      if (!state) { await reply('Pilihan preset nggak dikenal.'); return true; }
      await enter(guild, channelId, state);
      await reply(`Pomodoro ${PRESETS[state.preset].label} jalan.`);
      return true;
    }
    if (action === 'pomodoro-stop') {
      if (!room.pomodoro) { await reply('Pomodoro lagi nggak jalan.'); return true; }
      await finish(guild, channelId, creditFocus(guild, channelId, humans(channel).map(m => m.id), now()));
      await reply('Pomodoro dihentiin.');
      return true;
    }
    await reply('Tombol ini udah nggak berlaku.');
    return true;
  }

  // After a restart: rooms whose channel is gone are dropped, empty rooms close, the rest go on with an owner inside and
  // their Pomodoro. Then the weekly board check, every 5 minutes from here.
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
      if (room.pomodoro) await resume(guild, channelId, room.pomodoro);
      if (typeOf(room.type)?.announce) await syncPost(guild, channelId);
    }
    const tick = () => boardTick(client).catch(() => logger.error('[voice-rooms] BOARD_TICK_FAILED'));
    await tick();
    repeat(tick, TICK_EVERY)?.unref?.();
  }

  return { handleVoiceState, handleInteraction, start };
}

module.exports = { createVoiceRooms };
