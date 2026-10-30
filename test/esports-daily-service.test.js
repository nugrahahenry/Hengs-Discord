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

function rig(t, matches, { now = at(8, 0), people = { u1: 'Henry' }, roles = [], guide = true, holders = [], rooms = [], watch = WATCH } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-analis-daily-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now };
  const store = createEsportsStore({ filePath: path.join(dir, 'state.json'), now: () => clock.now });
  store.savePages({ [PAGE]: { revid: 1, matches } }, clock.now);
  if (guide) store.setGuide(GUILD, 'guide-existing'); // a tick posts the guide only when none is known
  const sent = []; const edits = []; const reports = []; const lists = []; const drafts = []; const roleLog = []; const rolesMade = [];
  // holders: members carrying the opt-in Nobar role 'r-nobar'.
  const member = id => ({ id, displayName: people[id], user: { bot: false }, roles: { cache: new Set(holders.includes(id) ? ['r-nobar'] : []),
    async add(role) { roleLog.push(['add', id, role.id]); }, async remove(role) { roleLog.push(['remove', id, role.id]); } } });
  const roleMap = new Map(roles.map(role => [role.id, role]));
  const channel = { id: '900000000000000001', guildId: GUILD, name: '📊・hengs-analis', type: ChannelType.GuildText, fail: false,
    async send(payload) {
      if (this.fail) throw Object.assign(new Error('private-provider'), { code: 50013 });
      const message = { id: String(910000000000000000n + BigInt(sent.length + 1)), payload, async edit(p) { edits.push(p); }, async react() {} };
      sent.push(payload); messages.set(message.id, message); return message;
    },
    messages: { async fetch(arg) { return messages.get(typeof arg === 'string' ? arg : arg.message); } } };
  const messages = new Map();
  const guild = { id: GUILD, channels: { cache: new Map([[channel.id, channel]]) },
    members: { async fetch(arg) {
      if (typeof arg === 'string') { if (!people[arg]) throw new Error('unknown member'); return member(arg); }
      return new Map((arg?.user || Object.keys(people)).filter(id => people[id]).map(id => [id, member(id)]));
    } },
    roles: { async fetch() { return roleMap; },
      async create(options) { const role = { id: 'r-new', editable: true, ...options }; rolesMade.push(options); roleMap.set(role.id, role); return role; } } };
  const liquipedia = { async revisions(titles) { return titles.map(title => ({ title, revid: 1, missing: false })); },
    async contents() { throw new Error('unexpected'); } };
  const service = createEsportsService({ guildAccess: { classify: () => ({ kind: 'home' }) }, store, liquipedia, watch,
    render: async () => Buffer.from('png'), renderPreview: async () => Buffer.from('png'),
    renderList: async data => { lists.push(data); return Buffer.from('png'); }, renderDraft: async () => Buffer.from('png'),
    draftAppreciation: async (g2, data, externalId) => { drafts.push([data, externalId]); }, nobarRooms: () => rooms,
    now: () => clock.now, logger: { error() {} }, reportFailure: async (g2, details) => { reports.push(details); } });
  service.attach({ guilds: { cache: new Map([[GUILD, guild]]) } });
  const set = list => store.savePages({ [PAGE]: { revid: 1, matches: list } }, clock.now);
  return { service, store, clock, sent, edits, reports, channel, set, lists, drafts, roleLog, rolesMade, guild, messages };
}
// Match-day cards only; series cards ('hengs-analis.png') follow a fresh check and are tested in esports-service.test.js,
// and kickoff reminders (text only, no file) have their own test.
const kinds = sent => sent.filter(p => p.files).map(p => p.files[0].name).filter(name => name !== 'hengs-analis.png');
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
  const press = (team, user = 'u1') => r.service.handleButton({ customId: `hengs-analis:vote:${voteKey('a')}:${team}`, guildId: GUILD,
    guild: {}, user: { id: user }, async reply(p) { replies.push(p); } });
  await press(2); await press(1);
  assert.deepEqual(r.store.votes(GUILD, 'a'), { u1: 1 });
  assert.match(replies.at(-1).content, /Tebakanmu: ONIC\. Bisa diganti sampai 15:00 WIB/); assert.equal(replies.at(-1).flags, MessageFlags.Ephemeral);
  r.clock.now = at(15, 1); await press(2, 'u2');
  assert.match(replies.at(-1).content, /udah ditutup/); assert.deepEqual(r.store.votes(GUILD, 'a'), { u1: 1 });
  await r.service.handleButton({ customId: 'hengs-analis:vote:nope:1', guildId: GUILD, guild: {}, user: { id: 'u1' }, async reply(p) { replies.push(p); } });
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

test('index.js routes hengs-analis buttons to the Analis button handler and drafts the champion card through the Ops hub', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /startsWith\('hengs-analis:'\)\) \{\n\s+try \{ await esportsService\.handleButton\(interaction\); \}/);
  assert.match(source, /draftAppreciation: \(guild, data, externalId\) => opsHub\.createDraftPanel\(guild, \{\s*\.\.\.require\('\.\/ops\/appreciation'\)\.buildAppreciationDraft\(data\)/);
});

test('with a commentator the preview carries its line, answers come from the cached pages, and failures keep the template', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(15)), match('p', [EVOS, AE], at(15) - 30 * HOUR, [1, 1])], { now: at(8, 5) });
  const seen = [];
  const commentator = { caption: async (kind, card, { teams }) => { seen.push([kind, card, teams]); return 'ONIC siap panas jam 15:00!'; },
    answer: async question => `Jawaban buat: ${question}` };
  const service = createEsportsService({ guildAccess: { classify: () => ({ kind: 'home' }) }, store: r.store, watch: WATCH,
    liquipedia: { async revisions(titles) { return titles.map(title => ({ title, revid: 1, missing: false })); } },
    renderPreview: async () => Buffer.from('png'), renderList: async () => Buffer.from('png'), render: async () => Buffer.from('png'),
    now: () => r.clock.now, logger: { error() {} }, commentator });
  service.attach({ guilds: { cache: new Map([[GUILD, { id: GUILD, channels: { cache: new Map([[r.channel.id, r.channel]]) } }]]) } });
  await service.tick();
  const preview = r.sent.find(p => p.files[0].name === 'hengs-preview.png');
  assert.match(JSON.stringify(preview.components), /ONIC siap panas jam 15:00!/);
  assert.equal(seen[0][0], 'preview'); assert.match(seen[0][1], /ONIC vs RRQ HOSHI/); assert.ok(seen[0][2].includes('EVOS'));
  assert.equal(await service.answer('siapa MVP kemarin?'), 'Jawaban buat: siapa MVP kemarin?\n-# Data: Liquipedia (CC-BY-SA 3.0)');
  assert.equal(await r.service.answer('apa aja?'), null); // no commentator configured: the guide answers
});

test('index.js builds the caster from the Groq client and answers the analis intent before the guide', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(source, /createCommentator\(\{ complete: createCasterCompletion\(\{ client: agent\.groq/);
  const route = source.slice(source.indexOf("if (route.intent === 'analis')"), source.indexOf('const guide = guideFor(route.intent'));
  assert.match(route, /await esportsService\.answer\(text\)/);
});

test('a finished series posts its card with one draft image per complete game', async t => {
  const r = rig(t, [match('s', [ONIC, RRQ], at(15), [1, 1])], { now: at(17) });
  r.store.savePages({ [PAGE]: { revid: 1, matches: [match('s', [ONIC, RRQ], at(15), [1, 1])] } }, at(17) - 4 * HOUR); // a check is due
  await r.service.tick();
  const card = r.sent.find(p => p.files[0].name === 'hengs-analis.png');
  assert.deepEqual(card.files.map(f => f.name), ['hengs-analis.png', 'hengs-draft-1.png', 'hengs-draft-2.png']);
});

const EVENT = 'MPL ID S18 Playoffs';
const PEOPLE = { u1: 'Henry', u2: 'Dua', u3: 'Uno', u4: 'Empat' };
const OPEN = match('later', [ONIC, { key: '', name: '', ticker: '' }], null); // keeps the event open: no event recap
const dayOf = (winners, extra = []) => [match('a', [ONIC, RRQ], at(15), winners[0]), match('b', [EVOS, AE], at(18), winners[1]),
  match('c', [RRQ, EVOS], at(20), winners[2]), ...extra];
const DONE = [[1, 1], [2, 2], [1, 1]];
// a and c get 4 voters each, so both are the day's Laga Panas; b gets 3.
function voteDay(r) {
  const picks = { a: { u1: 1, u2: 1, u3: 1, u4: 2 }, b: { u1: 1, u2: 2, u3: 2 }, c: { u1: 1, u2: 2, u3: 1, u4: 1 } };
  for (const [id, users] of Object.entries(picks)) for (const [user, team] of Object.entries(users)) r.store.vote(GUILD, id, user, team, EVENT);
}

test('Liga Tebak scores a day once all its matches started, doubles the Laga Panas and shows the standings at night', async t => {
  const r = rig(t, dayOf([[], [], []], [OPEN]), { now: at(9), people: PEOPLE });
  voteDay(r);
  r.set(dayOf([[1, 1], [2, 2], []], [OPEN])); r.clock.now = at(19); await r.service.tick();
  assert.equal(r.store.league(GUILD, EVENT), null); // c has not started: the day's Laga Panas is not known yet
  r.set(dayOf(DONE, [OPEN])); r.clock.now = at(21); await r.service.tick(); await r.service.tick();
  const ledger = r.store.league(GUILD, EVENT);
  assert.deepEqual(ledger.scored, { a: 2, b: 1, c: 2 });
  assert.deepEqual(ledger.users, { u1: { points: 4, right: 2, votes: 3, hot: 2 }, u2: { points: 3, right: 2, votes: 3, hot: 1 },
    u3: { points: 5, right: 3, votes: 3, hot: 2 }, u4: { points: 2, right: 1, votes: 2, hot: 1 } });
  const recap = r.lists.at(-1);
  assert.deepEqual(recap.sections[0].lines.filter(line => line.startsWith('Laga Panas')),
    ['Laga Panas: ONIC vs RRQ (4 penebak, poin dobel)', 'Laga Panas: RRQ vs EVOS (4 penebak, poin dobel)']);
  assert.deepEqual(recap.sections.at(-1), { heading: `Klasemen sementara ${EVENT}`,
    lines: ['1. Uno · 5 poin (3 benar dari 3)', '2. Henry · 4 poin (2 benar dari 3)', '3. Dua · 3 poin (2 benar dari 3)'] });
  const buttons = JSON.stringify(r.sent.at(-1).components);
  assert.match(buttons, new RegExp(`hengs-analis:liga:${voteKey(EVENT)}`)); assert.match(buttons, /Lihat posisiku/);
});

test('a match that ends after the 23:30 recap is scored on a later tick, once', async t => {
  const z = winners => match('z', [EVOS, AE], at(22), winners);
  const r = rig(t, [match('a', [ONIC, RRQ], at(15), [1, 1]), z([1]), OPEN], { now: at(9), people: PEOPLE });
  for (const user of ['u1', 'u2', 'u3']) r.store.vote(GUILD, 'a', user, 1, EVENT);
  for (const user of ['u1', 'u2', 'u3', 'u4']) r.store.vote(GUILD, 'z', user, 1, EVENT);
  r.clock.now = at(23, 31); await r.service.tick();
  assert.deepEqual(r.store.league(GUILD, EVENT).scored, { a: 1 });
  assert.match(r.lists.at(-1).sections[0].lines.join('\n'), /EVOS vs AE · belum selesai/);
  r.set([match('a', [ONIC, RRQ], at(15), [1, 1]), z([1, 1]), OPEN]); r.clock.now = at(23, 50);
  await r.service.tick(); await r.service.tick();
  assert.deepEqual(r.store.league(GUILD, EVENT).scored, { a: 1, z: 2 });
  assert.deepEqual(r.store.league(GUILD, EVENT).users.u4, { points: 2, right: 1, votes: 1, hot: 1 });
});

test('after the grand final the champion gets one appreciation draft and the rotating Analis Jitu role', async t => {
  const r = rig(t, dayOf(DONE), { now: at(9), people: { ...PEOPLE, u9: 'Lama' } });
  voteDay(r); r.store.setLeagueRole(GUILD, { roleId: 'r0', holders: ['u9'] });
  r.clock.now = at(21); await r.service.tick(); await r.service.tick(); await r.service.tick();
  const final = r.lists.at(-1).sections.at(-1);
  assert.equal(final.heading, 'Klasemen final Liga Tebak');
  assert.deepEqual(final.lines.slice(0, 2), ['Juara Liga Tebak: Uno', '1. Uno · 5 poin (3 benar dari 3)']);
  const card = JSON.stringify(r.sent.at(-1).components);
  assert.match(card, /Juara Liga Tebak: Uno 🏆/); assert.match(card, new RegExp(`hengs-analis:liga:${voteKey(EVENT)}`));
  assert.deepEqual(r.drafts, [[{ recipient: 'Uno', achievement: `Juara Liga Tebak ${EVENT} dengan 5 poin (3 benar dari 3 tebakan)`,
    occasion: EVENT, date: 'Rabu, 4 Nov 2026' }, `liga:${GUILD}:${voteKey(EVENT)}`]]);
  assert.deepEqual(r.rolesMade.map(o => [o.name, o.color, o.permissions, o.hoist, o.mentionable]), [['Analis Jitu', 0xF1C40F, [], false, false]]);
  assert.deepEqual(r.roleLog, [['remove', 'u9', 'r-new'], ['add', 'u3', 'r-new']]);
  assert.deepEqual(r.store.leagueRole(GUILD), { roleId: 'r-new', holders: ['u3'] });
  assert.deepEqual(r.reports, []);
});

test('a role Hengs cannot manage and a champion who left are reported, and nothing is retried', async t => {
  const r = rig(t, dayOf(DONE), { now: at(9), people: PEOPLE, roles: [{ id: 'r1', name: '🏅 Analis Jitu', editable: false }] });
  voteDay(r); r.clock.now = at(21); await r.service.tick(); await r.service.tick();
  assert.equal(r.drafts.length, 1); assert.deepEqual(r.roleLog, []); assert.deepEqual(r.rolesMade, []);
  assert.deepEqual(r.reports.map(x => x.feature), ['Role Analis Jitu']);
  assert.match(r.reports[0].reason, /Manage Roles/);
  const gone = rig(t, dayOf(DONE), { now: at(9), people: { u1: 'Henry', u2: 'Dua', u4: 'Empat' } }); // u3, the champion, left
  voteDay(gone); gone.clock.now = at(21); await gone.service.tick(); await gone.service.tick();
  assert.equal(gone.drafts.length, 0); assert.deepEqual(gone.roleLog, []);
  assert.deepEqual(gone.reports.map(x => x.feature), ['Juara Liga Tebak']);
});

test('Lihat posisiku answers privately with the rank, or how far a member is from the standings', async t => {
  const r = rig(t, dayOf(DONE, [OPEN]), { now: at(9), people: PEOPLE });
  voteDay(r); r.clock.now = at(21); await r.service.tick();
  const replies = [];
  const press = (user, key = voteKey(EVENT)) => r.service.handleButton({ customId: `hengs-analis:liga:${key}`, guildId: GUILD,
    user: { id: user }, async reply(p) { replies.push(p); } });
  await press('u1'); await press('u4'); await press('u1', 'nope');
  assert.equal(replies[0].content, `Kamu peringkat 2 dari 3 di ${EVENT} · 4 poin · 2 benar dari 3 tebakan`);
  assert.equal(replies[0].flags, MessageFlags.Ephemeral); assert.deepEqual(replies[0].allowedMentions, { parse: [] });
  assert.equal(replies[1].content, `Kamu belum masuk klasemen ${EVENT}: nebak minimal 3 laga dulu ya. Sejauh ini 2 tebakan kehitung.`);
  assert.match(replies[2].content, /udah nggak berlaku/);
});

// Light Nobar for the MPL ID playoffs (2026-10-30): kickoff reminder and the opt-in 🔔 role.
const LIVE = 'https://www.youtube.com/@MPLIndonesia';

test('the kickoff reminder goes out once 10 to 15 minutes before a previewed match and pings only Nobar members', async t => {
  const room = { id: '777000000000000001', count: 3 };
  const r = rig(t, [match('a', [ONIC, RRQ], at(13))], { now: at(8, 5), people: { u1: 'Henry', u2: 'Dara' }, holders: ['u2'],
    rooms: [room], watch: [{ ...WATCH[0], stream: LIVE }] });
  r.store.setNobarRole(GUILD, 'r-nobar');
  await r.service.tick();
  const preview = [...r.messages.keys()][0];
  r.clock.now = at(12, 44); await r.service.tick(); assert.equal(r.sent.length, 1); // 16 minutes before: not yet
  r.clock.now = at(12, 46); await r.service.tick(); r.clock.now = at(12, 51); await r.service.tick();
  assert.equal(r.sent.length, 2);
  const reminder = r.sent[1];
  assert.equal(reminder.content, [`🔴 **ONIC vs RRQ HOSHI** mulai 13:00 WIB (<t:${at(13) / 1000}:R>) · MPL ID S18 Playoffs`,
    `Tebakan ditutup pas laga mulai: https://discord.com/channels/${GUILD}/${r.channel.id}/${preview}`,
    `Nobar bareng: <#${room.id}> (3 orang), atau buka sendiri lewat 🎬・Bikin Nobar`, `Live: <${LIVE}>`, '<@u2>'].join('\n'));
  assert.deepEqual(reminder.allowedMentions, { users: ['u2'] });
  assert.equal(reminder.components[0].toJSON().components[0].custom_id, 'hengs-analis:nobar');
  const started = rig(t, [match('a', [ONIC, RRQ], at(13))], { now: at(13, 1) });
  await started.service.tick(); assert.equal(started.sent.filter(p => p.content).length, 0); // already started: no reminder
});

test('🔔 adds the Nobar role made once, a second click removes it, and a role above Hengs is reported', async t => {
  const r = rig(t, [match('a', [ONIC, RRQ], at(13))], { now: at(8, 5) });
  const replies = []; const log = [];
  const press = cache => r.service.handleButton({ customId: 'hengs-analis:nobar', guildId: GUILD, guild: r.guild,
    member: { roles: { cache, async add(role) { log.push(['add', role.id]); }, async remove(role) { log.push(['remove', role.id]); } } },
    user: { id: 'u1' }, async reply(p) { replies.push(p); } });
  await press(new Set());
  assert.deepEqual(r.rolesMade.map(o => [o.name, o.permissions, o.hoist, o.mentionable]), [['Nobar', [], false, false]]);
  assert.equal(r.store.nobarRole(GUILD), 'r-new'); assert.deepEqual(log, [['add', 'r-new']]);
  assert.match(replies[0].content, /bakal di-ping/); assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  await press(new Set(['r-new']));
  assert.deepEqual(log.at(-1), ['remove', 'r-new']); assert.match(replies.at(-1).content, /nggak di-ping lagi/); assert.equal(r.rolesMade.length, 1);
  const high = rig(t, [], { roles: [{ id: 'rx', name: '🔔 Nobar', editable: false }] });
  const out = [];
  await high.service.handleButton({ customId: 'hengs-analis:nobar', guildId: GUILD, guild: high.guild,
    member: { roles: { cache: new Set(), async add() {}, async remove() {} } }, user: { id: 'u1' }, async reply(p) { out.push(p); } });
  assert.match(out[0].content, /belum bisa diatur/); assert.deepEqual(high.reports.map(x => x.feature), ['Role Nobar']);
});
