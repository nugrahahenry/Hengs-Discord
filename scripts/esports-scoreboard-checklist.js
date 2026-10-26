'use strict';

// Offline, caller-attested visual review. No file access, provider, bot route or trust promotion.
const { createHash } = require('node:crypto');
const { canonicalVideoUrl } = require('./esports-video-lab');
const { createReview } = require('./esports-scoreboard-review');
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const label = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 80
  && /^[\p{L}\p{N} ._'()-]+$/u.test(x) && !/(?:AIza|AQ\.)[A-Za-z0-9._-]{15}/.test(x);
const integer = (x, max, min = 0) => Number.isSafeInteger(x) && x >= min && x <= max;
const fail = code => { throw new Error(code); };
const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
// Paths only ever come from the fixed field list, not from arbitrary input keys.
const set = (object, path, value) => {
  const keys = path.split('.'), last = keys.pop();
  keys.reduce((current, key) => current[key], object)[last] = value;
};
function fieldDefinitions() {
  const fields = [];
  const add = (path, title, max, min = 0) => fields.push({ path, title, max, min });
  add('gameNumber', 'Nomor game', 99, 1);
  add('durationSeconds', 'Durasi dalam detik', 10800, 1);
  add('winnerIndex', 'Pemenang, 0 kiri atau 1 kanan', 1);
  for (let side = 0; side < 2; side++) {
    const base = `teams.${side}`, title = side ? 'Kanan' : 'Kiri';
    add(`${base}.name`, `Nama tim ${title.toLowerCase()}`);
    add(`${base}.kills`, `Kill tim ${title.toLowerCase()}`, 200);
    add(`${base}.gold`, `Gold tim ${title.toLowerCase()}`, 1000000);
    for (let row = 0; row < 5; row++) {
      const player = `${base}.players.${row}`, prefix = `${title} pemain ${row + 1}`;
      add(`${player}.name`, `${prefix} nama`);
      for (const [key, text] of [['kills', 'kill'], ['deaths', 'death'], ['assists', 'assist'], ['gold', 'gold']]) {
        add(`${player}.${key}`, `${prefix} ${text}`, key === 'gold' ? 200000 : 200);
      }
    }
  }
  return fields;
}
const FIELDS = fieldDefinitions();
const valid = (value, field) => field.max === undefined ? label(value) : integer(value, field.max, field.min);
const missing = x => x === null || x === undefined || (typeof x === 'string' && !x.trim());

function reviewSource(source, candidate) {
  if (!record(source) || !record(candidate) || !sha(source.imageSha256)
    || candidate.sourceSha256 !== source.imageSha256 || !integer(source.width, 10000, 1)
    || !integer(source.height, 10000, 1) || source.width * source.height > 25000000
    || !integer(source.videoOffsetSeconds, 86400) || !label(source.event) || !label(source.seriesId)) fail('INVALID_REVIEW_SOURCE');
  let sourceUrl;
  try { sourceUrl = canonicalVideoUrl(source.sourceUrl).url; } catch { fail('INVALID_REVIEW_SOURCE'); }
  return { imageSha256: source.imageSha256, width: source.width, height: source.height, sourceUrl,
    videoOffsetSeconds: source.videoOffsetSeconds, event: source.event.trim(), seriesId: source.seriesId.trim() };
}

function createScoreboardChecklist(input) {
  if (!record(input)) fail('INVALID_REVIEW_INPUT');
  const { candidate } = input;
  const source = reviewSource(input.source, candidate);
  const raw = candidate.observation;
  if (!record(raw) || !Array.isArray(raw.teams) || raw.teams.length !== 2
    || !Array.from(raw.teams).every(t => record(t) && Array.isArray(t.players) && t.players.length === 5
      && Array.from(t.players).every(record))) fail('INVALID_CANDIDATE_SHAPE');
  // Reuse existing bounded roster parsing and consistency checks. Only the declared fields are copied below.
  const initial = createReview({ evidenceKind: 'model_candidate', observation: { ...raw, ...source } });
  const fields = FIELDS.map(field => {
    const value = get(raw, field.path);
    if (value !== null && value !== undefined && !(typeof value === 'string' && value.length <= 160)
      && !(typeof value === 'number' && Number.isFinite(value))) fail('INVALID_CANDIDATE_VALUE');
    const originalValue = valid(value, field) ? (typeof value === 'string' ? value.trim() : value) : null;
    return { path: field.path, title: field.title, originalValue, value: originalValue,
      state: missing(value) ? 'MISSING' : originalValue === null ? 'INVALID' : 'UNREVIEWED', evidence: null };
  });
  // Hash binds source context and every raw allowlisted field, including malformed strings, without echoing them.
  const candidateFingerprint = hash({ source, fields: FIELDS.map(field => [field.path, get(raw, field.path) ?? null]) });
  const observation = { sourceUrl: source.sourceUrl, videoOffsetSeconds: source.videoOffsetSeconds,
    event: source.event, seriesId: source.seriesId,
    teams: initial.observation.teams.map(t => ({ players: t.players.map(() => ({})) })) };
  for (const field of fields) set(observation, field.path, field.value);
  let reviewerKind = null;
  if (input.review !== undefined) {
    const review = input.review;
    if (!record(review) || !['operator_visual', 'human_visual'].includes(review.reviewerKind)
      || !Array.isArray(review.items) || review.items.length > FIELDS.length) fail('INVALID_REVIEW_DECISIONS');
    if (review.candidateFingerprint !== candidateFingerprint) fail('STALE_REVIEW');
    const seen = new Set();
    for (const item of review.items) {
      if (!record(item) || typeof item.path !== 'string') fail('INVALID_REVIEW_FIELD');
      const index = FIELDS.findIndex(field => field.path === item.path);
      if (index === -1 || seen.has(item.path)) fail('INVALID_REVIEW_FIELD');
      seen.add(item.path);
      if (!valid(item.value, FIELDS[index])) fail('INVALID_REVIEW_VALUE');
      const region = item.region;
      if (item.imageSha256 !== source.imageSha256 || !record(region)
        || !integer(region.x, source.width - 1) || !integer(region.y, source.height - 1)
        || !integer(region.width, source.width, 1) || !integer(region.height, source.height, 1)
        || region.x + region.width > source.width || region.y + region.height > source.height) fail('INVALID_REVIEW_EVIDENCE');
      const field = fields[index], value = typeof item.value === 'string' ? item.value.trim() : item.value;
      field.state = field.originalValue === value ? 'CONFIRMED' : 'CORRECTED';
      field.value = value;
      field.evidence = { imageSha256: source.imageSha256,
        region: { x: region.x, y: region.y, width: region.width, height: region.height } };
      set(observation, field.path, value);
    }
    reviewerKind = review.reviewerKind;
  }
  const checked = createReview({ evidenceKind: 'model_candidate', observation });
  const count = state => fields.filter(f => f.state === state).length;
  const summary = { total: fields.length, confirmed: count('CONFIRMED'), corrected: count('CORRECTED'),
    missing: count('MISSING'), invalid: count('INVALID'), unreviewed: count('UNREVIEWED') };
  summary.pending = summary.missing + summary.invalid + summary.unreviewed;
  return { schemaVersion: 1, status: summary.pending === 0 && checked.checks.issues.length === 0
    ? 'OFFLINE_REVIEW_COMPLETE' : 'REVIEW_REQUIRED', candidateFingerprint, source, reviewerKind,
    reviewerAssurance: 'CALLER_ATTESTED_NOT_IDENTITY_VERIFIED', fields, summary,
    observation, issues: [...checked.checks.issues],
    trustedForCoach: false, publishable: false, accuracyMeasured: false, networkRequests: 0,
    boundary: 'Koreksi operator bukan hasil OCR murni. Selesai diperiksa bukan izin publikasi atau impor pengetahuan.' };
}

const escape = value => String(value).replace(/[\\`*_{}\[\]()#+.!|~>]/g, '\\$&');
function renderScoreboardChecklist(input) {
  const packet = createScoreboardChecklist(input);
  const state = { CONFIRMED: 'Dikonfirmasi', CORRECTED: 'Dikoreksi', MISSING: 'Belum terbaca',
    INVALID: 'Tidak valid', UNREVIEWED: 'Belum diperiksa' };
  const display = value => value === null ? '?' : escape(value);
  const rows = ['# Lembar pemeriksaan Coach', '', packet.status === 'OFFLINE_REVIEW_COMPLETE'
    ? 'Pemeriksaan lokal lengkap. Hasil tetap belum masuk pengetahuan Coach.'
    : 'Masih ada bagian yang perlu diperiksa. Jangan pakai sebagai kesimpulan Coach dulu.', '',
  `- ${packet.summary.confirmed} kolom dikonfirmasi tanpa perubahan`,
  `- ${packet.summary.corrected} kolom dikoreksi dengan bukti screenshot`,
  `- ${packet.summary.pending} kolom belum selesai diperiksa`,
  '- Nilai yang tampak masuk akal tetap perlu dibandingkan dengan sumber', '',
  'Nama mengikuti posisi kiri atau kanan dan urutan pemain pada screenshot, bukan urutan tim di game lain.', '',
  '| Kolom | Bacaan awal | Hasil review | Status |', '| --- | --- | --- | --- |'];
  for (const field of packet.fields) rows.push(`| ${field.title} | ${display(field.originalValue)} | ${display(field.value)} | ${state[field.state]} |`);
  if (packet.issues.length) rows.push('', '## Pemeriksaan yang belum lolos', '', ...packet.issues.map(code => `- ${code}`));
  rows.push('', '## Asal pemeriksaan', '',
    packet.reviewerKind === 'human_visual' ? 'Ditandai oleh pemanggil sebagai review manusia. Identitas pemeriksa tidak diverifikasi oleh alat ini.'
      : packet.reviewerKind === 'operator_visual' ? 'Diperiksa oleh operator. Ini bukan penilaian manusia independen.' : 'Belum ada keputusan pemeriksa.',
    '', 'Setiap keputusan menyimpan kotak area screenshot dan sidik file sumber. Nilai awal tidak ditimpa.',
    '', `[Buka waktu sumber](${packet.source.sourceUrl}&t=${packet.source.videoOffsetSeconds}s)`, '', packet.boundary, '');
  return rows.join('\n');
}

module.exports = { createScoreboardChecklist, renderScoreboardChecklist };
