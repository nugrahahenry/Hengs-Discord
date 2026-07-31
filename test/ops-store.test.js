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
  refreshPendingDraftPanels,
  isValidDraftId,
  approvalRow,
  handleButton,
  handleModal,
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

test('manual edit keeps revision history and cannot overwrite a claimed draft', () => {
  const { draft } = store.createDraft({
    title: 'Judul awal',
    body: 'Isi awal yang masih panjang.',
  });
  const edited = store.updatePendingDraft(
    draft.id,
    { title: 'Judul baru', body: 'Isi baru.' },
    'owner-1',
    'edit',
  );
  assert.equal(edited.title, 'Judul baru');
  assert.equal(edited.body, 'Isi baru.');
  assert.equal(edited.revisions.length, 1);
  assert.equal(edited.revisions[0].title, 'Judul awal');
  assert.equal(edited.lastRevisionKind, 'edit');

  assert.equal(store.claimPublish(draft.id, 'owner-1').status, 'publishing');
  assert.equal(
    store.updatePendingDraft(draft.id, { title: 'Terlambat', body: 'Tidak boleh masuk.' }, 'owner-1'),
    null,
  );
  store.releasePublish(draft.id);
});

test('AI revision claim blocks publish, applies once, and recovers after a crash', () => {
  const { draft } = store.createDraft({
    title: 'Event Komunitas',
    body: 'Isi pengumuman event yang sangat panjang.',
  });
  const claimed = store.claimRevision(draft.id, 'owner-1', 'shorten');
  assert.equal(claimed.status, 'revising');
  assert.equal(store.claimPublish(draft.id, 'owner-1'), null);
  assert.equal(store.claimRevision(draft.id, 'owner-1', 'regenerate'), null);

  const applied = store.applyRevision(
    draft.id,
    { title: 'Event', body: 'Isi ringkas.' },
    'owner-1',
  );
  assert.equal(applied.status, 'pending');
  assert.equal(applied.body, 'Isi ringkas.');
  assert.equal(applied.revisions[0].kind, 'shorten');
  assert.equal(store.applyRevision(draft.id, { title: 'Dobel', body: 'Dobel' }, 'owner-1'), null);

  assert.equal(store.claimRevision(draft.id, 'owner-1', 'regenerate').status, 'revising');
  assert.deepEqual(store.recoverRevisingDrafts(), [draft.id]);
  assert.equal(store.getDraft(draft.id).status, 'pending');
});

test('pending panel exposes five owner actions and hides them while revising', () => {
  const { draft } = store.createDraft({ title: 'Panel', body: 'Isi panel.' });
  const customIds = approvalRow(draft)[0].toJSON().components.map(component => component.custom_id);
  assert.deepEqual(customIds, [
    `ops:edit:${draft.id}`,
    `ops:shorten:${draft.id}`,
    `ops:regenerate:${draft.id}`,
    `ops:publish:${draft.id}`,
    `ops:discard:${draft.id}`,
  ]);
  assert.deepEqual(approvalRow({ ...draft, status: 'revising' }), []);
});

test('startup refresh repairs a pending panel after a crash window', async () => {
  const { draft } = store.createDraft({ title: 'Pulihkan panel', body: 'Isi tersimpan.' });
  store.setPanel(draft.id, { channelId: 'settings', messageId: 'panel-refresh' });
  let editedPayload = null;
  const settingsChannel = {
    id: 'settings',
    messages: {
      fetch: async messageId => {
        assert.equal(messageId, 'panel-refresh');
        return { edit: async payload => { editedPayload = payload; } };
      },
    },
  };
  const guild = {
    channels: {
      cache: new Collection([[settingsChannel.id, settingsChannel]]),
      fetch: async () => null,
    },
  };
  await refreshPendingDraftPanels({
    guilds: { fetch: async () => guild },
  });
  assert.equal(editedPayload.components[0].components.length, 5);
});

test('owner modal edits pending draft while unauthorized buttons fail closed', async () => {
  const previousOwner = process.env.OWNER_ID;
  process.env.OWNER_ID = 'owner-1';
  try {
    const { draft } = store.createDraft({ title: 'Modal awal', body: 'Isi modal awal.' });
    store.setPanel(draft.id, { channelId: 'settings', messageId: 'panel-1' });
    const panelMessage = { edit: async () => {} };
    const settingsChannel = {
      id: 'settings',
      messages: { fetch: async () => panelMessage },
    };
    let unauthorizedReply = null;
    await handleButton({
      isButton: () => true,
      customId: `ops:edit:${draft.id}`,
      user: { id: 'outsider' },
      reply: async payload => { unauthorizedReply = payload; },
    });
    assert.match(unauthorizedReply.content, /Hanya owner/);
    assert.equal(unauthorizedReply.ephemeral, true);

    const replies = [];
    await handleModal({
      isModalSubmit: () => true,
      customId: `ops:editmodal:${draft.id}`,
      user: { id: 'owner-1' },
      fields: {
        getTextInputValue: key => key === 'title' ? 'Modal baru' : 'Isi modal baru.',
      },
      guild: {
        channels: {
          cache: new Collection([[settingsChannel.id, settingsChannel]]),
          fetch: async () => null,
        },
      },
      deferReply: async payload => { replies.push({ defer: payload }); },
      editReply: async payload => { replies.push({ edit: payload }); },
    });
    assert.equal(store.getDraft(draft.id).title, 'Modal baru');
    assert.match(replies.at(-1).edit.content, /berhasil diedit/);

    store.claimPublish(draft.id, 'owner-1');
    let staleReply = null;
    await handleModal({
      isModalSubmit: () => true,
      customId: `ops:editmodal:${draft.id}`,
      user: { id: 'owner-1' },
      fields: {
        getTextInputValue: key => key === 'title' ? 'Edit basi' : 'Tidak boleh tersimpan.',
      },
      reply: async payload => { staleReply = payload; },
    });
    assert.match(staleReply.content, /Tidak ada isi yang ditimpa/);
    assert.equal(store.getDraft(draft.id).title, 'Modal baru');
    store.releasePublish(draft.id);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
  }
});

test('failed AI revision releases its claim and preserves the original draft', async () => {
  const previousOwner = process.env.OWNER_ID;
  process.env.OWNER_ID = 'owner-1';
  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    const { draft } = store.createDraft({
      title: 'Tetap aman',
      body: 'Isi asli tidak boleh hilang.',
    });
    const followUps = [];
    await handleButton({
      isButton: () => true,
      customId: `ops:regenerate:${draft.id}`,
      user: { id: 'owner-1' },
      guild: { channels: { cache: new Collection(), fetch: async () => null } },
      update: async () => {},
      message: { edit: async () => {} },
      followUp: async payload => { followUps.push(payload); },
    }, {
      agent: {
        reviseAnnouncement: async () => { throw new Error('model unavailable'); },
      },
    });

    const restored = store.getDraft(draft.id);
    assert.equal(restored.status, 'pending');
    assert.equal(restored.title, 'Tetap aman');
    assert.equal(restored.body, 'Isi asli tidak boleh hilang.');
    assert.match(followUps.at(-1).content, /Draft asli tetap aman/);
  } finally {
    console.error = originalConsoleError;
    if (previousOwner === undefined) delete process.env.OWNER_ID;
    else process.env.OWNER_ID = previousOwner;
  }
});

test('corrupt state fails closed instead of silently resetting drafts', () => {
  fs.writeFileSync(path.join(testDataDir, 'ops-state.json'), '{not-json', 'utf8');
  assert.throws(() => store.getStatus(), /Ops state tidak dapat dibaca/);
});
