'use strict';

// Hengs Analis: watches Liquipedia pages, posts one card per finished series in #hengs-analis, keeps the card in step
// with Liquipedia for 72 hours and tells the server owner when a member flags it with ⚠️. On match days it also posts
// a morning preview per match with member predictions, a night recap and, after the grand final, an event recap.
const fs = require('node:fs');
const path = require('node:path');
const { ChannelType, MessageFlags } = require('discord.js');
const { createEsportsStore } = require('./store');
const { createLiquipedia } = require('./liquipedia');
const { parseMatches, matchHash } = require('./wikitext');
const { renderSeriesCard } = require('./card');
const { renderPreviewCard, renderListCard } = require('./daily-cards');
const { seriesPayload, guidePayload, previewPayload, listPayload, pageUrl, REACTIONS, isWarning, VOTE_PREFIX } = require('./presentation');
const { WATCH, DISCOVER, discoveredEntries } = require('./watch');
const { wibDay, wibMinutes, previousDay, matchesOf, dayMatches, featured, eventState } = require('./schedule');
const { voteKey, topGuessers } = require('./predictions');
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

async function defaultBanner() {
  try { return fs.statSync(BANNER).isFile() ? fs.readFileSync(BANNER) : null; } catch { return null; }
}

function createEsportsService({ guildAccess, store = createEsportsStore(), liquipedia = createLiquipedia(),
  render = renderSeriesCard, renderPreview = renderPreviewCard, renderList = renderListCard, now = Date.now, logger = console,
  watch = WATCH, discover = watch === WATCH, loadBanner = defaultBanner, reportFailure = async () => {}, commentator = null } = {}) {
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

  async function post(guild, channel, match) {
    const hash = matchHash(match);
    store.claim(guild.id, match.id, { hash });
    let message;
    try {
      message = await channel.send(seriesPayload(match, { league: leagueOf(match.page) }, await render(match, { league: leagueOf(match.page) })));
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
          await message.edit(seriesPayload(match, { league }, await render(match, { league }), { updatedAt: now() }));
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
    await send(guild, channel, 'Rekap harian Analis', key, async () => {
      const data = dayRecapData(list, day, votes);
      return listPayload(await renderList(data), `Rekap ${day}`, dayCaption(list, day, await line('day', data, all)));
    });
  }

  async function memberNames(guild, ids) {
    if (!ids.length) return {};
    try {
      const members = await guild.members.fetch({ user: ids });
      return Object.fromEntries([...members.values()].map(m => [m.id, cleanName(m.displayName)]));
    } catch { return {}; }
  }

  async function eventRecap(guild, channel, all, event) {
    const key = `event:${event}`;
    if (store.daily(guild.id, key)) return;
    const state = eventState(all, event);
    if (!state.complete || !state.final.startAt || now() - state.final.startAt > POST_WINDOW) return;
    store.claimDaily(guild.id, key);
    const votes = store.allVotes(guild.id);
    const names = await memberNames(guild, topGuessers(votes, state.matches).map(x => x.user));
    await send(guild, channel, 'Rekap event Analis', key, async () => {
      const data = eventRecapData(state, event, votes, names);
      return listPayload(await renderList(data), `Rekap ${event}`, eventCaption(state, event, await line('event', data, all)));
    });
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
    const day = wibDay(now());
    const today = dayMatches(all, day);
    if (wibMinutes(now()) >= PREVIEW_AT && today.length) await previews(guild, channel, all, today, day);
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

  // Posts and pins the guide unless the last one is still there. Used by /admin setup.
  async function ensureGuide(channel) {
    const known = store.guide(channel.guildId);
    if (known) {
      try { await channel.messages.fetch({ message: known, force: true }); return { exists: true }; } catch { /* gone: post again */ }
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
    tick, ensureGuide, handleVote, answer,
  };
}

module.exports = { createEsportsService, WATCH };
