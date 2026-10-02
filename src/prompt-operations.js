'use strict';

// Adapter prompt-first untuk Ops Hub dan Event Hub.
// Modul ini hanya mem-parsing input bounded. Penyimpanan, scheduler, dan
// approval tetap dimiliki hub yang sudah ada.

const MAX_PROMPT_LENGTH = 1800;
const MAX_TITLE_LENGTH = 200;
const MAX_BRIEF_LENGTH = 1500;

const OPERATION_SIGNAL = /\b(?:buat|buatkan|bikin|siapkan|susun|atur|jadwalkan|adakan|ingatkan|umumkan|sampaikan|beritahu|post)\b/i;
const ANNOUNCEMENT_SIGNAL = /\b(?:umumkan|pengumuman|sampaikan|beritahu|post|update|proyek|project|maintenance|info)\b/i;
const EVENT_SIGNAL = /\b(?:event|acara|jadwal|reminder|pengingat|ingatkan|meeting|rapat|mabar|turnamen|tournament|scrim)\b/i;
const OPERATION_STATUS_SIGNAL = /\b(?:lihat|cek|tampilkan|status|ada)\b.*\b(?:draft|pengumuman|event|reminder|pengingat|operasi|ops)\b/i;
const TIME_SIGNAL = /\b(?:jam|pukul|at)\s*\d{1,2}(?:[:.]\d{2})\b|\b\d{4}-\d{2}-\d{2}[ T]\d{1,2}[:.]\d{2}\b/i;
const RELATIVE_TIME_SIGNAL = /\b(?:besok|lusa|nanti|minggu depan)\b/i;

function normalizePrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTimeSeparators(value) {
  return String(value || '').replace(/(\d{1,2})\.(\d{2})\b/g, '$1:$2');
}

function titleCase(value) {
  return normalizePrompt(value)
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, '')
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

function extractScheduleInput(prompt) {
  const normalized = normalizeTimeSeparators(prompt);
  const full = normalized.match(/\b(\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2})\b/);
  if (full) return full[1];
  const timeOnly = normalized.match(/\b(?:jam|pukul|at)\s*(\d{1,2}:\d{2})\b/i);
  return timeOnly ? timeOnly[1] : null;
}

function stripOperationLead(value) {
  return normalizePrompt(value)
    .replace(/^(?:tolong\s+)?(?:buat(?:kan)?|bikin|siapkan|susun|atur|jadwalkan|adakan|ingatkan|buatkan\s+pengingat)\s+/i, '')
    .replace(/^(?:sebuah\s+|satu\s+)?(?:pengumuman|announcement|event|acara|reminder|pengingat|jadwal|update)\s*/i, '')
    .replace(/^(?:untuk\s+|di\s+)?(?:server|komunitas)\s+/i, '')
    .trim();
}

function stripSchedule(value) {
  return normalizePrompt(value)
    .replace(/\b(?:jam|pukul|at)\s*\d{1,2}(?::\d{2})?\b/ig, '')
    .replace(/\b\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}\b/ig, '')
    .replace(/\b(?:besok|lusa|nanti|minggu depan)\b/ig, '')
    .replace(/\s+/g, ' ')
    .replace(/[,.!?;:]+$/g, '')
    .trim();
}

function extractLocation(value) {
  const match = normalizePrompt(value).match(/\b(?:di|via|lewat)\s+(.+)$/i);
  if (!match) return null;
  const location = match[1].replace(/\b(?:maksimal|kapasitas)\s+\d+\b.*$/i, '').trim();
  return location ? location.slice(0, 500) : null;
}

function extractCapacity(value) {
  const match = normalizePrompt(value).match(/\b(?:maksimal|kapasitas|max)\s+(\d{1,3})\b/i);
  if (!match) return null;
  const capacity = Number(match[1]);
  return Number.isInteger(capacity) && capacity >= 2 && capacity <= 500 ? capacity : null;
}

function buildOperationQuestions(kind = 'operation') {
  if (kind === 'event') {
    return [
      '🗓️ **Aku bisa siapkan draft event atau reminder.**',
      '',
      'Sebutkan judul singkat dan waktu WIB yang jelas, misalnya `Buat event mabar jam 20:00`.',
      'Gunakan `HH:mm` untuk jadwal berikutnya, atau `YYYY-MM-DD HH:mm` untuk tanggal tertentu.',
      'Draft masuk ke `bot-settings` dan belum dipublikasikan atau dijadwalkan.',
    ].join('\n');
  }
  return [
    '📋 **Aku bisa siapkan draft pengumuman atau update proyek.**',
    '',
    'Tulis inti pesannya, misalnya `Buat pengumuman maintenance server malam ini`.',
    'Draft masuk ke `bot-settings`. Hengs tidak akan publish tanpa review dan keputusan owner.',
  ].join('\n');
}

function parseAnnouncement(prompt) {
  if (!ANNOUNCEMENT_SIGNAL.test(prompt)) return null;
  const brief = stripOperationLead(prompt).slice(0, MAX_BRIEF_LENGTH).trim();
  if (!brief || brief.length < 4) return { kind: 'operation_questions', operation: 'announcement' };
  return {
    kind: 'ops_draft',
    operation: 'announcement',
    brief,
    titleOverride: null,
  };
}

function parseEvent(prompt) {
  if (!EVENT_SIGNAL.test(prompt)) return null;
  const scheduleInput = extractScheduleInput(prompt);
  const withoutSchedule = stripSchedule(stripOperationLead(prompt));
  const location = extractLocation(withoutSchedule);
  const titleSource = location
    ? withoutSchedule.replace(/\b(?:di|via|lewat)\s+(.+)$/i, '').trim()
    : withoutSchedule;
  const title = titleCase(titleSource || 'Event Hengs');
  if (!scheduleInput || RELATIVE_TIME_SIGNAL.test(prompt)) {
    return { kind: 'operation_questions', operation: 'event' };
  }
  if (!title || title.length < 2) return { kind: 'operation_questions', operation: 'event' };
  return {
    kind: 'event_draft',
    operation: 'event',
    title,
    description: `Pengingat untuk ${title}.`,
    scheduleInput,
    location,
    capacity: extractCapacity(prompt),
  };
}

function parseOperationPrompt(value) {
  const prompt = normalizePrompt(value);
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return null;
  if (OPERATION_STATUS_SIGNAL.test(prompt)) {
    return { kind: 'operation_status', operation: 'status' };
  }
  if (!OPERATION_SIGNAL.test(prompt)) return null;
  const event = parseEvent(prompt);
  if (event) return event;
  const announcement = parseAnnouncement(prompt);
  if (announcement) return announcement;
  return null;
}

function operationReply(route) {
  if (!route) return null;
  if (route.kind === 'operation_questions') return buildOperationQuestions(route.operation);
  return null;
}

function formatOperationStatus({ opsHub, eventHub } = {}) {
  const ops = opsHub?.getStatus?.() || {};
  const events = eventHub?.getStatus?.() || {};
  const upcomingCount = Array.isArray(events.upcoming) ? events.upcoming.length : 0;
  return [
    '📊 Status operasi Hengs',
    `Ops Hub: ${Number(ops.pending) || 0} draft menunggu, ${Number(ops.scheduled) || 0} terjadwal, ${Number(ops.published) || 0} sudah publish.`,
    `Event Hub: ${Number(events.draft) || 0} draft, ${upcomingCount} event aktif, ${Number(events.closed) || 0} selesai.`,
    'Detail isi draft tetap berada di ruang review privat.',
  ].join('\n');
}

module.exports = {
  MAX_PROMPT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_BRIEF_LENGTH,
  normalizePrompt,
  extractScheduleInput,
  parseOperationPrompt,
  buildOperationQuestions,
  operationReply,
  formatOperationStatus,
};
