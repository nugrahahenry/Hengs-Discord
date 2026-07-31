const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hengs-event-test-'));
process.env.EVENT_DATA_DIR = testDataDir;

const store = require('../src/events/store');

function futureIso(offsetMs = 2 * 60 * 60 * 1000) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function create(overrides = {}) {
  return store.createEvent({
    title: 'Community Night',
    description: 'Main dan ngobrol bareng.',
    startAt: futureIso(),
    location: 'Discord Voice',
    capacity: 2,
    createdBy: 'owner-1',
    externalId: `event:${Math.random()}`,
    ...overrides,
  }).event;
}

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('event creation is idempotent and publish claim has one winner', () => {
  const first = store.createEvent({
    title: 'Turnamen Sabtu',
    description: 'Daftar sebelum Jumat.',
    startAt: futureIso(),
    createdBy: 'editor-1',
    externalId: 'discord:interaction-001',
  });
  const duplicate = store.createEvent({
    title: 'Retry title',
    description: 'Retry body',
    startAt: futureIso(),
    createdBy: 'editor-1',
    externalId: 'discord:interaction-001',
  });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.event.id, first.event.id);

  assert.equal(store.claimPublish(first.event.id, 'owner-1').status, 'publishing');
  assert.equal(store.claimPublish(first.event.id, 'owner-2'), null);
  const published = store.finalizePublish(first.event.id, 'owner-1', {
    channelId: 'channel-1',
    messageId: 'message-1',
  });
  assert.equal(published.status, 'published');
  assert.deepEqual(published.publication, { channelId: 'channel-1', messageId: 'message-1' });
});

test('an expired draft cannot be claimed for publication', () => {
  const event = create({ startAt: futureIso(5 * 60 * 1000) });
  const afterStart = Date.parse(event.startAt) + 1;

  assert.equal(store.claimPublish(event.id, 'owner-1', afterStart), null);
  assert.equal(store.getEvent(event.id).status, 'draft');
});

test('event source URL accepts only credential-free HTTP(S)', () => {
  const event = create({ sourceUrl: 'https://example.com/events/alpha' });
  assert.equal(event.sourceUrl, 'https://example.com/events/alpha');
  assert.throws(() => create({ sourceUrl: 'file:///C:/secret.txt' }), /HTTP atau HTTPS/);
  assert.throws(() => create({ sourceUrl: 'https://user:pass@example.com/event' }), /credential/);
});

test('draft edit is validated, revision-safe, and disabled after publication starts', () => {
  const now = Date.now();
  const event = create({ startAt: new Date(now + (3 * 60 * 60 * 1000)).toISOString() });
  assert.equal(event.revision, 0);

  const first = store.updateDraft(event.id, {
    title: 'Community Night Revised',
    description: 'Agenda yang sudah diperbarui.',
    startAt: new Date(now + (4 * 60 * 60 * 1000)).toISOString(),
    location: '',
  }, 'editor-1', 0, now);
  assert.equal(first.ok, true);
  assert.equal(first.event.revision, 1);
  assert.equal(first.event.title, 'Community Night Revised');
  assert.equal(first.event.location, null);
  assert.equal(first.event.messageSyncPending, true);

  const stale = store.updateDraft(event.id, { title: 'Stale overwrite' }, 'editor-2', 0, now);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale');
  assert.equal(store.getEvent(event.id).title, 'Community Night Revised');

  assert.throws(
    () => store.updateDraft(event.id, { capacity: 1 }, 'editor-1', 1, now),
    /2-500/,
  );
  assert.throws(
    () => store.updateDraft(event.id, { sourceUrl: 'https://user:pass@example.com/event' }, 'editor-1', 1, now),
    /credential/,
  );
  assert.throws(
    () => store.updateDraft(event.id, { startAt: new Date(now - 1).toISOString() }, 'editor-1', 1, now),
    /masa depan/,
  );
  assert.equal(store.getEvent(event.id).revision, 1);

  const claimed = store.claimPublish(event.id, 'owner-1', now);
  assert.equal(claimed.status, 'publishing');
  const blocked = store.updateDraft(event.id, { title: 'Too late' }, 'editor-1', 1, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'status');
});

test('RSVP is exclusive, capacity-safe, removable, and closed after start', () => {
  const event = create();
  store.claimPublish(event.id, 'owner-1');
  store.finalizePublish(event.id, 'owner-1', { channelId: 'channel', messageId: 'message' });

  assert.equal(store.setRsvp(event.id, 'user-1', 'yes').ok, true);
  assert.equal(store.setRsvp(event.id, 'user-2', 'yes').ok, true);
  assert.equal(store.setRsvp(event.id, 'user-3', 'yes').reason, 'full');

  const changed = store.setRsvp(event.id, 'user-1', 'maybe');
  assert.deepEqual(changed.event.rsvp.yes, ['user-2']);
  assert.deepEqual(changed.event.rsvp.maybe, ['user-1']);
  assert.equal(store.setRsvp(event.id, 'user-3', 'yes').ok, true);
  assert.equal(store.setRsvp(event.id, 'user-3', 'no').ok, true);
  assert.equal(store.getEvent(event.id).rsvp.yes.includes('user-3'), false);
  assert.equal(store.getEvent(event.id).messageSyncPending, true);
  store.markMessagesSynced(event.id);
  assert.equal(store.listUnsyncedEvents().some((item) => item.id === event.id), false);

  const closed = store.closeDueEvent(event.id, Date.parse(event.startAt) + 1);
  assert.equal(closed.status, 'closed');
  assert.equal(store.setRsvp(event.id, 'user-4', 'yes').reason, 'closed');
});

test('reminders are claimed once and recoverable before finalization', () => {
  const event = create({ startAt: futureIso(30 * 60 * 1000) });
  store.claimPublish(event.id, 'owner-1');
  store.finalizePublish(event.id, 'owner-1', { channelId: 'channel', messageId: 'message' });

  const due = store.listDueReminders();
  assert.ok(due.some((item) => item.event.id === event.id && item.kind === 'hour'));
  assert.equal(store.claimReminder(event.id, 'hour').reminders.hour.status, 'sending');
  assert.equal(store.claimReminder(event.id, 'hour'), null);
  assert.equal(store.cancelEvent(event.id, 'owner-1'), null);
  assert.equal(store.releaseReminder(event.id, 'hour').reminders.hour, null);
  store.claimReminder(event.id, 'hour');
  const sent = store.finalizeReminder(event.id, 'hour', 'reminder-message');
  assert.equal(sent.reminders.hour.status, 'sent');
  assert.equal(store.listDueReminders().some((item) => item.event.id === event.id), false);
});

test('only draft events can be discarded and only published events cancelled', () => {
  const draft = create();
  assert.equal(store.cancelEvent(draft.id, 'owner-1'), null);
  assert.equal(store.discardDraft(draft.id, 'owner-1').status, 'discarded');
  assert.equal(store.discardDraft(draft.id, 'owner-1'), null);

  const published = create();
  store.claimPublish(published.id, 'owner-1');
  store.finalizePublish(published.id, 'owner-1', { channelId: 'channel', messageId: 'message' });
  assert.equal(store.cancelEvent(published.id, 'owner-1').status, 'cancelled');
  assert.equal(store.cancelEvent(published.id, 'owner-1'), null);
});
