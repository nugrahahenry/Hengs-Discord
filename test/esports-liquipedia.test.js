'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { fetchBounded } = require('../src/news/http');
const { createLiquipedia, USER_AGENT } = require('../src/esports/liquipedia');

function gzipRequest(body, seen = []) {
  return (url, options, callback) => {
    seen.push(options.headers);
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip' };
      res.destroy = () => {};
      callback(res); res.emit('data', zlib.gzipSync(body)); res.emit('end');
    };
    return req;
  };
}

test('bounded fetch can ask for gzip and returns the decoded bytes within the size cap', async () => {
  const seen = []; const body = Buffer.from(JSON.stringify({ ok: true }));
  const options = { hosts: ['liquipedia.net'], types: ['application/json'], maxBytes: 100, gzip: true,
    userAgent: USER_AGENT, request: gzipRequest(body, seen) };
  assert.deepEqual(await fetchBounded('https://liquipedia.net/mobilelegends/api.php', options), body);
  assert.equal(seen[0]['Accept-Encoding'], 'gzip'); assert.equal(seen[0]['User-Agent'], USER_AGENT);
  await assert.rejects(fetchBounded('https://liquipedia.net/x', { ...options, maxBytes: 5 }), /FAILED/);
  // Callers that did not ask for gzip still refuse compressed replies.
  await assert.rejects(fetchBounded('https://liquipedia.net/x', { ...options, gzip: false }), /FAILED/);
});

test('the User-Agent names the bot and the public repo only', () => {
  assert.match(USER_AGENT, /^HengsDiscordBot\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/nugrahahenry\/Hengs-Discord\)$/);
});

function rig(reply) {
  const calls = []; const sleeps = []; let clock = 1_000_000;
  const lp = createLiquipedia({
    fetch: async (url, options) => { calls.push({ url: new URL(url), options, at: clock }); return Buffer.from(JSON.stringify(reply(new URL(url)))); },
    now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; },
  });
  return { lp, calls, sleeps, tick: ms => { clock += ms; } };
}
const page = (title, revid, content) => ({ title, revisions: [{ revid, timestamp: '2026-10-23T11:04:25Z',
  ...(content === undefined ? {} : { slots: { main: { content } } }) }] });

test('revisions and contents use the query API with batched titles and the bot User-Agent', async () => {
  const r = rig(url => ({ query: { pages: url.searchParams.get('titles').split('|').map((t, i) => t === 'Gone'
    ? { title: t, missing: true } : page(t, 100 + i, url.searchParams.get('rvprop').includes('content') ? `wiki ${t}` : undefined)) } }));
  const revs = await r.lp.revisions(['A/B', 'Gone']);
  assert.deepEqual(revs, [{ title: 'A/B', revid: 100, missing: false }, { title: 'Gone', revid: 0, missing: true }]);
  const [call] = r.calls;
  assert.equal(call.url.origin + call.url.pathname, 'https://liquipedia.net/mobilelegends/api.php');
  assert.equal(call.url.searchParams.get('action'), 'query'); assert.equal(call.url.searchParams.get('rvprop'), 'ids|timestamp');
  assert.equal(call.url.searchParams.get('formatversion'), '2'); assert.equal(call.url.searchParams.get('titles'), 'A/B|Gone');
  assert.equal(call.url.searchParams.has('parse'), false);
  assert.deepEqual(call.options.hosts, ['liquipedia.net']); assert.equal(call.options.gzip, true);
  assert.equal(call.options.userAgent, USER_AGENT);
  const pages = await r.lp.contents(['A/B']);
  assert.deepEqual(pages, [{ title: 'A/B', revid: 100, content: 'wiki A/B', missing: false }]);
  assert.equal(r.calls[1].url.searchParams.get('rvprop'), 'ids|timestamp|content');
});

test('requests are spaced at least 2 seconds apart and split into batches of 50 titles', async () => {
  const r = rig(url => ({ query: { pages: url.searchParams.get('titles').split('|').map(t => page(t, 1)) } }));
  const titles = Array.from({ length: 51 }, (_, i) => `T${i}`);
  assert.equal((await r.lp.revisions(titles)).length, 51);
  assert.equal(r.calls.length, 2); assert.equal(r.calls[0].url.searchParams.get('titles').split('|').length, 50);
  assert.ok(r.calls[1].at - r.calls[0].at >= 2000);
  r.tick(5000); await r.lp.revisions(['X']);
  assert.equal(r.sleeps.length, 1); // enough time had passed for the third request
});

test('odd replies fail closed', async () => {
  for (const reply of [() => ({ error: { code: 'ratelimited' } }), () => ({ query: {} }), () => 'not json']) {
    const r = rig(reply);
    await assert.rejects(r.lp.contents(['A']), /ESPORTS_FETCH_FAILED/);
  }
  const broken = createLiquipedia({ fetch: async () => Buffer.from('{oops'), now: () => 0, sleep: async () => {} });
  await assert.rejects(broken.revisions(['A']), /ESPORTS_FETCH_FAILED/);
  const idle = rig(() => ({}));
  assert.deepEqual(await idle.lp.revisions([]), []); assert.equal(idle.calls.length, 0);
});

test('prefix search returns page titles through the same spaced, identified client', async () => {
  const urls = [];
  const lp = createLiquipedia({ fetch: async url => { urls.push(url); return Buffer.from(JSON.stringify({ query: { prefixsearch: [
    { title: 'M8 World Championship/Wildcard' }, { title: 7 }, { title: 'M8 World Championship/Swiss Stage' }] } })); },
  now: () => 0, sleep: async () => {} });
  assert.deepEqual(await lp.prefixSearch('M8 World Championship/'), ['M8 World Championship/Wildcard', 'M8 World Championship/Swiss Stage']);
  assert.match(urls[0], /list=prefixsearch/); assert.match(urls[0], /pssearch=M8\+World\+Championship%2F/);
  const broken = createLiquipedia({ fetch: async () => Buffer.from('{"query":{}}'), now: () => 0, sleep: async () => {} });
  await assert.rejects(broken.prefixSearch('M8'), /ESPORTS_FETCH_FAILED/);
});
