'use strict';

const { SOURCES, articleUrl } = require('./feeds');
const { DAY, wibClock } = require('./store');

function compositionLimits(settings) {
  const mixed = settings.count >= 2 && settings.topics?.includes('memes')
    && settings.topics.some(topic => topic !== 'memes');
  return mixed ? { news: settings.count - 1, entertainment: 1 } : null;
}

function selectArticles(settings, items, row, now) {
  const seen = new Set((row?.seen || []).filter(item => now - item.at < 30 * DAY).map(item => item.hash));
  const publishers = new Set((row?.receipts || []).filter(x => x.day === wibClock(now).day).map(x => x.publisher).filter(Boolean));
  const picks = [];
  const limits = compositionLimits(settings);
  const counts = { news: 0, entertainment: 0 };
  for (const item of [...items].sort((a, b) => b.publishedAt - a.publishedAt || String(a.hash).localeCompare(String(b.hash)))) {
    const source = SOURCES.find(source => source.name === item.source && source.topic === item.topic);
    if (!source || !settings.topics.includes(item.topic) || !articleUrl(item.url, source)
      || !/^[a-f0-9]{64}$/.test(item.hash) || seen.has(item.hash) || publishers.has(source.id)
      || !Number.isFinite(item.publishedAt) || item.publishedAt > now || now - item.publishedAt > 3 * DAY) continue;
    const category = item.topic === 'memes' ? 'entertainment' : 'news';
    if (limits && counts[category] >= limits[category]) continue;
    counts[category]++;
    seen.add(item.hash); publishers.add(source.id); picks.push(item);
    if (picks.length >= settings.count) break;
  }
  return limits ? [...picks.filter(item => item.topic !== 'memes'), ...picks.filter(item => item.topic === 'memes')] : picks;
}

module.exports = { selectArticles, compositionLimits };
