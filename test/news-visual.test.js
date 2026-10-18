'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ComponentType, MessageFlags, MessagePayload } = require('discord.js');
const { SOURCES, imageUrl, parseFeed, createFeedReader } = require('../src/news/feeds');
const { digestPayload } = require('../src/news/presentation');

const NOW = Date.parse('2026-10-16T01:00:00Z');
const source = SOURCES[1];
const image = `https://${source.imageHost}${source.imagePath}2026/story.jpg`;
const title = 'Contoh artikel sintetis';
function rss(media, publisher = source) {
  return `<rss><channel><item><title>${title}</title><link>https://${publisher.hosts[0]}/article/</link><pubDate>${new Date(NOW - 1000).toUTCString()}</pubDate>${media}</item></channel></rss>`;
}
function item(overrides = {}) {
  return { title, excerpt: 'Cuplikan pendek dari penerbit.', url: 'https://blogs.nvidia.com/article/',
    source: source.name, topic: 'ai', publishedAt: NOW - 1000, imageUrl: image, ...overrides };
}

test('image URLs only admit verified per-publisher HTTPS raster paths', () => {
  for (const publisher of SOURCES) {
    for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp']) {
      const url = `https://${publisher.imageHost}${publisher.imagePath}sample.${extension}`;
      assert.equal(imageUrl(url, publisher), url);
    }
  }
  assert.equal(imageUrl(`${image}?utm_source=rss#section`, source), image);
  for (const url of [
    'http://blogs.nvidia.com/wp-content/uploads/a.jpg', 'https://127.0.0.1/a.jpg',
    'https://169.254.169.254/a.jpg', 'https://localhost/a.jpg', 'https://[::1]/a.jpg',
    'https://blogs.nvidia.com.evil.invalid/wp-content/uploads/a.jpg',
    'https://blogs.nvidia.com@evil.invalid/wp-content/uploads/a.jpg',
    'https://user:pass@blogs.nvidia.com/wp-content/uploads/a.jpg',
    'https://blogs.nvidia.com:443/wp-content/uploads/a.jpg',
    'https://blogs.nvidia.com:8443/wp-content/uploads/a.jpg',
    'https://blogs.nvidia.com/redirect/a.jpg', 'https://blogs.nvidia.com/wp-content/uploads/../../../a.jpg',
    `${image}?url=https://private.invalid/`, `${image}?token=secret`, `${image}?tracking=1`,
    image.replace('.jpg', '.svg'), image.replace('.jpg', '.html'), image.replace('.jpg', '.mp4'),
    image.replace('/story', '/%2e%2e/%2fstory'), image.replace('/story', '/%250astory'),
    `${image}\n`, `${image}%0a`, 'data:image/png;base64,a', 'attachment://image.png',
    'https://blogs.nvidia.com\\@evil.invalid/wp-content/uploads/a.jpg', 'x'.repeat(1001),
  ]) assert.equal(imageUrl(url, source), null, url);
  assert.equal(imageUrl(image, SOURCES[0]), null);
  assert.equal(imageUrl(image, { ...source }), null);
});

test('RSS extracts media thumbnail/content, image enclosures and HTML per entry', () => {
  for (const media of [
    `<media:thumbnail url="${image}"/>`,
    `<media:content medium="image" type="image/jpeg" url="${image}" />`,
    `<enclosure type="image/jpeg" url="${image}"/>`,
    `<description><![CDATA[<p>Cuplikan.</p><img width="1200" height="630" src="${image}" alt="demo"/>]]></description>`,
    `<content:encoded><![CDATA[<img src='${image}'/>]]></content:encoded>`,
    `<description>&lt;img src=&quot;${image}&quot;/&gt;</description>`,
  ]) assert.equal(parseFeed(rss(media), source, NOW)[0].imageUrl, image);
});

test('Atom encoded image is attributed to the comic entry without HTML in text', () => {
  const comic = SOURCES[3];
  const url = 'https://imgs.xkcd.com/comics/example.png';
  const xml = `<feed><entry><title>Komik contoh</title><link rel="alternate" href="https://xkcd.com/123/"/><updated>${new Date(NOW - 1000).toISOString()}</updated><summary>&lt;img src="${url}" alt="comic"/&gt; Penjelasan.</summary></entry></feed>`;
  const row = parseFeed(xml, comic, NOW)[0];
  assert.equal(row.imageUrl, url); assert.equal(row.excerpt, 'Penjelasan.');
  const payload = digestPayload({ tone: 'casual' }, [row], NOW);
  assert.match(JSON.stringify(payload), /Hiburan, bukan berita faktual/);
});

test('unsafe, missing, tracker, video, script and unrelated images do not hide text', () => {
  for (const media of [
    '', '<img src="https://private.invalid/a.jpg"/>',
    `<img src="${image}" width="1" height="1"/>`,
    `<media:content medium="video" url="${image}"/>`,
    `<enclosure type="text/html" url="${image}"/>`,
    `<enclosure url="${image}"/>`,
    `<script><img src="${image}"/></script>`, `<!-- <img src="${image}"/> -->`,
  ]) {
    const row = parseFeed(rss(media), source, NOW)[0];
    assert.equal(row.imageUrl, null); assert.equal(row.title, title);
    const card = digestPayload({ tone: 'casual' }, [row], NOW).components[1];
    assert.equal(card.components.length, 1);
    assert.equal(card.components[0].type, ComponentType.TextDisplay);
    assert.match(card.components[0].content, /Gambar tidak tersedia/);
    assert.match(card.components[0].content, /Baca di NVIDIA Blog/);
  }
  const xml = rss(`<img src="https://private.invalid/a.jpg"/><img src="${image}"/>`);
  assert.equal(parseFeed(xml, source, NOW)[0].imageUrl, image);
  const noImage = rss('').replace('</channel>', `<image><url>${image}</url></image></channel>`);
  assert.equal(parseFeed(noImage, source, NOW)[0].imageUrl, null);
});

test('each visual news card puts one image above title, excerpt and source', () => {
  const payload = digestPayload({ tone: 'casual' }, [item()], NOW);
  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  assert.equal(payload.embeds, undefined); assert.equal(payload.content, undefined);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  const card = payload.components[1];
  assert.equal(card.type, ComponentType.Container);
  assert.equal(card.components[0].type, ComponentType.MediaGallery);
  assert.equal(card.components[0].items.length, 1);
  assert.equal(card.components[0].items[0].media.url, image);
  assert.match(card.components[0].items[0].description, /Gambar dari NVIDIA Blog/);
  assert.equal(card.components[1].type, ComponentType.TextDisplay);
  assert.match(card.components[1].content, /### Contoh artikel sintetis/);
  assert.match(card.components[1].content, /Cuplikan sumber:/);
  assert.match(card.components[1].content, /\[Baca di NVIDIA Blog\]\(https:\/\/blogs.nvidia.com\/article\/\)/);
  assert.match(card.components[1].content, /2026-10-16 WIB/);
});

test('preview and send share cards, stay bounded and survive invalid images without a fetch', async () => {
  let reads = 0;
  const reader = createFeedReader({ now: () => NOW, fetchFeed: async () => {
    reads++; return rss(`<img src="${image}"/>`);
  } });
  const { items } = await reader(['ai']);
  await reader(['ai']); assert.equal(reads, 1);
  const sent = digestPayload({ tone: 'casual' }, items, NOW);
  const preview = digestPayload({ tone: 'casual' }, items, NOW, 'Preview privat. Belum dikirim.');
  assert.deepEqual(preview.components.slice(1), sent.components);
  const unsafe = digestPayload({ tone: 'neutral' }, [item({ imageUrl: 'https://private.invalid/a.jpg' })], NOW);
  assert.equal(unsafe.components[1].components.length, 1);
  assert.throws(() => digestPayload({}, [item({ url: 'https://evil.invalid/' })], NOW), /ARTICLE_INVALID/);
  const full = digestPayload({ tone: 'casual' }, Array.from({ length: 4 }, () => item({ title: '@everyone '.repeat(50), excerpt: '<script>hi</script> '.repeat(50) })), NOW);
  assert.equal(full.components.filter(row => row.type === ComponentType.Container).length, 3);
  assert(!JSON.stringify(full).includes('@everyone'));
  assert(!JSON.stringify(full).includes('<script>'));
  const texts = full.components.flatMap(c => c.components || [c]).filter(c => c.type === ComponentType.TextDisplay);
  assert(texts.reduce((total, c) => total + c.content.length, 0) < 4000);
  assert(full.components.length + full.components.reduce((sum, c) => sum + (c.components?.length || 0), 0) < 40);
});

test('installed Discord SDK serializes visual payload without legacy content/embeds or attachments', async () => {
  const payload = digestPayload({ tone: 'casual' }, [item()], NOW);
  const sdk = new MessagePayload({ client: { options: { jsonTransformer: value => value } } }, payload);
  await sdk.resolveBody();
  assert.equal(sdk.body.flags, MessageFlags.IsComponentsV2);
  assert.equal(sdk.body.content, undefined); assert.equal(sdk.body.embeds, undefined);
  assert.equal(sdk.body.components[1].components[0].items[0].media.url, image);
  assert.deepEqual(sdk.body.allowed_mentions, { parse: [] });
  assert.equal(sdk.files, null);
});

test('news and entertainment cards omit availability counters in send and preview', () => {
  const comic = item({ topic: 'memes', source: SOURCES[3].name,
    url: 'https://xkcd.com/123/', imageUrl: 'https://imgs.xkcd.com/comics/example.png' });
  for (const tone of ['casual', 'neutral']) {
    for (const items of [[item()], [comic], [item(), comic]]) {
      for (const intro of ['', 'Preview privat. Belum dikirim.']) {
        const payload = digestPayload({ tone, count: 3, topics: ['ai', 'memes'] }, items, NOW, intro);
        const output = JSON.stringify(payload);
        assert.doesNotMatch(output, /Tersedia \d+ berita|\d+ hiburan|Bahan segar belum cukup/);
        assert.match(output, items.every(row => row.topic === 'memes') ? /Hengs Memes/ : /Hengs News/);
        assert.deepEqual(payload.allowedMentions, { parse: [] });
        assert.equal(payload.components.filter(row => row.type === ComponentType.Container).length, items.length);
      }
    }
  }
});
