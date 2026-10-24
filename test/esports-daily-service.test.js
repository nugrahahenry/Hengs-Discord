'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType, MessageFlags } = require('discord.js');
const { createEsportsService } = require('../src/esports/service');
const { createEsportsStore } = require('../src/esports/store');
const { voteKey } = require('../src/esports/predictions');

const GUILD = '223456789012345678';
const HOUR = 3_600_000; const MIN = 60_000;
const PAGE = 'MPL/Indonesia/Season 18/Playoffs';
const WATCH = [{ title: PAGE, league: 'MPL ID S18 Playoffs', family: 'MPL/Indonesia/Season 18', event: 'MPL ID S18 Playoffs' }];
const DAY = Date.UTC(2026, 10, 4); // 4 Nov 00:00 UTC = 07:00 WIB
const at = (wibHour, wibMinute = 0) => DAY + (wibHour - 7) * HOUR + wibMinute * MIN;
const T = (key, ticker) => ({ key, name: key.toUpperCase(), ticker });
const g = winner => ({ number: 1, winner, length: '15:00', sides: ['blue', 'red'], vod: '', objective: null,
  picks: [['Lancelot', 'Chou', 'Mathilda', 'Grock', 'Floryn'], ['Joy', 'Fredrinn', 'Valentina', 'Hylos', 'Claude']], bans: [['Fanny'], ['Ling']] });
function match(id, teams, startAt, winners = []) {
  const score = [1, 2].map(t => winners.filter(w => w === t).length);
  const finished = Math.max(...score) === 2;
  return { id, page: PAGE, key: 'R1M1', stage: 'Upper Bracket', teams, startAt, bestof: 3, mvp: '', valid: true, finished,
    games: winners.map((w, i) => ({ ...g(w), number: i + 1 })), score, winner: finished ? (score[0] === 2 ? 1 : 2) : 0 };
}

function rig(t, matches, { now = at(8, 0) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-analis-daily-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now };
  const store = createEsportsStore({ filePath: path.join(dir, 'state.json'), now: () => clock.now });
  store.savePages({ [PAGE]: { revid: 1, matches } }, clock.now);
  const sent = []; const edits = []; const reports = [];
  const channel = { id: '900000000000000001', guildId: GUILD, name: '📊・hengs-analis', type: ChannelType.GuildText, fail: false,
    async send(payload) {
      if (this.fail) throw Object.assign(new Error('private-provider'), { code: 50013 });
      const message = { id: String(910000000000000000n + BigInt(sent.length + 1)), payload, async edit(p) { edits.push(p); }, async react() {} };
      sent.push(payload); messages.set(message.id, message); return message;
    },
    messages: { async fetch(arg) { return messages.get(typeof arg === 'string' ? arg : arg.message); } } };
  const messages = new Map();
  const guild = { id: GUILD, channels: { cache: new Map([[channel.id, channel]]) },
    members: { async fetch() { return new Map([['u1', { id: 'u1', displayName: 'Henry' }]]); } } };
  const liquipedia = { async revisions(titles) { return titles.map(title => ({ title, revid: 1, missing: false })); },
    async contents() { throw new Error('unexpected'); } };
  const service = createEsportsService({ guildAccess: { classify: () => ({ kind: 'home' }) }, store, liquipedia, watch: WATCH,
    render: async () => Buffer.from('png'), renderPreview: async () => Buffer.from('png'), renderList: async () => Buffer.from('png'),
    now: () => clock.now, logger: { error() {} }, reportFailure: async (g2, details) => { reports.push(details); } });
  service.attach({ guilds: { cache: new Map([[GUILD, guild]]) } });
  const set = list => store.savePages({ [PAGE]: { revid: 1, matches: list } }, clock.now);
  return { service, store, clock, sent, edits, reports, channel, set };
}
// Match-day cards only; series cards ('hengs-analis.png') follow a fresh check and are tested in esports-service.test.js.
const kinds = sent => sent.map(p => p.files[0].name).filter(name => name !== 'hengs-analis.png');
const ONIC = T('onic', 'ONIC'); const RRQ = T('rrq hoshi', 'RRQ'); const EVOS = T('evos', 'EVOS'); const AE = T('alter ego', 'AE');

test('previews go out once from 08:00 WIB on match days, only for matches that have not started', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(15)), match('b', [EVOS, AE], at(18))], { now: at(7, 50) });
  await r.service.tick(); assert.equal(r.sent.length, 0);
  r.clock.now = at(8, 5); await r.service.tick(); await r.service.tick();
  assert.deepEqual(kinds(r.sent), ['hengs-preview.png', 'hengs-preview.png']);
  assert.match(JSON.stringify(r.sent[0].components), new RegExp(`hengs-analis:vote:${voteKey('a')}:1`));
  const late = rig(t, [match('a', [ONIC, RRQ], at(9))], { now: at(10) });
  await late.service.tick(); assert.equal(late.sent.length, 0);
});

test('a changed schedule edits the posted preview instead of sending another', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(15))], { now: at(8, 5) });
  await r.service.tick();
  r.set([match('a', [ONIC, RRQ], at(16))]); await r.service.tick();
  assert.equal(r.sent.length, 1); assert.equal(r.edits.length, 1);
});

test('busy days get one list card plus four featured previews', async t => {
  const teams = n => [T(`team${n}a`, `A${n}`), T(`team${n}b`, `B${n}`)];
  const r = rig(t, [1, 2, 3, 4, 5].map(n => match(`m${n}`, teams(n), at(9 + n))), { now: at(8, 5) });
  await r.service.tick();
  assert.deepEqual(kinds(r.sent), ['hengs-rekap.png', 'hengs-preview.png', 'hengs-preview.png', 'hengs-preview.png', 'hengs-preview.png']);
});

test('votes count until kick-off, change freely, and the night recap posts once when the day is done', async t => {
  const later = match('later', [ONIC, { key: '', name: '', ticker: '' }], null); // keeps the event open: no event recap here
  const r = rig(t, [match('a', [ONIC, RRQ], at(15)), later], { now: at(8, 5) });
  await r.service.tick();
  const replies = [];
  const press = (team, user = 'u1') => r.service.handleVote({ customId: `hengs-analis:vote:${voteKey('a')}:${team}`, guildId: GUILD,
    guild: {}, user: { id: user }, async reply(p) { replies.push(p); } });
  await press(2); await press(1);
  assert.deepEqual(r.store.votes(GUILD, 'a'), { u1: 1 });
  assert.match(replies.at(-1).content, /Tebakanmu: ONIC\. Bisa diganti sampai 15:00 WIB/); assert.equal(replies.at(-1).flags, MessageFlags.Ephemeral);
  r.clock.now = at(15, 1); await press(2, 'u2');
  assert.match(replies.at(-1).content, /udah ditutup/); assert.deepEqual(r.store.votes(GUILD, 'a'), { u1: 1 });
  await r.service.handleVote({ customId: 'hengs-analis:vote:nope:1', guildId: GUILD, guild: {}, user: { id: 'u1' }, async reply(p) { replies.push(p); } });
  assert.match(replies.at(-1).content, /nggak berlaku/);
  r.set([match('a', [ONIC, RRQ], at(15), [1, 1]), later]); r.clock.now = at(17); await r.service.tick(); await r.service.tick();
  assert.deepEqual(kinds(r.sent), ['hengs-preview.png', 'hengs-rekap.png']);
});

test('an unfinished day still gets its recap at 23:30 WIB, and the event recap posts once after the final', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(15), [1, 1]), match('b', [EVOS, AE], at(18), [1])], { now: at(22) });
  await r.service.tick(); assert.equal(r.sent.length, 0);
  r.clock.now = at(23, 31); await r.service.tick();
  assert.deepEqual(kinds(r.sent), ['hengs-rekap.png']);
  r.set([match('a', [ONIC, RRQ], at(15), [1, 1]), match('b', [EVOS, AE], at(18), [1, 1])]);
  await r.service.tick(); await r.service.tick();
  assert.deepEqual(kinds(r.sent), ['hengs-rekap.png', 'hengs-rekap.png']); // event recap, the day recap was already claimed
  const old = rig(t, [match('a', [ONIC, RRQ], at(15) - 72 * HOUR, [1, 1])], { now: at(12) });
  await old.service.tick(); assert.equal(old.sent.length, 0);
});

test('a failed daily send is claimed, reported to bot-settings and never retried', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(15))], { now: at(8, 5) });
  r.channel.fail = true; await r.service.tick();
  assert.deepEqual(r.reports.map(x => [x.feature, x.code]), [['Preview Analis', 50013]]);
  r.channel.fail = false; await r.service.tick(); assert.equal(r.sent.length, 0);
});

test('index.js routes hengs-analis buttons to the Analis vote handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /startsWith\('hengs-analis:'\)\) \{\n\s+try \{ await esportsService\.handleVote\(interaction\); \}/);
});
