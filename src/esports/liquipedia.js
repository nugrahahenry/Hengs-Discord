'use strict';

// Liquipedia MediaWiki API, read-only, following its API terms: query only (never parse or HTML pages), gzip, at
// most one request per 2 seconds, a User-Agent that names the bot with a contact (the public repo, nothing personal).
const { fetchBounded } = require('../news/http');
const { version } = require('../../package.json');

const API = 'https://liquipedia.net/mobilelegends/api.php';
const USER_AGENT = `HengsDiscordBot/${version} (+https://github.com/nugrahahenry/Hengs-Discord)`;
const SPACING_MS = 2000;
const BATCH = 50;
const fail = () => new Error('ESPORTS_FETCH_FAILED');

function createLiquipedia({ fetch = fetchBounded, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let last = -Infinity;
  let queue = Promise.resolve();
  // One request at a time, spaced, whoever calls.
  function get(params, pick = query => query?.pages) {
    const run = queue.then(async () => {
      const wait = last + SPACING_MS - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`;
      let data;
      try {
        data = JSON.parse((await fetch(url, { hosts: ['liquipedia.net'], types: ['application/json'], maxBytes: 4 * 1024 * 1024,
          timeoutMs: 15_000, userAgent: USER_AGENT, gzip: true })).toString('utf8'));
      } catch { throw fail(); }
      const list = pick(data?.query);
      if (data?.error || !Array.isArray(list)) throw fail();
      return list;
    });
    queue = run.catch(() => {});
    return run;
  }
  async function read(titles, rvprop) {
    const out = [];
    for (let i = 0; i < titles.length; i += BATCH) {
      for (const p of await get({ prop: 'revisions', rvprop, rvslots: 'main', titles: titles.slice(i, i + BATCH).join('|') })) {
        if (typeof p?.title !== 'string') throw fail();
        const rev = p.revisions?.[0];
        out.push({ title: p.title, revid: Number(rev?.revid) || 0, missing: Boolean(p.missing || p.invalid || !rev),
          ...(rvprop.endsWith('content') ? { content: String(rev?.slots?.main?.content || '') } : {}) });
      }
    }
    return out;
  }
  return {
    revisions: titles => read(titles, 'ids|timestamp'),
    contents: titles => read(titles, 'ids|timestamp|content'),
    prefixSearch: async prefix => (await get({ list: 'prefixsearch', pssearch: prefix, pslimit: '50' }, query => query?.prefixsearch))
      .map(page => page?.title).filter(title => typeof title === 'string'),
  };
}

module.exports = { createLiquipedia, USER_AGENT, SPACING_MS };
