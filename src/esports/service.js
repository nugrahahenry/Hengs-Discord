'use strict';

// Hengs Analis: watches a few Liquipedia pages, posts one card per finished series in #hengs-analis, keeps the
// card in step with Liquipedia for 72 hours and tells the server owner when a member flags it with ⚠️.
const fs = require('node:fs');
const path = require('node:path');
const { ChannelType } = require('discord.js');
const { createEsportsStore } = require('./store');
const { createLiquipedia } = require('./liquipedia');
const { parseMatches, matchHash } = require('./wikitext');
const { renderSeriesCard } = require('./card');
const { seriesPayload, guidePayload, pageUrl, REACTIONS, isWarning } = require('./presentation');

// ponytail: a fixed watchlist; international pages (M8 stages, Esports Nations Cup) join when Liquipedia has their
// match pages. Auto-discovery is worth it only if seasons roll over faster than releases.
const WATCH = Object.freeze([
  { title: 'MPL/Philippines/Season 18/Playoffs', league: 'MPL PH S18 Playoffs' },
  { title: 'MPL/Indonesia/Season 18/Playoffs', league: 'MPL ID S18 Playoffs' },
]);
const MIN = 60_000; const HOUR = 60 * MIN;
const LIVE_EVERY = 20 * MIN; const IDLE_EVERY = 3 * HOUR;
const POST_WINDOW = 36 * HOUR; const KEEP_IN_STEP = 72 * HOUR; const LIVE_WINDOW = 12 * HOUR;
const MAX_POSTS_PER_TICK = 3;
const BANNER = path.join(__dirname, '../../assets/esports/guide-banner.png');
const { slugOf: normalize } = require('../guilds/channel-style');

async function defaultBanner() {
  try { return fs.statSync(BANNER).isFile() ? fs.readFileSync(BANNER) : null; } catch { return null; }
}

function createEsportsService({ guildAccess, store = createEsportsStore(), liquipedia = createLiquipedia(),
  render = renderSeriesCard, now = Date.now, logger = console, watch = WATCH, loadBanner = defaultBanner,
  reportFailure = async () => {} } = {}) {
  let client = null; let running = false; let timer = null;
  const leagueOf = page => watch.find(w => w.title === page)?.league || '';

  function due(pages) {
    const live = Object.values(pages).flatMap(p => p.matches || [])
      .some(m => !m.finished && m.startAt && m.startAt <= now() && now() - m.startAt <= LIVE_WINDOW);
    return now() - store.lastCheck() >= (live ? LIVE_EVERY : IDLE_EVERY);
  }

  // One revisions request; page content only where the revision changed. A failure still counts as a check.
  async function refresh(pages) {
    try {
      const revisions = await liquipedia.revisions(watch.map(w => w.title));
      const next = Object.fromEntries(Object.entries(pages).filter(([title]) => watch.some(w => w.title === title)));
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

  async function tick() {
    if (running || !client) return;
    running = true;
    try {
      // No #hengs-analis anywhere yet: nothing to post, so no reason to ask Liquipedia.
      const targets = [...client.guilds.cache.values()]
        .filter(guild => guildAccess?.classify(guild.id)?.kind === 'home')
        .map(guild => [guild, channelFor(guild)]).filter(([, channel]) => channel);
      const cached = store.pages();
      if (!targets.length || !due(cached)) return;
      const pages = await refresh(cached);
      const candidates = watch.flatMap(w => pages[w.title]?.matches || [])
        .filter(m => m.finished && m.valid && m.startAt && now() - m.startAt <= POST_WINDOW && m.startAt <= now())
        .sort((x, y) => x.startAt - y.startAt);
      for (const [guild, channel] of targets) {
        let posted = 0;
        for (const match of candidates) {
          if (posted >= MAX_POSTS_PER_TICK || store.post(guild.id, match.id)) continue;
          await post(guild, channel, match); posted++;
        }
        await keepInStep(guild, channel, pages);
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
    tick, ensureGuide,
  };
}

module.exports = { createEsportsService, WATCH };
