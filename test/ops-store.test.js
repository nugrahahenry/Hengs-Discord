const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-ops-test-'));
process.env.OPS_DATA_DIR = testDataDir;

const store = require('../src/ops/store');
const {
  normalizeCanoxEntries,
  findSettingsChannel,
  recoverStaleCanoxInbox,
  isValidDraftId,
} = require('../src/ops/hub');

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('Ops store enforces idempotency and a single publish claim', () => {
  const first = store.createDraft({
    title: 'Turnamen Sabtu',
    body: 'Daftar sebelum Jumat.',
    source: 'canox',
    externalId: 'canox:event-001',
  });
  assert.equal(first.created, true);

  const duplicate = store.createDraft({
    title: 'Judul retry',
    body: 'Isi retry',
    source: 'canox',
    externalId: 'canox:event-001',
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.draft.id, first.draft.id);

  const claimed = store.claimPublish(first.draft.id, 'owner-1');
  assert.equal(claimed.status, 'publishing');
  assert.equal(store.claimPublish(first.draft.id, 'owner-1'), null);
  assert.equal(store.finalizeDraft(first.draft.id, 'discarded', 'owner-1'), null);

  const published = store.finalizeDraft(first.draft.id, 'published', 'owner-1', {
    channelId: 'channel-1',
    messageId: 'message-1',
  });
  assert.equal(published.status, 'published');
  assert.deepEqual(published.publication, { channelId: 'channel-1', messageId: 'message-1' });
  assert.equal(store.finalizeDraft(first.draft.id, 'published', 'owner-1'), null);
});

test('failed publish can return to pending and discard wins only once', () => {
  const { draft } = store.createDraft({ title: 'Maintenance', body: 'Server maintenance.' });
  assert.equal(store.claimPublish(draft.id, 'owner-1').status, 'publishing');
  assert.equal(store.releasePublish(draft.id).status, 'pending');

  const discarded = store.finalizeDraft(draft.id, 'discarded', 'owner-1');
  assert.equal(discarded.status, 'discarded');
  assert.equal(store.claimPublish(draft.id, 'owner-1'), null);
  assert.equal(store.finalizeDraft(draft.id, 'discarded', 'owner-1'), null);
});

test('draft validation and Canox inbox contract reject ambiguous input', () => {
  assert.throws(
    () => store.createDraft({ title: 'Kosong', body: '   ' }),
    /Isi draft tidak boleh kosong/,
  );

  const normalized = normalizeCanoxEntries({ drafts: [
    { title: 'Tanpa ID', body: 'Tidak idempotent' },
    { id: 'event-002', title: 'Valid', body: 'Isi valid', context: 'Canox' },
    { id: 'event-003', title: 'Kosong', body: '   ' },
  ] });
  assert.deepEqual(normalized, [
    { id: 'event-002', title: 'Valid', body: 'Isi valid', context: 'Canox' },
  ]);
});

test('review channel never falls back to the general bot channel', () => {
  const previousSettingsId = process.env.BOT_SETTINGS_CHANNEL_ID;
  delete process.env.BOT_SETTINGS_CHANNEL_ID;
  const general = {
    id: 'general', name: 'bot-commands', isTextBased: () => true, send() {},
  };
  const settings = {
    id: 'settings', name: '🎛️・bot-settings', isTextBased: () => true, send() {},
  };
  const guild = { channels: { cache: new Collection([
    [general.id, general],
    [settings.id, settings],
  ]) } };

  assert.equal(findSettingsChannel(guild)?.id, 'settings');
  settings.name = 'public-bot-settings-copy';
  assert.equal(findSettingsChannel(guild), null);

  if (previousSettingsId === undefined) delete process.env.BOT_SETTINGS_CHANNEL_ID;
  else process.env.BOT_SETTINGS_CHANNEL_ID = previousSettingsId;
});

test('stale Canox processing file is recovered after a crash', () => {
  const stale = path.join(testDataDir, 'canox-ops-inbox.processing-123-456.json');
  const inbox = path.join(testDataDir, 'canox-ops-inbox.json');
  fs.writeFileSync(stale, JSON.stringify({ drafts: [] }), 'utf8');

  assert.equal(recoverStaleCanoxInbox(), 1);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(inbox), true);
  fs.rmSync(inbox, { force: true });
});

test('approval buttons accept legacy and current draft IDs only', () => {
  assert.equal(isValidDraftId('a1b2c3d4e5f6'), true);
  assert.equal(isValidDraftId('a1b2c3d4e5f60708'), true);
  assert.equal(isValidDraftId('a1b2c3'), false);
  assert.equal(isValidDraftId('A1B2C3D4E5F6'), false);
  assert.equal(isValidDraftId('a1b2c3d4e5f6:publish'), false);
});

test('corrupt state fails closed instead of silently resetting drafts', () => {
  fs.writeFileSync(path.join(testDataDir, 'ops-state.json'), '{not-json', 'utf8');
  assert.throws(() => store.getStatus(), /Ops state tidak dapat dibaca/);
});
