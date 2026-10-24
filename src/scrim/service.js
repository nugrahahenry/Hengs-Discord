'use strict';

// /scrim hasil: a Hengs Family member logs one MLBB game (opponent, win or loss reason, optional screenshot),
// checks the lineup in a private preview, then Hengs posts the card in hasil-scrim and records the game.
// /scrim rekap and /scrim statku read the games back: the team recap privately, per-player numbers only by DM.
// /scrim hapus undoes the requester's own last log; deleting one Hengs card in hasil-scrim drops its game too.
// Coach: a member mentioning Hengs in hasil-scrim, or asking /scrim tanya, gets the chat model with the notebook as data.
const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, PermissionFlagsBits: P, UserSelectMenuBuilder,
  escapeMarkdown,
} = require('discord.js');
const { MAX_LINEUP } = require('./store');
const { REASON_LABEL, cutUnits, opponentKey, whenLabel, todayScore, formatTeamRecap, formatPlayerStats } = require('./stats');
const { COACH_DAILY_LIMIT, coachContext, createCoachQuota } = require('./coach');

const PREFIX = 'hengs-scrim:';
const ROLE_NAME = 'Hengs Family';
const CHANNEL_NAME = '📸・hasil-scrim';
const CHANNEL_KEY = 'hasil-scrim';
const TTL = 10 * 60_000;
const MAX_DRAFTS = 100;
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
const IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const BOT_PERMISSIONS = [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.AttachFiles, P.EmbedLinks];
// One dropdown carries the result and, for a loss, the team's main reason: no extra step and no loss without a reason.
// Coach voice is Gen Z santai (W/L); the stored values stay the same, so older games keep reading.
const RESULT_CHOICES = Object.freeze([
  { name: 'W (menang)', value: 'menang' },
  { name: 'L: early game (lane, gank awal)', value: 'kalah-early' },
  { name: 'L: objective (turtle, lord, turret)', value: 'kalah-objective' },
  { name: 'L: teamfight (war, rotasi)', value: 'kalah-teamfight' },
  { name: 'L: draft (komposisi hero)', value: 'kalah-draft' },
  { name: 'L: lainnya (DC, lag, dll.)', value: 'kalah-lainnya' },
]);
const RESULTS = new Map(RESULT_CHOICES.map(({ value }) => [value, value === 'menang' ? ['menang', null] : ['kalah', value.slice(6)]]));
const MESSAGES = Object.freeze({
  SCRIM_ACCESS: 'Fitur scrim cuma ada di server utama Hengs.',
  SCRIM_ROLE_MISSING: 'Role Hengs Family belum ada. Minta admin jalanin /admin setup terus pilih Scrim tim.',
  SCRIM_CHANNEL_MISSING: 'Channel hasil-scrim belum ada. Minta admin jalanin /admin setup terus pilih Scrim tim.',
  SCRIM_ROLE_CONFLICT: 'Ada lebih dari satu role Hengs Family. Rapihin dulu biar Hengs nggak salah tebak.',
  SCRIM_CHANNEL_CONFLICT: 'Ada lebih dari satu channel hasil-scrim, atau namanya kepake jenis channel lain. Rapihin dulu ya.',
  SCRIM_CHANNEL_PUBLIC: 'Channel hasil-scrim masih bisa dilihat semua member. Minta admin jalanin /admin setup terus pilih Scrim tim biar privat lagi.',
  SCRIM_NOT_TEAM: 'Fitur scrim khusus anggota role Hengs Family. Minta admin kasih role-nya dulu ya.',
  SCRIM_FIELDS_INVALID: 'Lawan wajib diisi dan hasilnya dipilih dari daftar ya.',
  SCRIM_IMAGE_INVALID: 'SS harus gambar PNG, JPG atau WebP, maksimal 8 MB.',
  SCRIM_BOT_PERMISSIONS: 'Hengs butuh izin lihat, baca riwayat, kirim, lampirkan file dan embed di hasil-scrim.',
  SCRIM_STALE: 'Preview-nya udah basi atau berubah. Jalanin /scrim hasil lagi ya, belum ada yang kekirim.',
  SCRIM_DELETE_STALE: 'Konfirmasi hapusnya udah basi atau berubah. Jalanin /scrim hapus lagi ya, belum ada yang kehapus.',
  SCRIM_BUSY: 'Kiriman sebelumnya masih diproses, sabar bentar ya.',
  SCRIM_LIMIT: 'Lagi banyak preview yang kebuka. Coba lagi bentar lagi.',
  COACH_QUOTA: `Jatah ngobrol sama coach hari ini udah habis (${COACH_DAILY_LIMIT} pertanyaan). Lanjut besok ya.`,
});
const quiet = { allowedMentions: { parse: [] } };
const { slugOf: normalize } = require('../guilds/channel-style');
// Control and format characters (zero-width, bidi), angle brackets and @ never reach a post.
const clean = (value, max) => cutUnits(String(value ?? '').replace(/[\p{Cc}\p{Cf}<>@]/gu, ' ').replace(/\s+/g, ' ').trim(), max);
const shown = value => escapeMarkdown(value);

// Like the channel, the role may carry an emoji prefix ("🫂 Hengs Family"); two candidates still conflict.
function teamRoleIn(roles) {
  const matches = [...roles.values()].filter(role => normalize(role?.name) === normalize(ROLE_NAME));
  if (matches.length > 1) throw new Error('SCRIM_ROLE_CONFLICT');
  return matches[0] || null;
}

async function findTeamRole(guild) {
  return teamRoleIn(await guild.roles.fetch());
}

function findScrimChannel(channels) {
  const matches = channels.filter(channel => normalize(channel?.name) === CHANNEL_KEY);
  if (matches.length > 1 || (matches[0] && matches[0].type !== ChannelType.GuildText)) throw new Error('SCRIM_CHANNEL_CONFLICT');
  return matches[0] || null;
}

// GuildMember (roles.cache) or the raw API member a select interaction may carry (roles: [ids]).
const hasRole = (member, roleId) => (Array.isArray(member?.roles) ? member.roles.includes(roleId) : Boolean(member?.roles?.cache?.has(roleId)));

function readImage(attachment) {
  let url;
  try { url = new URL(attachment.url); } catch { throw new Error('SCRIM_IMAGE_INVALID'); }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname) || !IMAGE_TYPES.has(attachment.contentType)
    || !Number.isInteger(attachment.size) || attachment.size <= 0 || attachment.size > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
  return { url: url.href, type: attachment.contentType };
}

function readSubmission(options) {
  const opponent = clean(options.getString('lawan', true), 60);
  const result = RESULTS.get(options.getString('hasil', true));
  const note = clean(options.getString('catatan') || '', 300);
  if (!opponent || !result) throw new Error('SCRIM_FIELDS_INVALID');
  const attachment = options.getAttachment('ss');
  return { opponent, outcome: result[0], reason: result[1], note, image: attachment ? readImage(attachment) : null };
}

function card(draft, userId, score) {
  const result = draft.outcome === 'menang' ? 'W' : `L (${REASON_LABEL[draft.reason]})`;
  return [`🎮 **MLBB vs ${shown(draft.opponent)}: ${result}**`, `Skor hari ini vs mereka: ${score.won}-${score.lost}`,
    `Lineup: ${draft.lineup.length ? draft.lineup.map(id => `<@${id}>`).join(' ') : 'belum dipilih'}`,
    `Dicatat sama <@${userId}>`, draft.note ? `Catatan: ${shown(draft.note)}` : null].filter(Boolean).join('\n');
}

function previewPayload(draft, userId, notice = null) {
  const lineup = new UserSelectMenuBuilder().setCustomId(`${PREFIX}${draft.id}:lineup`)
    .setPlaceholder('Lineup game ini (maks 5, anggota Hengs Family)').setMinValues(0).setMaxValues(MAX_LINEUP);
  if (draft.lineup.length) lineup.setDefaultUsers(draft.lineup);
  return { content: [card(draft, userId, draft.score), `Tujuan: <#${draft.target}>`, notice,
    '-# Cuma kamu yang lihat. Cek lineup, terus Kirim. Hangus 10 menit, belum kekirim apa-apa.'].filter(Boolean).join('\n'),
  embeds: draft.image ? [{ image: { url: draft.image.url } }] : [],
  components: [new ActionRowBuilder().addComponents(lineup), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}${draft.id}:send`).setLabel('Kirim ke hasil-scrim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PREFIX}${draft.id}:cancel`).setLabel('Batal').setStyle(ButtonStyle.Secondary),
  )], ...quiet };
}

function removalPayload(game, pendingId) {
  const result = game.outcome === 'menang' ? 'W' : `L (${REASON_LABEL[game.reason]})`;
  return { content: ['🗑️ **Hapus game terakhir yang kamu catat?**', `MLBB vs ${shown(game.opponent)}: ${result}, ${whenLabel(game.at)}`,
    `Lineup: ${game.lineup.length ? game.lineup.map(id => `<@${id}>`).join(' ') : 'belum dipilih'}`,
    game.note ? `Catatan: ${shown(game.note)}` : null,
    '-# Cuma kamu yang lihat. Hangus 10 menit. Kalau dihapus, kartunya di hasil-scrim ikut ditarik.'].filter(Boolean).join('\n'),
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}${pendingId}:delete`).setLabel('Hapus game ini').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${PREFIX}${pendingId}:keep`).setLabel('Batal').setStyle(ButtonStyle.Secondary),
  )], ...quiet };
}

const answer = (i, content) => (i.deferred || i.replied
  ? i.editReply({ content, embeds: [], components: [], ...quiet })
  : i.reply({ content, flags: MessageFlags.Ephemeral, ...quiet }));

function createScrimResults({ store, agent = null, fetchImpl = fetch, now = Date.now, logger = console } = {}) {
  const drafts = new Map();
  const quota = createCoachQuota({ now });
  const removals = new Map(); // pending /scrim hapus confirmations, same key and TTL as drafts
  const busy = new Set();
  const keyFor = i => `${i.guildId}:${i.user?.id}`;
  function sweep() {
    for (const pending of [drafts, removals]) for (const [key, item] of pending) if (now() >= item.expires) pending.delete(key);
  }
  const reply = (i, code) => i.reply({ content: MESSAGES[code] || MESSAGES.SCRIM_STALE, flags: MessageFlags.Ephemeral, ...quiet });
  const home = (i, guildAccess) => guildAccess?.classify(i.guildId)?.kind === 'home';

  // Re-read role, member, channel and permissions from Discord; names are the setup contract.
  async function teamMember(i) {
    if (!i.guild || i.guild.id !== i.guildId || !i.user?.id || i.user.bot) throw new Error('SCRIM_ACCESS');
    const role = await findTeamRole(i.guild);
    if (!role) throw new Error('SCRIM_ROLE_MISSING');
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (member?.id !== i.user.id || !hasRole(member, role.id)) throw new Error('SCRIM_NOT_TEAM');
    return role;
  }

  async function destination(i) {
    const role = await teamMember(i);
    const channel = findScrimChannel([...(await i.guild.channels.fetch()).values()]);
    if (!channel) throw new Error('SCRIM_CHANNEL_MISSING');
    // Cards carry the lineup and team notes: never post them where every member can read. Unknown counts as public.
    const everyone = channel.permissionsFor(i.guild.roles.everyone);
    if (!everyone || everyone.has(P.ViewChannel)) throw new Error('SCRIM_CHANNEL_PUBLIC');
    if (!channel.permissionsFor(await i.guild.members.fetchMe({ force: true }))?.has(BOT_PERMISSIONS)) throw new Error('SCRIM_BOT_PERMISSIONS');
    return { role, channel };
  }

  // Prefill only people who still hold the team role; a slow or failed lookup just leaves the lineup empty.
  async function teamOnly(guild, roleId, ids) {
    if (!ids.length) return [];
    try {
      const members = await guild.members.fetch({ user: ids, time: 5_000 });
      return ids.filter(id => hasRole(members.get(id), roleId));
    } catch { return []; }
  }

  // Second step of /scrim hapus. The row goes first (the recap must stop counting it), then the card, best effort.
  async function confirmRemoval(i, key, match, select) {
    const pending = removals.get(key);
    if (select || !pending || pending.id !== match[1] || pending.source !== i.channelId) {
      await reply(i, 'SCRIM_DELETE_STALE');
      return true;
    }
    // Consume before awaiting Discord so a double click can never delete twice.
    removals.delete(key);
    busy.add(key);
    try {
      await i.deferUpdate();
      if (match[2] === 'keep') {
        await i.editReply({ content: 'Oke, nggak jadi dihapus. Game-nya tetap ada di rekap.', embeds: [], components: [], ...quiet });
        return true;
      }
      await teamMember(i);
      if (now() >= pending.expires) throw new Error('SCRIM_DELETE_STALE');
      const owned = store.list(i.guildId).some(game => game.messageId === pending.messageId && game.submitterId === i.user.id);
      if (!owned || !store.remove(i.guildId, pending.messageId)) {
        await i.editReply({ content: 'Game itu udah nggak ada di rekap (mungkin udah dihapus). Nggak ada yang berubah.', embeds: [], components: [], ...quiet });
        return true;
      }
      let cardGone = true;
      try {
        const channel = findScrimChannel([...(await i.guild.channels.fetch()).values()]);
        if (channel) await channel.messages.delete(pending.messageId);
      } catch (error) {
        if (error?.code !== 10008) { cardGone = false; logger.error('[scrim] CARD_DELETE_FAILED'); } // 10008: card already gone
      }
      await i.editReply({ content: cardGone ? 'Beres, game itu udah dihapus dari rekap dan kartunya di hasil-scrim ikut ditarik.'
        : 'Game itu udah dihapus dari rekap, tapi kartunya di hasil-scrim belum bisa ditarik. Minta admin hapus manual ya.',
      embeds: [], components: [], ...quiet });
    } catch (error) {
      logger.error('[scrim] REMOVE_FAILED');
      await answer(i, MESSAGES[error.message] || 'Hapus game belum berhasil. Cek rekap dulu ya, Hengs nggak nyoba ulang otomatis.');
    } finally { busy.delete(key); }
    return true;
  }

  // One coach turn: data card from the notebook, one chat call, and the reply checked before it is stored or shown.
  // A personal turn (/scrim tanya) adds the asker's own stats and keeps no history. Only a real model answer
  // (the guard ran) costs a question; cooldown and outage replies are free.
  async function coachReply({ guildId, userId, text, personal = false }) {
    let answered = false;
    const { question, context } = coachContext(store.list(guildId), { text, userId: personal ? userId : null, now: now(),
      onGuard(answer, checked) {
        answered = true;
        if (checked.masked) logger.error('[scrim] COACH_REPLY_MASKED');
      } });
    const reply = await agent.chat(question, agent.buildConversationKey(guildId, userId), context);
    if (answered) quota.spend(userId);
    return reply;
  }

  async function download(image) {
    const response = await fetchImpl(image.url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim();
    if (!response.ok || type !== image.type || Number(response.headers?.get?.('content-length') || 0) > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE) throw new Error('SCRIM_IMAGE_INVALID');
    return buffer;
  }

  return {
    async preview(i, { guildAccess } = {}) {
      if (!home(i, guildAccess)) return reply(i, 'SCRIM_ACCESS');
      sweep();
      const key = keyFor(i);
      if (busy.has(key)) return reply(i, 'SCRIM_BUSY');
      if (drafts.size >= MAX_DRAFTS && !drafts.has(key)) return reply(i, 'SCRIM_LIMIT');
      drafts.delete(key);
      try {
        const submission = readSubmission(i.options);
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        const { role, channel } = await destination(i);
        const games = store.list(i.guildId);
        const lastLineup = games.findLast(game => game.lineup.length)?.lineup || [];
        const draft = { ...submission, id: crypto.randomBytes(12).toString('hex'), source: i.channelId, target: channel.id,
          roleId: role.id, lineup: await teamOnly(i.guild, role.id, lastLineup), expires: now() + TTL };
        draft.score = todayScore([...games, { ...draft, at: now() }], draft.opponent, now());
        drafts.set(key, draft);
        await i.editReply(previewPayload(draft, i.user.id));
      } catch (error) {
        logger.error('[scrim] PREVIEW_FAILED');
        drafts.delete(key);
        await answer(i, MESSAGES[error.message] || 'Preview belum bisa dibuat, coba lagi bentar. Belum ada yang kekirim.');
      }
    },

    // Buttons (Kirim, Batal) and the lineup user select on the private preview.
    async handleComponent(i) {
      const select = Boolean(i.isUserSelectMenu?.());
      if ((!select && !i.isButton?.()) || !String(i.customId).startsWith(PREFIX)) return false;
      sweep();
      const key = keyFor(i);
      // A second click while Kirim is still posting must not read as "nothing was sent".
      if (busy.has(key)) {
        await reply(i, 'SCRIM_BUSY');
        return true;
      }
      const match = /^hengs-scrim:([a-f0-9]{24}):(send|cancel|lineup|delete|keep)$/.exec(i.customId);
      if (match && (match[2] === 'delete' || match[2] === 'keep')) return confirmRemoval(i, key, match, select);
      const draft = drafts.get(key);
      if (!match || !draft || draft.id !== match[1] || draft.source !== i.channelId || (match[2] === 'lineup') !== select) {
        await reply(i, 'SCRIM_STALE');
        return true;
      }
      if (select) {
        const picked = [...new Set(i.values)];
        draft.lineup = picked.filter(id => hasRole(i.members?.get(id), draft.roleId)).slice(0, MAX_LINEUP);
        const ignored = picked.length - draft.lineup.length;
        try { await i.update(previewPayload(draft, i.user.id, ignored ? `${ignored} pilihan di-skip karena bukan Hengs Family.` : null)); }
        catch { logger.error('[scrim] LINEUP_FAILED'); }
        return true;
      }
      // Consume before awaiting Discord so a double click can never post twice.
      drafts.delete(key);
      busy.add(key);
      let dispatched = false;
      try {
        await i.deferUpdate();
        if (match[2] === 'cancel') {
          await i.editReply({ content: 'Oke, dibatalin. Nggak ada yang kekirim.', embeds: [], components: [], ...quiet });
          return true;
        }
        const { channel } = await destination(i);
        if (channel.id !== draft.target || now() >= draft.expires) throw new Error('SCRIM_STALE');
        const games = store.list(i.guildId);
        const buffer = draft.image ? await download(draft.image) : null;
        const at = now();
        const nonce = BigInt(`0x${crypto.createHash('sha256').update(`${PREFIX}${i.id}:${draft.id}`).digest('hex').slice(0, 16)}`).toString();
        dispatched = true;
        const sent = await channel.send({
          content: `${card(draft, i.user.id, todayScore([...games, { ...draft, at }], draft.opponent, at))}\n-# Dicatat lewat /scrim hasil`,
          files: buffer ? [{ attachment: buffer, name: `hasil-scrim.${IMAGE_TYPES.get(draft.image.type)}` }] : [],
          nonce, enforceNonce: true, ...quiet });
        try {
          store.add(i.guildId, { messageId: sent.id, at, submitterId: i.user.id, opponent: draft.opponent,
            outcome: draft.outcome, reason: draft.reason, lineup: draft.lineup, note: draft.note });
        } catch {
          logger.error('[scrim] RECORD_FAILED');
          await i.editReply({ content: `Hasil game udah kekirim ke <#${channel.id}>, tapi belum kesimpan buat rekap. Kabarin admin ya, Hengs nggak nyoba ulang otomatis.`, embeds: [], components: [], ...quiet });
          return true;
        }
        await i.editReply({ content: `Beres, hasil game udah masuk <#${channel.id}> dan kecatat buat rekap tim.`, embeds: [], components: [], ...quiet });
      } catch (error) {
        logger.error('[scrim] SEND_FAILED');
        await answer(i, dispatched ? 'Hasil kiriman belum bisa dipastiin. Cek hasil-scrim dulu ya, Hengs nggak nyoba ulang otomatis.'
          : MESSAGES[error.message] || 'Hasil scrim belum kekirim. Cek channel hasil-scrim dulu ya, Hengs nggak nyoba ulang otomatis.');
      } finally { busy.delete(key); }
      return true;
    },

    async recap(i, { guildAccess } = {}) {
      if (!home(i, guildAccess)) return reply(i, 'SCRIM_ACCESS');
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await teamMember(i);
        const opponent = clean(i.options.getString('lawan') || '', 60) || null;
        await i.editReply({ content: formatTeamRecap(store.list(i.guildId), { opponent, now: now() }), ...quiet });
      } catch (error) {
        logger.error('[scrim] RECAP_FAILED');
        await answer(i, MESSAGES[error.message] || 'Rekap scrim belum bisa dibuat. Coba lagi nanti ya.');
      }
    },

    // Per-player numbers only ever go to that player's DM; a closed DM gets instructions, never the numbers.
    async stats(i, { guildAccess } = {}) {
      if (!home(i, guildAccess)) return reply(i, 'SCRIM_ACCESS');
      let content;
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await teamMember(i);
        content = formatPlayerStats(store.list(i.guildId), i.user.id, { now: now() });
      } catch (error) {
        logger.error('[scrim] STATS_FAILED');
        return answer(i, MESSAGES[error.message] || 'Stat scrim belum bisa dibuat. Coba lagi nanti ya.');
      }
      try { await i.user.send({ content, ...quiet }); } catch {
        logger.error('[scrim] DM_FAILED');
        return answer(i, 'Hengs belum bisa DM kamu. Izinin DM dari member server ini di pengaturan privasi server, terus jalanin /scrim statku lagi.');
      }
      return answer(i, 'Stat scrim kamu udah dikirim lewat DM. Cuma kamu yang bisa lihat.');
    },

    // Opponent names are team data too: only Hengs Family members get suggestions. The cached role keeps this
    // inside Discord's 3-second autocomplete window (no REST call per keystroke).
    async autocomplete(i) {
      try {
        const role = teamRoleIn(i.guild.roles.cache);
        if (!role || !hasRole(i.member, role.id)) return await i.respond([]);
        const typed = opponentKey(clean(i.options.getFocused(), 60));
        const names = new Map();
        for (const game of store.list(i.guildId).reverse()) {
          const key = opponentKey(game.opponent);
          if (key.includes(typed) && !names.has(key)) names.set(key, game.opponent);
        }
        await i.respond([...names.values()].slice(0, 25).map(name => ({ name, value: name })));
      } catch {
        logger.error('[scrim] AUTOCOMPLETE_FAILED');
        await i.respond([]).catch(() => {});
      }
    },

    // /scrim hapus: own last game only, private preview, then Hapus or Batal (confirmRemoval).
    async remove(i, { guildAccess } = {}) {
      if (!home(i, guildAccess)) return reply(i, 'SCRIM_ACCESS');
      sweep();
      const key = keyFor(i);
      if (busy.has(key)) return reply(i, 'SCRIM_BUSY');
      if (removals.size >= MAX_DRAFTS && !removals.has(key)) return reply(i, 'SCRIM_LIMIT');
      removals.delete(key);
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await teamMember(i);
        const game = store.list(i.guildId).findLast(item => item.submitterId === i.user.id);
        if (!game) return await answer(i, 'Belum ada game yang kamu catat, jadi nggak ada yang bisa dihapus.');
        const pending = { id: crypto.randomBytes(12).toString('hex'), messageId: game.messageId, source: i.channelId, expires: now() + TTL };
        removals.set(key, pending);
        await i.editReply(removalPayload(game, pending.id));
      } catch (error) {
        logger.error('[scrim] REMOVE_PREVIEW_FAILED');
        removals.delete(key);
        await answer(i, MESSAGES[error.message] || 'Belum bisa nyiapin hapus game. Coba lagi bentar ya, belum ada yang kehapus.');
      }
    },

    // A Hengs Family member mentioning Hengs in hasil-scrim talks to the coach. Anyone else, or anywhere else, gets the
    // normal Hengs chat (false), which never sees the notebook.
    async coach(msg, text) {
      const here = msg.channel;
      const named = [here?.name, here?.parent?.name].some(name => normalize(name ?? '') === CHANNEL_KEY);
      if (!agent || msg.author?.bot || !msg.guild || !named) return false;
      let content;
      try {
        // Same checks as posting a card: team role, the one real hasil-scrim, private, bot permissions. A thread inside
        // it is fine; a look-alike name anywhere else is not.
        const { channel } = await destination({ guild: msg.guild, guildId: msg.guildId, user: msg.author });
        if (msg.channelId !== channel.id && here.parentId !== channel.id) return false;
        if (!quota.allows(msg.author.id)) content = MESSAGES.COACH_QUOTA;
        else {
          here.sendTyping?.().catch(() => {});
          content = await coachReply({ guildId: msg.guildId, userId: msg.author.id, text });
        }
      } catch (error) {
        // Outside the team (or no team yet): normal Hengs chat, which never sees the notebook. Any other failure answers
        // here, so a team question never falls back to shared chat.
        if (error.message === 'SCRIM_NOT_TEAM' || error.message === 'SCRIM_ROLE_MISSING') return false;
        logger.error('[scrim] COACH_FAILED');
        content = MESSAGES[error.message] || 'Coach lagi error, coba lagi bentar ya.';
      }
      await msg.reply({ content, ...quiet }).catch(() => logger.error('[scrim] COACH_REPLY_FAILED'));
      return true;
    },

    // /scrim tanya: one private question, team recap plus the asker's own stats, no history kept.
    async ask(i, { guildAccess } = {}) {
      if (!agent || !home(i, guildAccess)) return reply(i, 'SCRIM_ACCESS');
      try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await teamMember(i);
        const text = clean(i.options.getString('pertanyaan', true), 500);
        if (!text) return await answer(i, 'Tulis pertanyaannya dulu ya.');
        if (!quota.allows(i.user.id)) return await answer(i, MESSAGES.COACH_QUOTA);
        await answer(i, await coachReply({ guildId: i.guildId, userId: i.user.id, text, personal: true }));
      } catch (error) {
        logger.error('[scrim] COACH_ASK_FAILED');
        await answer(i, MESSAGES[error.message] || 'Coach belum bisa jawab, coba lagi bentar ya.');
      }
    },

    // A Hengs card deleted in hasil-scrim (by an admin, or by /scrim hapus) drops its game, so the recap never counts
    // a card that is gone. Bulk purges are not wired here on purpose: cleaning the channel must not wipe the notebook.
    forget(message) {
      if (!message?.guildId || normalize(message.channel?.name) !== CHANNEL_KEY) return false;
      return store.remove(message.guildId, message.id);
    },
  };
}

module.exports = { PREFIX, ROLE_NAME, CHANNEL_NAME, CHANNEL_KEY, BOT_PERMISSIONS, MESSAGES, RESULT_CHOICES,
  findTeamRole, findScrimChannel, readSubmission, createScrimResults };
