'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { duration, readHealthSnapshot, onlineNotice, statusReport, handleStatusMessage } = require('../src/runtime/status-board');

const AT = Date.parse('2026-10-26T03:42:00Z'); // 10:42 WIB

test('the online notice tells a first start, a tidy stop, an abrupt stop and a new version apart', () => {
  assert.equal(onlineNotice({ previous: null, version: '1.85.0', startedAt: AT }), '🟢 **Hengs online** · v1.85.0');
  assert.equal(onlineNotice({ previous: { version: '1.85.0', heartbeatAt: AT - 4 * 60_000, stopped: true }, version: '1.85.0', startedAt: AT }),
    '🟢 **Hengs online lagi** · v1.85.0 · sempat mati 4 menit, dimatikan dengan rapi.');
  assert.equal(onlineNotice({ previous: { version: '1.84.1', heartbeatAt: AT - 4 * 60_000, stopped: false }, version: '1.85.0', startedAt: AT }),
    '🟠 **Hengs online lagi** · v1.85.0 · sempat mati sekitar 4 menit, berhentinya mendadak (terakhir hidup 10:38 WIB).'
    + ' Versi baru: v1.84.1 ke v1.85.0.');
});

test('durations read naturally', () => {
  assert.equal(duration(20_000), 'kurang dari semenit');
  assert.equal(duration(-5), 'kurang dari semenit');
  assert.equal(duration(59 * 60_000), '59 menit');
  assert.equal(duration(2 * 3_600_000), '2 jam');
  assert.equal(duration(3 * 3_600_000 + 12 * 60_000), '3 jam 12 menit');
  assert.equal(duration(26 * 3_600_000), '1 hari 2 jam');
});

test('the previous health snapshot is read safely', () => {
  const files = {
    good: JSON.stringify({ schemaVersion: 1, service: 'hengs-discord', version: '1.84.1', heartbeat: { status: 'STOPPED', at: '2026-10-26T03:38:00.000Z' } }),
    alive: JSON.stringify({ schemaVersion: 1, service: 'hengs-discord', version: '1.84.1', heartbeat: { status: 'ALIVE', at: '2026-10-26T03:38:00.000Z' } }),
    broken: '{',
    other: JSON.stringify({ schemaVersion: 1, service: 'hengs-wa', heartbeat: { status: 'ALIVE', at: '2026-10-26T03:38:00.000Z' } }),
  };
  const fsImpl = { readFileSync: name => { if (!(name in files)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files[name]; } };
  assert.deepEqual(readHealthSnapshot('good', fsImpl), { version: '1.84.1', heartbeatAt: Date.parse('2026-10-26T03:38:00.000Z'), stopped: true });
  assert.equal(readHealthSnapshot('alive', fsImpl).stopped, false);
  for (const name of ['broken', 'other', 'missing']) assert.equal(readHealthSnapshot(name, fsImpl), null);
});

test('the status reply shows version, uptime, connection, news, Analis and failures', () => {
  const text = statusReport({ version: '1.85.0', startedAt: AT, now: AT + 3 * 3_600_000 + 12 * 60_000, connection: 'CONNECTED', ping: 84,
    newsRow: { receipts: [
      { kind: 'news', status: 'sent', at: Date.parse('2026-10-26T02:00:00Z') },
      { kind: 'news', status: 'claimed', at: Date.parse('2026-10-26T05:00:00Z') },
      { kind: 'meme', status: 'sent', at: Date.parse('2026-10-26T05:00:00Z') }] },
    analisCheck: Date.parse('2026-10-26T04:30:00Z'), failures: 2, logChannel: { id: '523456789012345678' } });
  assert.equal(text, ['📡 **Status Hengs** · v1.85.0',
    '• Online sejak 26 Okt 10:42 WIB (3 jam 12 menit)',
    '• Koneksi Discord: tersambung, ping 84 ms',
    '• News terakhir: 26 Okt 09:00 WIB · Meme terakhir: 26 Okt 12:00 WIB',
    '• Analis: cek Liquipedia terakhir 26 Okt 11:30 WIB',
    '• Laporan gagal sejak online: 2 (detailnya di <#523456789012345678>)'].join('\n'));
  const quiet = statusReport({ version: '1.85.0', startedAt: AT, now: AT, connection: 'RECONNECTING', ping: -1, newsRow: null,
    analisCheck: 0, failures: 0, logChannel: null });
  assert.match(quiet, /Koneksi Discord: nyambung ulang, ping belum ada/);
  assert.match(quiet, /News terakhir: belum ada · Meme terakhir: belum ada/);
  assert.match(quiet, /Analis: belum pernah cek Liquipedia/);
  assert.match(quiet, /Laporan gagal sejak online: 0$/);
  for (const value of [text, quiet]) assert.doesNotMatch(value, /[–—]/);
});

test('status is answered only in bot-status, only for those allowed, only for the status words', async () => {
  const replies = [];
  const message = (channel, content, allowed = true) => ({ channel: { name: channel }, content, allowed,
    reply: async payload => { replies.push(payload); } });
  const deps = { canAsk: m => m.allowed, report: () => 'STATUS' };
  assert.equal(await handleStatusMessage(message('📡・bot-status', 'status'), deps), true);
  assert.equal(await handleStatusMessage(message('bot-status', 'Cek Status?'), deps), true);
  assert.equal(await handleStatusMessage(message('bot-status', '<@123456789012345678> status'), deps), true);
  assert.equal(await handleStatusMessage(message('bot-status', 'status', false), deps), false);
  assert.equal(await handleStatusMessage(message('bot-status', 'statusnya gimana'), deps), false);
  assert.equal(await handleStatusMessage(message('ngobrol', 'status'), deps), false);
  assert.equal(replies.length, 3);
  assert.deepEqual(replies[0], { content: 'STATUS', allowedMentions: { parse: [] } });
});

test('index reads the old snapshot before start, posts the online notice to bot-status and answers status before mentions', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert(index.includes('readHealthSnapshot(runtimeHealth.filePath)'));
  assert(index.indexOf('readHealthSnapshot(runtimeHealth.filePath)') < index.indexOf('runtimeHealth.start()'));
  assert.match(index, /postBotChannel\(guild, 'status', notice\)/);
  assert(index.includes('handleStatusMessage(msg'));
  assert(index.indexOf('handleStatusMessage(msg') < index.indexOf('if (!msg.mentions.has(client.user'));
  assert.doesNotMatch(index, /postBotSettings/);
});
