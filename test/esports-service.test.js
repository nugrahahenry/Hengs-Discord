'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType } = require('discord.js');
const { createEsportsService } = require('../src/esports/service');
const { createEsportsStore } = require('../src/esports/store');

const GUILD = '223456789012345678';
const HOUR = 3_600_000; const MIN = 60_000;
const PAGE = 'MPL/Philippines/Season 18/Playoffs';
const NOW = Date.UTC(2026, 9, 23, 12, 0);

// Liquipedia-style date in SGT for a UTC instant.
function sgt(at) {
  const d = new Date(at + 8 * HOUR);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
  return `${month} ${d.getUTCDate()},${d.getUTCFullYear()} - ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} {{Abbr/SGT}}`;
}
const game = winner => `{{Map|vod= |team1side=blue |team2side=red |length=15:00 |winner=${winner} |comment= |t1h1=kalea |t2h1=nolan}}`;
function series(key, startAt, winners, mvp = '') {
  return `|${key}={{Match |bestof=5|mvp=${mvp}
    |opponent1={{TeamOpponent|team falcons ph}} |opponent2={{TeamOpponent|aurora gaming ph}}
    |date=${sgt(startAt)}
    ${winners.map((w, i) => `|map${i + 1}=${game(w)}`).join('\n    ')}
}}`;
}

function rig(t, wiki, { guide = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-esports-svc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: NOW };
  const store = createEsportsStore({ filePath: path.join(dir, 'state.json'), now: () => clock.now });
  if (guide) store.setGuide(GUILD, 'guide-existing'); // a tick posts the guide only when none is known
  const lp = { revid: 1, wiki, revisionCalls: 0, contentCalls: 0, fail: false };
  const liquipedia = {
    async revisions(titles) { lp.revisionCalls++; if (lp.fail) throw new Error('ESPORTS_FETCH_FAILED');
      return titles.map(title => ({ title, revid: title === PAGE ? lp.revid : 0, missing: title !== PAGE })); },
    async contents(titles) { lp.contentCalls++; return titles.map(title => ({ title, revid: lp.revid, content: lp.wiki, missing: false })); },
  };
  const sent = []; const reacts = []; const edits = []; const dms = []; const logs = []; const pins = []; const reports = [];
  const messages = new Map();
  const channel = { id: '900000000000000001', guildId: GUILD, name: '📊・hengs-analis', type: ChannelType.GuildText,
    fail: false,
    async send(payload) {
      if (this.fail) throw new Error('private-provider');
      const message = { id: String(910000000000000000n + BigInt(sent.length + 1)), url: `https://discord.com/channels/${GUILD}/x/${sent.length + 1}`,
        payload, reactions: { cache: new Map() },
        async react(emoji) { reacts.push(emoji); }, async edit(p) { edits.push(p); this.payload = p; }, async pin() { pins.push(this.id); } };
      sent.push(payload); messages.set(message.id, message); return message;
    },
    messages: { async fetch(arg) { const id = typeof arg === 'string' ? arg : arg.message;
      if (!messages.has(id)) throw new Error('Unknown Message'); return messages.get(id); } },
  };
  const guild = { id: GUILD, channels: { cache: new Map([[channel.id, channel]]) },
    async fetchOwner() { return { async send(p) { dms.push(p); } }; } };
  const service = createEsportsService({ guildAccess: { classify: () => ({ kind: 'home' }) }, store, liquipedia,
    render: async () => Buffer.from('png'), now: () => clock.now, logger: { error: code => logs.push(code) },
    watch: [{ title: PAGE, league: 'MPL PH S18 Playoffs' }, { title: 'Missing/Page', league: 'Other' }], loadBanner: async () => null,
    reportFailure: async (g, details) => { reports.push(details); } });
  service.attach({ guilds: { cache: new Map([[GUILD, guild]]) } });
  return { service, store, clock, lp, sent, reacts, edits, dms, logs, pins, messages, channel, reports };
}

const WIKI = [series('R1M1', NOW - 10 * HOUR, [1, 1, 1], 'KyleTzy'), series('R1M2', NOW - 72 * HOUR, [2, 2, 2]),
  series('R2M1', NOW - HOUR, [1])].join('\n');

test('finished series from the last 36 hours post once with the card and three reaction seeds', async t => {
  const r = rig(t, WIKI);
  await r.service.tick();
  assert.equal(r.sent.length, 1); // R1M2 is too old, R2M1 is still running
  assert.equal(r.sent[0].files[0].name, 'hengs-analis.png');
  assert.match(JSON.stringify(r.sent[0].components), /Team Falcons PH menang 3-0 atas Aurora Gaming PH/);
  assert.deepEqual(r.reacts, ['🔥', '🤔', '⚠️']);
  assert.equal(r.store.post(GUILD, `${PAGE}#R1M1#0`).status, 'sent');
  r.clock.now += 25 * MIN; await r.service.tick();
  assert.equal(r.sent.length, 1);
});

test('checks run every 20 minutes while a series is live, every 3 hours otherwise, and failures also wait', async t => {
  const r = rig(t, WIKI);
  await r.service.tick(); assert.equal(r.lp.revisionCalls, 1);
  r.clock.now += 5 * MIN; await r.service.tick(); assert.equal(r.lp.revisionCalls, 1);
  r.clock.now += 16 * MIN; await r.service.tick(); assert.equal(r.lp.revisionCalls, 2);
  assert.equal(r.lp.contentCalls, 1); // same revision: no second download
  r.lp.wiki = WIKI.replace(series('R2M1', NOW - HOUR, [1]), series('R2M1', NOW - HOUR, [1, 1, 1])); r.lp.revid = 2;
  r.clock.now += 21 * MIN; await r.service.tick();
  assert.equal(r.lp.contentCalls, 2); assert.equal(r.sent.length, 2);
  r.clock.now += 21 * MIN; await r.service.tick(); assert.equal(r.lp.revisionCalls, 3); // nothing live now: 3 hours
  r.clock.now += 3 * HOUR; r.lp.fail = true; await r.service.tick(); assert.equal(r.lp.revisionCalls, 4);
  assert.ok(r.logs.includes('[esports] ESPORTS_TICK_FAILED'));
  r.clock.now += 10 * MIN; await r.service.tick(); assert.equal(r.lp.revisionCalls, 4); // a failure waits too
});

test('changed data within 72 hours edits the card, and a member warning sends one DM to the owner', async t => {
  const r = rig(t, WIKI.replace('mvp=KyleTzy', 'mvp='));
  await r.service.tick();
  const [message] = r.messages.values();
  r.lp.wiki = WIKI; r.lp.revid = 2;
  message.reactions.cache.set('w', { emoji: { name: '⚠️' }, count: 2, me: true });
  r.clock.now += 3 * HOUR; await r.service.tick();
  assert.equal(r.edits.length, 1); assert.match(JSON.stringify(r.edits[0].components), /MVP: KyleTzy/);
  assert.match(JSON.stringify(r.edits[0].components), /Diperbarui/);
  assert.equal(r.dms.length, 1); assert.match(r.dms[0].content, /melaporkan data salah/); assert.match(r.dms[0].content, /liquipedia\.net/);
  assert.deepEqual(r.dms[0].allowedMentions, { parse: [] });
  r.clock.now += 3 * HOUR; await r.service.tick();
  assert.equal(r.edits.length, 1); assert.equal(r.dms.length, 1);
  // Only Hengs' own seed: no report.
  const quiet = rig(t, WIKI); await quiet.service.tick();
  [...quiet.messages.values()][0].reactions.cache.set('w', { emoji: { name: '⚠️' }, count: 1, me: true });
  quiet.clock.now += 3 * HOUR; await quiet.service.tick(); assert.equal(quiet.dms.length, 0);
});

test('no analyst channel yet means no Liquipedia request at all', async t => {
  const r = rig(t, WIKI); r.channel.name = 'general';
  await r.service.tick();
  assert.equal(r.lp.revisionCalls, 0); assert.equal(r.sent.length, 0);
});

test('a failed send is recorded and never retried', async t => {
  const r = rig(t, WIKI); r.channel.fail = true;
  await r.service.tick();
  assert.equal(r.store.post(GUILD, `${PAGE}#R1M1#0`).status, 'failed');
  assert.ok(r.logs.includes('[esports] ESPORTS_SEND_FAILED')); assert.ok(!JSON.stringify(r.logs).includes('private-provider'));
  assert.deepEqual(r.reports.map(x => [x.feature, x.channel.id, x.code]), [['Kartu Analis', r.channel.id, null]]); // to bot-settings
  r.channel.fail = false; r.clock.now += 3 * HOUR; await r.service.tick();
  assert.equal(r.sent.length, 0);
});

test('a tick posts the guide once when none is known, as for a channel made over REST (2026-10-30)', async t => {
  const r = rig(t, WIKI, { guide: false });
  await r.service.tick();
  assert.match(JSON.stringify(r.sent[0].components), /Hengs Analis/); assert.equal(r.pins.length, 1);
  const guides = () => r.sent.filter(p => /## 📊 Hengs Analis/.test(JSON.stringify(p.components))).length;
  r.clock.now += 6 * 60_000; await r.service.tick();
  assert.equal(guides(), 1);
});

test('the guide is posted and pinned once, updated in place while it exists, and posted again only when it is gone', async t => {
  const r = rig(t, WIKI);
  assert.deepEqual(await r.service.ensureGuide(r.channel), { posted: true, pinned: true });
  assert.equal(r.sent.length, 1); assert.match(JSON.stringify(r.sent[0].components), /Hengs Analis/); assert.equal(r.pins.length, 1);
  assert.deepEqual(await r.service.ensureGuide(r.channel), { exists: true, updated: true });
  assert.equal(r.sent.length, 1); assert.match(JSON.stringify(r.edits.at(-1).components), /Liga Tebak/);
  r.messages.clear();
  assert.deepEqual(await r.service.ensureGuide(r.channel), { posted: true, pinned: true });
  assert.equal(r.sent.length, 2);
});
