'use strict';

// Hengs Analis: watches Liquipedia pages, posts one card per finished series in #hengs-analis, keeps the card in step
// with Liquipedia for 72 hours and tells the server owner when a member flags it with ⚠️. On match days it also posts
// a morning preview per match with member predictions, a night recap and, after the grand final, an event recap. The
// predictions feed Liga Tebak: points per event, standings in the recaps, and a champion with a role and a card draft.
const fs = require('node:fs');
const path = require('node:path');
const { ChannelType, MessageFlags } = require('discord.js');
const { createEsportsStore } = require('./store');
const { createLiquipedia } = require('./liquipedia');
const { parseMatches, matchHash } = require('./wikitext');
const { renderSeriesCard } = require('./card');
const { renderPreviewCard, renderListCard } = require('./daily-cards');
const { draftData, draftable, renderDraftCard } = require('./draft-card');
const { seriesPayload, guidePayload, previewPayload, listPayload, ligaRows, pageUrl, REACTIONS, isWarning, VOTE_PREFIX,
  LIGA_PREFIX } = require('./presentation');
const { WATCH, DISCOVER, discoveredEntries } = require('./watch');
const { wibDay, wibMinutes, previousDay, matchesOf, dayMatches, featured, eventState } = require('./schedule');
const { voteKey } = require('./predictions');
const { hotMatchIds, pointsFor, standings, champions, rankOf, championCard } = require('./league');
const { wibTime, cleanName, previewData, previewCaption, previewHash, compactData, compactCaption, dayRecapData, dayCaption,
  eventRecapData, eventCaption, factsOf, analisCard } = require('./daily');

const MIN = 60_000; const HOUR = 60 * MIN; const DAY_MS = 24 * HOUR;
const LIVE_EVERY = 20 * MIN; const IDLE_EVERY = 3 * HOUR;
const POST_WINDOW = 36 * HOUR; const KEEP_IN_STEP = 72 * HOUR; const LIVE_WINDOW = 12 * HOUR;
const MAX_POSTS_PER_TICK = 3;
// WIB minutes: one fresh check from 07:30, previews from 08:00, the night recap at the latest 23:30.
const PREP_AT = 7 * 60 + 30; const PREVIEW_AT = 8 * 60; const RECAP_LATEST = 23 * 60 + 30;
const BANNER = path.join(__dirname, '../../assets/esports/guide-banner.png');
const { slugOf: normalize } = require('../guilds/channel-style');
const { rotateRole } = require('../utils/rotating-role');
const { NOBAR_ID, reminderDue, reminderText, pingIds, nobarRow, NOBAR_REPLIES } = require('./nobar');

async function defaultBanner() {
  try { return fs.statSync(BANNER).isFile() ? fs.readFileSync(BANNER) : null; } catch { return null; }
}

function createEsportsService({ guildAccess, store = createEsportsStore(), liquipedia = createLiquipedia(),
  render = renderSeriesCard, renderPreview = renderPreviewCard, renderList = renderListCard, renderDraft = renderDraftCard,
  now = Date.now, logger = console,
  watch = WATCH, discover = watch === WATCH, loadBanner = defaultBanner, reportFailure = async () => {}, commentator = null,
  draftAppreciation = null, nobarRooms = () => [], onResult = null } = {}) {
  let client = null; let running = false; let timer = null;
  const watchlist = () => (discover ? [...watch, ...store.discovered()] : watch);
  const leagueOf = page => watchlist().find(w => w.title === page)?.league || '';
  const teamNames = all => [...new Set(all.flatMap(m => m.teams.flatMap(t => [t.name, t.ticker])).filter(Boolean))];

  // The caster's line for a card, or null so the template caption stands.
  async function line(kind, data, all) {
    if (!commentator) return null;
    try { return await commentator.caption(kind, factsOf(data), { teams: teamNames(all) }); } catch { return null; }
  }

  function due(pages) {
    const live = Object.values(pages).flatMap(p => p.matches || [])
      .some(m => !m.finished && m.startAt && m.startAt <= now() && now() - m.startAt <= LIVE_WINDOW);
    // From 07:30 WIB one check before the 08:00 preview, so it never reads a three-hour-old schedule.
    const minutes = wibMinutes(now());
    const prep = minutes >= PREP_AT && minutes < PREVIEW_AT && now() - store.lastCheck() > (minutes - PREP_AT) * MIN;
    return prep || now() - store.lastCheck() >= (live ? LIVE_EVERY : IDLE_EVERY);
  }

  // Once a day: find new stage pages of watched championships (one prefix search per rule).
  async function discoverPages() {
    if (!discover || now() - store.lastDiscovery() < DAY_MS) return;
    const found = [];
    try {
      const titles = [];
      for (const rule of DISCOVER) titles.push(...await liquipedia.prefixSearch(rule.prefix));
      found.push(...discoveredEntries(titles, watchlist()));
    } catch { logger.error('[esports] ESPORTS_DISCOVERY_FAILED'); }
    store.saveDiscovered(found, now());
  }

  // One revisions request; page content only where the revision changed. A failure still counts as a check.
  async function refresh(pages) {
    await discoverPages();
    const titles = watchlist().map(w => w.title);
    try {
      const revisions = await liquipedia.revisions(titles);
      const next = Object.fromEntries(Object.entries(pages).filter(([title]) => titles.includes(title)));
      const changed = revisions.filter(r => !r.missing && next[r.title]?.revid !== r.revid).map(r => r.title);
      if (changed.length) {
        for (const page of await liquipedia.contents(changed)) {
          if (!page.missing) next[page.title] = { revid: page.revid, matches: parseMatches(page.content, { page: page.title }) };
        }
      }
      store.savePages(next, now());
      return next;
    } catch (error) {
      store.savePages(pages, now());
      throw error;
    }
  }

  function channelFor(guild) {
    const matches = [...guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildText && normalize(c.name) === 'hengs-analis');
    return matches.length === 1 ? matches[0] : null;
  }

  // One broadcast-style draft card per game with a complete draft; a failed render only drops that image.
  async function draftsFor(match, league) {
    const out = [];
    for (const index of draftable(match)) {
      try {
        const data = draftData(match, index, { league });
        out.push({ name: `hengs-draft-${data.number}.png`, png: await renderDraft(data),
          description: `Draft ${data.game}: ${data.sides.map(s => `${s.ticker} ${s.picks.map(p => p.name).join(', ')}`).join(' vs ')}` });
      } catch { logger.error('[esports] ESPORTS_DRAFT_RENDER_FAILED'); }
    }
    return out;
  }

  async function post(guild, channel, match) {
    const hash = matchHash(match);
    store.claim(guild.id, match.id, { hash });
    let message;
    try {
      const league = leagueOf(match.page);
      message = await channel.send(seriesPayload(match, { league }, await render(match, { league }), { drafts: await draftsFor(match, league) }));
    } catch (error) {
      store.finish(guild.id, match.id, { status: 'failed' });
      logger.error('[esports] ESPORTS_SEND_FAILED');
      await reportFailure(guild, { feature: 'Kartu Analis', channel, code: error?.code || null });
      return;
    }
    store.finish(guild.id, match.id, { status: 'sent', messageId: message.id, channelId: channel.id });
    for (const emoji of REACTIONS) {
      try { await message.react(emoji); } catch { logger.error('[esports] ESPORTS_REACT_FAILED'); break; }
    }
    await notable(guild, match);
  }

  // A notable finished MPL or M-series result becomes meme material for Hengs Memes (owner request, 2026-10-30: "kalau
  // menang atau kalah ada memes nya"): a sweep, an upset against most Liga Tebak guesses, a grand final, or a comeback
  // from 0-2. Team names only; the meme writer has its own rules.
  async function notable(guild, match) {
    const entry = watchlist().find(w => w.title === match.page);
    if (!onResult || !entry?.event || !/^(MPL\/|M\d)/.test(entry.family || '') || ![1, 2].includes(match.winner)) return;
    const [winner, loser] = match.winner === 2 ? [match.teams[1], match.teams[0]] : match.teams;
    const [won, lost] = match.winner === 2 ? [match.score[1], match.score[0]] : match.score;
    const votes = Object.values(store.votes(guild.id, match.id));
    const flags = { sweep: lost === 0, upset: votes.length >= 3 && votes.filter(team => team !== match.winner).length / votes.length > 0.6,
      final: /grand final/i.test(match.stage || ''), comeback: (match.games || []).length >= 3
        && match.games.slice(0, 2).every(game => game.winner && game.winner !== match.winner) };
    if (!Object.values(flags).some(Boolean)) return;
    try { await onResult(guild, { id: match.id, event: entry.league, winner: winner.name, loser: loser.name, score: [won, lost], flags }); } catch {
      logger.error('[esports] RESULT_MEME_FAILED');
    }
  }

  // Within 72 hours: follow Liquipedia corrections, and pass a member's ⚠️ on to the owner once.
  async function keepInStep(guild, channel, pages) {
    const byId = new Map(Object.values(pages).flatMap(p => p.matches || []).map(m => [m.id, m]));
    for (const sent of store.recent(guild.id, KEEP_IN_STEP)) {
      const match = byId.get(sent.id);
      let message;
      try { message = await channel.messages.fetch({ message: sent.messageId, force: true }); } catch { continue; }
      if (match?.finished && match.valid && matchHash(match) !== sent.hash) {
        try {
          const league = leagueOf(match.page);
          await message.edit(seriesPayload(match, { league }, await render(match, { league }),
            { updatedAt: now(), drafts: await draftsFor(match, league) }));
          store.update(guild.id, sent.id, { hash: matchHash(match) });
        } catch { logger.error('[esports] ESPORTS_EDIT_FAILED'); }
      }
      if (sent.reported) continue;
      const flagged = [...(message.reactions?.cache?.values?.() || [])]
        .some(r => isWarning(r?.emoji?.name) && Number(r.count || 0) - (r.me ? 1 : 0) > 0);
      if (!flagged) continue;
      store.update(guild.id, sent.id, { reported: true });
      try {
        const [a, b] = match?.teams || [{ name: '?' }, { name: '?' }];
        const owner = await guild.fetchOwner();
        await owner.send({ content: [`⚠️ Ada anggota yang melaporkan data salah di kartu Hengs Analis: ${a.name} vs ${b.name}${match?.stage ? ` (${match.stage})` : ''}.`,
          'Data Liquipedia saat ini sudah sama dengan kartu, jadi kalau memang salah, kemungkinan Liquipedia belum dikoreksi.',
          `Kartu: ${message.url}`, match ? `Sumber: ${pageUrl(match.page)}` : ''].filter(Boolean).join('\n'), allowedMentions: { parse: [] } });
      } catch { logger.error('[esports] ESPORTS_REPORT_DM_FAILED'); }
    }
  }

  // Claimed before the send; a failure is logged, reported in bot-settings and never retried.
  async function send(guild, channel, feature, key, build) {
    try {
      const message = await channel.send(await build());
      store.updateDaily(guild.id, key, { messageIds: [message.id] });
    } catch (error) {
      logger.error('[esports] ESPORTS_DAILY_SEND_FAILED');
      await reportFailure(guild, { feature, channel, code: error?.code || null });
    }
  }

  async function previews(guild, channel, all, today, day) {
    const picked = featured(today);
    if (today.length > picked.length && !store.daily(guild.id, `compact:${day}`)) {
      store.claimDaily(guild.id, `compact:${day}`);
      const ids = new Set(picked.map(m => m.id));
      await send(guild, channel, 'Jadwal Analis', `compact:${day}`,
        async () => listPayload(await renderList(compactData(today, day, ids)), `Jadwal ${day}`, compactCaption(today, day)));
    }
    for (const match of picked) {
      const key = `preview:${match.id}`; const hash = previewHash(match); const claim = store.daily(guild.id, key);
      const build = async () => {
        const data = previewData(match, all);
        return previewPayload(match, await renderPreview(data),
          { key: voteKey(match.id), caption: previewCaption(match, await line('preview', data, all)) });
      };
      if (!claim) {
        if (match.startAt <= now()) continue;
        store.claimDaily(guild.id, key, { hash });
        await send(guild, channel, 'Preview Analis', key, build);
      } else if (claim.hash !== hash && claim.messageIds?.[0] && match.startAt > now()) {
        try {
          const message = await channel.messages.fetch({ message: claim.messageIds[0], force: true });
          await message.edit(await build());
          store.updateDaily(guild.id, key, { hash });
        } catch { logger.error('[esports] ESPORTS_PREVIEW_EDIT_FAILED'); }
      }
    }
  }

  // Kickoff reminder (owner request, 2026-10-30, MPL ID playoffs): one per featured match, 10 to 15 minutes before it
  // starts, claimed first; pings the members holding the opt-in Nobar role and lists the open Nobar rooms.
  async function reminders(guild, channel, today) {
    for (const match of featured(today)) {
      const key = `remind:${match.id}`;
      if (!reminderDue(match, now()) || store.daily(guild.id, key)) continue;
      store.claimDaily(guild.id, key);
      const entry = watchlist().find(w => w.title === match.page);
      const preview = store.daily(guild.id, `preview:${match.id}`)?.messageIds?.[0];
      const roleId = store.nobarRole(guild.id);
      let ids = []; let rooms = [];
      if (roleId) {
        try { ids = pingIds([...(await guild.members.fetch()).values()].filter(m => !m.user?.bot && m.roles?.cache?.has(roleId)).map(m => m.id)); } catch {
          logger.error('[esports] NOBAR_MEMBERS_FAILED');
        }
      }
      try { rooms = (await nobarRooms(guild)) || []; } catch { rooms = []; }
      const content = reminderText({ match, league: entry?.league || '', rooms, stream: entry?.stream || null, ids,
        previewUrl: preview ? `https://discord.com/channels/${guild.id}/${channel.id}/${preview}` : null });
      try { await channel.send({ content, components: [nobarRow()], allowedMentions: { users: ids } }); } catch (error) {
        logger.error('[esports] NOBAR_REMIND_FAILED');
        await reportFailure(guild, { feature: 'Pengingat Nobar', channel, code: error?.code || null });
      }
    }
  }

  // After the day's last match, or at 23:30 WIB with what is finished; never for days older than 36 hours.
  async function dayRecap(guild, channel, all, day, today) {
    const key = `day:${day}`;
    if (store.daily(guild.id, key)) return;
    const list = dayMatches(all, day);
    const finished = list.filter(m => m.finished && m.valid);
    if (!finished.length || now() - list[0].startAt > POST_WINDOW) return;
    const late = day < today || wibMinutes(now()) >= RECAP_LATEST;
    if (finished.length < list.length && !late) return;
    store.claimDaily(guild.id, key);
    const votes = store.allVotes(guild.id);
    // Liga Tebak so far for the day's events (at most two), top 5 by display name, and the day's Laga Panas.
    const tables = [...new Set(list.map(m => m.event).filter(Boolean))].slice(0, 2)
      .map(event => ({ event, key: voteKey(event), rows: standings(store.league(guild.id, event)?.users) })).filter(t => t.rows.length);
    const names = await memberNames(guild, [...new Set(tables.flatMap(t => t.rows.slice(0, 5).map(row => row.user)))]);
    const hot = hotMatchIds(list.filter(m => m.startAt <= now()), votes);
    await send(guild, channel, 'Rekap harian Analis', key, async () => {
      const data = dayRecapData(list, day, votes, { hot, tables, names });
      return listPayload(await renderList(data), `Rekap ${day}`, dayCaption(list, day, await line('day', data, all)), ligaRows(tables));
    });
  }

  async function fetchMembers(guild, ids) {
    if (!ids.length) return new Map();
    const found = await guild.members.fetch({ user: ids });
    return new Map([...found.values()].map(m => [m.id, m]));
  }

  async function memberNames(guild, ids) {
    try {
      return Object.fromEntries([...(await fetchMembers(guild, ids)).values()].map(m => [m.id, cleanName(m.displayName)]));
    } catch { return {}; }
  }

  async function eventRecap(guild, channel, all, event) {
    const key = `event:${event}`;
    if (store.daily(guild.id, key)) return;
    const state = eventState(all, event);
    if (!state.complete || !state.final.startAt || now() - state.final.startAt > POST_WINDOW) return;
    store.claimDaily(guild.id, key);
    const table = standings(store.league(guild.id, event)?.users);
    const names = await memberNames(guild, table.slice(0, 10).map(row => row.user));
    await send(guild, channel, 'Rekap event Analis', key, async () => {
      const data = eventRecapData(state, event, { table, names });
      const winners = champions(table).map(row => names[row.user] || 'Anggota');
      return listPayload(await renderList(data), `Rekap ${event}`, eventCaption(state, event, await line('event', data, all), winners),
        ligaRows(table.length ? [{ event, key: voteKey(event) }] : []));
    });
    await crown(guild, event, table, names);
  }

  // Liga Tebak: each finished match is scored once, after every match of its WIB day has started (all guesses closed),
  // so the day's Laga Panas is final. A match that finishes after the 23:30 recap is scored on a later tick.
  // ponytail: a Liquipedia correction after scoring is not re-scored; recount from the votes while they last if needed.
  function scoreFinished(guild, all) {
    const votes = store.allVotes(guild.id);
    const voted = m => m.finished && m.valid && m.event && m.startAt && Object.keys(votes[m.id] || {}).length;
    for (const day of new Set(all.filter(voted).map(m => wibDay(m.startAt)))) {
      const list = dayMatches(all, day);
      if (list.some(m => m.startAt > now())) continue;
      const hot = hotMatchIds(list, votes);
      for (const m of list.filter(voted)) {
        if (store.league(guild.id, m.event)?.scored?.[m.id]) continue;
        const weight = hot.has(m.id) ? 2 : 1;
        store.scoreLeague(guild.id, m.event, m.id, weight, pointsFor(votes[m.id], m.winner, weight));
      }
    }
  }

  // Once per event: the champions get an appreciation draft for the owner to review and the rotating Analis Jitu role.
  async function crown(guild, event, table, names) {
    const winners = champions(table);
    const key = `liga:${event}`;
    if (!winners.length || store.daily(guild.id, key)) return;
    store.claimDaily(guild.id, key);
    let present;
    try { present = await fetchMembers(guild, winners.map(w => w.user)); } catch {
      await reportFailure(guild, { feature: 'Juara Liga Tebak', reason: 'data anggota belum kebaca dari Discord, jadi role dan kartu juara dilewati' });
      return;
    }
    const here = winners.filter(w => present.has(w.user));
    if (here.length < winners.length) {
      await reportFailure(guild, { feature: 'Juara Liga Tebak',
        reason: `${winners.length - here.length} juara udah keluar dari server, jadi nggak dapet role dan kartu` });
    }
    if (!here.length) return;
    const card = championCard(event, here, names, wibDay(now()));
    if (!card) await reportFailure(guild, { feature: 'Kartu juara Liga Tebak', reason: 'nama juaranya nggak bisa dipakai di kartu' });
    else if (draftAppreciation) {
      try { await draftAppreciation(guild, card, `liga:${guild.id}:${voteKey(event)}`); } catch {
        logger.error('[esports] LIGA_DRAFT_FAILED');
        await reportFailure(guild, { feature: 'Kartu juara Liga Tebak', reason: 'draft kartu apresiasinya belum bisa dibuat' });
      }
    }
    await rotateLeagueRole(guild, here.map(w => present.get(w.user)));
  }

  // Analis Jitu (gold) moves to the newest champions.
  async function rotateLeagueRole(guild, winners) {
    try {
      store.setLeagueRole(guild.id, await rotateRole({ guild, name: 'Analis Jitu', color: 0xF1C40F,
        reason: 'Hengs Liga Tebak: role juara bergilir', previous: store.leagueRole(guild.id)?.holders || [], winners }));
    } catch {
      logger.error('[esports] LIGA_ROLE_FAILED');
      await reportFailure(guild, { feature: 'Role Analis Jitu',
        reason: 'Hengs butuh izin Manage Roles, dan role Hengs Bot harus ada di atas Analis Jitu (Server Settings > Roles)' });
    }
  }

  // An Analis question from #tanya-hengs, answered from the cached pages only (no Liquipedia request).
  async function answer(question) {
    if (!commentator) return null;
    const all = matchesOf(store.pages(), watchlist());
    const card = analisCard(all, now(), question);
    if (!card) return null;
    let text = null;
    try { text = await commentator.answer(question, card, { teams: teamNames(all) }); } catch { text = null; }
    return text ? `${text}\n-# Data: Liquipedia (CC-BY-SA 3.0)` : null;
  }

  async function daily(guild, channel, pages) {
    const all = matchesOf(pages, watchlist());
    if (!all.length) return;
    scoreFinished(guild, all);
    const day = wibDay(now());
    const today = dayMatches(all, day);
    if (wibMinutes(now()) >= PREVIEW_AT && today.length) await previews(guild, channel, all, today, day);
    if (today.length) await reminders(guild, channel, today);
    for (const d of [previousDay(day), day]) await dayRecap(guild, channel, all, d, day);
    for (const event of [...new Set(all.map(m => m.event).filter(Boolean))]) await eventRecap(guild, channel, all, event);
  }

  // Prediction buttons under a preview: the latest choice counts until kick-off; the reply is private.
  async function handleVote(interaction) {
    if (!String(interaction.customId || '').startsWith(VOTE_PREFIX)) return false;
    const [key, team] = interaction.customId.slice(VOTE_PREFIX.length).split(':');
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    const match = matchesOf(store.pages(), watchlist()).find(m => voteKey(m.id) === key);
    if (!interaction.guildId || guildAccess?.classify(interaction.guildId)?.kind !== 'home' || !match || !['1', '2'].includes(team)) {
      await reply('Tombol tebakan ini udah nggak berlaku.'); return true;
    }
    if (!match.startAt || now() >= match.startAt) { await reply('Tebakan udah ditutup, laganya udah mulai.'); return true; }
    store.vote(interaction.guildId, match.id, interaction.user.id, Number(team), match.event);
    await reply(`Tebakanmu: ${match.teams[Number(team) - 1].name}. Bisa diganti sampai ${wibTime(match.startAt)} WIB.`);
    return true;
  }

  // "Lihat posisiku" under a recap: the member's Liga Tebak rank for that event, privately.
  async function handleLiga(interaction, key) {
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    const home = interaction.guildId && guildAccess?.classify(interaction.guildId)?.kind === 'home';
    const event = home ? Object.keys(store.leagues(interaction.guildId)).find(e => voteKey(e) === key) : null;
    if (!event) { await reply('Tombol klasemen ini udah nggak berlaku.'); return true; }
    const { rank, of, entry } = rankOf(store.league(interaction.guildId, event).users, interaction.user.id);
    await reply(rank
      ? `Kamu peringkat ${rank} dari ${of} di ${event} · ${entry.points} poin · ${entry.right} benar dari ${entry.votes} tebakan`
      : `Kamu belum masuk klasemen ${event}: nebak minimal 3 laga dulu ya.${entry ? ` Sejauh ini ${entry.votes} tebakan kehitung.` : ''}`);
    return true;
  }

  // The opt-in Nobar role: found by the stored id or by name, else created once with no permissions.
  async function nobarRoleOf(guild) {
    const roles = await guild.roles.fetch(); const known = store.nobarRole(guild.id);
    const role = (known && roles.get(known)) || [...roles.values()].find(r => normalize(r.name) === 'nobar')
      || await guild.roles.create({ name: 'Nobar', permissions: [], hoist: false, mentionable: false, reason: 'Hengs: role pengingat Nobar (opt-in)' });
    if (!role.editable) throw new Error('NOBAR_ROLE_ABOVE_HENGS');
    if (role.id !== known) store.setNobarRole(guild.id, role.id);
    return role;
  }

  // 🔔 Ingetin aku under a preview or a reminder: adds or removes the Nobar role; the reply is private.
  async function handleNobar(interaction) {
    const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    if (!interaction.guildId || guildAccess?.classify(interaction.guildId)?.kind !== 'home' || !interaction.member?.roles) {
      await reply('Tombol ini udah nggak berlaku.'); return true;
    }
    try {
      const role = await nobarRoleOf(interaction.guild);
      const has = Boolean(interaction.member.roles.cache?.has(role.id));
      if (has) await interaction.member.roles.remove(role, 'Hengs Nobar: berhenti di-ping');
      else await interaction.member.roles.add(role, 'Hengs Nobar: minta di-ping');
      await reply(has ? NOBAR_REPLIES.off : NOBAR_REPLIES.on);
    } catch {
      logger.error('[esports] NOBAR_ROLE_FAILED');
      await reply(NOBAR_REPLIES.failed);
      await reportFailure(interaction.guild, { feature: 'Role Nobar',
        reason: 'Hengs butuh izin Manage Roles, dan role Hengs Bot harus ada di atas Nobar (Server Settings > Roles)' });
    }
    return true;
  }

  async function handleButton(interaction) {
    const id = String(interaction.customId || '');
    if (id === NOBAR_ID) return handleNobar(interaction);
    return id.startsWith(LIGA_PREFIX) ? handleLiga(interaction, id.slice(LIGA_PREFIX.length)) : handleVote(interaction);
  }

  async function tick() {
    if (running || !client) return;
    running = true;
    try {
      // No #hengs-analis anywhere yet: nothing to post, so no reason to ask Liquipedia.
      const targets = [...client.guilds.cache.values()]
        .filter(guild => guildAccess?.classify(guild.id)?.kind === 'home')
        .map(guild => [guild, channelFor(guild)]).filter(([, channel]) => channel);
      if (!targets.length) return;
      const cached = store.pages();
      const fresh = due(cached);
      const pages = fresh ? await refresh(cached) : cached;
      // Series cards and their 72-hour upkeep follow a fresh check; match-day posts run every tick from the cache.
      const candidates = fresh ? watchlist().flatMap(w => pages[w.title]?.matches || [])
        .filter(m => m.finished && m.valid && m.startAt && now() - m.startAt <= POST_WINDOW && m.startAt <= now())
        .sort((x, y) => x.startAt - y.startAt) : [];
      for (const [guild, channel] of targets) {
        // A channel made outside /admin setup (2026-10-30: setup now runs over REST) still gets its guide once.
        if (!store.guide(guild.id)) {
          try { await ensureGuide(channel); } catch { logger.error('[esports] ESPORTS_GUIDE_FAILED'); }
        }
        if (fresh) {
          let posted = 0;
          for (const match of candidates) {
            if (posted >= MAX_POSTS_PER_TICK || store.post(guild.id, match.id)) continue;
            await post(guild, channel, match); posted++;
          }
          await keepInStep(guild, channel, pages);
        }
        await daily(guild, channel, pages);
      }
    } catch {
      logger.error('[esports] ESPORTS_TICK_FAILED');
    } finally { running = false; }
  }

  // Posts and pins the guide unless the last one is still there; a guide that is still there gets the current text (new
  // sections such as Liga Tebak reach the pin on the next /admin setup). Used by /admin setup.
  async function ensureGuide(channel) {
    const known = store.guide(channel.guildId);
    if (known) {
      let message = null;
      try { message = await channel.messages.fetch({ message: known, force: true }); } catch { /* gone: post again */ }
      if (message) {
        try { await message.edit(guidePayload({ banner: await loadBanner() })); return { exists: true, updated: true }; } catch {
          logger.error('[esports] ESPORTS_GUIDE_EDIT_FAILED');
          return { exists: true, updated: false };
        }
      }
    }
    const message = await channel.send(guidePayload({ banner: await loadBanner() }));
    store.setGuide(channel.guildId, message.id);
    try { await message.pin(); return { posted: true, pinned: true }; } catch {
      logger.error('[esports] ESPORTS_GUIDE_PIN_FAILED');
      return { posted: true, pinned: false };
    }
  }

  return {
    attach(c) { client = c; },
    start(c) {
      client = c;
      if (timer) return;
      timer = setInterval(() => { void tick(); }, 5 * MIN); timer.unref?.();
      setTimeout(() => { void tick(); }, MIN).unref?.();
    },
    tick, ensureGuide, handleButton, answer,
  };
}

module.exports = { createEsportsService, WATCH };
