'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { fetchBounded } = require('../src/news/http');
const { keywords, sameStory, rankArticles, parseTrends, createTrendReader, SENSITIVE } = require('../src/news/trending');

const NOW = Date.parse('2026-10-21T03:00:00Z');
const HOUR = 3_600_000;
function fakeRequest(type = 'image/png', body = Buffer.from([1, 2, 3])) {
  return (url, options, callback) => {
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { 'content-type': type }; res.destroy = () => {};
      callback(res); res.emit('data', body); res.emit('end');
    };
    return req;
  };
}

test('bounded fetch only talks to listed HTTPS hosts and returns bytes of an allowed type', async () => {
  const options = { hosts: ['api.memegen.link'], types: ['image/png'], maxBytes: 10, request: fakeRequest() };
  assert.deepEqual(await fetchBounded('https://api.memegen.link/images/x.png', options), Buffer.from([1, 2, 3]));
  for (const url of ['http://api.memegen.link/x.png', 'https://evil.example/x.png', 'https://api.memegen.link:8443/x.png',
    'https://u:p@api.memegen.link/x.png', 'not a url']) {
    await assert.rejects(fetchBounded(url, options), /REJECTED/, url);
  }
  await assert.rejects(fetchBounded('https://api.memegen.link/x.png', { ...options, types: ['image/jpeg'] }), /FAILED/);
  await assert.rejects(fetchBounded('https://api.memegen.link/x.png', { ...options, maxBytes: 2 }), /FAILED/);
});

function story(source, title, ageHours, extra = {}) {
  const url = `https://${source}.example/${encodeURIComponent(title)}`;
  return { title, excerpt: '', url, source, topic: 'tech', publishedAt: NOW - ageHours * HOUR, imageUrl: null,
    hash: crypto.createHash('sha256').update(url).digest('hex'), ...extra };
}

test('keywords drop stopwords and accents; one story needs two shared words with one strong word', () => {
  assert.deepEqual(keywords('Atlético Madrid menang, dan yang lain'), ['atletico', 'madrid', 'menang', 'lain']);
  assert.deepEqual(keywords('iPhone 18 rilis di Indonesia'), ['iphone', '18', 'rilis', 'indonesia']);
  assert.equal(sameStory(keywords('Samsung Galaxy S26 resmi meluncur'), keywords('Galaxy S26 dijual mulai hari ini')), true);
  assert.equal(sameStory(keywords('Samsung rilis HP lipat'), keywords('Apple rilis iPad baru')), false);
});

test('sensitive filter blocks politics, tragedy and gambling but not ordinary tech or gaming words', () => {
  for (const title of ['Kampanye pemilu pakai AI', 'Korban jiwa gempa', 'Situs judol diblokir', 'Drones over Ukraine']) {
    assert.ok(SENSITIVE.test(title), title);
  }
  for (const title of ['Demo produk baru', 'Model AI terbaru', 'Patch MLBB baru', 'War besar di MPL']) {
    assert.equal(SENSITIVE.test(title), false, title);
  }
});

test('heat follows Hacker News velocity, coverage across publishers, Google Trends and age', () => {
  const fast = story('hn', 'Synthetic compiler release', 2, { points: 400, comments: 120 });
  const slow = story('hn', 'Synthetic database essay', 30, { points: 400, comments: 120 });
  const a = story('cnn', 'Galaxy S26 resmi meluncur di Indonesia', 3);
  const b = story('liputan6', 'Harga Galaxy S26 di Indonesia', 4);
  const c = story('okezone', 'Galaxy S26 dijual mulai hari ini', 5);
  const sameDesk = story('cnn', 'Galaxy S26 punya fitur baru', 2);
  const lone = story('cnn', 'Tips merawat baterai laptop', 1);
  const rows = rankArticles([fast, slow, a, b, c, sameDesk, lone],
    { now: NOW, trends: [{ term: 'galaxy s26', traffic: 2000, words: ['galaxy', 's26'] }] });
  const by = title => rows.find(row => row.title === title);
  assert.ok(by('Synthetic compiler release').heat > by('Synthetic database essay').heat);
  assert.equal(by('Synthetic compiler release').reason, '200 poin per jam di Hacker News');
  const main = by('Galaxy S26 resmi meluncur di Indonesia');
  assert.equal(main.reason, 'dibahas 3 media dalam 12 jam');
  assert.equal(main.trending, true);
  // Siblings come from other publishers only, so a desk's own follow-up stays eligible later.
  assert.deepEqual(new Set(main.siblings), new Set([b.hash, c.hash]));
  assert.ok(main.heat > by('Tips merawat baterai laptop').heat);
  assert.equal(by('Tips merawat baterai laptop').reason, null);
  assert.deepEqual(by('Tips merawat baterai laptop').siblings, []);
});

test('Google Trends feed gives terms, traffic and freshness without trusting markup', () => {
  const item = (title, traffic, ageHours) => `<item><title>${title}</title><ht:approx_traffic>${traffic}</ht:approx_traffic><pubDate>${new Date(NOW - ageHours * HOUR).toUTCString()}</pubDate></item>`;
  const xml = `<rss><channel>${item('Galaxy S26', '2000+', 2)}${item('mobile legends', '10K+', 1)}${item('lama', '500+', 72)}${item('&lt;b&gt;bold&lt;/b&gt;', '100+', 1)}${item('setengah', '2.5K+', 1)}</channel></rss>`;
  assert.deepEqual(parseTrends(xml, NOW).map(row => [row.term, row.traffic]),
    [['Galaxy S26', 2000], ['mobile legends', 10000], ['bold', 100], ['setengah', 2500]]);
  assert.deepEqual(parseTrends(xml, NOW)[0].words, ['galaxy', 's26']);
  assert.throws(() => parseTrends('<!DOCTYPE x><rss></rss>', NOW), /INVALID/);
});

test('trend reader caches for thirty minutes and fails quietly', async () => {
  let now = NOW; let calls = 0; let fail = false;
  const read = createTrendReader({ now: () => now, fetchText: async () => {
    calls++; if (fail) throw new Error('down');
    return `<rss><channel><item><title>valorant</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>${new Date(now - HOUR).toUTCString()}</pubDate></item></channel></rss>`;
  } });
  assert.equal((await read())[0].term, 'valorant'); await read(); assert.equal(calls, 1);
  now += 31 * 60_000; fail = true;
  assert.deepEqual(await read(), []); assert.equal(calls, 2);
});
const { SOURCES, parseHn, createFeedReader } = require('../src/news/feeds');
const hn = SOURCES.find(row => row.id === 'hackernews');
const hnAi = SOURCES.find(row => row.id === 'hackernews-ai');

test('new sources keep fixed hosts, Indonesian media carry no images and HN shares one URL', () => {
  assert.deepEqual(SOURCES.slice(0, 5).map(row => row.id), ['mozilla', 'nvidia', 'steam', 'xkcd', 'cloudflare']);
  for (const id of ['cnnindonesia', 'cnbcindonesia', 'liputan6', 'okezone', 'antara', 'gamebrott', 'jagatplay', 'esportsnesia', 'revivaltv']) {
    const source = SOURCES.find(row => row.id === id);
    assert.ok(source, id); assert.equal(source.imageHost, null, id);
    assert.ok(source.url.startsWith('https://'), id); assert.ok(source.hosts.length >= 1, id);
  }
  assert.equal(hn.url, hnAi.url); assert.equal(hn.name, hnAi.name);
  assert.deepEqual([hn.topic, hnAi.topic], ['tech', 'ai']);
  assert.equal(new Set(SOURCES.map(row => `${row.name}:${row.topic}`)).size, SOURCES.length);
});

test('Hacker News front page becomes discussion links split into AI and tech', () => {
  const body = JSON.stringify({ hits: [
    { objectID: '101', title: 'New LLM beats benchmarks', url: 'https://www.example.com/a', points: 300, num_comments: 90, created_at_i: (NOW - 3 * HOUR) / 1000 },
    { objectID: '102', title: 'A tiny text editor', url: 'https://blog.example.org/b', points: 50, num_comments: 4, created_at_i: (NOW - HOUR) / 1000 },
    { objectID: 'x', title: 'Bad id', points: 5, created_at_i: NOW / 1000 },
    { objectID: '103', title: 'Old story', points: 900, created_at_i: (NOW - 96 * HOUR) / 1000 },
    { objectID: '104', title: 'Zero points', points: 0, created_at_i: NOW / 1000 },
  ] });
  const tech = parseHn(body, hn, NOW); const ai = parseHn(body, hnAi, NOW);
  assert.deepEqual(tech.map(row => row.title), ['A tiny text editor']);
  assert.deepEqual(ai.map(row => row.title), ['New LLM beats benchmarks']);
  assert.equal(ai[0].url, 'https://news.ycombinator.com/item?id=101');
  assert.equal(ai[0].domain, 'example.com'); assert.equal(ai[0].points, 300);
  assert.equal(ai[0].excerpt, 'Dibahas di Hacker News: 300 poin dan 90 komentar dalam 3 jam.');
  assert.throws(() => parseHn('<html>', hn, NOW), /INVALID/);
});

test('feed reader fetches each URL once, parses HN as JSON and returns trends', async () => {
  const urls = [];
  const read = createFeedReader({ now: () => NOW, readTrends: async () => [{ term: 'valorant', traffic: 500, words: ['valorant'] }],
    fetchFeed: async source => { urls.push(source.url); return source.format === 'hn'
      ? JSON.stringify({ hits: [{ objectID: '7', title: 'OpenAI ships a model', points: 10, num_comments: 1, created_at_i: (NOW - HOUR) / 1000 }] })
      : '<rss><channel></channel></rss>'; } });
  const result = await read(['tech', 'ai']);
  assert.equal(urls.filter(url => url === hn.url).length, 1);
  assert.deepEqual(result.items.map(row => [row.source, row.topic]), [['Hacker News', 'ai']]);
  assert.equal(result.trends[0].term, 'valorant'); assert.equal(result.failures, 0);
  assert.deepEqual((await read(['memes'])).trends, []);
});