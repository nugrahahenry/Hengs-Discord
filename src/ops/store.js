const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.OPS_DATA_DIR
  ? path.resolve(process.env.OPS_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'ops-state.json');
const MAX_DRAFTS = 250;
const MAX_HISTORY = 100;
const MAX_REVISIONS_PER_DRAFT = 20;

function defaultState() {
  return { drafts: [], history: [] };
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('root state bukan object');
    if (!Array.isArray(parsed.drafts) || !Array.isArray(parsed.history)) {
      throw new Error('drafts/history bukan array');
    }
    return { drafts: parsed.drafts, history: parsed.history };
  } catch (error) {
    throw new Error(`Ops state tidak dapat dibaca: ${error.message}`);
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temp, STATE_FILE);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

function createDraft({ title, body, brief = null, source = 'discord', createdBy = null, externalId = null }) {
  const state = readState();
  const normalizedExternalId = externalId ? String(externalId).trim().slice(0, 200) : null;
  if (normalizedExternalId) {
    const existing = state.drafts.find(draft => draft.externalId === normalizedExternalId);
    if (existing) return { draft: existing, created: false };
  }

  const normalizedBody = String(body || '').trim().slice(0, 4000);
  if (!normalizedBody) throw new Error('Isi draft tidak boleh kosong.');

  const draft = {
    id: crypto.randomBytes(8).toString('hex'),
    // Sisakan ruang untuk prefix emoji/label pada Discord embed (maks. 256 karakter).
    title: String(title || 'Pengumuman').trim().slice(0, 230) || 'Pengumuman',
    body: normalizedBody,
    brief: brief ? String(brief).trim().slice(0, 1500) : null,
    source: source === 'canox' ? 'canox' : 'discord',
    createdBy: createdBy ? String(createdBy).slice(0, 100) : null,
    externalId: normalizedExternalId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    panel: null,
    actionStartedAt: null,
    actionBy: null,
    finalizedAt: null,
    finalizedBy: null,
    publication: null,
    revisions: [],
  };
  state.drafts.unshift(draft);
  // Jangan pernah membuang draft aktif hanya demi batas arsip. Yang dipangkas hanya
  // draft finalized lama; pending/publishing selalu dipertahankan.
  let finalizedKept = 0;
  state.drafts = state.drafts.filter(item => {
    if (['pending', 'revising', 'publishing'].includes(item.status)) return true;
    finalizedKept += 1;
    return finalizedKept <= MAX_DRAFTS;
  });
  writeState(state);
  return { draft, created: true };
}

function getDraft(id) {
  return readState().drafts.find(draft => draft.id === id) || null;
}

function listDraftsByStatus(status) {
  return readState().drafts.filter(draft => draft.status === status);
}

function setPanel(id, panel) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft) return null;
  draft.panel = {
    channelId: String(panel.channelId),
    messageId: String(panel.messageId),
  };
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

// Sinkron dan atomik pada satu proses Node: hanya klik pertama yang dapat mengubah
// pending -> publishing sebelum operasi network dimulai.
function claimPublish(id, userId) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'pending') return null;
  draft.status = 'publishing';
  draft.actionStartedAt = new Date().toISOString();
  draft.actionBy = String(userId);
  writeState(state);
  return draft;
}

function releasePublish(id) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'publishing') return null;
  draft.status = 'pending';
  draft.actionStartedAt = null;
  draft.actionBy = null;
  writeState(state);
  return draft;
}

function revisionEntry(draft, kind, userId) {
  return {
    title: draft.title,
    body: draft.body,
    kind: String(kind || 'edit').slice(0, 30),
    at: new Date().toISOString(),
    by: String(userId).slice(0, 100),
  };
}

function pushRevision(draft, kind, userId) {
  if (!Array.isArray(draft.revisions)) draft.revisions = [];
  draft.revisions.unshift(revisionEntry(draft, kind, userId));
  draft.revisions = draft.revisions.slice(0, MAX_REVISIONS_PER_DRAFT);
}

function normalizeRevisionInput({ title, body }) {
  const normalizedBody = String(body || '').trim().slice(0, 4000);
  if (!normalizedBody) throw new Error('Isi draft tidak boleh kosong.');
  return {
    title: String(title || 'Pengumuman').trim().slice(0, 230) || 'Pengumuman',
    body: normalizedBody,
  };
}

// Edit manual tidak membutuhkan await. Update sinkron ini hanya berhasil selama
// draft masih pending, sehingga submit modal lama tidak dapat menimpa draft final.
function updatePendingDraft(id, input, userId, kind = 'edit') {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'pending') return null;
  const normalized = normalizeRevisionInput(input);
  pushRevision(draft, kind, userId);
  draft.title = normalized.title;
  draft.body = normalized.body;
  draft.lastRevisedAt = new Date().toISOString();
  draft.lastRevisedBy = String(userId).slice(0, 100);
  draft.lastRevisionKind = String(kind).slice(0, 30);
  writeState(state);
  return draft;
}

// AI revision membutuhkan network call. Claim sinkron mencegah Publish, Discard,
// atau revision kedua berjalan saat model masih menyusun versi baru.
function claimRevision(id, userId, kind) {
  if (!['shorten', 'regenerate'].includes(kind)) {
    throw new Error(`Jenis revisi Ops Hub tidak valid: ${kind}`);
  }
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'pending') return null;
  draft.status = 'revising';
  draft.actionStartedAt = new Date().toISOString();
  draft.actionBy = String(userId);
  draft.revisionKind = kind;
  writeState(state);
  return draft;
}

function applyRevision(id, input, userId) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'revising') return null;
  const normalized = normalizeRevisionInput(input);
  const kind = draft.revisionKind || 'regenerate';
  pushRevision(draft, kind, userId);
  draft.title = normalized.title;
  draft.body = normalized.body;
  draft.status = 'pending';
  draft.lastRevisedAt = new Date().toISOString();
  draft.lastRevisedBy = String(userId).slice(0, 100);
  draft.lastRevisionKind = kind;
  draft.actionStartedAt = null;
  draft.actionBy = null;
  draft.revisionKind = null;
  writeState(state);
  return draft;
}

function releaseRevision(id) {
  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  if (!draft || draft.status !== 'revising') return null;
  draft.status = 'pending';
  draft.actionStartedAt = null;
  draft.actionBy = null;
  draft.revisionKind = null;
  writeState(state);
  return draft;
}

function recoverRevisingDrafts() {
  const state = readState();
  const revising = state.drafts.filter(draft => draft.status === 'revising');
  if (!revising.length) return [];
  for (const draft of revising) {
    draft.status = 'pending';
    draft.actionStartedAt = null;
    draft.actionBy = null;
    draft.revisionKind = null;
  }
  writeState(state);
  return revising.map(draft => draft.id);
}

function finalizeDraft(id, status, userId, publication = null) {
  if (!['published', 'discarded'].includes(status)) {
    throw new Error(`Status final Ops Hub tidak valid: ${status}`);
  }

  const state = readState();
  const draft = state.drafts.find(item => item.id === id);
  const expectedStatus = status === 'published' ? 'publishing' : 'pending';
  if (!draft || draft.status !== expectedStatus) return null;

  draft.status = status;
  draft.finalizedAt = new Date().toISOString();
  draft.finalizedBy = String(userId);
  draft.publication = publication ? {
    channelId: String(publication.channelId),
    messageId: String(publication.messageId),
  } : null;
  state.history.unshift({
    id: draft.id,
    title: draft.title,
    source: draft.source,
    status,
    at: draft.finalizedAt,
    by: draft.finalizedBy,
    publication: draft.publication,
  });
  state.history = state.history.slice(0, MAX_HISTORY);
  writeState(state);
  return draft;
}

function getStatus() {
  const state = readState();
  return {
    pending: state.drafts.filter(draft => draft.status === 'pending').length,
    revising: state.drafts.filter(draft => draft.status === 'revising').length,
    publishing: state.drafts.filter(draft => draft.status === 'publishing').length,
    published: state.history.filter(item => item.status === 'published').length,
    discarded: state.history.filter(item => item.status === 'discarded').length,
    latest: state.drafts[0] || null,
  };
}

module.exports = {
  createDraft,
  getDraft,
  listDraftsByStatus,
  setPanel,
  removeDraft,
  claimPublish,
  releasePublish,
  updatePendingDraft,
  claimRevision,
  applyRevision,
  releaseRevision,
  recoverRevisingDrafts,
  finalizeDraft,
  getStatus,
};
