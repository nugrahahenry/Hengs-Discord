'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { createFailureReporter, failureNote, findBotSettings, missingPermissions } = require('../src/utils/failure-report');

function guildWith({ granted = [P.ViewChannel, P.EmbedLinks], settings = true, fail = false } = {}) {
  const notes = [];
  const welcome = { id: '423456789012345678', name: '👋・welcome', isTextBased: () => true,
    permissionsFor: () => new PermissionsBitField(granted) };
  const botSettings = { id: '423456789012345679', name: '⚙️︱bot-settings', isTextBased: () => true,
    async send(payload) { if (fail) throw new Error('private-provider'); notes.push(payload); } };
  const channels = new Map([[welcome.id, welcome], ...(settings ? [[botSettings.id, botSettings]] : [])]);
  return { guild: { id: 'g1', members: { me: {} }, channels: { cache: channels } }, welcome, notes };
}

test('missing permissions read like Discord channel settings, and bot-settings is found under any theme', () => {
  const { guild, welcome } = guildWith();
  assert.deepEqual(missingPermissions(welcome, {}), ['Send Messages', 'Attach Files']);
  assert.deepEqual(missingPermissions(welcome, {}, [P.ViewChannel, P.SendMessages]), ['Send Messages']);
  assert.deepEqual(missingPermissions({ permissionsFor: () => null }, {}), []);
  assert.equal(findBotSettings(guild).name, '⚙️︱bot-settings');
});

test('a failed send posts one note to bot-settings without pings, and the same failure is not repeated in the window', async () => {
  let time = 0;
  const report = createFailureReporter({ now: () => time, logger: { error() {} } });
  const { guild, welcome, notes } = guildWith();
  assert.equal(await report(guild, { feature: 'Welcome', channel: welcome, who: '<@1>', extra: 'Role Member-nya tetap sudah dikasih.' }), true);
  assert.equal(notes[0].content, '⚠️ **Welcome gagal dikirim** buat <@1> di <#423456789012345678>: Hengs belum punya izin **Send Messages**, '
    + '**Attach Files** di channel itu. Buka Edit Channel > Permissions, tambah role Hengs Bot, lalu nyalakan izin tadi. Role Member-nya tetap sudah dikasih.');
  assert.deepEqual(notes[0].allowedMentions, { parse: [] });
  assert.equal(await report(guild, { feature: 'Welcome', channel: welcome, who: '<@1>' }), false); // same failure: no double
  assert.equal(await report(guild, { feature: 'Welcome', channel: welcome, who: '<@2>' }), true); // another member: reported
  time += 6 * 60 * 60_000;
  assert.equal(await report(guild, { feature: 'Welcome', channel: welcome, who: '<@1>' }), true); // after the window
  assert.equal(notes.length, 3);
});

test('notes cover error codes, a missing channel and a given reason, with no em or en dash', () => {
  const channel = { id: '423456789012345678' };
  assert.equal(failureNote({ feature: 'Kartu Analis', channel, code: 50001 }),
    '⚠️ **Kartu Analis gagal dikirim** di <#423456789012345678> (kode 50001). Cek channel itu dan izin Hengs di sana.');
  assert.equal(failureNote({ feature: 'Berita harian' }), '⚠️ **Berita harian gagal dikirim**: channel tujuannya tidak ketemu. Cek pengaturannya.');
  const reason = failureNote({ feature: 'Welcome', who: '<@1>', reason: 'channel dari WELCOME_CHANNEL_ID tidak ketemu' });
  assert.equal(reason, '⚠️ **Welcome gagal dikirim** buat <@1>: channel dari WELCOME_CHANNEL_ID tidak ketemu.');
  for (const text of [reason, failureNote({ feature: 'Leave card', channel })]) assert.doesNotMatch(text, /[–—]/);
});

test('reporting never throws: no bot-settings or a failed note is only logged, without provider text', async () => {
  const logs = [];
  const report = createFailureReporter({ logger: { error: code => logs.push(code) } });
  assert.equal(await report(guildWith({ settings: false }).guild, { feature: 'Welcome' }), false);
  assert.equal(await report(guildWith({ fail: true }).guild, { feature: 'Leave card' }), false);
  assert.equal(await report(null, { feature: 'Welcome' }), false);
  assert.deepEqual(logs, ['[failure-report] BOT_SETTINGS_MISSING', '[failure-report] REPORT_FAILED']);
});

test('welcome, leave and boost handlers report through the one reporter; the welcome checks permissions before the card', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
  const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
  const welcome = between('client.on(Events.GuildMemberAdd', 'client.on(Events.GuildMemberRemove');
  assert.ok(welcome.indexOf('missingPermissions(channel, member.guild.members.me)') < welcome.indexOf('generateCard(member'));
  assert.equal((welcome.match(/await reportWelcome\(/g) || []).length, 3); // channel missing, permissions, send error
  assert.match(between('client.on(Events.GuildMemberRemove', 'client.on(Events.GuildMemberUpdate'), /reportFailure\(member\.guild, \{ feature: 'Leave card'/);
  assert.match(source, /reportFailure\(g, \{ feature: 'Ucapan boost'/);
  assert.match(source, /createEsportsService\(\{ guildAccess, reportFailure,/);
  assert.match(source, /countReactions: countMemeReactions \}\), reportFailure \}\);/);
});
