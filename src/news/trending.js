'use strict';

const { fetchBounded } = require('./http');
const { plain } = require('./feeds');
const { DAY } = require('./store');

const HOUR = 3_600_000;
const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=ID';
const STOP = new Set([
  'yang', 'dan', 'dari', 'untuk', 'ini', 'itu', 'dengan', 'akan', 'bisa', 'pada', 'juga', 'ada', 'jadi', 'karena',
  'tak', 'tidak', 'baru', 'kini', 'resmi', 'atau', 'dalam', 'lebih', 'sudah', 'masih', 'agar', 'oleh', 'para', 'kata',
  'saat', 'bagi', 'buat', 'hingga', 'sebagai', 'setelah', 'tanpa', 'lagi', 'kamu', 'kita', 'kami', 'mereka', 'cara',
  'apa', 'hari', 'jam', 'tahun', 'bulan', 'minggu', 'sejak', 'usai', 'jelang', 'soal', 'begini', 'begitu',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those', 'into', 'over', 'new', 'how', 'why', 'what',
  'when', 'your', 'you', 'will', 'can', 'now', 'are', 'was', 'were', 'been', 'has', 'have', 'had', 'its', 'about',
  'after', 'before', 'more', 'most', 'than', 'then', 'they', 'them', 'their', 'our', 'out', 'not', 'but', 'all', 'one', 'two',
]);
// Topics Hengs never posts, in titles or meme text (ID + EN). Conservative on purpose.
const SENSITIVE = /\b(?:politik\w*|pemilu|pilpres|pilkada|partai|kampanye|capres|cawapres|koalisi|oposisi|sara|agama|rasis\w*|penistaan|teroris\w*|perang|militer|tewas|meninggal|wafat|korban jiwa|pembunuhan|dibunuh|bunuh diri|pemerkosaan|kekerasan seksual|cabul|porno\w*|bokep|judi|judol|slot gacor|togel|narkoba|sabu|kecelakaan|bencana|gempa|banjir|tsunami|longsor|election\w*|politic\w*|senate|congress|killed|murder\w*|suicide|porn\w*|gambling|terror\w*|shooting|ukraine|russia|gaza|israel|hamas|nato)\b/i;

function keywords(value) {
  const words = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  return [...new Set(words.filter(word => (word.length >= 3 && !STOP.has(word)) || /^(?=.*\d)[a-z0-9]{2,}$/.test(word)))];
}

function sameStory(a, b) {
  const shared = a.filter(word => b.includes(word));
  return shared.length >= 2 && shared.some(word => word.length >= 5 || /\d/.test(word));
}

function trendBonus(words, trends) {
  let best = 0;
  for (const trend of trends) {
    const terms = trend?.words || [];
    if (!terms.length || (terms.length === 1 && terms[0].length < 5) || !Number.isFinite(trend.traffic)) continue;
    if (terms.every(word => words.includes(word))) best = Math.max(best, Math.log10(trend.traffic) - 1);
  }
  return best;
}

// Heat = how fast something is rising. HN has votes; RSS has none, so coverage across publishers stands in.
function rankArticles(items, { now = Date.now(), trends = [] } = {}) {
  const rows = items.map(item => ({ item, words: keywords(item.title) }));
  return rows.map(row => {
    const related = rows.filter(other => other !== row && other.item.source !== row.item.source
      && sameStory(row.words, other.words));
    const recent = related.filter(other => Math.abs(other.item.publishedAt - row.item.publishedAt) <= 12 * HOUR);
    const coverage = 1 + new Set(recent.map(other => other.item.source)).size;
    const age = Number.isFinite(row.item.publishedAt) ? Math.max(0, (now - row.item.publishedAt) / HOUR) : 72;
    const votes = Number.isSafeInteger(row.item.points);
    const base = votes ? Math.log2(1 + Math.max(0, row.item.points - 1) / (age + 2) ** 1.8)
      : 1.5 * Math.log2(coverage) + (age <= 6 ? 0.5 : 0);
    const bonus = trendBonus(row.words, trends);
    return { ...row.item, heat: Math.round((base + bonus - age / 24) * 1000) / 1000,
      reason: votes ? `${Math.round(row.item.points / Math.max(1, age))} poin per jam di Hacker News`
        : coverage > 1 ? `dibahas ${coverage} media dalam 12 jam` : null,
      trending: bonus > 0, siblings: related.map(other => other.item.hash) };
  });
}

function trafficOf(raw) {
  const match = /^([\d.,]+)\s*([KM])?\+?$/i.exec(String(raw || '').trim());
  if (!match) return NaN;
  const number = match[2] ? Number(match[1].replace(',', '.')) : Number(match[1].replace(/[.,]/g, ''));
  return Math.round(number * ({ k: 1000, m: 1_000_000 }[String(match[2] || '').toLowerCase()] || 1));
}

function parseTrends(xml, now = Date.now()) {
  if (typeof xml !== 'string' || xml.length > 512 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('NEWS_TRENDS_INVALID');
  const trends = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    if (trends.length >= 25) break;
    const body = match[1];
    const term = plain(/<title>([\s\S]*?)<\/title>/.exec(body)?.[1], 80);
    const traffic = trafficOf(/<ht:approx_traffic>([^<]*)<\/ht:approx_traffic>/.exec(body)?.[1]);
    const startedAt = Date.parse(/<pubDate>([^<]*)<\/pubDate>/.exec(body)?.[1] || '');
    if (!term || !Number.isSafeInteger(traffic) || traffic < 1 || !Number.isFinite(startedAt) || now - startedAt > 2 * DAY) continue;
    trends.push({ term, traffic, startedAt, words: keywords(term) });
  }
  return trends;
}

function createTrendReader({ fetchText = url => fetchBounded(url, { hosts: ['trends.google.com'],
  types: ['text/xml', 'application/rss+xml', 'application/xml'], maxBytes: 512 * 1024 }).then(body => body.toString('utf8')),
now = Date.now } = {}) {
  let cached = null;
  return () => {
    if (cached && now() - cached.at < 30 * 60_000) return cached.promise;
    const promise = Promise.resolve().then(() => fetchText(TRENDS_URL)).then(xml => parseTrends(xml, now())).catch(() => []);
    cached = { at: now(), promise };
    return promise;
  };
}

module.exports = { HOUR, TRENDS_URL, SENSITIVE, keywords, sameStory, rankArticles, parseTrends, createTrendReader };
