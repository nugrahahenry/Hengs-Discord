'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ChannelType, ComponentType, MessageFlags } = require('discord.js');
const { createNewsStore, validateState, wibClock, DAY } = require('../src/news/store');
const { SOURCES, publicIPv4, articleUrl, parseFeed, createFeedReader, readFeed, plain, MAX_FEED_BYTES } = require('../src/news/feeds');
const { parsePrompt, editSettings, DEFAULTS } = require('../src/news/prompts');
const { createNewsService } = require('../src/news/service');
const { createNewsEditor } = require('../src/news/editor');
const { selectStateEntries } = require('../scripts/cloud/state-transfer');
const hengs = require('../src/commands/hengs');

const GUILD = '223456789012345678';
const OTHER = '923456789012345678';
const USER = '323456789012345678';
const CHANNEL = '423456789012345678';
const MEMES = '523456789012345678';
const BASE = Date.parse('2026-10-13T01:00:00Z');
const { GAP, CADENCE, dueSlot, scheduleTimes } = require('../src/news/cadence');
const { upgradeState, downgradeState } = require('../src/news/store');
const settings = () => ({ ...structuredClone(DEFAULTS), channelId: CHANNEL });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-news-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'news-state.json');
  let time = BASE;
  const now = () => time;
  const store = createNewsStore({ filePath, now });
  return { root, filePath, now, store, advance: ms => { time += ms; } };
}
function rss(source = SOURCES[0], count = 5, now = BASE) {
  return `<rss><channel>${Array.from({ length: count }, (_, i) => `<item><title>Update ${i} @everyone</title><link>https://${source.hosts[0]}/news/${i}/?utm_source=test</link><pubDate>${new Date(now - i * 1000 - 1000).toUTCString()}</pubDate><description><![CDATA[<p>Cuplikan ${i} <img src="http://private.invalid/image"> dari sumber.</p>]]></description></item>`).join('')}</channel></rss>`;
}
function rig(t, options = {}) {
  const f = fixture(t);
  let permission = true; let enabledScope = true; let sendError = false;
  const sent = []; const logs = []; const destinations = [];
  const channel = { id: CHANNEL, name: 'hengs-news', guildId: GUILD, type: ChannelType.GuildText,
    permissionsFor: () => ({ has: () => permission }),
    async send(payload) { destinations.push(this.id); sent.push(payload); if (sendError) throw new Error('PRIVATE RAW ERROR'); return { id: 'synthetic' }; } };
  const memeChannel = { ...channel, id: MEMES, name: 'hengs-memes' };
  const guild = { id: GUILD, ownerId: USER, channels: {
    cache: new Map([[CHANNEL, channel], [MEMES, memeChannel]]), async fetch(id) { return this.cache.get(id); },
  }, members: { async fetchMe() { return {}; } } };
  const guildAccess = { classify: () => ({ kind: enabledScope ? 'home' : 'pending' }) };
  const readFeeds = options.readFeeds || (async () => ({ items: parseFeed(rss(SOURCES[0], 5, f.now()), SOURCES[0], f.now()), failures: 0 }));
  const service = createNewsService({ store: f.store, now: f.now, readFeeds, guildAccess,
    editArticles: options.editArticles, memeMaker: options.memeMaker,
    logger: { error: code => logs.push(code) } });
  t.after(() => service.stop());
  const interaction = { guildId: GUILD, channelId: CHANNEL, user: { id: USER }, guild };
  const client = { guilds: { cache: new Map([[GUILD, guild]]) } };
  const handle = prompt => service.handle(interaction, prompt);
  return { ...f, service, handle, interaction, channel, guild, sent, destinations, logs, client, guildAccess,
    deny: () => { permission = false; }, disable: () => { enabledScope = false; }, failSend: () => { sendError = true; } };
}
async function testedRow(r) {
  await r.handle('atur berita teknologi AI jam 08:00 ke #hengs-news');
  const preview = await r.handle('preview berita');
  assert.equal(preview.components.filter(row => row.type === ComponentType.Container).length, 1);
  assert.equal(preview.flags, MessageFlags.IsComponentsV2);
  assert.match((await r.handle('kirim berita sekali')).content, /berhasil/);
  await r.handle('preview berita');
  assert.match((await r.handle('aktifkan berita')).content, /Jadwal berita aktif/);
}

test('split-route parsing supports decorated names, keeps topics and rejects ambiguous/same targets', () => {
  const channels = [{ id: CHANNEL, name: '📰・hengs-news' }, { id: MEMES, name: '😂・hengs-memes' }];
  const value = editSettings('atur berita 2 berita 1 meme ke #hengs-news, meme ke #hengs-memes', DEFAULTS, channels);
  assert.equal(value.channelId, CHANNEL); assert.equal(value.memeChannelId, MEMES);
  assert.deepEqual(value.topics, ['tech', 'ai']); assert.equal(value.count, 2); assert.equal(value.memeCount, 1);
  const routeOnly = editSettings(`atur berita meme ke <#${MEMES}>`, settings(), channels);
  assert.deepEqual(routeOnly.topics, settings().topics); assert.equal(routeOnly.channelId, CHANNEL);
  assert.throws(() => editSettings(`atur berita meme ke <#${CHANNEL}>`, settings(), channels), /berbeda/);
  assert.throws(() => editSettings('atur berita meme ke #hengs-memes', settings(), [...channels, { id: OTHER, name: 'hengs-memes' }]), /belum ditemukan/);
});

test('v4 rollback pauses unsupported schedules and memes without a route are skipped', async t => {
  const r = rig(t); await testedRow(r);
  const state = JSON.parse(fs.readFileSync(r.filePath, 'utf8'));
  assert.equal(state.schemaVersion, 4);
  const v3 = downgradeState(state, 3);
  assert.equal(v3.schemaVersion, 3); assert.equal(v3.guilds[0].enabled, true);
  assert.deepEqual(v3.guilds[0].settings, { channelId: CHANNEL, memeChannelId: null, topics: ['tech', 'ai'], time: '08:00', count: 3, tone: 'casual' });
  assert.deepEqual(v3.guilds[0].receipts.map(x => [x.day, x.slot, x.status]), [[wibClock(BASE).day, -1, 'cancelled']]);
  assert.equal(downgradeState(state, 2).guilds[0].settings.memeChannelId, undefined);
  assert.throws(() => downgradeState(state, 4), /ROLLBACK_VERSION/);
  const bad = structuredClone(state); bad.guilds[0].settings.memeChannelId = CHANNEL;
  assert.throws(() => validateState(bad), /STATE_INVALID/);
  let row = r.store.get(GUILD);
  row = r.store.revise(GUILD, row.revision, { ...row.settings, memeCount: 1, memeTime: '15:00' });
  r.advance(DAY + 7 * 60 * 60_000); r.service.start(r.client); // 15:00 WIB next day, news windows already over
  const count = r.sent.length; await r.service.tick(); await r.service.tick();
  assert.equal(r.sent.length, count);
  assert.deepEqual(['kind', 'slot', 'status'].map(key => r.store.get(GUILD).receipts.at(-1)[key]), ['meme', 0, 'cancelled']);
  row = r.store.get(GUILD);
  r.store.revise(GUILD, row.revision, { ...row.settings, count: 5 });
  const busy = downgradeState(JSON.parse(fs.readFileSync(r.filePath, 'utf8')), 3);
  assert.equal(busy.guilds[0].enabled, false, 'older runtimes must not resume a schedule they cannot follow');
  assert.equal(busy.guilds[0].settings.count, 3);
});

test('v3 state upgrades to separate news and meme counts without writing', t => {
  const f = fixture(t);
  const legacy = { schemaVersion: 3, guilds: [{ guildId: GUILD, revision: 4, enabled: true, tested: true, updatedAt: BASE,
    settings: { channelId: CHANNEL, memeChannelId: MEMES, topics: ['tech', 'ai', 'memes'], time: '08:00', count: 3, tone: 'casual' },
    receipts: [{ day: '2026-10-12', status: 'sent', at: BASE - DAY, hashes: ['a'.repeat(64)], slot: 2, publisher: 'xkcd' },
      { day: '2026-10-12', status: 'sent', at: BASE - DAY - 7_200_000, hashes: ['b'.repeat(64)], slot: 0, publisher: 'mozilla' }],
    seen: [{ hash: 'a'.repeat(64), at: BASE - DAY }] }] };
  fs.writeFileSync(f.filePath, JSON.stringify(legacy));
  const bytes = fs.readFileSync(f.filePath);
  const row = f.store.get(GUILD);
  assert.deepEqual(row.settings, { channelId: CHANNEL, memeChannelId: MEMES, topics: ['tech', 'ai'], time: '08:00', count: 2,
    memeTime: '13:00', memeCount: 1, tone: 'casual' });
  assert.equal(row.enabled, true);
  assert.deepEqual(row.receipts.map(x => [x.kind, x.slot]), [['meme', 2], ['news', 0]]);
  assert.deepEqual(fs.readFileSync(f.filePath), bytes, 'read-only upgrade must not write');
  const memesOnly = structuredClone(legacy); memesOnly.guilds[0].settings.topics = ['memes'];
  fs.writeFileSync(f.filePath, JSON.stringify(memesOnly));
  const paused = f.store.get(GUILD);
  assert.equal(paused.enabled, false); assert.equal(paused.settings.memeCount, 3); assert.deepEqual(paused.settings.topics, ['tech', 'ai']);
});

test('adding a distinct meme destination requires preview and preserves prior delivery evidence', async t => {
  const r = rig(t); await testedRow(r); const before = r.store.get(GUILD);
  await r.handle('atur berita meme ke #hengs-memes');
  assert.match((await r.handle('terapkan berita')).content, /preview berita/);
  await r.handle('preview berita'); assert.match((await r.handle('terapkan berita')).content, /Revisi berita diterapkan/);
  const after = r.store.get(GUILD); assert.equal(after.settings.memeChannelId, MEMES);
  assert.equal(after.enabled, before.enabled); assert.deepEqual(after.receipts, before.receipts);
  assert.deepEqual(after.seen, before.seen); assert.equal(r.sent.length, 1);
});

test('spaced scheduler sends news every two hours and memes on their own clock', async t => {
  // Distinct titles per publisher, otherwise ranking treats them as one story and sends it once.
  const r = rig(t, { readFeeds: async topics => ({ items: [SOURCES[0], SOURCES[1], SOURCES[3]]
    .filter(source => topics.includes(source.topic))
    .flatMap(source => parseFeed(rss(source, 3, r.now()).replaceAll('Update', source.id), source, r.now())), failures: 0 }) });
  let row = r.store.save(GUILD, 0, { ...settings(), memeChannelId: MEMES, count: 2, memeTime: '11:00', memeCount: 1 });
  // Existing destination proof from yesterday, not an extra live test today.
  row = r.store.claim(GUILD, row.revision, '2026-10-12', [], 'claimed');
  row = r.store.finish(GUILD, row.revision, '2026-10-12', 'sent');
  r.advance(DAY);
  r.store.enable(GUILD, row.revision);
  r.service.start(r.client);
  await Promise.all([r.service.tick(), r.service.tick()]);
  assert.equal(r.sent.length, 1);
  r.advance(CADENCE - 1); await r.service.tick(); assert.equal(r.sent.length, 1);
  r.advance(1); await r.service.tick(); assert.equal(r.sent.length, 2);
  r.service.stop();
  const restarted = createNewsService({ store: createNewsStore({ filePath: r.filePath, now: r.now }), now: r.now,
    readFeeds: async () => ({ items: parseFeed(rss(SOURCES[3], 1, r.now()), SOURCES[3], r.now()), failures: 0 }), guildAccess: r.guildAccess });
  t.after(() => restarted.stop()); restarted.start(r.client);
  await restarted.tick(); assert.equal(r.sent.length, 2);
  r.advance(GAP); await restarted.tick(); assert.equal(r.sent.length, 3);
  assert.equal(new Set(r.sent.map(x => x.nonce)).size, 3);
  for (const payload of r.sent) {
    assert.equal(payload.components.filter(x => x.type === ComponentType.Container).length, 1);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  }
  assert.match(JSON.stringify(r.sent[2]), /Jeda komik/);
  assert.deepEqual(r.destinations, [CHANNEL, CHANNEL, MEMES]);
  assert.deepEqual(r.store.get(GUILD).receipts.filter(x => x.slot >= 0).map(x => [x.kind, x.slot]), [['news', 0], ['news', 1], ['meme', 0]]);
  r.advance(CADENCE); await restarted.tick(); assert.equal(r.sent.length, 3);
});

test('cadence skips expired slots, honors actual finish spacing and never crosses midnight quota', t => {
  const f = fixture(t);
  let row = f.store.save(GUILD, 0, settings());
  assert.deepEqual(dueSlot(row, BASE + CADENCE * 2), { day: wibClock(BASE).day, slot: 2, kind: 'news' });
  row = f.store.claim(GUILD, row.revision, wibClock(BASE).day, ['a'.repeat(64)], 'claimed', 0, 'mozilla');
  f.advance(30_000); row = f.store.finish(GUILD, row.revision, wibClock(BASE).day, 'sent', 0);
  assert.equal(dueSlot(row, BASE + GAP), null);
  assert.equal(dueSlot(row, BASE + CADENCE).slot, 1);
  assert.throws(() => f.store.claim(GUILD, row.revision, wibClock(BASE).day, [], 'empty', 1), /GAP_REQUIRED/);
  assert.deepEqual(scheduleTimes({ ...settings(), time: '20:30' }), ['20:30', '22:30']);
  assert.deepEqual(scheduleTimes({ ...settings(), memeCount: 5 }, 'meme'), ['13:00', '15:00', '17:00', '19:00', '21:00']);
  assert.equal(dueSlot({ ...row, settings: { ...settings(), time: '23:30' } }, Date.parse('2026-10-14T17:30:00Z')), null);
  assert.equal(dueSlot(row, BASE + CADENCE, 'meme'), null, 'memes are off by default');
  // A news send never blocks a meme slot: gaps are per kind.
  const memeRow = { ...row, settings: { ...row.settings, memeCount: 1, memeTime: '08:00' } };
  assert.deepEqual(dueSlot(memeRow, BASE + 60_000, 'meme'), { day: wibClock(BASE).day, slot: 0, kind: 'meme' });
});

test('legacy news migration preserves evidence and rollback conservatively consumes all used days', t => {
  const f = fixture(t);
  let row = f.store.save(GUILD, 0, settings());
  row = f.store.claim(GUILD, row.revision, wibClock(BASE).day, ['b'.repeat(64)], 'failed', 0, 'mozilla');
  f.advance(GAP); row = f.store.claim(GUILD, row.revision, wibClock(BASE).day, ['c'.repeat(64)], 'sent', 1, 'nvidia');
  const state = JSON.parse(fs.readFileSync(f.filePath, 'utf8'));
  const malformed = structuredClone(state);
  malformed.guilds[0].receipts[0].publisher = false;
  assert.throws(() => validateState(malformed), /STATE_INVALID/);
  const old = downgradeState(state);
  assert.equal(old.schemaVersion, 1); assert.equal(old.guilds[0].receipts.length, 1);
  assert.deepEqual(old.guilds[0].seen, state.guilds[0].seen);
  const migrated = upgradeState(old);
  assert.equal(migrated.guilds[0].receipts[0].slot, -1);
  assert.equal(dueSlot(migrated.guilds[0], BASE + GAP * 2), null);
  fs.writeFileSync(f.filePath, JSON.stringify(old));
  const bytes = fs.readFileSync(f.filePath);
  assert.equal(f.store.get(GUILD).receipts[0].slot, -1);
  assert.deepEqual(fs.readFileSync(f.filePath), bytes, 'read-only upgrade must not write');
  f.store.pause(GUILD);
  assert.equal(JSON.parse(fs.readFileSync(f.filePath)).schemaVersion, 4);
  assert.deepEqual(f.store.get(GUILD).seen, old.guilds[0].seen);
});

test('news fresh install, schema checks, atomic writes, stale revision and tenant boundaries', t => {
  const f = fixture(t);
  assert.deepEqual(f.store.list(), []); assert.equal(fs.existsSync(f.filePath), false);
  const row = f.store.save(GUILD, 0, settings());
  assert.equal(row.enabled, false); assert.equal(row.tested, false);
  assert.equal(f.store.get(OTHER), null);
  assert.throws(() => f.store.enable(GUILD, row.revision), /TEST_REQUIRED/);
  assert.throws(() => f.store.save(GUILD, 0, settings()), /STALE/);
  assert.throws(() => f.store.save('../escape', 0, settings()), /GUILD_INVALID/);
  assert.equal(fs.readdirSync(f.root).length, 1);
  const reopened = createNewsStore({ filePath: f.filePath, now: f.now });
  assert.deepEqual(reopened.get(GUILD), row);
  assert.throws(() => validateState({ schemaVersion: 5, guilds: [] }), /STATE_INVALID/);
  fs.writeFileSync(f.filePath, '{corrupt');
  assert.throws(() => f.store.list(), /STATE_INVALID/);
  assert.throws(() => f.store.save(OTHER, 0, settings()), /STATE_INVALID/);
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), '{corrupt');
});

test('news store does not replace valid state on failed atomic rename', t => {
  const f = fixture(t); f.store.save(GUILD, 0, settings());
  const original = fs.readFileSync(f.filePath, 'utf8');
  const failing = createNewsStore({ filePath: f.filePath, now: f.now,
    fsImpl: { ...fs, renameSync() { throw new Error('DISK_FAILURE'); } } });
  assert.throws(() => failing.save(GUILD, 1, settings()), /DISK_FAILURE/);
  assert.equal(fs.readFileSync(f.filePath, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(f.root), ['news-state.json']);
});

test('news state is selected and validated by encrypted snapshot/restore path', t => {
  const f = fixture(t); f.store.save(GUILD, 0, settings());
  assert.deepEqual(selectStateEntries(f.root), ['news-state.json']);
  fs.writeFileSync(f.filePath, JSON.stringify({ schemaVersion: 99, guilds: [] }));
  assert.throws(() => selectStateEntries(f.root), /STATE_JSON_INVALID/);
});

test('news state rejects duplicate receipts, unexpected fields and oversized files', t => {
  const f = fixture(t); f.store.save(GUILD, 0, settings());
  let row = f.store.claim(GUILD, 1, '2026-10-13', ['a'.repeat(64)]);
  assert.throws(() => f.store.claim(GUILD, row.revision, '2026-10-13', []), /DAY_USED/);
  const state = JSON.parse(fs.readFileSync(f.filePath));
  state.guilds[0].receipts.push(state.guilds[0].receipts[0]);
  assert.throws(() => validateState(state), /STATE_INVALID/);
  state.guilds[0].receipts.pop(); state.guilds[0].secret = 'not allowed';
  assert.throws(() => validateState(state), /STATE_INVALID/);
  fs.writeFileSync(f.filePath, ' '.repeat(2 * 1024 * 1024 + 1));
  assert.throws(() => f.store.get(GUILD), /STATE_INVALID/);
});

test('news receipts persist across restart and prune to thirty days', t => {
  const f = fixture(t); let row = f.store.save(GUILD, 0, settings());
  for (let i = 0; i < 40; i++) {
    row = f.store.claim(GUILD, row.revision, wibClock(f.now()).day, [i.toString(16).padStart(64, '0')], 'empty');
    f.advance(DAY);
  }
  assert.equal(row.receipts.length, 30); assert.equal(row.seen.length, 30);
  assert.equal(createNewsStore({ filePath: f.filePath }).get(GUILD).receipts.length, 30);
  assert.deepEqual(wibClock(Date.parse('2026-10-13T17:30:00Z')), { day: '2026-10-14', time: '00:30' });
});

test('news questions/negations never turn on schedules; drafts have bounded revisions', () => {
  for (const prompt of ['kenapa berita aktif?', 'jangan aktifkan berita', 'kalau aktifkan berita', 'bisa matikan berita?', 'aktifkan berita?']) {
    assert.equal(parsePrompt(prompt).action, 'help');
  }
  assert.equal(parsePrompt('aktifkan berita').action, 'enable');
  assert.equal(parsePrompt('lebih santai'), null);
  assert.equal(parsePrompt('lebih santai', true).action, 'edit');
  assert.equal(parsePrompt('Angel udah tidur belum?'), null);
  let config = editSettings('atur berita teknologi AI jam 08:00 ke #hengs-news', DEFAULTS, [{ name: 'hengs-news', id: CHANNEL }]);
  config = editSettings('kurangi AI, tambahin gaming', config);
  assert.deepEqual(config.topics, ['tech', 'gaming']);
  assert.deepEqual(editSettings('tambah gaming dan AI', { ...config, topics: ['tech'] }).topics, ['tech', 'gaming', 'ai']);
  assert.deepEqual(editSettings('hapus AI dan gaming', { ...config, topics: ['tech', 'ai', 'gaming'] }).topics, ['tech']);
  config = editSettings('ubah jam 09:00, 2 berita, lebih santai', config);
  assert.equal(config.time, '09:00'); assert.equal(config.count, 2);
  for (const prompt of ['ubah jam 25:00', 'ubah jam sembilan', 'atur 20 berita', 'atur berita politik', 'atur berita ke https://localhost']) {
    assert.throws(() => editSettings(prompt, config));
  }
  assert.equal(config.time, '09:00');
});

test('news source boundary rejects private DNS, redirects/unsafe article links and XML entities', async () => {
  for (const ip of ['127.0.0.1', '10.0.1.1', '192.168.1.1', '169.254.169.254', '100.100.100.100', '172.31.1.1', '::1', '224.1.1.1', '0.0.0.0', '192.0.2.1', '198.18.1.1']) assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
  // Only 192.0.0.0/24 and 192.0.2.0/24 are special; WordPress.com feeds live in 192.0.64.0/18.
  for (const ip of ['192.0.78.239', '192.0.1.1']) assert.equal(publicIPv4(ip), true, ip);
  assert.equal(publicIPv4('192.0.0.8'), false);
  for (const url of ['http://hacks.mozilla.org/a', 'https://hacks.mozilla.org@localhost/a', 'https://hacks.mozilla.org.evil.invalid/a', 'https://hacks.mozilla.org:8443/a', 'https://127.0.0.1/a']) assert.equal(articleUrl(url, SOURCES[0]), null);
  assert.equal(articleUrl('https://hacks.mozilla.org/test/?utm_source=x#fragment', SOURCES[0]), 'https://hacks.mozilla.org/test/');
  assert.throws(() => parseFeed('<!DOCTYPE rss><rss></rss>', SOURCES[0]), /INVALID/);
  assert.throws(() => parseFeed('<rss><channel>', SOURCES[0]), /INVALID/);
  await assert.rejects(readFeed({ ...SOURCES[0], url: 'http://localhost' }), /SOURCE_REJECTED/);
});

test('RSS/Atom keep only recent attributed text; markup, tracking and mass mentions removed', () => {
  const rows = parseFeed(rss(), SOURCES[0], BASE);
  assert.equal(rows.length, 5); assert.equal(rows[0].title.includes('@'), false);
  assert.equal(rows[0].excerpt.includes('<'), false); assert.equal(rows[0].url.includes('utm_'), false);
  assert.equal(parseFeed(rss(SOURCES[0], 1, BASE + DAY), SOURCES[0], BASE).length, 0);
  assert.equal(parseFeed(rss(SOURCES[0], 1, BASE - 4 * DAY), SOURCES[0], BASE).length, 0);
  assert.equal(parseFeed('<rss><item><title>undated</title><link>https://github.blog/a</link></item></rss>', SOURCES[0], BASE).length, 0);
  const atom = `<feed><entry><title>Komik</title><link rel="self" href="https://xkcd.com/atom.xml"/><link rel="alternate" href="https://xkcd.com/1/"/><updated>${new Date(BASE - 1000).toISOString()}</updated><summary>&lt;img src="bad"&gt; Komik.</summary></entry></feed>`;
  assert.equal(parseFeed(atom, SOURCES[3], BASE)[0].url, 'https://xkcd.com/1/');
  const rdf = `<rdf:RDF><item><title>Game update</title><link>https://store.steampowered.com/news/1</link><dc:date>${new Date(BASE - 1000).toISOString()}</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(rdf, SOURCES[2], BASE).length, 1);
  assert.equal(plain('&#64;everyone &lt;script&gt;ignore&lt;/script&gt;'), 'everyone ignore');
});

function fakeRequest({ status = 200, type = 'application/rss+xml', body = '<rss></rss>', abort = false } = {}) {
  let calls = 0;
  const request = (url, options, callback) => {
    calls++;
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => {
      if (abort) { options.signal.addEventListener('abort', () => req.emit('error', new Error('timeout'))); return; }
      const res = new EventEmitter();
      res.statusCode = status; res.headers = { 'content-type': type }; res.destroy = () => {};
      callback(res);
      if (status === 200 && type === 'application/rss+xml') { res.emit('data', Buffer.from(body)); res.emit('end'); }
    };
    return req;
  };
  return { request, calls: () => calls };
}
test('news feed transport bounds response size/time and never follows redirects', async () => {
  for (const options of [{ status: 302 }, { status: 403 }, { type: 'text/html' }, { body: 'x'.repeat(MAX_FEED_BYTES + 1) }, { abort: true }]) {
    const mock = fakeRequest(options);
    await assert.rejects(readFeed(SOURCES[0], { request: mock.request, timeoutMs: 5 }), /UNAVAILABLE/);
    assert.equal(mock.calls(), 1);
  }
  assert.equal(await readFeed(SOURCES[0], fakeRequest()), '<rss></rss>');
});

test('feed cache shares concurrent fetches and caches failures without retry storms', async () => {
  let calls = 0;
  const read = createFeedReader({ now: () => BASE, fetchFeed: async source => {
    calls++;
    if (source.id === 'nvidia') throw new Error('provider');
    return source.format === 'hn' ? JSON.stringify({ hits: [] }) : rss(source);
  } });
  const [a, b] = await Promise.all([read(['tech', 'ai']), read(['tech', 'ai'])]);
  const urls = new Set(SOURCES.filter(source => ['tech', 'ai'].includes(source.topic)).map(source => source.url));
  assert.equal(calls, urls.size); assert.equal(a.failures, 1); assert.deepEqual(a, b);
});

test('news preview/revisions are private and side-effect free until explicit confirmation', async t => {
  const r = rig(t);
  const first = await r.handle('atur berita teknologi AI jam 08:00 ke #hengs-news');
  assert.match(first.content, /Belum disimpan/);
  assert.equal(r.store.get(GUILD), null);
  assert.match((await r.handle('aktifkan berita')).content, /preview berita/);
  await r.handle('preview berita');
  assert.equal(r.sent.length, 0); assert.equal(fs.existsSync(r.filePath), false);
  await r.handle('lebih santai');
  assert.match((await r.handle('kirim berita sekali')).content, /preview berita/);
  await r.handle('preview berita');
  const saved = await r.handle('simpan berita');
  assert.match(saved.content, /jeda/); assert.equal(r.store.get(GUILD).enabled, false);
});

test('news verified first send then daily activation survives restart without duplicate', async t => {
  const r = rig(t); await testedRow(r);
  assert.equal(r.sent.length, 1); assert.equal(r.store.get(GUILD).enabled, true);
  assert.deepEqual(r.sent[0].allowedMentions, { parse: [] });
  assert.equal(r.sent[0].enforceNonce, true);
  assert.match(r.sent[0].nonce, /^\d{1,20}$/);
  r.service.start(r.client); await r.service.tick();
  assert.equal(r.sent.length, 1);
  const freshService = createNewsService({ store: createNewsStore({ filePath: r.filePath, now: r.now }), now: r.now,
    readFeeds: async () => ({ items: parseFeed(rss(), SOURCES[0], BASE), failures: 0 }), guildAccess: r.guildAccess });
  t.after(() => freshService.stop()); freshService.start(r.client); await freshService.tick();
  assert.equal(r.sent.length, 1);
  r.advance(DAY); await r.service.tick();
  assert.equal(r.sent.length, 2);
  const links = payload => payload.components.filter(row => row.type === ComponentType.Container)
    .flatMap(row => row.components.filter(child => child.type === ComponentType.TextDisplay))
    .flatMap(row => row.content.match(/https[^)]+/g) || []);
  const firstLinks = links(r.sent[0]);
  const secondLinks = links(r.sent[1]);
  assert.equal(secondLinks.some(link => firstLinks.includes(link)), false);
  await r.handle('jeda berita'); r.advance(DAY); await r.service.tick(); assert.equal(r.sent.length, 2);
});

test('news refuses unauthorized, cross-guild, wrong-channel and expired approvals', async t => {
  const r = rig(t);
  const denied = { ...r.interaction, user: { id: OTHER } };
  assert.match((await r.service.handle(denied, 'atur berita ke #hengs-news')).content, /Administrator/);
  await r.handle('atur berita ke #hengs-news'); await r.handle('preview berita');
  assert.match((await r.service.handle({ ...r.interaction, channelId: OTHER }, 'kirim berita sekali')).content, /channel tujuan/);
  r.advance(11 * 60_000);
  assert.match((await r.handle('kirim berita sekali')).content, /channel tujuan/);
  assert.equal(r.sent.length, 0);
  r.disable(); assert.match((await r.handle('preview berita')).content, /Administrator/);
});

test('news rejects stale drafts after another manager saves or channel permission is removed', async t => {
  const r = rig(t);
  await r.handle('atur berita ke #hengs-news'); await r.handle('preview berita');
  r.store.save(GUILD, 0, settings());
  assert.match((await r.handle('kirim berita sekali')).content, /Pengaturan berubah/);
  await r.handle('preview berita'); r.deny();
  assert.match((await r.handle('kirim berita sekali')).content, /izin/);
  assert.equal(r.sent.length, 0);
});

test('news failed/ambiguous sends retain day claim, leave schedule paused and never auto retry', async t => {
  const r = rig(t); r.failSend();
  await r.handle('atur berita ke #hengs-news'); await r.handle('preview berita');
  assert.match((await r.handle('kirim berita sekali')).content, /belum bisa dipastikan/);
  assert.equal(r.store.get(GUILD).receipts[0].status, 'failed');
  assert.equal(r.store.get(GUILD).tested, false);
  await r.handle('preview berita'); await r.handle('kirim berita sekali');
  assert.equal(r.sent.length, 1);
  assert.ok(r.logs.every(line => !line.includes('PRIVATE')));
});

test('news tick honors pause during source read and coalesces concurrent ticks', async t => {
  let resume; let pending = false; let calls = 0;
  const r = rig(t, { readFeeds: async () => { calls++; if (pending) await new Promise(resolve => { resume = resolve; }); return { items: parseFeed(rss(), SOURCES[0], BASE), failures: 0 }; } });
  await testedRow(r); r.advance(DAY); pending = true; r.service.start(r.client);
  const tick = r.service.tick(); await r.service.tick();
  r.store.pause(GUILD); resume(); await tick;
  assert.equal(r.sent.length, 1); assert.equal(calls, 3);
});

test('news scheduled empty/failure consumes a slot and misses older windows quietly', async t => {
  const r = rig(t); await testedRow(r);
  r.advance(DAY + 6 * 60 * 60_000); r.service.start(r.client); await r.service.tick();
  assert.equal(r.sent.length, 1);
  r.advance(DAY - 6 * 60 * 60_000);
  const empty = createNewsService({ store: r.store, now: r.now, guildAccess: r.guildAccess,
    readFeeds: async () => ({ items: [], failures: 1 }) });
  t.after(() => empty.stop()); empty.start(r.client); await empty.tick(); await empty.tick();
  assert.equal(r.store.get(GUILD).receipts.at(-1).status, 'failed'); assert.equal(r.sent.length, 1);
});

test('/hengs news bypasses conversational LLM/memory, always defers privately and reset clears pending preview', async t => {
  const r = rig(t); let cleared = false;
  const interaction = { ...r.interaction, inGuild: () => true,
    options: { getSubcommand: () => 'ask', getString: () => 'atur berita ke #hengs-news' },
    async deferReply(payload) { this.deferred = payload; }, async editReply(payload) { this.edited = payload; } };
  await hengs.execute(interaction, { agent: {}, guildAccess: r.guildAccess, newsService: r.service });
  assert.equal(interaction.deferred.flags, MessageFlags.Ephemeral);
  assert.deepEqual(interaction.edited.allowedMentions, { parse: [] });
  interaction.options.getString = () => 'preview berita';
  await hengs.execute(interaction, { agent: {}, guildAccess: r.guildAccess, newsService: r.service });
  assert.equal(interaction.deferred.flags, MessageFlags.Ephemeral);
  assert.equal(interaction.edited.flags, MessageFlags.IsComponentsV2);
  assert.equal(interaction.edited.content, undefined);
  assert.equal(interaction.edited.embeds, undefined);
  assert.match(interaction.edited.components[0].content, /preview privat/);
  assert.equal(r.sent.length, 0);
  interaction.options.getSubcommand = () => 'reset'; interaction.reply = async () => {};
  await hengs.execute(interaction, { agent: { buildConversationKey: () => 'scope', clearHistory() {} },
    guildAccess: r.guildAccess, newsService: { clear() { cleared = true; } } });
  assert.equal(cleared, true);
});

test('visual previews and sends do not persist article text or image URLs', async t => {
  const source = SOURCES[0];
  const image = `https://${source.imageHost}${source.imagePath}2026/news.jpg`;
  const xml = rss().replace('http://private.invalid/image', image);
  const r = rig(t, { readFeeds: async () => ({ items: parseFeed(xml, source, BASE), failures: 0 }) });
  await testedRow(r);
  assert.equal(r.sent[0].components[1].components[0].items[0].media.url, image);
  const state = fs.readFileSync(r.filePath, 'utf8');
  assert(!state.includes(image)); assert(!state.includes('Cuplikan')); assert(!state.includes('imageUrl'));
});

test('reset or shutdown during feed read cannot resurrect a confirmable preview', async t => {
  let resume;
  const r = rig(t, { readFeeds: () => new Promise(resolve => { resume = () => resolve({ items: parseFeed(rss(), SOURCES[0], BASE), failures: 0 }); }) });
  await r.handle('atur berita ke #hengs-news');
  const preview = r.handle('preview berita');
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  r.service.clear({ ...r.interaction, channelId: OTHER });
  resume();
  assert.match((await preview).content, /Pengaturan berubah/);
  assert.equal(r.service.canHandle(r.interaction, 'lebih santai'), false);
  assert.equal(r.sent.length, 0); assert.equal(r.store.get(GUILD), null);
});

test('malformed large feed bodies remain bounded and cannot emit HTML or source instructions', () => {
  const xml = `<rss><item><title>${'<'.repeat(100_000)}</title><link>https://hacks.mozilla.org/news/</link></item></rss>`;
  assert.deepEqual(parseFeed(xml, SOURCES[0], BASE), []);
  assert.ok(plain('<'.repeat(1_000_000)).length <= 200);
});

test('channel type, tenant and activation permission are rechecked', async t => {
  const r = rig(t);
  await r.handle('atur berita ke #hengs-news');
  r.channel.guildId = OTHER;
  assert.match((await r.handle('preview berita')).content, /channel teks/);
  r.channel.guildId = GUILD; r.channel.type = ChannelType.PublicThread;
  await r.handle('atur berita ke #hengs-news');
  assert.match((await r.handle('preview berita')).content, /channel teks/);
  r.channel.type = ChannelType.GuildText;
  await testedRow(r); await r.handle('jeda berita'); await r.handle('preview berita'); r.deny();
  assert.match((await r.handle('aktifkan berita')).content, /izin/);
  assert.equal(r.store.get(GUILD).enabled, false);
});

test('revoked manager permission cannot confirm a previously allowed preview', async t => {
  const r = rig(t); r.guild.ownerId = OTHER;
  r.interaction.memberPermissions = { has: () => true };
  r.guild.members.fetch = async () => ({ permissions: { has: () => false } });
  await r.handle('atur berita ke #hengs-news'); await r.handle('preview berita');
  assert.match((await r.handle('kirim berita sekali')).content, /izin pengelola/);
  assert.equal(r.sent.length, 0); assert.equal(r.store.get(GUILD), null);
});

test('Indonesian preview uses the exact same copy on send without another model call or persistence', async t => {
  let calls = 0;
  const editArticles = createNewsEditor({ complete: async () => {
    calls++;
    return JSON.stringify({ items: [{ id: '0', title: 'Pembaruan dari penerbit', summary: 'Sumber membagikan pembaruan baru.' }] });
  } });
  const r = rig(t, { editArticles });
  await r.handle('atur berita ke #hengs-news');
  const preview = await r.handle('preview berita');
  assert.match(JSON.stringify(preview), /Ringkasan AI/);
  await r.handle('kirim berita sekali');
  assert.equal(calls, 1);
  assert.deepEqual(preview.components.slice(1), r.sent[0].components);
  const stored = fs.readFileSync(r.filePath, 'utf8');
  assert(!/Ringkasan|Pembaruan|editorial|summary/.test(stored));
});

test('reset, pause, revision change and stop during editing invalidate the pending operation', async t => {
  for (const operation of ['reset', 'revision', 'stop']) {
    let resume;
    const r = rig(t, { editArticles: items => new Promise(resolve => { resume = () => resolve(items); }) });
    await r.handle('atur berita ke #hengs-news');
    const pending = r.handle('preview berita');
    while (!resume) await new Promise(resolve => setImmediate(resolve));
    if (operation === 'reset') r.service.clear(r.interaction);
    if (operation === 'revision') r.store.save(GUILD, 0, settings());
    if (operation === 'stop') r.service.stop();
    resume();
    assert.equal((await pending).components, undefined);
    assert.equal(r.sent.length, 0);
  }
  let resume; let pending = false;
  const r = rig(t, { editArticles: async items => {
    if (pending) await new Promise(resolve => { resume = resolve; });
    return items;
  } });
  await testedRow(r); r.advance(DAY); pending = true; r.service.start(r.client);
  const tick = r.service.tick();
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  r.store.pause(GUILD); resume(); await tick;
  assert.equal(r.sent.length, 1);
  assert.equal(r.store.get(GUILD).enabled, false);
  assert.equal(r.store.get(GUILD).receipts.length, 1);
});

test('items that expire while the editor is running are removed before preview', async t => {
  let r;
  r = rig(t, { readFeeds: async () => ({ items: parseFeed(rss(SOURCES[0], 1, BASE - 3 * DAY + 1001), SOURCES[0], BASE), failures: 0 }),
    editArticles: async items => { assert.equal(items.length, 1); r.advance(2); return items; } });
  await r.handle('atur berita ke #hengs-news');
  const preview = await r.handle('preview berita');
  assert.match(preview.content, /Belum ada item baru/);
  assert.equal(r.sent.length, 0);
});

test('tested same-channel revision preserves the schedule, receipts and restart safety', async t => {
  const r = rig(t); await testedRow(r);
  const before = r.store.get(GUILD);
  await r.handle('atur berita 2 berita 1 meme jam 09:00');
  assert.match((await r.handle('terapkan berita')).content, /preview berita/);
  await r.handle('preview berita');
  assert.match((await r.handle('terapkan berita')).content, /Revisi berita diterapkan/);
  const row = createNewsStore({ filePath: r.filePath, now: r.now }).get(GUILD);
  assert.equal(row.enabled, true); assert.equal(row.tested, true);
  assert.deepEqual(row.settings.topics, ['tech', 'ai']);
  assert.equal(row.settings.count, 2); assert.equal(row.settings.memeCount, 1); assert.equal(row.settings.time, '09:00');
  assert.deepEqual(row.receipts, before.receipts); assert.deepEqual(row.seen, before.seen);
  assert.equal(r.sent.length, 1);
  r.advance(60 * 60_000); r.service.start(r.client); await r.service.tick();
  assert.equal(r.sent.length, 1);
  assert.match((await r.handle('terapkan berita')).content, /preview berita/);
});

test('apply requires existing tested destination, fresh permission and unchanged revision', async t => {
  const r = rig(t);
  await r.handle('atur berita ke #hengs-news'); await r.handle('preview berita');
  assert.match((await r.handle('terapkan berita')).content, /uji/);
  assert.equal(r.store.get(GUILD), null);
  await testedRow(r); await r.handle('jeda berita');
  await r.handle('ubah berita jam 09:00'); await r.handle('preview berita');
  await r.handle('terapkan berita');
  assert.equal(r.store.get(GUILD).enabled, false); assert.equal(r.store.get(GUILD).tested, true);
  await r.handle('preview berita'); r.deny();
  assert.match((await r.handle('terapkan berita')).content, /izin/);
  assert.equal(r.sent.length, 1);
  const before = r.store.get(GUILD);
  assert.throws(() => r.store.revise(GUILD, before.revision, { ...before.settings, channelId: OTHER }), /TEST_REQUIRED/);
  assert.deepEqual(r.store.get(GUILD), before);
  assert.throws(() => r.store.revise(GUILD, before.revision - 1, before.settings), /STALE/);
});

test('news and meme counts parse separately with their own limits and clock', () => {
  const config = editSettings('atur berita 2 berita + 1 meme', settings());
  assert.deepEqual(config.topics, ['tech', 'ai']); assert.equal(config.count, 2); assert.equal(config.memeCount, 1);
  assert.equal(parsePrompt('terapkan berita').action, 'apply');
  for (const value of ['terapkan berita?', 'jangan terapkan berita', 'kalau terapkan berita']) assert.equal(parsePrompt(value).action, 'help');
  assert.equal(editSettings('atur berita 5 berita', config).count, 5);
  for (const value of ['atur berita 6 berita', 'atur berita 6 meme', 'atur berita 1 meme 2 meme']) assert.throws(() => editSettings(value, config));
  assert.deepEqual(editSettings('atur berita gaming 2 berita 1 komik', config).topics, ['gaming']);
  const channels = [{ id: CHANNEL, name: 'hengs-news' }, { id: MEMES, name: '😂・hengs-memes' }];
  const memes = editSettings('atur berita meme 5 jam 13:30 ke #hengs-memes', { ...config, channelId: CHANNEL }, channels);
  assert.deepEqual([memes.memeCount, memes.memeTime, memes.memeChannelId, memes.count, memes.time], [5, '13:30', MEMES, 2, '08:00']);
  assert.equal(editSettings('atur berita meme 0', memes).memeCount, 0);
  assert.throws(() => editSettings('atur berita meme 7', memes), /0 sampai 5/);
  assert.throws(() => editSettings(`atur berita meme ke <#${CHANNEL}>`, memes, channels), /berbeda/);
});

test('apply rechecks stale preview, expiry, reset and manager permission without touching state', async t => {
  for (const action of ['stale', 'expiry', 'reset', 'permission']) {
    const r = rig(t); await testedRow(r);
    await r.handle('ubah berita jam 09:00'); await r.handle('preview berita');
    if (action === 'stale') r.store.pause(GUILD);
    if (action === 'expiry') r.advance(11 * 60_000);
    if (action === 'reset') r.service.clear(r.interaction);
    if (action === 'permission') {
      r.guild.ownerId = OTHER; r.interaction.memberPermissions = { has: () => true };
      r.guild.members.fetch = async () => ({ permissions: { has: () => false } });
    }
    const before = r.store.get(GUILD);
    assert.doesNotMatch((await r.handle('terapkan berita')).content, /Revisi berita diterapkan/);
    assert.deepEqual(r.store.get(GUILD), before); assert.equal(r.sent.length, 1);
  }
});

test('revision while an older scheduler is editing cancels that edition without consuming its slot', async t => {
  let holdNext = false; let resume;
  const r = rig(t, { editArticles: async items => {
    if (holdNext) { holdNext = false; await new Promise(resolve => { resume = resolve; }); }
    return items;
  } });
  await testedRow(r); r.advance(DAY); r.service.start(r.client); holdNext = true;
  const tick = r.service.tick();
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  await r.handle('ubah berita jam 09:00'); await r.handle('preview berita');
  assert.match((await r.handle('terapkan berita')).content, /Revisi berita diterapkan/);
  resume(); await tick;
  assert.equal(r.sent.length, 1); assert.equal(r.store.get(GUILD).receipts.length, 1);
  r.advance(60 * 60_000); await r.service.tick();
  assert.equal(r.sent.length, 2); assert.equal(r.store.get(GUILD).receipts.length, 2);
});

test('apply during a dispatched send cannot invalidate its receipt completion', async t => {
  const r = rig(t); await testedRow(r); r.advance(DAY);
  let resume;
  r.channel.send = async payload => { r.sent.push(payload); await new Promise(resolve => { resume = resolve; }); };
  r.service.start(r.client); const tick = r.service.tick();
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  await r.handle('ubah berita jam 09:00'); await r.handle('preview berita');
  const before = r.store.get(GUILD);
  assert.match((await r.handle('terapkan berita')).content, /Kiriman sedang/);
  assert.deepEqual(r.store.get(GUILD), before);
  resume(); await tick;
  assert.equal(r.store.get(GUILD).receipts.at(-1).status, 'sent');
  assert.equal(r.store.get(GUILD).settings.time, '08:00');
  assert.equal(r.logs.length, 0);
});

test('failed atomic revision leaves the old active configuration and receipt bytes unchanged', t => {
  const r = fixture(t);
  let row = r.store.save(GUILD, 0, settings());
  row = r.store.claim(GUILD, row.revision, wibClock(BASE).day, ['a'.repeat(64)]);
  row = r.store.finish(GUILD, row.revision, wibClock(BASE).day, 'sent');
  row = r.store.enable(GUILD, row.revision);
  const before = fs.readFileSync(r.filePath, 'utf8');
  const broken = createNewsStore({ filePath: r.filePath, now: r.now,
    fsImpl: { ...fs, renameSync() { throw new Error('SYNTHETIC_DISK_FAILURE'); } } });
  assert.throws(() => broken.revise(GUILD, row.revision, { ...row.settings, time: '09:00' }), /DISK_FAILURE/);
  assert.equal(fs.readFileSync(r.filePath, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(r.root), ['news-state.json']);
});

test('meme slots use the meme maker, attach files to the meme channel and preview stays private', async t => {
  const made = { kind: 'hengs', publisher: 'hengs-meme', topic: 'memes', source: 'Hengs', lines: ['a b', 'c d'], template: 'drake',
    title: 'a b / c d', topicTitle: 'Tema sintetis', topicUrl: null, alt: 'Meme drake: a b / c d',
    file: { name: 'hengs-meme.png', data: Buffer.from('png') }, hash: 'e'.repeat(64), publishedAt: BASE };
  const calls = [];
  const memeMaker = { make: async input => { calls.push(['make', input.slot]); return made; },
    preview: async () => { calls.push(['preview']); return made; } };
  const r = rig(t, { memeMaker });
  await testedRow(r);
  const before = fs.readFileSync(r.filePath, 'utf8');
  const preview = await r.handle('preview meme');
  assert.deepEqual(preview.files, [{ attachment: made.file.data, name: 'hengs-meme.png' }]);
  assert.equal(fs.readFileSync(r.filePath, 'utf8'), before); assert.equal(r.sent.length, 1);
  const row = r.store.get(GUILD);
  r.store.revise(GUILD, row.revision, { ...row.settings, memeChannelId: MEMES, memeCount: 1, memeTime: '15:00' });
  r.advance(DAY + 7 * 60 * 60_000); r.service.start(r.client); await r.service.tick();
  assert.equal(r.sent.length, 2); assert.equal(r.destinations.at(-1), MEMES);
  assert.deepEqual(r.sent.at(-1).files, [{ attachment: made.file.data, name: 'hengs-meme.png' }]);
  const receipt = r.store.get(GUILD).receipts.at(-1);
  assert.deepEqual([receipt.kind, receipt.slot, receipt.publisher, receipt.status], ['meme', 0, 'hengs-meme', 'sent']);
  assert(!fs.readFileSync(r.filePath, 'utf8').includes('Tema sintetis'));
  assert.deepEqual(calls, [['preview'], ['make', 0]]);
  assert.equal(parsePrompt('preview meme').action, 'preview_meme');
  assert.equal(parsePrompt('bagikan meme: https://discord.com/channels/1/2/3'), null);
});