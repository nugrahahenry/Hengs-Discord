'use strict';

const crypto = require('node:crypto');
const { DAY } = require('./store');
const { publicIPv4, fetchBounded } = require('./http');

const FEED_TYPES = Object.freeze(['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml']);
const HN_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
const noImage = { imageHost: null, imagePath: null };
const SOURCES = Object.freeze([
  Object.freeze({ id: 'mozilla', topic: 'tech', name: 'Mozilla Hacks', url: 'https://hacks.mozilla.org/feed/', hosts: ['hacks.mozilla.org'], imageHost: 'hacks.mozilla.org', imagePath: '/wp-content/uploads/' }),
  Object.freeze({ id: 'nvidia', topic: 'ai', name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/', hosts: ['blogs.nvidia.com'], imageHost: 'blogs.nvidia.com', imagePath: '/wp-content/uploads/' }),
  Object.freeze({ id: 'steam', topic: 'gaming', name: 'Steam News', url: 'https://store.steampowered.com/feeds/news.xml', hosts: ['store.steampowered.com', 'steamcommunity.com'], imageHost: 'cdn.fastly.steamstatic.com', imagePath: '/steam/apps/' }),
  Object.freeze({ id: 'xkcd', topic: 'memes', name: 'xkcd (komik)', url: 'https://xkcd.com/atom.xml', hosts: ['xkcd.com'], imageHost: 'imgs.xkcd.com', imagePath: '/comics/' }),
  Object.freeze({ id: 'cloudflare', topic: 'tech', name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', hosts: ['blog.cloudflare.com'], imageHost: 'blog.cloudflare.com', imagePath: '/_emdash/api/media/file/' }),
  // Hacker News: one front-page fetch, split by title into an AI and a tech publisher (max one each per day).
  Object.freeze({ id: 'hackernews', topic: 'tech', name: 'Hacker News', format: 'hn', url: HN_URL, hosts: ['news.ycombinator.com'], ...noImage }),
  Object.freeze({ id: 'hackernews-ai', topic: 'ai', name: 'Hacker News', format: 'hn', url: HN_URL, hosts: ['news.ycombinator.com'], ...noImage }),
  // Indonesian media: headline + own summary + link only, never their photos (ANTARA terms).
  Object.freeze({ id: 'cnnindonesia', topic: 'tech', name: 'CNN Indonesia', url: 'https://www.cnnindonesia.com/teknologi/rss', hosts: ['www.cnnindonesia.com'], ...noImage }),
  Object.freeze({ id: 'cnbcindonesia', topic: 'tech', name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/tech/rss', hosts: ['www.cnbcindonesia.com'], ...noImage }),
  Object.freeze({ id: 'liputan6', topic: 'tech', name: 'Liputan6', url: 'https://feed.liputan6.com/rss/tekno', hosts: ['www.liputan6.com'], ...noImage }),
  Object.freeze({ id: 'okezone', topic: 'tech', name: 'Okezone', url: 'https://sindikasi.okezone.com/index.php/rss/16/RSS2.0', hosts: ['ototekno.okezone.com'], ...noImage }),
  Object.freeze({ id: 'antara', topic: 'tech', name: 'ANTARA', url: 'https://www.antaranews.com/rss/tekno.xml', hosts: ['www.antaranews.com'], ...noImage }),
  Object.freeze({ id: 'gamebrott', topic: 'gaming', name: 'Gamebrott', url: 'https://gamebrott.com/feed/', hosts: ['gamebrott.com'], ...noImage }),
  Object.freeze({ id: 'jagatplay', topic: 'gaming', name: 'Jagat Play', url: 'https://jagatplay.com/feed/', hosts: ['jagatplay.com'], ...noImage }),
  Object.freeze({ id: 'esportsnesia', topic: 'gaming', desk: 'esports', name: 'Esportsnesia', url: 'https://esportsnesia.com/feed/', hosts: ['esportsnesia.com'], ...noImage }),
  Object.freeze({ id: 'revivaltv', topic: 'gaming', desk: 'esports', name: 'Revival TV', url: 'https://revivaltv.id/feed/', hosts: ['revivaltv.id'], ...noImage }),
  // More desks (owner request, 2026-10-30; feeds and link hosts probed from the VM). The settings topic gates a desk: tech
  // gates gadget, gaming gates esports; pop culture and kampus run whenever News is on. Headline, own summary and link only.
  Object.freeze({ id: 'dafunda', topic: 'gaming', name: 'Dafunda', url: 'https://dafunda.com/feed/', hosts: ['dafunda.com'], ...noImage }),
  Object.freeze({ id: 'hybrid', topic: 'gaming', desk: 'esports', name: 'Hybrid', url: 'https://hybrid.co.id/feed/', hosts: ['hybrid.co.id'], ...noImage }),
  Object.freeze({ id: 'gizmologi', topic: 'tech', desk: 'gadget', name: 'Gizmologi', url: 'https://gizmologi.id/feed/', hosts: ['gizmologi.id'], ...noImage }),
  Object.freeze({ id: 'selular', topic: 'tech', desk: 'gadget', name: 'Selular.ID', url: 'https://selular.id/feed/', hosts: ['selular.id'], ...noImage }),
  Object.freeze({ id: 'jagatreview', topic: 'tech', desk: 'gadget', name: 'Jagat Review', url: 'https://www.jagatreview.com/feed/',
    hosts: ['www.jagatreview.com', 'gadget.jagatreview.com'], ...noImage }),
  Object.freeze({ id: 'cnnhiburan', topic: 'popculture', name: 'CNN Indonesia Hiburan', url: 'https://www.cnnindonesia.com/hiburan/rss',
    hosts: ['www.cnnindonesia.com'], only: 'popculture', ...noImage }),
  Object.freeze({ id: 'liputan6showbiz', topic: 'popculture', name: 'Liputan6 Showbiz', url: 'https://feed.liputan6.com/rss/showbiz',
    hosts: ['www.liputan6.com'], only: 'popculture', ...noImage }),
  Object.freeze({ id: 'cnnedukasi', topic: 'kampus', name: 'CNN Indonesia Edukasi', url: 'https://www.cnnindonesia.com/edukasi/rss', hosts: ['www.cnnindonesia.com'], ...noImage }),
  Object.freeze({ id: 'republika', topic: 'kampus', name: 'Republika', url: 'https://www.republika.co.id/rss/pendidikan',
    hosts: ['news.republika.co.id', 'www.republika.co.id'], ...noImage }),
  Object.freeze({ id: 'indbeasiswa', topic: 'kampus', name: 'IndBeasiswa', url: 'https://indbeasiswa.com/feed/', hosts: ['indbeasiswa.com'], ...noImage }),
]);
// Desks that do not need a settings topic, and the desk of a source (its topic unless it names another).
const ALWAYS_ON = Object.freeze(['popculture', 'kampus']);
const deskOf = source => source?.desk || source?.topic || null;
// The topics to read: the chosen News topics plus the always-on desks (memes alone stay memes).
const deskTopics = topics => (topics.some(topic => topic !== 'memes') ? [...new Set([...topics, ...ALWAYS_ON])] : [...topics]);
// Pop culture items must be about films, series, music or anime, never celebrity gossip (on top of SENSITIVE).
const POP_CULTURE = /\b(?:film|movie|anime|manga|webtoon|series|serial|drakor|drama korea|k-?pop|musik|lagu|album|single|konser|tur dunia|trailer|netflix|disney|bioskop|sinopsis|episode|soundtrack|ost|festival musik|game of the year)\b/i;
const GOSSIP = /\b(?:cerai|perceraian|selingkuh|gugat|hamil|pacaran|nikah|menikah|mantan|skandal|dilaporkan|polisi|sidang|ditangkap|tersangka|rumah tangga|kekasih|asmara)\b/i;
const onlyFits = (source, text) => source?.only !== 'popculture' || (POP_CULTURE.test(text) && !GOSSIP.test(text));
const MAX_FEED_BYTES = 1024 * 1024;
const AI_TITLE = /\b(?:ai|llms?|gpt|openai|anthropic|claude|gemini|deepseek|mistral|llama|neural|machine learning|models?)\b/i;
for (const source of SOURCES) Object.freeze(source.hosts);

function readFeed(source, { request, lookup, timeoutMs = 10_000 } = {}) {
  if (!SOURCES.some(row => row === source)) return Promise.reject(new Error('NEWS_SOURCE_REJECTED'));
  return fetchBounded(source.url, { hosts: [new URL(source.url).hostname],
    types: source.format === 'hn' ? ['application/json'] : FEED_TYPES, maxBytes: MAX_FEED_BYTES, timeoutMs,
    ...(request && { request }), ...(lookup && { lookup }) })
    .then(body => body.toString('utf8'), () => { throw new Error('NEWS_FEED_UNAVAILABLE'); });
}
function plain(value, max = 200) {
  // Feed markup is data, never rendered as HTML. Only bounded plain snippets reach the editor.
  return String(value || '').slice(0, 4096).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n.toLowerCase()])
    .replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-').replace(/[@`*_~|\[\]<>\\]/g, '').replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function articleUrl(raw, source) {
  try {
    const url = new URL(String(raw).trim().replace(/&amp;/g, '&'));
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !source.hosts.includes(url.hostname) || url.href.length > 400) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.href.replace(/[()]/g, c => c === '(' ? '%28' : '%29');
  } catch { return null; }
}

function decodeMarkup(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(x[0-9a-f]+|\d+)|(amp|lt|gt|quot|apos));/gi, (_, number, named) => {
      if (named) return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()];
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function imageUrl(raw, source) {
  // Only publisher-hosted raster paths observed in the fixed feeds. Never fetch media here.
  if (!SOURCES.includes(source) || !source.imageHost || typeof raw !== 'string' || raw.length > 1000
    || /[\s\\<>\u0000-\u001f\u007f]|%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c|25)/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (!raw.startsWith(`https://${source.imageHost}/`) || url.hostname !== source.imageHost
      || url.username || url.password || url.port || !url.pathname.startsWith(source.imagePath)
      || !/\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    // Reject signed URLs, redirects, unknown transformations and tracking query parameters.
    if (url.search) return null;
    return url.href;
  } catch { return null; }
}

function entryImage(body, source) {
  // Bounded per-entry parsing; XML/HTML stays data. Do not crawl linked article pages.
  const markup = decodeMarkup(body.slice(0, 32768))
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const candidates = [];
  for (const match of markup.matchAll(/<(media:content|media:thumbnail|enclosure|img)\b([^<>]{1,2000})\/?\s*>/gi)) {
    if (candidates.length >= 24) break;
    const attrs = Object.create(null);
    for (const attr of match[2].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[attr[1].toLowerCase()] = attr[3];
    const kind = match[1].toLowerCase();
    if (kind === 'enclosure' && !/^image\/(?:jpeg|png|webp|gif)$/i.test(attrs.type || '')) continue;
    if (attrs.medium && attrs.medium !== 'image') continue;
    if (attrs.type && !/^image\/(?:jpeg|png|webp|gif)$/i.test(attrs.type)) continue;
    if (['width', 'height'].some(key => attrs[key] && /^\d+$/.test(attrs[key]) && Number(attrs[key]) < 100)) continue;
    candidates.push(kind === 'img' ? attrs.src : attrs.url);
  }
  return candidates.map(raw => imageUrl(raw, source)).find(Boolean) || null;
}

function parseFeed(xml, source, now = Date.now()) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_FEED_BYTES
    || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<\/(?:rss|feed|rdf:RDF)>\s*$/i.test(xml.trim())) throw new Error('NEWS_FEED_INVALID');
  const tag = (body, name) => {
    const open = new RegExp(`<${name}(?:\\s[^>]{0,500})?>`, 'i').exec(body);
    if (!open) return '';
    const start = open.index + open[0].length;
    const end = body.toLowerCase().indexOf(`</${name.toLowerCase()}>`, start);
    return end < 0 ? '' : body.slice(start, end);
  };
  const result = [];
  const opening = /<(item|entry)(?:\s[^>]{0,500})?>/gi;
  const lower = xml.toLowerCase();
  let match; let count = 0;
  while (count++ < 100 && (match = opening.exec(xml))) {
    const type = match[1].toLowerCase();
    const start = opening.lastIndex;
    const end = lower.indexOf(`</${type}>`, start);
    if (end < 0) break;
    opening.lastIndex = end + type.length + 3;
    const body = xml.slice(start, Math.min(end, start + 32768));
    const rawLink = type.toLowerCase() === 'item' ? tag(body, 'link')
      : [...body.matchAll(/<link\s([^>]{1,1000})\/?\s*>/gi)].map(x => x[1]).find(x => !/rel=["'](?!alternate["'])/i.test(x))?.match(/href=["']([^"']+)["']/i)?.[1];
    const url = articleUrl(String(rawLink || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'), source);
    const publishedAt = Date.parse(tag(body, type.toLowerCase() === 'item' ? 'pubDate' : 'published') || tag(body, 'updated') || tag(body, 'dc:date'));
    const title = plain(tag(body, 'title'), 150);
    if (!url || !title || !Number.isFinite(publishedAt) || publishedAt > now || now - publishedAt > 3 * DAY) continue;
    const excerpt = plain(tag(body, 'description') || tag(body, 'summary'), 220).split(/\s+/).slice(0, 25).join(' ');
    result.push({ title, excerpt, url, imageUrl: entryImage(body, source), publishedAt, source: source.name, topic: source.topic,
      hash: crypto.createHash('sha256').update(url).digest('hex') });
  }
  return result;
}

function parseHn(body, source, now = Date.now()) {
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('NEWS_FEED_INVALID'); }
  if (!Array.isArray(data?.hits)) throw new Error('NEWS_FEED_INVALID');
  const result = [];
  for (const hit of data.hits.slice(0, 100)) {
    const id = String(hit?.objectID ?? '');
    const points = Number(hit?.points); const comments = Number(hit?.num_comments ?? 0);
    const publishedAt = Number(hit?.created_at_i) * 1000;
    const title = plain(hit?.title, 150);
    if (!/^\d{1,12}$/.test(id) || !title || !Number.isSafeInteger(points) || points < 1
      || !Number.isSafeInteger(comments) || comments < 0 || !Number.isFinite(publishedAt)
      || publishedAt > now || now - publishedAt > 3 * DAY || (source.topic === 'ai') !== AI_TITLE.test(title)) continue;
    const url = articleUrl(`https://news.ycombinator.com/item?id=${id}`, source);
    if (!url) continue;
    let domain = null;
    try { domain = new URL(hit.url).hostname.replace(/^www\./, ''); } catch {}
    const hours = Math.max(1, Math.round((now - publishedAt) / 3_600_000));
    result.push({ title, excerpt: `Dibahas di Hacker News: ${points} poin dan ${comments} komentar dalam ${hours} jam.`,
      url, imageUrl: null, publishedAt, source: source.name, topic: source.topic, points, comments,
      domain: domain && /^[a-z0-9.-]{1,60}$/.test(domain) ? domain : null,
      hash: crypto.createHash('sha256').update(url).digest('hex') });
  }
  return result;
}

function createFeedReader({ fetchFeed = readFeed, readTrends = null, now = Date.now } = {}) {
  const cache = new Map();
  function body(source) {
    // Keyed by URL: both Hacker News publishers share one front-page request.
    const existing = cache.get(source.url);
    if (existing && now() - existing.at < 600_000) return existing.promise;
    const promise = Promise.resolve().then(() => fetchFeed(source)).then(text => ({ text }), () => ({ failed: true }));
    cache.set(source.url, { at: now(), promise });
    return promise;
  }
  async function load(source) {
    const row = await body(source);
    if (row.failed) return { items: [], failed: true };
    try { return { items: (source.format === 'hn' ? parseHn : parseFeed)(row.text, source, now()), failed: false }; }
    catch { return { items: [], failed: true }; }
  }
  return async topics => {
    const rows = [];
    for (const source of SOURCES.filter(row => topics.includes(row.topic))) rows.push(await load(source));
    const trends = readTrends && topics.some(topic => topic !== 'memes') ? await readTrends().catch(() => []) : [];
    return { items: rows.flatMap(row => row.items).filter(item => now() - item.publishedAt <= 3 * DAY),
      failures: rows.filter(row => row.failed).length, trends };
  };
}

module.exports = { SOURCES, ALWAYS_ON, MAX_FEED_BYTES, publicIPv4, readFeed, plain, articleUrl, imageUrl, parseFeed, parseHn, createFeedReader,
  deskOf, deskTopics, onlyFits };