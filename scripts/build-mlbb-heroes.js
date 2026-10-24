'use strict';

// Builds src/scrim/mlbb-heroes.json, the coach's MLBB hero dictionary (name, title, roles, lanes, specialties), from
// Liquipedia's MediaWiki API under its API terms: query only, gzip, one request per 2 seconds, the bot's User-Agent.
// The official mobilelegends.com data API is not used: MLBB ToS section 11 bans automated collection.
// Run when a new hero is released, with the live patch (Liquipedia's newest "Patch X" page, whose infobox has no next):
// node scripts/build-mlbb-heroes.js 2.2.16a   (about 4 requests)
const fs = require('node:fs');
const path = require('node:path');
const { fetchBounded } = require('../src/news/http');
const { createLiquipedia, USER_AGENT } = require('../src/esports/liquipedia');

const OUT = path.join(__dirname, '..', 'src', 'scrim', 'mlbb-heroes.json');
const API = 'https://liquipedia.net/mobilelegends/api.php';

async function heroTitles() {
  const query = new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle: 'Category:Hero', cmlimit: '500',
    cmnamespace: '0', format: 'json', formatversion: '2' });
  const body = await fetchBounded(`${API}?${query}`, { hosts: ['liquipedia.net'], types: ['application/json'],
    maxBytes: 1024 * 1024, timeoutMs: 15_000, userAgent: USER_AGENT, gzip: true });
  const data = JSON.parse(body.toString('utf8'));
  if (data.continue) throw new Error('HERO_LIST_TRUNCATED');
  return data.query.categorymembers.map(member => member.title);
}

// "|lane=Gold Lane<br>Mid Lane" style values: split on breaks and commas, drop links and markup.
const values = raw => String(raw || '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]*>/g, ',')
  .split(/[,/]/).map(value => value.trim()).filter(Boolean);

function parseHero(title, content) {
  const box = /\{\{Infobox hero([\s\S]*?)\n\}\}/.exec(content)?.[1];
  if (!box) return null;
  const field = name => (new RegExp(`\\|${name}=([^|\\n]*)`).exec(box)?.[1] || '').trim();
  const hero = { name: field('name') || title, title: field('title'), roles: [...values(field('primaryrole')), ...values(field('secondaryrole'))],
    lanes: values(field('lane')), specialties: [field('specialty1'), field('specialty2')].filter(Boolean) };
  return hero.roles.length && hero.lanes.length ? hero : null;
}

(async () => {
  const patch = process.argv[2];
  if (!/^\d+\.\d+\.\d+[a-z]?$/.test(patch || '')) throw new Error('usage: node scripts/build-mlbb-heroes.js <live patch, e.g. 2.2.16a>');
  const titles = await heroTitles();
  const pages = await createLiquipedia().contents(titles);
  const heroes = pages.filter(page => !page.missing).map(page => parseHero(page.title, page.content)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  const skipped = titles.length - heroes.length;
  fs.writeFileSync(OUT, `${JSON.stringify({ source: 'Liquipedia Mobile Legends wiki (liquipedia.net/mobilelegends), CC-BY-SA 3.0',
    retrieved: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), patch, heroes }, null, 1)}\n`); // WIB date
  console.log(`heroes ${heroes.length} of ${titles.length}${skipped ? `, skipped ${skipped} without an infobox role or lane` : ''}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
