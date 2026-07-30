const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'ops-state.json');

function defaultState() {
  return { drafts: [], history: [] };
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STATE_FILE);
}

function createDraft({ title, body, brief = null, source = 'discord', createdBy = null, externalId = null }) {
  const state = readState();
  if (externalId) {
    const existing = state.drafts.find(draft => draft.externalId === externalId);
    if (existing) return { draft: existing, created: false };
  }

  const draft = {
    id: crypto.randomBytes(6).toString('hex'),
    title: String(title || 'Pengumuman').trim().slice(0, 256),
    body: String(body || '').trim().slice(0, 4000),
    brief: brief ? String(brief).slice(0, 1500) : null,
    source,
    createdBy,
    externalId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    panel: null,
    finalizedAt: null,
    finalizedBy: null,
  };
  state.drafts.unshift(draft);
  writeState(state);
  return { draft, created: true };
}

function getDraft(id) {
  return readState().drafts.find(draft => draft.id === id) || null;
}

function setPanel(id, panel) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft) return null;
  draft.panel = panel;
  writeState(state);
  return draft;
}

function removeDraft(id) {
  const state = readState();
  const index = state.drafts.findIndex(item => item.id === id);
  if (index < 0) return false;
  state.drafts.splice(index, 1);
  writeState(state);
  return true;
}

function finalizeDraft(id, status, userId) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'pending') return null;
  draft.status = status;
  draft.finalizedAt = new Date().toISOString();
  draft.finalizedBy = userId;
  state.history.unshift({
    id: draft.id,
    title: draft.title,
    source: draft.source,
    status,
    at: draft.finalizedAt,
    by: userId,
  });
  state.history = state.history.slice(0, 100);
  writeState(state);
  return draft;
}

function getStatus() {
  const state = readState();
  return {
    pending: state.drafts.filter(draft => draft.status === 'pending').length,
    published: state.history.filter(item => item.status === 'published').length,
    discarded: state.history.filter(item => item.status === 'discarded').length,
    latest: state.drafts[0] || null,
  };
}

module.exports = { createDraft, getDraft, setPanel, removeDraft, finalizeDraft, getStatus };
