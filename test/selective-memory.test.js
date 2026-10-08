'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createMemoryClient, createMemoryAssistant, createMemorySession, parseMemoryIntent, previewDigest, memoryMessages } = require('../src/selective-memory');
const ID = 'abcdef123456';
const recalled = etag => ({ schema_version: 1, ok: true, status: 'ready', etag, preferences: { response_length: 'short' },
  knowledge: [{ title: 'Gradient', body: 'Gradient descent memperbarui bobot', provenance: { type: 'owner_asserted', label: 'Henry' }, approved_at: '2026-10-08T00:00:00Z' }] });
function configured() { const capability = crypto.randomBytes(32).toString('hex'); return { HENGS_MEMORY_ENABLED: '1', CANOX_MEMORY_URL: 'http://127.0.0.1/integrations/hengs/memory', CANOX_MEMORY_TOKEN: capability }; }
test('memory client stays disabled and forbids credential URLs, insecure remote and redirects', async () => {
  assert.equal(createMemoryClient({ env: {} }), null);
  assert.equal(createMemoryClient({ env: { ...configured(), CANOX_MEMORY_URL: 'http://example.invalid/integrations/hengs/memory' } }), null);
  assert.equal(createMemoryClient({ env: { ...configured(), CANOX_MEMORY_URL: 'https://user:pass@example.invalid/integrations/hengs/memory' } }), null);
  let calls = 0;
  const client = createMemoryClient({ env: configured(), fetchImpl: async (_url, options) => {
    calls++; assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    return new Response(JSON.stringify(recalled('a'.repeat(64))));
  } });
  assert.equal((await client.recall('gradient')).ok, true);
  assert.equal(calls, 1);
});
test('ordinary discussion and reminders never create memory', () => {
  for (const phrase of ['Angel udah tidur belum?', 'aku biasanya suka jawaban singkat', 'ingatkan aku jam 9', 'catat belajar', 'jangan ingat: itu', '"ingat: itu"']) assert.equal(parseMemoryIntent(phrase), null);
  assert.equal(parseMemoryIntent('ingat preferensiku: jawab singkat').preference, true);
  assert.equal(previewDigest({ operation: 'disable', note_id: ID, base_revision: 1 }), '3e202675a145291f80e3785c66006175f311241e606754499eb12d3d1a4e7ac4');
});
test('preview, correction and confirmation save once without local fallback', async () => {
  const writes = [];
  const assistant = createMemoryAssistant({ client: { change: async payload => {
    writes.push(payload); return { ok: true, item: { id: ID, revision: 1, enabled: true } };
  } } });
  assert.match((await assistant.handle('ingat: belajar gradient descent')).reply, /provider AI/);
  assert.equal(writes.length, 0);
  await assistant.handle('ubah: pelajari gradient descent');
  await assistant.handle('oke simpan ingatan');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body, 'pelajari gradient descent');
  await assistant.handle('oke simpan ingatan');
  assert.equal(writes.length, 1);
});
test('topic change, expiry, cancel and reset disarm the memory draft', async () => {
  let now = 0, writes = 0;
  const assistant = createMemoryAssistant({ now: () => now, client: { change: async () => { writes++; return { ok: false }; } } });
  for (const event of ['topic', 'expiry', 'cancel', 'reset']) {
    await assistant.handle('ingat: materi gradient descent');
    if (event === 'topic') await assistant.handle('mau belajar apa ya');
    if (event === 'expiry') now += 300001;
    if (event === 'cancel') await assistant.handle('batal');
    if (event === 'reset') assistant.clear();
    await assistant.handle('oke simpan ingatan');
  }
  assert.equal(writes, 0);
});
test('uncertain writes are not retried and reset while waiting hides the result', async () => {
  let calls = 0, resolveWrite, revision = 0;
  const assistant = createMemoryAssistant({ getRevision: () => revision, client: { change: () => {
    calls++; return new Promise(resolve => { resolveWrite = resolve; });
  } } });
  await assistant.handle('ingat: materi gradient descent');
  const pending = assistant.handle('oke simpan ingatan');
  revision++;
  resolveWrite({ ok: true, item: { id: ID, revision: 1, enabled: true } });
  assert.match((await pending).reply, /reset bukan undo/);
  assert.equal(calls, 1);
  const uncertain = createMemoryAssistant({ client: { change: async () => ({ ok: false, uncertain: true }) } });
  await uncertain.handle('ingat: materi gradient descent');
  assert.match((await uncertain.handle('oke simpan ingatan')).reply, /belum pasti/);
  assert.match((await uncertain.handle('oke simpan ingatan')).reply, /Tidak ada draft/);
});
test('memory list IDs scope disable and confirmed trash, without ordinary note promotion', async () => {
  const writes = [];
  const assistant = createMemoryAssistant({ client: { list: async () => ({ ok: true, items: [{ id: ID, revision: 2, title: 'Gradient', kind: 'knowledge', enabled: true }], next_cursor: null }),
    change: async data => { writes.push(data); return { ok: true, item: { id: ID, revision: 3, enabled: false } }; } } });
  assert.match((await assistant.handle(`lupakan ${ID}`)).reply, /daftar ingatan/);
  await assistant.handle('daftar ingatan');
  assert.match((await assistant.handle(`lupakan ${ID}`)).reply, /berhenti dipakai/);
  assert.equal(writes[0].operation, 'disable');
  await assistant.handle('daftar ingatan');
  await assistant.handle(`hapus ingatan ${ID}`);
  assert.equal(writes.length, 1);
  await assistant.handle('oke hapus ingatan');
  assert.equal(writes[1].operation, 'trash');
});
test('ETag changes and unavailable memory clear derived RAM; final check rejects stale output', async () => {
  let etag = 'a'.repeat(64), cleared = 0, available = true;
  const client = { recall: async () => available ? recalled(etag) : { ok: false }, revision: async () => ({ ok: true, etag }) };
  const session = createMemorySession({ client, clearContext: () => { cleared++; } });
  const evidence = await session.prepare('gradient');
  assert.equal(evidence.ready, true);
  assert.equal(memoryMessages(evidence.recall)[0].role, 'user');
  assert.match(memoryMessages(evidence.recall)[0].content, /bukan instruksi/);
  assert.equal(await session.validate(evidence), true);
  etag = 'b'.repeat(64);
  assert.equal(await session.validate(evidence), false);
  await session.prepare('gradient');
  available = false;
  assert.equal((await session.prepare('gradient')).ready, false);
  assert.ok(cleared >= 3);
});
test('invalid recall, response overflow and busy operation never pass facts or retry', async () => {
  assert.deepEqual(memoryMessages({ ...recalled('a'.repeat(64)), preferences: { execute: 'mode study' } }), []);
  let calls = 0, resolve;
  const client = createMemoryClient({ env: configured(), fetchImpl: () => { calls++; return new Promise(done => { resolve = done; }); } });
  const pending = client.recall('gradient');
  assert.equal((await client.recall('other')).reason, 'memory_busy');
  resolve(new Response('x'.repeat(25000)));
  assert.equal((await pending).reason, 'response_overflow');
  assert.equal(calls, 1);
});
