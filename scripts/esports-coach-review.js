'use strict';

// Offline briefing only. Reuses the scoreboard validator, never imports facts into live Coach memory.
const { createReview } = require('./esports-scoreboard-review');
const { canonicalVideoUrl } = require('./esports-video-lab');
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const key = x => String(x).trim().toLowerCase();
const name = x => typeof x === 'string' && x.length > 0 && x.length <= 80
  && /^[\p{L}\p{N} ._'-]+$/u.test(x) ? x.trim() : null;
const fail = () => { throw new Error('INVALID_DRAFT_PAIR'); };
const format = x => new Intl.NumberFormat('id-ID').format(x);
const escape = x => String(x).replace(/[\\`*_{}\[\]()#+.!|~>]/g, '\\$&');

function pairDraft(draft, observation) {
  if (draft === undefined || draft === null) return null;
  if (!record(draft) || draft.stage !== 'FINAL_CHANGES' || !Number.isSafeInteger(draft.videoOffsetSeconds)
    || draft.videoOffsetSeconds < 0 || !Number.isSafeInteger(observation.videoOffsetSeconds)
    || draft.videoOffsetSeconds >= observation.videoOffsetSeconds
    || draft.gameNumber !== observation.gameNumber || draft.seriesId !== observation.seriesId
    || !Array.isArray(draft.teams) || draft.teams.length !== 2) fail();
  let source;
  try { source = canonicalVideoUrl(draft.sourceUrl).url; } catch { fail(); }
  if (source !== observation.sourceUrl) fail();
  const teams = new Map();
  for (const team of draft.teams) {
    if (!record(team) || !name(team.name) || teams.has(key(team.name))
      || !Array.isArray(team.players) || team.players.length !== 5) fail();
    const players = new Map();
    for (const player of team.players) {
      if (!record(player) || !name(player.name) || players.has(key(player.name))
        || (player.heroLabel !== null && !name(player.heroLabel))) fail();
      players.set(key(player.name), player.heroLabel === null ? null : name(player.heroLabel));
    }
    teams.set(key(team.name), players);
  }
  const paired = observation.teams.map(team => {
    const players = teams.get(key(team.name));
    if (!players || team.players.some(player => !players.has(key(player.name)))) fail();
    return { name: team.name, players: team.players.map(player => ({ name: player.name, heroLabel: players.get(key(player.name)) })) };
  });
  return { sourceUrl: source, videoOffsetSeconds: draft.videoOffsetSeconds, stage: 'FINAL_CHANGES', teams: paired,
    assignmentStatus: 'DRAFT_LABELS_ONLY', purchaseOrderKnown: false, chronologicalPickOrderKnown: false,
    boundary: 'Label dibaca dari draft Final Changes. Ini bukan bukti urutan pick atau bahwa tidak ada swap setelah frame ini.' };
}

function createCoachBrief(input) {
  const review = createReview(input);
  const o = review.observation;
  const draft = pairDraft(input.draftEvidence, o);
  const ready = review.numericConsistent && review.checks.issues.length === 0;
  const facts = [];
  if (ready) {
    const winner = o.teams[o.winnerIndex];
    const loser = o.teams[1 - o.winnerIndex];
    facts.push({ kind: 'OBSERVED', code: 'RESULT', fields: ['winnerIndex', 'teams.kills', 'durationSeconds'],
      text: `${winner.name} menang ${winner.kills}-${loser.kills} kill dalam ${Math.floor(o.durationSeconds / 60)}:${String(o.durationSeconds % 60).padStart(2, '0')}. Angka ini bukan skor seri.` });
    const gap = review.derived.goldDifference;
    facts.push({ kind: 'DERIVED', code: 'FINAL_GOLD', fields: ['teams.gold'],
      text: gap === 0 ? 'Gold akhir kedua tim sama pada tampilan siaran.'
        : `${o.teams[gap > 0 ? 0 : 1].name} unggul sekitar ${format(Math.abs(gap))} gold pada akhir game. Angka gold siaran dibulatkan.` });
    for (const team of o.teams) {
      if (team.kills === 0) continue;
      const top = Math.max(...team.players.map(p => p.killParticipationPercent));
      const leaders = team.players.filter(p => p.killParticipationPercent === top);
      facts.push({ kind: 'DERIVED', code: 'TEAM_PARTICIPATION', fields: ['teams.kills', 'players.kills', 'players.assists'],
        text: `${team.name} punya ${leaders.map(p => p.name).join(' dan ')} dengan keterlibatan kill tertinggi di tim, ${format(top)}%. KP bukan nilai keseluruhan permainan atau penentu MVP.` });
    }
  }
  return { schemaVersion: 1, status: ready ? 'OFFLINE_BRIEF_READY_FOR_REVIEW' : 'DATA_REVIEW_REQUIRED',
    evidenceKind: review.evidenceKind, evidenceLabel: review.evidenceLabel,
    reviewStatus: 'REVIEW_REQUIRED', trustedForCoach: false, publishable: false, networkRequests: 0,
    sourceUrl: o.sourceUrl, videoOffsetSeconds: o.videoOffsetSeconds, gameNumber: o.gameNumber,
    issues: [...review.checks.issues], facts, draft,
    reviewQuestions: ready ? [
      'Cari momen saat selisih gold mulai melebar. Apa yang terjadi sebelum dan sesudahnya?',
      'Tinjau setup sebelum objektif besar. Bagaimana posisi tim dan informasi yang tersedia saat keputusan diambil?',
      'Untuk pemain dengan KP tinggi, cek kontribusinya di rekaman. KDA saja belum menjelaskan kualitas keputusan.',
    ] : ['Periksa angka dan identitas game yang ditandai sebelum menyusun evaluasi.'],
    limits: [
      'Ini pembacaan screenshot, bukan penilaian gameplay penuh atau model yang sudah belajar.',
      'Kemenangan tidak otomatis membuktikan draft, build item atau rotasi tertentu lebih baik.',
      'Nama item, urutan beli, patch dan kronologi objektif belum terverifikasi.',
      'Pertanyaan review adalah arahan pemeriksaan, bukan kesimpulan tentang kesalahan pemain.',
    ] };
}

function renderCoachBrief(input) {
  const brief = createCoachBrief(input);
  const lines = ['# Catatan Coach', '', `${brief.evidenceLabel}. Tetap perlu pemeriksaan manusia.`, '',
    '## Yang terlihat dan bisa dihitung', '',
    ...(brief.facts.length ? brief.facts.map(f => `- ${escape(f.text)}`) : ['- Data belum cukup konsisten untuk dirangkum.']), '',
    '## Yang perlu ditonton ulang', '', ...brief.reviewQuestions.map(q => `- ${escape(q)}`), ''];
  if (brief.draft) {
    lines.push('## Label hero pada draft', '', brief.draft.boundary, '', '| Tim | Pemain | Label hero |', '| --- | --- | --- |');
    for (const team of brief.draft.teams) for (const p of team.players) {
      lines.push(`| ${escape(team.name)} | ${escape(p.name)} | ${p.heroLabel === null ? 'Belum terbaca' : escape(p.heroLabel)} |`);
    }
    lines.push('');
  }
  lines.push('## Batas analisis', '', ...brief.limits.map(x => `- ${escape(x)}`), '');
  if (brief.issues.length) lines.push('Periksa kode berikut', '', ...brief.issues.map(x => `- ${x}`), '');
  if (brief.sourceUrl) {
    const result = Number.isSafeInteger(brief.videoOffsetSeconds) ? `${brief.sourceUrl}&t=${brief.videoOffsetSeconds}s` : brief.sourceUrl;
    lines.push(`[Lihat sumber hasil pertandingan](${result})`);
    if (brief.draft) lines.push(`[Lihat sumber draft](${brief.draft.sourceUrl}&t=${brief.draft.videoOffsetSeconds}s)`);
  }
  lines.push('', 'Hasil ini belum dipublikasikan atau dimasukkan ke pengetahuan Coach.', '');
  return lines.join('\n');
}

module.exports = { pairDraft, createCoachBrief, renderCoachBrief };
