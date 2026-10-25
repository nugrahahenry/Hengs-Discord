'use strict';

// Offline extension of the existing Hengs Analis card, not a bot route or an importer into Coach.
// THESIS: compare ten players without turning a final scoreboard into invented gameplay advice.
// OWN-WORLD: inherited navy, blue/red sides, gold result emphasis and bundled Barlow fonts.
// STORY: read the result, check each number, then see exactly what evidence is still missing.
// FIRST VIEWPORT: labelled manual/model evidence, game kills (not series score), final gold, two rosters.
// FORM: existing broadcast card extended for review; stacked roster layout for phone reading.
const { canonicalVideoUrl, inspectScoreboard } = require('./esports-video-lab');
const { C, fitText, loadFonts, paint } = require('../src/esports/card');

const KINDS = Object.freeze({ manual_transcription: 'Dibaca manual dari screenshot', model_candidate: 'Kandidat model, belum diverifikasi' });
const DIMENSIONS = Object.freeze({ wide: [1600, 1200], portrait: [900, 1650] });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80
  && !/[\p{Cc}\p{Cf}<>@\u2013\u2014]/u.test(value) && !/(?:AIza|AQ\.)[A-Za-z0-9._-]{15}/.test(value) ? value.trim() : null;
const fail = code => { throw new Error(code); };
const percent = (part, whole) => whole > 0 && part >= 0 && part <= whole ? Math.round(part / whole * 1000) / 10 : null;
const display = value => value === null ? '?' : String(value);
const gold = value => value === null ? '?' : new Intl.NumberFormat('id-ID').format(value);
const duration = seconds => seconds === null ? '?' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const pct = value => value === null ? '?' : `${String(value).replace('.', ',')}%`;

function createReview(input) {
  if (!isRecord(input) || !Object.hasOwn(KINDS, input.evidenceKind) || !isRecord(input.observation)) fail('INVALID_REVIEW_INPUT');
  const raw = input.observation;
  if (!Array.isArray(raw.teams) || raw.teams.length !== 2 || raw.teams.some(t => !isRecord(t)
    || !Array.isArray(t.players) || t.players.length !== 5 || t.players.some(p => !isRecord(p)))) fail('INVALID_REVIEW_ROSTER');
  let sourceUrl = null;
  try { sourceUrl = canonicalVideoUrl(raw.sourceUrl).url; } catch { /* Missing evidence stays visibly unresolved. */ }
  const observation = {
    sourceUrl, videoOffsetSeconds: number(raw.videoOffsetSeconds, 86400), event: label(raw.event),
    seriesId: label(raw.seriesId), gameNumber: number(raw.gameNumber, 99),
    durationSeconds: number(raw.durationSeconds, 10800), winnerIndex: [0, 1].includes(raw.winnerIndex) ? raw.winnerIndex : null,
    patch: label(raw.patch), teams: raw.teams.map(t => ({ name: label(t.name), kills: number(t.kills, 200), gold: number(t.gold, 1000000),
      players: t.players.map(p => ({ name: label(p.name), kills: number(p.kills, 200), deaths: number(p.deaths, 200),
        assists: number(p.assists, 200), gold: number(p.gold, 200000) })) })),
  };
  const checks = inspectScoreboard(observation);
  const numericIssues = checks.issues.filter(code => /MISSING_TOTALS|MISSING_PLAYER_NUMBERS|KILLS_MISMATCH|GOLD_MISMATCH|OPPOSING_DEATHS_MISMATCH/.test(code));
  observation.teams.forEach((t, index) => {
    if (t.kills !== null && t.players.some(p => p.kills !== null && p.assists !== null && p.kills + p.assists > t.kills)) {
      const issue = `TEAM_${index}_PARTICIPATION_EXCEEDS_KILLS`;
      checks.issues.push(issue); numericIssues.push(issue);
    }
  });
  if (checks.issues.length) checks.status = 'REVIEW_REQUIRED';
  const numericConsistent = numericIssues.length === 0;
  if (!numericConsistent) checks.goldLead = null;
  const teams = observation.teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p,
    killParticipationPercent: numericConsistent ? percent(p.kills + p.assists, t.kills) : null,
  })) }));
  const goldDifference = numericConsistent ? teams[0].gold - teams[1].gold : null;
  const notes = [];
  if (goldDifference !== null && goldDifference !== 0) {
    notes.push(`${teams[goldDifference > 0 ? 0 : 1].name || 'Tim ?'} unggul ${gold(Math.abs(goldDifference))} gold di akhir game.`);
  } else if (goldDifference === 0) notes.push('Gold akhir kedua tim sama pada angka yang ditampilkan.');
  const missing = [];
  if (observation.videoOffsetSeconds === null) missing.push('Posisi screenshot di video belum pasti.');
  if (!observation.patch) missing.push('Patch belum terverifikasi.');
  missing.push('Urutan draft, item, objektif dan momen gameplay belum dinilai.');
  return { schemaVersion: 1, evidenceKind: input.evidenceKind, evidenceLabel: KINDS[input.evidenceKind],
    reviewStatus: 'REVIEW_REQUIRED', trustedForCoach: false, publishable: false, networkRequests: 0,
    observation: { ...observation, teams }, checks, numericConsistent,
    derived: { goldDifference, blueGoldSharePercent: numericConsistent ? percent(teams[0].gold, teams[0].gold + teams[1].gold) : null },
    notes, missing,
    boundary: 'Angka akhir bukan bukti penyebab menang atau kalah. Belum masuk pengetahuan Coach.' };
}

// Escape labels for a local Markdown companion; do not forward arbitrary model text or fields.
const md = value => display(value).replace(/[\\`*_{}\[\]()#+.!|~>-]/g, '\\$&');
function renderReviewMarkdown(input) {
  const review = createReview(input); const o = review.observation;
  const rows = ['# Review pertandingan Hengs', '', review.evidenceLabel, '',
    `**${md(o.teams[0].name)} ${display(o.teams[0].kills)} : ${display(o.teams[1].kills)} ${md(o.teams[1].name)}**`,
    'Angka di atas adalah kill dalam satu game, bukan skor seri.', '',
    `Event: ${md(o.event)}. Match: ${md(o.seriesId)}. Game: ${display(o.gameNumber)}. Durasi: ${duration(o.durationSeconds)}.`,
    `Pemenang tercatat: ${o.winnerIndex === null ? '?' : md(o.teams[o.winnerIndex].name)}.`, '',
    `Status: ${review.numericConsistent ? 'angka lolos cek konsistensi' : 'ada angka yang perlu diperiksa'}; tetap perlu review manusia.`, ''];
  for (const team of o.teams) {
    rows.push(`## ${md(team.name)}`, '', `Gold akhir: ${gold(team.gold)}`, '', '| Pemain | K / D / A | Gold | KP |', '| --- | ---: | ---: | ---: |');
    for (const p of team.players) rows.push(`| ${md(p.name)} | ${display(p.kills)} / ${display(p.deaths)} / ${display(p.assists)} | ${gold(p.gold)} | ${pct(p.killParticipationPercent)} |`);
    rows.push('');
  }
  rows.push('KP = (kill + assist) / kill tim. KP tidak dihitung jika data bertentangan, belum lengkap, atau kill tim nol.', '',
    ...review.notes, '', '## Batas bukti', '', ...review.missing.map(line => `- ${line}`), `- ${review.boundary}`, '',
    `Sumber: ${o.sourceUrl ? `[Arsip publik YouTube](${o.sourceUrl})` : 'belum valid'}.`,
    `Posisi video dari input: ${o.videoOffsetSeconds === null ? 'belum diketahui' : `${o.videoOffsetSeconds} detik (belum diverifikasi oleh alat ini)`}.`, '',
    `Pemeriksaan: ${review.checks.issues.length ? review.checks.issues.join(', ') : 'tidak ada konflik aritmetika terdeteksi'}.`,
    'Bukan hasil ekstraksi otomatis untuk data berlabel manual. Tidak ada publikasi atau penulisan ke Coach.', '');
  return rows.join('\n');
}

async function renderReviewCard(input, { layout = 'wide' } = {}) {
  if (!Object.hasOwn(DIMENSIONS, layout)) fail('INVALID_REVIEW_LAYOUT');
  const review = createReview(input); const o = review.observation;
  const [width, height] = DIMENSIONS[layout]; const portrait = layout === 'portrait';
  loadFonts();
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(width, height); const ctx = canvas.getContext('2d');
  paint(ctx, width, height, null); ctx.textBaseline = 'alphabetic';
  const margin = portrait ? 64 : 80; const usable = width - margin * 2;
  const text = (value, x, y, size = 32, color = C.text, maxWidth = usable, align = 'left', family = 'Analis Text') =>
    fitText(ctx, String(value), x, y, { size, min: size - 4, family, color, width: maxWidth, align });
  const line = y => { ctx.strokeStyle = '#33405D'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke(); };
  text('Review pertandingan', margin, 100, 50, C.text, usable - 170, 'left', 'Analis Bold');
  text('HENGS', width - margin, 100, 36, C.accent, 160, 'right', 'Analis Bold');
  text(`${o.event || 'Event belum diketahui'} · Game ${display(o.gameNumber)} · ${duration(o.durationSeconds)}`, margin, 148, 30);
  text(review.evidenceLabel, margin, 190, 28, C.win);
  const a = o.teams[0]; const b = o.teams[1];
  text(a.name || 'Tim ?', margin, 282, portrait ? 66 : 84, C.blue, usable * 0.28, 'left', 'Analis Bold');
  text(b.name || 'Tim ?', width - margin, 282, portrait ? 66 : 84, C.red, usable * 0.28, 'right', 'Analis Bold');
  text(`${display(a.kills)} : ${display(b.kills)}`, width / 2, 282, portrait ? 76 : 96, C.text, usable * 0.36, 'center', 'Analis Display');
  text('KILL GAME, BUKAN SKOR SERI', width / 2, 322, 24, C.muted, usable, 'center');
  if (o.winnerIndex !== null) text(`Pemenang tercatat: ${o.teams[o.winnerIndex].name || '?'}`, width / 2, 365, 30, C.win, usable, 'center');
  else text('Pemenang belum diketahui', width / 2, 365, 30, C.muted, usable, 'center');
  text(`${gold(a.gold)} gold`, margin, 416, 32, C.blue, usable * 0.45);
  text(`${gold(b.gold)} gold`, width - margin, 416, 32, C.red, usable * 0.45, 'right');
  ctx.fillStyle = '#33405D'; ctx.fillRect(margin, 438, usable, 10);
  if (review.derived.blueGoldSharePercent !== null) {
    const split = usable * review.derived.blueGoldSharePercent / 100;
    ctx.fillStyle = C.blue; ctx.fillRect(margin, 438, split, 10);
    ctx.fillStyle = C.red; ctx.fillRect(margin + split, 438, usable - split, 10);
  }
  const table = (team, index, x, y, w) => {
    const color = index === 0 ? C.blue : C.red;
    const col = { name: x + 16, kda: x + w * 0.56, gold: x + w * 0.80, kp: x + w - 16 };
    text(team.name || 'Tim ?', x + 16, y + 34, 36, color, w - 32, 'left', 'Analis Bold');
    text('PEMAIN', col.name, y + 82, 24, C.muted, w * 0.32);
    text('K / D / A', col.kda, y + 82, 24, C.muted, w * 0.22, 'right');
    text('GOLD', col.gold, y + 82, 24, C.muted, w * 0.22, 'right');
    text('KP', col.kp, y + 82, 24, C.muted, w * 0.17, 'right');
    team.players.forEach((p, i) => {
      const rowY = y + 99 + i * 57;
      if (i % 2 === 0) { ctx.fillStyle = '#151D38'; ctx.fillRect(x, rowY, w, 57); }
      text(p.name || '?', col.name, rowY + 38, 32, C.text, w * 0.33, 'left', 'Analis Bold');
      text(`${display(p.kills)} / ${display(p.deaths)} / ${display(p.assists)}`, col.kda, rowY + 38, 29, C.text, w * 0.23, 'right');
      text(gold(p.gold), col.gold, rowY + 38, 29, C.text, w * 0.22, 'right');
      text(pct(p.killParticipationPercent), col.kp, rowY + 38, 28, C.muted, w * 0.17, 'right');
    });
  };
  const tableY = 480; const tableWidth = portrait ? usable : (usable - 56) / 2;
  table(a, 0, margin, tableY, tableWidth);
  table(b, 1, portrait ? margin : width / 2 + 28, portrait ? tableY + 424 : tableY, tableWidth);
  const footY = portrait ? 1330 : 906;
  line(footY - 20);
  text('KP = (kill + assist) / kill tim. ? = belum diketahui.', margin, footY + 16, 26, C.muted);
  text(review.notes[0] || 'Angka belum cukup konsisten untuk menghitung selisih gold.', margin, footY + 58, 30,
    review.numericConsistent ? C.win : C.red);
  text(review.numericConsistent ? 'Angka konsisten. Tetap perlu review sumber.' : 'Ada konflik angka. Periksa sumber sebelum dipakai.', margin, footY + 98, 28, C.muted);
  text(o.videoOffsetSeconds === null ? 'Posisi video belum pasti · Patch belum diverifikasi'
    : 'Posisi video dari input · Belum diverifikasi oleh alat ini', margin, footY + 138, 26, C.muted);
  text(o.sourceUrl ? 'Sumber: arsip publik YouTube · Tautan lengkap di review.md' : 'Sumber belum valid. Jangan dipublikasikan.', margin, footY + 180, 25, C.muted);
  text('Preview lokal, belum masuk pengetahuan Coach.', margin, height - 54, 26, C.accent);
  return canvas.toBuffer('image/png');
}

// Outputs are previews only. No runtime files, URL fetches, credentials, Coach imports or publication.
async function writeReviewBundle(inputPath, outputDir) {
  const fs = require('node:fs'); const path = require('node:path');
  const root = path.resolve(__dirname, '..'); const evalRoot = path.join(root, '.cloud', 'evals');
  if (!path.isAbsolute(inputPath) || !path.isAbsolute(outputDir)) fail('REVIEW_PATH_OUTSIDE_EVALS');
  inputPath = path.resolve(inputPath); outputDir = path.resolve(outputDir);
  const inside = target => {
    if (!path.isAbsolute(target)) fail('REVIEW_PATH_OUTSIDE_EVALS');
    const relative = path.relative(evalRoot, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('REVIEW_PATH_OUTSIDE_EVALS');
  };
  const noLinks = target => {
    let current = root;
    for (const part of path.relative(root, target).split(path.sep)) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) fail('REVIEW_LINK_REJECTED');
    }
  };
  inside(inputPath); inside(outputDir); noLinks(inputPath); noLinks(path.dirname(outputDir));
  if (!fs.statSync(inputPath).isFile() || fs.statSync(inputPath).size > 65536) fail('INVALID_REVIEW_FILE');
  if (fs.existsSync(outputDir)) fail('REVIEW_OUTPUT_EXISTS');
  let input;
  try { input = JSON.parse(fs.readFileSync(inputPath, 'utf8')); } catch { fail('INVALID_REVIEW_FILE'); }
  const review = createReview(input);
  const wide = await renderReviewCard(input); const portrait = await renderReviewCard(input, { layout: 'portrait' });
  const markdown = renderReviewMarkdown(input);
  fs.mkdirSync(outputDir); // Exclusive new directory; all inputs/rendering were validated first.
  for (const [name, contents] of [['scoreboard-wide.png', wide], ['scoreboard-portrait.png', portrait],
    ['review.md', markdown], ['review.json', JSON.stringify(review, null, 2)]]) {
    fs.writeFileSync(path.join(outputDir, name), contents, { flag: 'wx', mode: 0o600 });
  }
  return { code: 'OFFLINE_REVIEW_CREATED', images: 2, trustedForCoach: false, networkRequests: 0 };
}

module.exports = { createReview, renderReviewCard, renderReviewMarkdown, writeReviewBundle, DIMENSIONS };
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 6 || process.argv[2] !== '--input' || process.argv[4] !== '--out-dir') fail('REVIEW_USAGE_REQUIRED');
    console.log(JSON.stringify(await writeReviewBundle(process.argv[3], process.argv[5])));
  })().catch(err => {
    const allowed = ['INVALID_REVIEW_INPUT', 'INVALID_REVIEW_ROSTER', 'REVIEW_PATH_OUTSIDE_EVALS', 'REVIEW_LINK_REJECTED',
      'INVALID_REVIEW_FILE', 'REVIEW_OUTPUT_EXISTS', 'REVIEW_USAGE_REQUIRED', 'ESPORTS_FONT_UNAVAILABLE'];
    console.log(JSON.stringify({ code: allowed.includes(err.message) ? err.message : 'REVIEW_OUTPUT_FAILED', networkRequests: 0 }));
    process.exitCode = 1;
  });
}
