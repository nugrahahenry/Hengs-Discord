'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.PERSONAL_DATA_DIR
  ? path.resolve(process.env.PERSONAL_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'personal-memory-state.json');
const MAX_NOTES = 100;
const MAX_REMINDERS = 100;
const MAX_NOTE_LENGTH = 500;
const MAX_REMINDER_LENGTH = 300;
const SENDING_TTL_MS = 10 * 60 * 1000;

function defaultState() {
  return { version: 1, nextNote: 1, nextReminder: 1, notes: [], reminders: [] };
}

function validScope(value) {
  return /^\d{1,30}$/.test(String(value || ''));
}

function normalizeText(value, maximum) {
  const text = String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim();
  return text;
}

function scopeKey(guildId, userId) {
  if (!validScope(guildId) || !validScope(userId)) throw new Error('PERSONAL_SCOPE_INVALID');
  return `${guildId}:${userId}`;
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.notes) || !Array.isArray(parsed.reminders)) {
    throw new Error('PERSONAL_STATE_INVALID');
  }
  return {
    version: 1,
    nextNote: Number.isInteger(parsed.nextNote) && parsed.nextNote > 0 ? parsed.nextNote : 1,
    nextReminder: Number.isInteger(parsed.nextReminder) && parsed.nextReminder > 0 ? parsed.nextReminder : 1,
    notes: parsed.notes,
    reminders: parsed.reminders,
  };
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

function createId(prefix, counter) {
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

function noteForScope(note, guildId, userId) {
  return note.scopeKey === scopeKey(guildId, userId);
}

function reminderForScope(reminder, guildId, userId) {
  return reminder.scopeKey === scopeKey(guildId, userId);
}

function addNote({ guildId, userId, text, nowMs = Date.now() } = {}) {
  const normalized = normalizeText(text, MAX_NOTE_LENGTH);
  if (!normalized) return { ok: false, code: 'EMPTY' };
  if (normalized.length > MAX_NOTE_LENGTH) return { ok: false, code: 'TOO_LONG' };
  const state = readState();
  const item = {
    id: createId('note', state.nextNote++),
    scopeKey: scopeKey(guildId, userId),
    text: normalized.slice(0, MAX_NOTE_LENGTH),
    createdAt: new Date(nowMs).toISOString(),
  };
  state.notes.unshift(item);
  state.notes = state.notes.slice(0, MAX_NOTES);
  writeState(state);
  return { ok: true, item: { ...item } };
}

function listNotes({ guildId, userId } = {}) {
  return readState().notes
    .filter(note => noteForScope(note, guildId, userId))
    .slice(0, 20)
    .map(note => ({ ...note }));
}

function removeNote({ guildId, userId, id } = {}) {
  const state = readState();
  const index = state.notes.findIndex(note => note.id === id && noteForScope(note, guildId, userId));
  if (index < 0) return { ok: false, code: 'NOT_FOUND' };
  state.notes.splice(index, 1);
  writeState(state);
  return { ok: true };
}

function addReminder({ guildId, userId, text, dueAt, nowMs = Date.now() } = {}) {
  const normalized = normalizeText(text, MAX_REMINDER_LENGTH);
  const dueMs = Date.parse(dueAt);
  if (!normalized) return { ok: false, code: 'EMPTY' };
  if (normalized.length > MAX_REMINDER_LENGTH) return { ok: false, code: 'TOO_LONG' };
  if (!Number.isFinite(dueMs) || dueMs <= nowMs) return { ok: false, code: 'TIME_INVALID' };
  const state = readState();
  const item = {
    id: createId('reminder', state.nextReminder++),
    scopeKey: scopeKey(guildId, userId),
    guildId: String(guildId),
    userId: String(userId),
    text: normalized.slice(0, MAX_REMINDER_LENGTH),
    dueAt: new Date(dueMs).toISOString(),
    status: 'active',
    attempts: 0,
    createdAt: new Date(nowMs).toISOString(),
    sendingAt: null,
  };
  state.reminders.unshift(item);
  state.reminders = state.reminders
    .filter(reminder => reminder.status === 'active' || Date.parse(reminder.createdAt) >= nowMs - 30 * 24 * 60 * 60 * 1000)
    .slice(0, MAX_REMINDERS);
  writeState(state);
  return { ok: true, item: { ...item } };
}

function listReminders({ guildId, userId } = {}) {
  return readState().reminders
    .filter(reminder => reminderForScope(reminder, guildId, userId) && reminder.status === 'active')
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 20)
    .map(reminder => ({ ...reminder }));
}

function removeReminder({ guildId, userId, id } = {}) {
  const state = readState();
  const index = state.reminders.findIndex(reminder => (
    reminder.id === id && reminderForScope(reminder, guildId, userId) && reminder.status === 'active'
  ));
  if (index < 0) return { ok: false, code: 'NOT_FOUND' };
  state.reminders.splice(index, 1);
  writeState(state);
  return { ok: true };
}

function recoverStaleSending(nowMs = Date.now()) {
  const state = readState();
  let changed = false;
  for (const reminder of state.reminders) {
    if (reminder.status === 'sending' && Date.parse(reminder.sendingAt) <= nowMs - SENDING_TTL_MS) {
      reminder.status = 'active';
      reminder.sendingAt = null;
      changed = true;
    }
  }
  if (changed) writeState(state);
  return changed;
}

function claimDue(nowMs = Date.now()) {
  const state = readState();
  const due = state.reminders.find(reminder => (
    reminder.status === 'active'
    && Number.isFinite(Date.parse(reminder.dueAt))
    && Date.parse(reminder.dueAt) <= nowMs
  ));
  if (!due) return null;
  due.status = 'sending';
  due.sendingAt = new Date(nowMs).toISOString();
  due.attempts = (Number(due.attempts) || 0) + 1;
  writeState(state);
  return { ...due };
}

function completeReminder(id) {
  const state = readState();
  const reminder = state.reminders.find(item => item.id === id && item.status === 'sending');
  if (!reminder) return false;
  reminder.status = 'sent';
  reminder.sendingAt = null;
  writeState(state);
  return true;
}

function releaseReminder(id, nowMs = Date.now()) {
  const state = readState();
  const reminder = state.reminders.find(item => item.id === id && item.status === 'sending');
  if (!reminder) return false;
  if ((Number(reminder.attempts) || 0) >= 3) {
    reminder.status = 'failed';
  } else {
    reminder.status = 'active';
    reminder.dueAt = new Date(nowMs + 60_000).toISOString();
  }
  reminder.sendingAt = null;
  writeState(state);
  return true;
}

function getStatus({ guildId, userId } = {}) {
  const key = scopeKey(guildId, userId);
  const state = readState();
  return {
    notes: state.notes.filter(note => note.scopeKey === key).length,
    reminders: state.reminders.filter(reminder => reminder.scopeKey === key && reminder.status === 'active').length,
  };
}

module.exports = {
  DATA_DIR,
  STATE_FILE,
  MAX_NOTES,
  MAX_REMINDERS,
  MAX_NOTE_LENGTH,
  MAX_REMINDER_LENGTH,
  addNote,
  addReminder,
  claimDue,
  completeReminder,
  defaultState,
  getStatus,
  listNotes,
  listReminders,
  normalizeText,
  readState,
  recoverStaleSending,
  releaseReminder,
  removeNote,
  removeReminder,
  scopeKey,
};
