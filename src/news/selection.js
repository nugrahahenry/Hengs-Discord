'use strict';

const { SOURCES, articleUrl, deskOf, deskTopics, onlyFits } = require('./feeds');
const { DAY, wibClock } = require('./store');
const { SENSITIVE } = require('./trending');

// Desks (owner request, 2026-10-31: more variety): a desk takes one news slot a day and a second only when no other desk
// has news; a desk missing for three days gets a lift, and desks members keep marking 🔥 a smaller one (liked: desk ->
// score, evidence rule in ./taste).
const STALE_LIFT = 2;
const LIKED_LIFT = 1;

// One item per publisher per day, hottest first, spread over desks. A story counts as covered once any publisher's version
// was sent (siblings come from rankArticles); items without ranking keep the old newest-first order.
function selectArticles(settings, items, row, now, { liked = null } = {}) {
  const seen = new Set((row?.seen || []).filter(item => now - item.at < 30 * DAY).map(item => item.hash));
  const day = wibClock(now).day;
  const news = (row?.receipts || []).filter(x => (x.kind || 'news') === 'news' && x.publisher);
  const deskOfId = id => deskOf(SOURCES.find(source => source.id === id));
  const publishers = new Set(news.filter(x => x.day === day).map(x => x.publisher));
  const deskCount = new Map();
  for (const desk of news.filter(x => x.day === day).map(x => deskOfId(x.publisher)).filter(Boolean)) deskCount.set(desk, (deskCount.get(desk) || 0) + 1);
  const recentDays = new Set([0, 1, 2].map(back => wibClock(now - back * DAY).day));
  const recentDesks = new Set(news.filter(x => recentDays.has(x.day)).map(x => deskOfId(x.publisher)).filter(Boolean));
  const lift = desk => (recentDesks.has(desk) ? 0 : STALE_LIFT) + (liked?.has(desk) ? LIKED_LIFT : 0);
  const topics = deskTopics(settings.topics);
  const eligible = [];
  for (const item of items) {
    const source = SOURCES.find(source => source.name === item.source && source.topic === item.topic);
    const text = `${item.title} ${item.excerpt || ''}`;
    if (!source || !topics.includes(item.topic) || !articleUrl(item.url, source)
      || !/^[a-f0-9]{64}$/.test(item.hash) || SENSITIVE.test(text) || !onlyFits(source, text)
      || !Number.isFinite(item.publishedAt) || item.publishedAt > now || now - item.publishedAt > 3 * DAY) continue;
    eligible.push({ item, source, desk: deskOf(source) });
  }
  eligible.sort((a, b) => ((b.item.heat ?? 0) + lift(b.desk)) - ((a.item.heat ?? 0) + lift(a.desk))
    || b.item.publishedAt - a.item.publishedAt || String(a.item.hash).localeCompare(String(b.item.hash)));
  const picks = [];
  // First pass: each desk's first slot of the day; second pass, only when nothing else is left: its second.
  for (const pass of [1, 2]) {
    for (const { item, source, desk } of eligible) {
      if (picks.length >= settings.count) return picks;
      if (seen.has(item.hash) || publishers.has(source.id) || (deskCount.get(desk) || 0) >= pass
        || (item.siblings || []).some(hash => seen.has(hash))) continue;
      seen.add(item.hash); publishers.add(source.id); deskCount.set(desk, (deskCount.get(desk) || 0) + 1); picks.push(item);
    }
  }
  return picks;
}

module.exports = { selectArticles, STALE_LIFT, LIKED_LIFT };
