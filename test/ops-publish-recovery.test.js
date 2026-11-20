'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');
const { inspectPublishHistory } = require('../src/ops/publish-recovery');

const now = Date.now();
const start = now - 20 * 60_000;
const draft = { id: '0123456789ab', actionStartedAt: new Date(start).toISOString() };
const msg = (id, createdTimestamp, footer, author = 'bot') => ({
  id, createdTimestamp, author: { id: author }, embeds: [{ footer: { text: footer } }],
});
function channel(pages) {
  const calls = [];
  return { calls, messages: { fetch: async options => {
    calls.push(options);
    const page = pages[calls.length - 1];
    if (page instanceof Error) throw page;
    return new Map((page || []).map(message => [message.id, message]));
  } } };
}

test('recovery finds publication beyond the first page without allowing a resend', async () => {
  const target = channel([[msg('newer', now)], [msg('sent', start, `Hengs Ops Hub · Draft ID: ${draft.id}`)]]);
  assert.deepEqual(await inspectPublishHistory(target, draft, 'bot', now), { status: 'published', messageId: 'sent' });
  assert.equal(target.calls[1].before, 'newer');
});

test('recovery unlocks only after history covers the claim or reaches the end', async () => {
  const target = channel([[msg('newer', now)], [msg('older', start - 60_000)]]);
  assert.deepEqual(await inspectPublishHistory(target, draft, 'bot', now), { status: 'absent' });
  assert.equal(target.calls.length, 2);
  assert.deepEqual(await inspectPublishHistory(channel([[]]), draft, 'bot', now), { status: 'absent' });
});

test('recovery keeps incomplete, failed, looping and fresh claims locked', async () => {
  for (const pages of [
    [new Error('private provider detail')],
    [[msg('no-time', undefined)]],
    [[msg('loop', now)], [msg('loop', now)]],
    Array.from({ length: 10 }, (_, index) => [msg(String(index), now - index)]),
  ]) {
    const target = channel(pages);
    assert.deepEqual(await inspectPublishHistory(target, draft, 'bot', now), { status: 'review' });
    assert.ok(target.calls.length <= 10);
  }
  for (const actionStartedAt of [new Date(now).toISOString(), null]) {
    assert.deepEqual(await inspectPublishHistory(channel([[]]), { ...draft, actionStartedAt }, 'bot', now), { status: 'review' });
  }
});

test('recovery does not accept another author or a longer draft ID as a receipt', async () => {
  const target = channel([[
    msg('forged', start - 60_000, `Draft ID: ${draft.id}`, 'member'),
    msg('prefix', start, `Draft ID: ${draft.id}1234`),
  ]]);
  assert.deepEqual(await inspectPublishHistory(target, draft, 'bot', now), { status: 'absent' });
});

test('startup requires history permission and restores review without sending a public message', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-recovery-'));
  process.env.OPS_DATA_DIR = dir;
  process.env.ANNOUNCE_CHANNEL_ID = 'announcements';
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = require('../src/ops/store');
  const { recoverPublishingDrafts } = require('../src/ops/hub');
  const { draft: entry } = store.createDraft({ title: 'Review', body: 'A draft, not a new post.' });
  store.claimPublish(entry.id, 'owner');
  const file = path.join(dir, 'ops-state.json');
  const state = JSON.parse(fs.readFileSync(file));
  state.drafts[0].actionStartedAt = draft.actionStartedAt;
  fs.writeFileSync(file, JSON.stringify(state));
  let permitted = false;
  const target = Object.assign(channel([[]]), {
    id: 'announcements', isTextBased: () => true,
    send: () => assert.fail('Recovery must not publish'),
    permissionsFor: () => ({ has: () => permitted }),
  });
  const guild = { channels: { cache: new Collection([[target.id, target]]) } };
  const client = { user: { id: 'bot' }, guilds: { fetch: async () => guild } };
  await recoverPublishingDrafts(client);
  assert.equal(target.calls.length, 0);
  assert.equal(store.getDraft(entry.id).status, 'publishing');
  permitted = true;
  await recoverPublishingDrafts(client);
  assert.equal(store.getDraft(entry.id).status, 'pending');
});
