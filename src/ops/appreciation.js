'use strict';

// This is a display template inside an ordinary Ops announcement, not an award record.
const PREFIX = '🏆 Apresiasi Hengs: ';
const CLOSING = 'Kerja bagus! Terima kasih sudah bikin komunitas makin bangga.';
const LIMITS = Object.freeze({ recipient: 80, achievement: 220, occasion: 100, date: 48, players: 480 });
const LABELS = Object.freeze({ recipient: 'Penerima', achievement: 'Pencapaian', occasion: 'Momen', date: 'Tanggal', players: 'Pemain' });
const UNSAFE = /[@<>`\r\n\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]|https?:\/\/|discord\.gg/iu;

function validateAppreciation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !Object.hasOwn(LIMITS, key))) {
    throw new Error('APPRECIATION_INVALID');
  }
  const output = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    let raw = input[key];
    if (key !== 'recipient' && key !== 'achievement' && (raw === undefined || (typeof raw === 'string' && !raw.trim()))) continue;
    if (key === 'players' && typeof raw === 'string') {
      if (raw.length > max) throw new Error('APPRECIATION_INVALID');
      const players = raw.split(/[\r\n;,]+/).map(value => value.trim()).filter(Boolean);
      if (!players.length || players.length > 8 || players.some(value => value.length > 60)) throw new Error('APPRECIATION_INVALID');
      raw = players.join('; ');
    }
    if (typeof raw !== 'string' || UNSAFE.test(raw)) throw new Error('APPRECIATION_INVALID');
    const value = raw.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
    if (!value || value.length > max) throw new Error('APPRECIATION_INVALID');
    output[key] = value;
  }
  return output;
}

function buildAppreciationDraft(input) {
  const data = validateAppreciation(input);
  return {
    title: `${PREFIX}${data.recipient}`,
    body: `${Object.keys(LABELS).filter(key => data[key])
      .map(key => `${LABELS[key]}: ${data[key]}`).join('\n')}\n\n${CLOSING}`,
  };
}

function isAppreciationDraft(draft) {
  return draft?.kind !== 'project' && typeof draft?.title === 'string' && draft.title.startsWith(PREFIX);
}

function readAppreciationDraft(draft) {
  if (!isAppreciationDraft(draft) || typeof draft.body !== 'string' || draft.body.length > 1200) return null;
  const lines = draft.body.split('\n');
  if (lines.pop() !== CLOSING || lines.pop() !== '') return null;
  const data = {};
  for (const line of lines) {
    const entry = Object.entries(LABELS).find(([, label]) => line.startsWith(`${label}: `));
    if (!entry || Object.hasOwn(data, entry[0])) return null;
    data[entry[0]] = line.slice(entry[1].length + 2);
  }
  try {
    const normalized = validateAppreciation(data);
    const canonical = buildAppreciationDraft(normalized);
    return canonical.title === draft.title && canonical.body === draft.body ? normalized : null;
  } catch {
    return null;
  }
}

function parseAppreciationPrompt(prompt) {
  const match = prompt.match(/^(?:tolong\s+)?(?:buat(?:kan)?|bikin(?:in|kan)?|siapkan|susun)\s+(?:(?:draft|kartu|pengumuman)\s+)?(?:apresiasi|achievement|hall\s+of\s+fame)\b\s*(.*)$/i);
  if (!match) return null;
  const question = { kind: 'operation_questions', operation: 'appreciation' };
  const [main, ...extras] = match[1].replace(/^(?:untuk|buat)\s+/i, '').split(/\s*;\s*/);
  const parts = main.match(/^(.+?)(?:\s+(?:karena|atas|yang)\s+|:\s*)(.+)$/i)
    || main.match(/^(.+?)\s+((?:juara\s+\d+|menang\b|berhasil\b|jadi\s+mvp\b).+)$/i);
  if (!parts || extras.length > 3) return question;
  const data = { recipient: parts[1], achievement: parts[2] };
  for (const extra of extras) {
    const field = extra.match(/^(tanggal|momen|turnamen|acara|pemain)\s*:?\s+(.+)$/i);
    if (!field) return question;
    const key = { tanggal: 'date', pemain: 'players' }[field[1].toLowerCase()] || 'occasion';
    if (Object.hasOwn(data, key)) return question;
    data[key] = field[2];
  }
  try {
    return {
      kind: 'ops_draft', operation: 'announcement',
      brief: prompt, titleOverride: null,
      preparedDraft: buildAppreciationDraft(data),
    };
  } catch {
    return question;
  }
}

module.exports = { buildAppreciationDraft, isAppreciationDraft, parseAppreciationPrompt, readAppreciationDraft, validateAppreciation };
