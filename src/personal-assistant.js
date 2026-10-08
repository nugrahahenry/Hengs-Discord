'use strict';

const { parseScheduleInput } = require('./ops/time');
const defaultStore = require('./personal-memory-store');

const MAX_PROMPT_LENGTH = 1800;
const PENDING_TTL_MS = 5 * 60 * 1000;
const FOLLOW_UP_PATTERN = /^(?:ada lagi|lanjut|apa lagi|yang lain)\??$/i;
const CANCEL_PATTERN = /^(?:batal|cancel|gajadi|nggak jadi|gak jadi|abaikan)\.?$/i;
const NOTE_CONFIRM_PATTERN = /^(?:oke|ok|iya|ya|simpan|simpan saja|oke catat|oke,? aku catat(?: seperti itu)?|catat seperti itu|simpan seperti itu)\.?$/i;
const NOTE_REJECT_PATTERN = /^(?:jangan\s+catat|tidak\s+usah\s+catat|nggak\s+usah\s+catat|gak\s+usah\s+catat|jangan\s+simpan)\.?$/i;
const RAW_NOTE_PATTERN = /^(?:jangan\s+catat\s+(?:seperti\s+itu|kayak\s+gitu)[,;]?\s*)?(?:khusus\s+(?:ini|kali\s+ini)\s+)?catat\s+(?:mentah(?:-mentah)?|persis(?:nya)?)[,:]?\s*(.+)$/i;
const RAW_NOTE_REQUEST_PATTERN = /^(?:jangan\s+catat\s+(?:seperti\s+itu|kayak\s+gitu)[,;]?\s*)?(?:khusus\s+(?:ini|kali\s+ini)\s+)?catat\s+(?:mentah(?:-mentah)?|persis(?:nya)?|apa\s+yang\s+aku\s+ketik)[.!?]*$/i;

function normalizePrompt(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
}

function extractRawNoteText(value) {
  const match = normalizePrompt(value).match(RAW_NOTE_PATTERN);
  return match?.[1]?.trim() || null;
}

function isRawNoteRequest(value) {
  return RAW_NOTE_REQUEST_PATTERN.test(normalizePrompt(value));
}

function normalizeClock(value) {
  const source = String(value || '').trim().toLowerCase();
  const match = source.match(/^(besok\s+)?(?:jam\s+)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*(pagi|siang|sore|malam)?$/i);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  const period = (match[4] || '').toLowerCase();
  if (period) {
    if (hour > 12) return null;
    if (period === 'malam' && hour < 12) hour += 12;
    if (period === 'pagi' && hour === 12) hour = 0;
    if ((period === 'siang' || period === 'sore') && hour < 12) hour += 12;
  }
  return `${match[1] ? 'besok ' : ''}${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findClock(text) {
  const source = String(text || '').toLowerCase();
  const match = source.match(/\b(?:besok\s+)?(?:jam\s+)?(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:\s*(?:pagi|siang|sore|malam))?\b/i);
  if (!match) return null;
  const normalized = normalizeClock(match[0]);
  return normalized ? { raw: match[0], normalized, index: match.index } : null;
}

function removeActionWords(value) {
  return String(value || '')
    .replace(/\b(?:aku|saya|gue|gw|untuk|pada|di|jam|hari\s+ini|besok)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePersonalPrompt(value) {
  const text = normalizePrompt(value);
  if (!text) return { kind: 'empty' };
  const lower = text.toLocaleLowerCase('id-ID');
  if (FOLLOW_UP_PATTERN.test(text)) return { kind: 'follow_up' };
  if (CANCEL_PATTERN.test(text)) return { kind: 'cancel_pending' };

  const action = lower.replace(/^(?:hengs[, ]+)?(?:(?:tolong|coba|bantu)\s+){0,2}/i, '')
    .replace(/^(?:(?:aku|saya|gue|gw)\s+)?(?:(?:mau|ingin|pengen)\s+)?(?=catat|simpan|tulis|ingatkan|ingetin|remind)/i, '');
  if (/^(?:lihat|list|daftar|tampilkan|apa)\b.*\b(?:catatan|notes?)\b/i.test(action)) {
    return { kind: 'note_list' };
  }
  if (/^(?:lihat|list|daftar|tampilkan|apa)\b.*\b(?:pengingat|reminder)\b/i.test(action)) {
    return { kind: 'reminder_list' };
  }
  if (/^(?:hapus|delete|buang)\b.*\bcatatan\b/i.test(action)) {
    if (!/^(?:hapus|delete|buang)\s+catatan(?:\s+note-[0-9]{4,})?[.!]?$/i.test(action)) return null;
    const id = lower.match(/\bnote-[0-9]{4,}\b/i)?.[0] || '';
    return id ? { kind: 'note_delete', id } : { kind: 'note_delete_missing' };
  }
  if (/^(?:hapus|delete|buang)\b.*\b(?:pengingat|reminder)\b/i.test(action)) {
    if (!/^(?:hapus|delete|buang)\s+(?:pengingat|reminder)(?:\s+reminder-[0-9]{4,})?[.!]?$/i.test(action)) return null;
    const id = lower.match(/\breminder-[0-9]{4,}\b/i)?.[0] || '';
    return id ? { kind: 'reminder_delete', id } : { kind: 'reminder_delete_missing' };
  }

  const rawText = extractRawNoteText(text);
  if (rawText) return { kind: 'note_add_raw', text: rawText };

  if (/^(?:ingatkan|ingetin|reminder|pengingat|remind)\b/i.test(action)) {
    if (/\b(?:event|acara|komunitas|turnamen|tournament|mabar|meeting|rapat|scrim)\b/i.test(lower)
      && !/\b(?:aku|saya|gue|gw|pribadi)\b/i.test(lower)) return null;
    const trigger = lower.match(/\b(?:ingatkan|ingetin|reminder|pengingat|remind)\b/i);
    const afterTrigger = text.slice((trigger?.index || 0) + (trigger?.[0]?.length || 0));
    const remainder = afterTrigger.trim();
    const clock = findClock(remainder);
    const before = clock ? remainder.slice(0, clock.index) : remainder;
    const after = clock ? remainder.slice(clock.index + clock.raw.length) : '';
    const reminderText = removeActionWords(`${before} ${after}`)
      .replace(/^kan\s+/i, '')
      .trim();
    if (!clock) return reminderText
      ? { kind: 'reminder_add_missing_time', text: reminderText }
      : { kind: 'reminder_add_missing_time' };
    return reminderText
      ? { kind: 'reminder_add', timeText: clock.normalized, text: reminderText }
      : { kind: 'reminder_add_missing_text', timeText: clock.normalized };
  }

  if (/^(?:catat|simpan(?:kan)?|tulis(?:kan)?)\b/i.test(action)) {
    const marker = lower.match(/\b(?:catat|simpan(?:kan)?|tulis(?:kan)?)\b/i);
    const noteText = text.slice((marker?.index || 0) + (marker?.[0]?.length || 0))
      .replace(/^catatan\s*/i, '')
      .trim();
    return noteText ? { kind: 'note_add', text: noteText } : { kind: 'note_add_missing_text' };
  }
  return null;
}

function toScheduleInput(timeText, nowMs = Date.now()) {
  const normalized = normalizeClock(timeText);
  if (!normalized) return null;
  const tomorrow = normalized.startsWith('besok ');
  const wibNow = new Date(nowMs + (7 * 60 * 60 * 1000) + (tomorrow ? 24 * 60 * 60 * 1000 : 0));
  const date = `${wibNow.getUTCFullYear()}-${String(wibNow.getUTCMonth() + 1).padStart(2, '0')}-${String(wibNow.getUTCDate()).padStart(2, '0')}`;
  return `${date} ${normalized.replace(/^besok /, '')}`;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function createPersonalAssistant({ store = defaultStore, client = null, logger = console } = {}) {
  const pending = new Map();
  let timer = null;

  function keyFor(scope) {
    return store.scopeKey(scope.guildId, scope.userId);
  }

  function clear(scope) {
    pending.delete(keyFor(scope));
  }

  function fresh(scope) {
    const value = pending.get(keyFor(scope));
    if (!value) return null;
    if (Date.now() - value.createdAt > PENDING_TTL_MS) {
      clear(scope);
      return null;
    }
    return value;
  }

  function arm(scope, kind, details = {}) {
    pending.set(keyFor(scope), { kind, ...details, createdAt: Date.now() });
  }

  function canContinue(value, scope) {
    const waiting = fresh(scope);
    if (!waiting) return false;
    const text = normalizePrompt(value);
    if (CANCEL_PATTERN.test(text) || FOLLOW_UP_PATTERN.test(text)) return true;
    const action = parsePersonalPrompt(text);
    const confirmation = waiting.kind === 'note_confirm' && (NOTE_CONFIRM_PATTERN.test(text)
      || NOTE_REJECT_PATTERN.test(text) || isRawNoteRequest(text) || extractRawNoteText(text)
      || /^(?:ganti|ubah|bukan)[,:]?\s+\S/i.test(text));
    if (confirmation) return true;
    if (action) { clear(scope); return false; }
    if (waiting.kind === 'reminder_time' && normalizeClock(text)) return true;
    if (['note_text', 'reminder_text'].includes(waiting.kind)
        && text && !/[?"“”]|^(?:apa|kenapa|kok|bagaimana|gimana|kalau|kalo|bahas|sekarang bahas)\b/i.test(text)) return true;
    clear(scope);
    return false;
  }

  function saveNote(scope, text, intent = { kind: 'note_add' }) {
    const result = store.addNote({ ...scope, text });
    if (!result.ok) return { intent, contextCode: 'FAILED', reply: result.code === 'TOO_LONG' ? 'Catatan terlalu panjang. Batasnya 500 karakter.' : 'Catatan belum tersimpan.' };
    return { intent, contextCode: 'SAVED', reply: `✅ Sudah dicatat sebagai ${result.item.id}.` };
  }

  function previewNote(scope, text) {
    arm(scope, 'note_confirm', { text });
    return {
      intent: { kind: 'note_add', text },
      contextCode: 'PENDING_CONFIRMATION',
      reply: `📝 Oke, aku akan catat seperti ini:\n"${text}"\nBalas "oke catat" untuk menyimpan, "batal" untuk membatalkan, atau "catat mentah" jika harus persis.`,
    };
  }

  function handlePending(scope, text, value) {
    if (CANCEL_PATTERN.test(text)) {
      clear(scope);
      return { intent: { kind: 'cancel_pending' }, contextCode: 'CANCELLED', reply: 'Oke, permintaan tadi dibatalkan.' };
    }
    if (value.kind === 'note_confirm') {
      const rawText = extractRawNoteText(text);
      if (rawText) { clear(scope); return saveNote(scope, rawText, { kind: 'note_add_raw', text: rawText }); }
      if (isRawNoteRequest(text)) { clear(scope); return saveNote(scope, value.text, { kind: 'note_add_raw', text: value.text }); }
      if (NOTE_REJECT_PATTERN.test(text)) { clear(scope); return { intent: { kind: 'note_cancel' }, contextCode: 'CANCELLED', reply: 'Oke, catatan itu tidak disimpan.' }; }
      if (NOTE_CONFIRM_PATTERN.test(text)) { clear(scope); return saveNote(scope, value.text); }
      const replacement = text.match(/^(?:ganti|ubah|bukan)[,:]?\s+(.+)$/i);
      if (replacement?.[1]) return previewNote(scope, replacement[1].trim());
      return { intent: { kind: 'note_confirm' }, reply: 'Aku belum menyimpan catatan itu. Balas "oke catat", "batal", atau "ganti: isi yang benar".' };
    }
    if (value.kind === 'note_text') {
      const rawText = extractRawNoteText(text);
      clear(scope);
      if (rawText) return saveNote(scope, rawText, { kind: 'note_add_raw', text: rawText });
      return previewNote(scope, text);
    }
    if (value.kind === 'reminder_time') {
      const resumed = parsePersonalPrompt(`ingatkan aku ${text}`);
      if (resumed?.kind === 'reminder_add') {
        clear(scope);
        return executeIntent(scope, resumed);
      }
      if (resumed?.kind === 'reminder_add_missing_text') {
        clear(scope);
        return executeIntent(scope, value.text
          ? { kind: 'reminder_add', timeText: resumed.timeText, text: value.text }
          : resumed);
      }
      return { intent: { kind: 'reminder_time' }, reply: 'Sebutkan jamnya, misalnya "jam 9 malam".' };
    }
    if (value.kind === 'reminder_text') {
      clear(scope);
      return executeIntent(scope, { kind: 'reminder_add', timeText: value.timeText, text });
    }
    return null;
  }

  function executeIntent(scope, intent) {
    if (intent.kind === 'cancel_pending') return { intent, reply: 'Tidak ada permintaan yang sedang menunggu.' };
    if (intent.kind === 'note_add') return previewNote(scope, intent.text);
    if (intent.kind === 'note_add_raw') return saveNote(scope, intent.text, intent);
    if (intent.kind === 'note_add_missing_text') {
      arm(scope, 'note_text');
      return { intent, reply: 'Mau aku catat isi apa?' };
    }
    if (intent.kind === 'note_list') {
      const notes = store.listNotes(scope);
      return { intent, reply: notes.length
        ? `📝 Catatan pribadimu:\n${notes.map(note => `• ${note.id} [${formatDate(note.createdAt)}] ${note.text}`).join('\n')}`
        : 'Belum ada catatan pribadi tersimpan.' };
    }
    if (intent.kind === 'note_delete_missing') return { intent, reply: 'Sebutkan ID catatan, misalnya `note-0001`.' };
    if (intent.kind === 'note_delete') {
      const result = store.removeNote({ ...scope, id: intent.id });
      return { intent, reply: result.ok ? `🗑️ ${intent.id} sudah dihapus.` : 'Catatan itu tidak ditemukan.' };
    }
    if (intent.kind === 'reminder_add_missing_time') {
      arm(scope, 'reminder_time', { text: intent.text || null });
      return { intent, reply: intent.text
        ? `Aku bisa ingatkan "${intent.text}". Mau diingatkan jam berapa?`
        : 'Boleh. Mau diingatkan jam berapa?' };
    }
    if (intent.kind === 'reminder_add_missing_text') {
      arm(scope, 'reminder_text', { timeText: intent.timeText });
      return { intent, reply: `Jam ${intent.timeText} sudah terbaca. Mau diingatkan tentang apa?` };
    }
    if (intent.kind === 'reminder_add') {
      let schedule;
      try {
        const scheduleInput = toScheduleInput(intent.timeText, Date.now());
        if (!scheduleInput) throw new Error('TIME_INVALID');
        schedule = parseScheduleInput(scheduleInput, Date.now());
      } catch {
        return { intent, reply: 'Jamnya belum terbaca. Pakai format seperti "jam 9 malam" atau "besok jam 7 pagi".' };
      }
      const result = store.addReminder({ ...scope, text: intent.text, dueAt: schedule.scheduledAt });
      if (!result.ok) return { intent, contextCode: 'FAILED', reply: result.code === 'TOO_LONG' ? 'Isi pengingat terlalu panjang. Batasnya 300 karakter.' : 'Pengingat belum tersimpan.' };
      return { intent, contextCode: 'SAVED', reply: `✅ Siap, aku ingatkan ${schedule.label}: ${result.item.text}` };
    }
    if (intent.kind === 'reminder_list') {
      const reminders = store.listReminders(scope);
      return { intent, reply: reminders.length
        ? `⏰ Pengingat pribadimu:\n${reminders.map(item => `• ${item.id} [${formatDate(item.dueAt)}] ${item.text}`).join('\n')}`
        : 'Belum ada pengingat aktif.' };
    }
    if (intent.kind === 'reminder_delete_missing') return { intent, reply: 'Sebutkan ID pengingat, misalnya `reminder-0001`.' };
    if (intent.kind === 'reminder_delete') {
      const result = store.removeReminder({ ...scope, id: intent.id });
      return { intent, reply: result.ok ? `🗑️ ${intent.id} sudah dihapus.` : 'Pengingat itu tidak ditemukan.' };
    }
    if (intent.kind === 'cancel_pending') return { intent, reply: 'Tidak ada permintaan yang sedang menunggu.' };
    if (intent.kind === 'follow_up') return { intent, reply: 'Tidak ada catatan atau pengingat yang sedang menunggu jawaban.' };
    return null;
  }

  async function handle(value, scope) {
    const text = normalizePrompt(value);
    if (!text) return { intent: { kind: 'empty' }, reply: 'Tulis catatan atau pengingat yang ingin kamu simpan.' };
    const waiting = fresh(scope);
    if (waiting) {
      const result = handlePending(scope, text, waiting);
      if (result) return { ...result, contextFamily: waiting.kind.startsWith('reminder') ? 'reminders' : 'notes' };
    }
    const intent = parsePersonalPrompt(text);
    const result = executeIntent(scope, intent || { kind: 'unsupported' })
      || { intent: intent || { kind: 'unsupported' }, reply: 'Coba tulis misalnya "catat beli kabel" atau "ingatkan aku jam 9 malam cek tugas".' };
    return { ...result, contextFamily: intent?.kind.startsWith('reminder') ? 'reminders' : 'notes' };
  }

  async function processDue() {
    store.recoverStaleSending();
    if (!client) return;
    const due = store.claimDue();
    if (!due) return;
    try {
      const user = await client.users.fetch(due.userId);
      await user.send({
        content: `⏰ Pengingat Hengs\n${due.text}`,
        allowedMentions: { parse: [] },
      });
      store.completeReminder(due.id);
    } catch {
      store.releaseReminder(due.id);
      logger.error('[personal-assistant] REMINDER_DELIVERY_FAILED');
    }
  }

  function start(nextClient = client) {
    client = nextClient;
    if (timer) return;
    processDue().catch(() => logger.error('[personal-assistant] REMINDER_WORKER_FAILED'));
    timer = setInterval(() => {
      processDue().catch(() => logger.error('[personal-assistant] REMINDER_WORKER_FAILED'));
    }, 30_000);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return Object.freeze({ handle, canContinue, clear, start, stop, processDue, getStatus: store.getStatus });
}

module.exports = {
  CANCEL_PATTERN,
  MAX_PROMPT_LENGTH,
  PENDING_TTL_MS,
  createPersonalAssistant,
  extractRawNoteText,
  findClock,
  isRawNoteRequest,
  normalizeClock,
  normalizePrompt,
  parsePersonalPrompt,
  toScheduleInput,
};
