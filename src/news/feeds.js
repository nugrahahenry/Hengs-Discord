'use strict';

const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const crypto = require('node:crypto');
const { DAY } = require('./store');

const SOURCES = Object.freeze([
  Object.freeze({ id: 'mozilla', topic: 'tech', name: 'Mozilla Hacks', url: 'https://hacks.mozilla.org/feed/', hosts: ['hacks.mozilla.org'], imageHost: 'hacks.mozilla.org', imagePath: '/wp-content/uploads/' }),
  Object.freeze({ id: 'nvidia', topic: 'ai', name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/', hosts: ['blogs.nvidia.com'], imageHost: 'blogs.nvidia.com', imagePath: '/wp-content/uploads/' }),
  Object.freeze({ id: 'steam', topic: 'gaming', name: 'Steam News', url: 'https://store.steampowered.com/feeds/news.xml', hosts: ['store.steampowered.com', 'steamcommunity.com'], imageHost: 'cdn.fastly.steamstatic.com', imagePath: '/steam/apps/' }),
  Object.freeze({ id: 'xkcd', topic: 'memes', name: 'xkcd (komik)', url: 'https://xkcd.com/atom.xml', hosts: ['xkcd.com'], imageHost: 'imgs.xkcd.com', imagePath: '/comics/' }),
]);
const MAX_FEED_BYTES = 1024 * 1024;
for (const source of SOURCES) Object.freeze(source.hosts);

function publicIPv4(value) {
  if (net.isIP(value) !== 4) return false;
  const [a, b, c] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function publicLookup(host, options, callback) {
  dns.lookup(host, { family: 4, all: true }, (error, records) => {
    if (error || !records?.length || records.some(row => !publicIPv4(row.address))) {
      callback(new Error('NEWS_DNS_REJECTED')); return;
    }
    callback(null, records[0].address, 4);
  });
}

function readFeed(source, { request = https.request, lookup = publicLookup, timeoutMs = 10_000 } = {}) {
  if (!SOURCES.some(row => row === source)) return Promise.reject(new Error('NEWS_SOURCE_REJECTED'));
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let finished = false;
    const end = (error, content) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (error) reject(new Error('NEWS_FEED_UNAVAILABLE')); else resolve(content);
    };
    let req;
    try {
      req = request(source.url, { method: 'GET', agent: false, lookup, family: 4,
        signal: controller.signal, headers: { 'User-Agent': 'Hengs-News/1.0', Accept: 'application/rss+xml, application/atom+xml, text/xml', 'Accept-Encoding': 'identity' } }, res => {
        const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (res.statusCode !== 200 || !['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml'].includes(type)
          || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
          || Number(res.headers['content-length'] || 0) > MAX_FEED_BYTES) {
          res.destroy(); end(true); return;
        }
        let bytes = 0; const chunks = [];
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > MAX_FEED_BYTES) { res.destroy(); end(true); return; }
          chunks.push(chunk);
        });
        res.on('end', () => end(null, Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => end(true));
        res.on('aborted', () => end(true));
      });
      req.on('error', () => end(true));
      req.end();
    } catch { req?.destroy(); end(true); }
  });
}

function plain(value, max = 200) {
  // Feed markup is data, never rendered as HTML or passed to a model.
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
  if (!SOURCES.includes(source) || typeof raw !== 'string' || raw.length > 1000
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

function createFeedReader({ fetchFeed = readFeed, now = Date.now } = {}) {
  const cache = new Map();
  async function load(source) {
    const existing = cache.get(source.id);
    if (existing && now() - existing.at < 600_000) return existing.promise;
    const promise = (async () => {
      try { return { items: parseFeed(await fetchFeed(source), source, now()), failed: false }; }
      catch { return { items: [], failed: true }; }
    })();
    cache.set(source.id, { at: now(), promise });
    return promise;
  }
  return async topics => {
    const rows = [];
    for (const source of SOURCES.filter(row => topics.includes(row.topic))) rows.push(await load(source));
    return { items: rows.flatMap(row => row.items).filter(item => now() - item.publishedAt <= 3 * DAY),
      failures: rows.filter(row => row.failed).length };
  };
}

module.exports = { SOURCES, MAX_FEED_BYTES, publicIPv4, readFeed, plain, articleUrl, imageUrl, parseFeed, createFeedReader };
