'use strict';

const { SOURCES, articleUrl } = require('./feeds');
const { DAY, wibClock } = require('./store');
const { SENSITIVE } = require('./trending');

// One item per publisher per day, hottest first. A story counts as covered once any publisher's version
// was sent (siblings come from rankArticles); items without ranking keep the old newest-first order.
function selectArticles(settings, items, row, now) {
  const seen = new Set((row?.seen || []).filter(item => now - item.at < 30 * DAY).map(item => item.hash));
  const publishers = new Set((row?.receipts || []).filter(x => x.day === wibClock(now).day).map(x => x.publisher).filter(Boolean));
  const picks = [];
  for (const item of [...items].sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0) || b.publishedAt - a.publishedAt
    || String(a.hash).localeCompare(String(b.hash)))) {
    const source = SOURCES.find(source => source.name === item.source && source.topic === item.topic);
    if (!source || !settings.topics.includes(item.topic) || !articleUrl(item.url, source)
      || !/^[a-f0-9]{64}$/.test(item.hash) || seen.has(item.hash) || publishers.has(source.id)
      || (item.siblings || []).some(hash => seen.has(hash)) || SENSITIVE.test(`${item.title} ${item.excerpt || ''}`)
      || !Number.isFinite(item.publishedAt) || item.publishedAt > now || now - item.publishedAt > 3 * DAY) continue;
    seen.add(item.hash); publishers.add(source.id); picks.push(item);
    if (picks.length >= settings.count) break;
  }
  return picks;
}

module.exports = { selectArticles };
