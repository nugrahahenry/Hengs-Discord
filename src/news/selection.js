'use strict';

const { SOURCES, articleUrl } = require('./feeds');
const { DAY } = require('./store');

function selectArticles(settings, items, row, now) {
  const seen = new Set((row?.seen || []).filter(item => now - item.at < 30 * DAY).map(item => item.hash));
  const publishers = new Set();
  const picks = [];
  for (const item of [...items].sort((a, b) => b.publishedAt - a.publishedAt || String(a.hash).localeCompare(String(b.hash)))) {
    const source = SOURCES.find(source => source.name === item.source && source.topic === item.topic);
    if (!source || !settings.topics.includes(item.topic) || !articleUrl(item.url, source)
      || !/^[a-f0-9]{64}$/.test(item.hash) || seen.has(item.hash) || publishers.has(source.id)
      || !Number.isFinite(item.publishedAt) || item.publishedAt > now || now - item.publishedAt > 3 * DAY) continue;
    seen.add(item.hash); publishers.add(source.id); picks.push(item);
    if (picks.length >= settings.count) break;
  }
  return picks;
}

module.exports = { selectArticles };
