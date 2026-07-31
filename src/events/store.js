const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.EVENT_DATA_DIR
  ? path.resolve(process.env.EVENT_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'events-state.json');
const MAX_FINALIZED_EVENTS = 250;
const MAX_AUDIT = 500;

function defaultState() {
  return { events: [], audit: [] };
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || !Array.isArray(parsed.events) || !Array.isArray(parsed.audit)) {
      throw new Error('events/audit bukan array');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Event state tidak dapat dibaca: ${error.message}`);
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temporary, STATE_FILE);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function appendAudit(state, eventId, action, actor, details = null) {
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    eventId: String(eventId).slice(0, 32),
    action: String(action).slice(0, 40),
    actor: String(actor || 'system').slice(0, 100),
    at: new Date().toISOString(),
  };
  if (details && typeof details === 'object') {
    entry.details = Object.fromEntries(
      Object.entries(details).slice(0, 5).map(([key, value]) => [
        String(key).slice(0, 30),
        String(value).slice(0, 100),
      ]),
    );
  }
  state.audit.unshift(entry);
  state.audit = state.audit.slice(0, MAX_AUDIT);
}

function normalizedCapacity(value) {
  if (value === null || value === undefined) return null;
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 500) {
    throw new Error('Kapasitas harus 2-500 peserta.');
  }
  return capacity;
}

function createEvent({
  title,
  description,
  startAt,
  location = null,
  capacity = null,
  createdBy,
  source = 'discord',
  externalId = null,
}) {
  const state = readState();
  const normalizedExternalId = externalId ? String(externalId).trim().slice(0, 200) : null;
  if (normalizedExternalId) {
    const existing = state.events.find((event) => event.externalId === normalizedExternalId);
    if (existing) return { event: existing, created: false };
  }

  const normalizedTitle = String(title || '').trim().slice(0, 200);
  const normalizedDescription = String(description || '').trim().slice(0, 3500);
  const startMs = Date.parse(startAt);
  if (!normalizedTitle) throw new Error('Judul event tidak boleh kosong.');
  if (!normalizedDescription) throw new Error('Deskripsi event tidak boleh kosong.');
  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    throw new Error('Waktu event harus berada di masa depan.');
  }

  const event = {
    id: crypto.randomBytes(8).toString('hex'),
    title: normalizedTitle,
    description: normalizedDescription,
    startAt: new Date(startMs).toISOString(),
    location: location ? String(location).trim().slice(0, 500) : null,
    capacity: normalizedCapacity(capacity),
    source: source === 'canox' ? 'canox' : 'discord',
    createdBy: String(createdBy || 'unknown').slice(0, 100),
    externalId: normalizedExternalId,
    status: 'draft',
    createdAt: new Date().toISOString(),
    actionStartedAt: null,
    actionBy: null,
    panel: null,
    publication: null,
    rsvp: { yes: [], maybe: [] },
    reminders: { day: null, hour: null },
    messageSyncPending: false,
    finalizedAt: null,
    finalizedBy: null,
  };
  state.events.unshift(event);
  let finalizedKept = 0;
  state.events = state.events.filter((item) => {
    if (['draft', 'publishing', 'published'].includes(item.status)) return true;
    finalizedKept += 1;
    return finalizedKept <= MAX_FINALIZED_EVENTS;
  });
  appendAudit(state, event.id, 'event_created', event.createdBy);
  writeState(state);
  return { event, created: true };
}

function getEvent(id) {
  return readState().events.find((event) => event.id === id) || null;
}

function setPanel(id, panel) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event) return null;
  event.panel = { channelId: String(panel.channelId), messageId: String(panel.messageId) };
  event.messageSyncPending = false;
  writeState(state);
  return event;
}

function removeEvent(id) {
  const state = readState();
  const index = state.events.findIndex((event) => event.id === id);
  if (index < 0) return false;
  state.events.splice(index, 1);
  state.audit = state.audit.filter((entry) => entry.eventId !== id);
  writeState(state);
  return true;
}

function claimPublish(id, actor, nowMs = Date.now()) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (
    !event
    || event.status !== 'draft'
    || Date.parse(event.startAt) <= nowMs
  ) return null;
  event.status = 'publishing';
  event.messageSyncPending = true;
  event.actionStartedAt = new Date().toISOString();
  event.actionBy = String(actor);
  writeState(state);
  return event;
}

function releasePublish(id) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'publishing') return null;
  event.status = 'draft';
  event.messageSyncPending = true;
  event.actionStartedAt = null;
  event.actionBy = null;
  writeState(state);
  return event;
}

function finalizePublish(id, actor, publication) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'publishing') return null;
  event.status = 'published';
  event.messageSyncPending = true;
  event.publication = {
    channelId: String(publication.channelId),
    messageId: String(publication.messageId),
  };
  event.actionStartedAt = null;
  event.actionBy = null;
  event.finalizedAt = new Date().toISOString();
  event.finalizedBy = String(actor);
  appendAudit(state, event.id, 'event_published', actor);
  writeState(state);
  return event;
}

function discardDraft(id, actor) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'draft') return null;
  event.status = 'discarded';
  event.messageSyncPending = true;
  event.finalizedAt = new Date().toISOString();
  event.finalizedBy = String(actor);
  appendAudit(state, event.id, 'event_discarded', actor);
  writeState(state);
  return event;
}

function setRsvp(id, userId, response, nowMs = Date.now()) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'published' || Date.parse(event.startAt) <= nowMs) {
    return { ok: false, reason: 'closed', event: event || null };
  }
  const user = String(userId);
  const wasYes = event.rsvp.yes.includes(user);
  if (response === 'yes' && !wasYes && event.capacity && event.rsvp.yes.length >= event.capacity) {
    return { ok: false, reason: 'full', event };
  }
  event.rsvp.yes = event.rsvp.yes.filter((idValue) => idValue !== user);
  event.rsvp.maybe = event.rsvp.maybe.filter((idValue) => idValue !== user);
  if (response === 'yes') event.rsvp.yes.push(user);
  else if (response === 'maybe') event.rsvp.maybe.push(user);
  else if (response !== 'no') throw new Error('Respons RSVP tidak valid.');
  event.messageSyncPending = true;
  appendAudit(state, event.id, `rsvp_${response}`, user);
  writeState(state);
  return { ok: true, response, event };
}

function cancelEvent(id, actor) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (
    !event
    || event.status !== 'published'
    || ['day', 'hour'].some((kind) => event.reminders?.[kind]?.status === 'sending')
  ) return null;
  event.status = 'cancelled';
  event.messageSyncPending = true;
  event.finalizedAt = new Date().toISOString();
  event.finalizedBy = String(actor);
  appendAudit(state, event.id, 'event_cancelled', actor);
  writeState(state);
  return event;
}

function closeDueEvent(id, nowMs = Date.now()) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'published' || Date.parse(event.startAt) > nowMs) return null;
  event.status = 'closed';
  event.messageSyncPending = true;
  event.finalizedAt = new Date(nowMs).toISOString();
  event.finalizedBy = 'scheduler';
  appendAudit(state, event.id, 'event_closed', 'scheduler');
  writeState(state);
  return event;
}

function listDueClosures(nowMs = Date.now()) {
  return readState().events.filter((event) => (
    event.status === 'published' && Date.parse(event.startAt) <= nowMs
  ));
}

function listDueReminders(nowMs = Date.now()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const due = [];
  for (const event of readState().events) {
    if (event.status !== 'published') continue;
    const remaining = Date.parse(event.startAt) - nowMs;
    if (remaining <= 0) continue;
    if (remaining <= hourMs) {
      if (!event.reminders.hour) due.push({ event, kind: 'hour' });
    } else if (remaining <= dayMs && !event.reminders.day) {
      due.push({ event, kind: 'day' });
    }
  }
  return due;
}

function claimReminder(id, kind) {
  if (!['day', 'hour'].includes(kind)) return null;
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.status !== 'published' || event.reminders[kind]) return null;
  event.reminders[kind] = { status: 'sending', startedAt: new Date().toISOString() };
  writeState(state);
  return event;
}

function finalizeReminder(id, kind, messageId) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.reminders?.[kind]?.status !== 'sending') return null;
  event.reminders[kind] = {
    status: 'sent',
    sentAt: new Date().toISOString(),
    messageId: String(messageId),
  };
  appendAudit(state, event.id, `reminder_${kind}`, 'scheduler');
  writeState(state);
  return event;
}

function releaseReminder(id, kind) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event || event.reminders?.[kind]?.status !== 'sending') return null;
  event.reminders[kind] = null;
  writeState(state);
  return event;
}

function listSendingReminders() {
  const items = [];
  for (const event of readState().events) {
    for (const kind of ['day', 'hour']) {
      if (event.reminders?.[kind]?.status === 'sending') items.push({ event, kind });
    }
  }
  return items;
}

function listPublishingEvents() {
  return readState().events.filter((event) => event.status === 'publishing');
}

function listActiveEvents() {
  return readState().events.filter((event) => ['draft', 'publishing', 'published'].includes(event.status));
}

function listEvents() {
  return readState().events;
}

function markMessagesSynced(id) {
  const state = readState();
  const event = state.events.find((item) => item.id === id);
  if (!event) return null;
  event.messageSyncPending = false;
  writeState(state);
  return event;
}

function listUnsyncedEvents() {
  return readState().events.filter((event) => event.messageSyncPending);
}

function getStatus() {
  const events = readState().events;
  return {
    draft: events.filter((event) => event.status === 'draft').length,
    publishing: events.filter((event) => event.status === 'publishing').length,
    published: events.filter((event) => event.status === 'published').length,
    closed: events.filter((event) => event.status === 'closed').length,
    cancelled: events.filter((event) => event.status === 'cancelled').length,
    discarded: events.filter((event) => event.status === 'discarded').length,
    upcoming: events
      .filter((event) => event.status === 'published')
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .slice(0, 10),
  };
}

module.exports = {
  createEvent,
  getEvent,
  setPanel,
  removeEvent,
  claimPublish,
  releasePublish,
  finalizePublish,
  discardDraft,
  setRsvp,
  cancelEvent,
  closeDueEvent,
  listDueClosures,
  listDueReminders,
  claimReminder,
  finalizeReminder,
  releaseReminder,
  listSendingReminders,
  listPublishingEvents,
  listActiveEvents,
  listEvents,
  markMessagesSynced,
  listUnsyncedEvents,
  getStatus,
};
