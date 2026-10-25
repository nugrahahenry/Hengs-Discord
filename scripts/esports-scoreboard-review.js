'use strict';

// Offline extension of the existing Hengs Analis card, not a bot route or an importer into Coach.
// THESIS: compare ten players without turning a final scoreboard into invented gameplay advice.
// OWN-WORLD: inherited navy, blue/red sides, gold result emphasis and bundled Barlow fonts.
// STORY: read the result, check each number, then see exactly what evidence is still missing.
// FIRST VIEWPORT: labelled manual/model evidence, game kills (not series score), final gold, two rosters.
// FORM: existing broadcast card extended for review; stacked roster layout for phone reading.
const { canonicalVideoUrl, inspectScoreboard } = require('./esports-video-lab');
const { C, fitText, loadFonts } = require('../src/esports/card');
const { reviewItemEvidence, decodeItemSource, MAX_ITEM_IMAGE_BYTES } = require('./esports-item-evidence');
const { reviewTeamLogos, decodeLogoSource, MAX_LOGO_IMAGE_BYTES } = require('./esports-team-logos');

const KINDS = Object.freeze({ manual_transcription: 'Dibaca manual dari screenshot', model_candidate: 'Kandidat model, belum diverifikasi' });
const DIMENSIONS = Object.freeze({ wide: [1600, 1200], portrait: [900, 1650] });
const ITEM_DIMENSIONS = Object.freeze({ wide: [1600, 1520], portrait: [900, 2280] });
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
  const itemEvidence = reviewItemEvidence(input.itemEvidence, teams);
  const teamLogoEvidence = reviewTeamLogos(input.teamLogoEvidence, teams);
  const goldDifference = numericConsistent ? teams[0].gold - teams[1].gold : null;
  const notes = [];
  if (goldDifference !== null && goldDifference !== 0) {
    notes.push(`${teams[goldDifference > 0 ? 0 : 1].name || 'Tim ?'} unggul ${gold(Math.abs(goldDifference))} gold di akhir game.`);
  } else if (goldDifference === 0) notes.push('Gold akhir kedua tim sama pada angka yang ditampilkan.');
  const missing = [];
  if (observation.videoOffsetSeconds === null) missing.push('Posisi screenshot di video belum pasti.');
  if (!observation.patch) missing.push('Patch belum terverifikasi.');
  missing.push(itemEvidence ? 'Ikon item berasal dari screenshot; nama item dan urutan beli belum diverifikasi.'
    : 'Item belum tersedia.');
  missing.push('Urutan draft, objektif dan momen gameplay belum dinilai.');
  return { schemaVersion: 1, evidenceKind: input.evidenceKind, evidenceLabel: KINDS[input.evidenceKind],
    reviewStatus: 'REVIEW_REQUIRED', trustedForCoach: false, publishable: false, networkRequests: 0,
    observation: { ...observation, teams }, itemEvidence, teamLogoEvidence, checks, numericConsistent,
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
  if (review.itemEvidence) {
    rows.push('## Item dari screenshot', '', 'Enam slot per pemain ditampilkan pada PNG dari potongan sumber asli.',
      'Urutan tampilan: baris atas kiri ke kanan, lalu baris bawah. Ini bukan urutan pembelian.',
      'Nama item belum diverifikasi. Slot bertanda ? tidak terlihat; kotak gelap mempertahankan tampilan sumber.', '');
  }
  if (review.teamLogoEvidence) {
    rows.push('## Logo tim', '', 'Logo dipotong dari screenshot dan dipasangkan secara manual ke tim pada pertandingan ini.',
      'Bukan klaim logo terbaru, afiliasi resmi, atau izin publikasi. Tim tanpa logo memakai singkatan, bukan logo rekaan.', '');
  }
  rows.push('KP = (kill + assist) / kill tim. KP tidak dihitung jika data bertentangan, belum lengkap, atau kill tim nol.', '',
    ...review.notes, '', '## Batas bukti', '', ...review.missing.map(line => `- ${line}`), `- ${review.boundary}`, '',
    `Sumber: ${o.sourceUrl ? `[Arsip publik YouTube](${o.sourceUrl})` : 'belum valid'}.`,
    `Posisi video dari input: ${o.videoOffsetSeconds === null ? 'belum diketahui' : `${o.videoOffsetSeconds} detik (belum diverifikasi oleh alat ini)`}.`, '',
    `Pemeriksaan: ${review.checks.issues.length ? review.checks.issues.join(', ') : 'tidak ada konflik aritmetika terdeteksi'}.`,
    'Bukan hasil ekstraksi otomatis untuk data berlabel manual. Tidak ada publikasi atau penulisan ke Coach.', '');
  return rows.join('\n');
}

async function renderReviewCard(input, { layout = 'wide', itemSourceBytes, logoSourceBytes } = {}) {
  if (!Object.hasOwn(DIMENSIONS, layout)) fail('INVALID_REVIEW_LAYOUT');
  const review = createReview(input); const o = review.observation;
  const itemImage = review.itemEvidence ? await decodeItemSource(itemSourceBytes, review.itemEvidence) : null;
  const logoImage = review.teamLogoEvidence ? await decodeLogoSource(logoSourceBytes, review.teamLogoEvidence) : null;
  const [width, height] = (itemImage ? ITEM_DIMENSIONS : DIMENSIONS)[layout]; const portrait = layout === 'portrait';
  loadFonts();
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const canvas = createCanvas(width, height); const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080D1F'; ctx.fillRect(0, 0, width, height);
  const wash = ctx.createLinearGradient(0, 0, width, 440);
  wash.addColorStop(0, '#153963'); wash.addColorStop(0.48, '#10162D'); wash.addColorStop(1, '#40243D');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, width, 460);
  // Angled broadcast framing stays outside the text columns, not behind the statistics.
  for (const right of [false, true]) {
    ctx.save(); if (right) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.beginPath(); ctx.moveTo(0, 220); ctx.lineTo(20, 200); ctx.lineTo(20, 408); ctx.lineTo(0, 428); ctx.closePath();
    ctx.fillStyle = right ? C.red : C.blue; ctx.fill();
    ctx.strokeStyle = right ? '#6D3A52' : '#2C5884'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 188); ctx.lineTo(42, 146); ctx.lineTo(42, 394); ctx.stroke(); ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
  const margin = portrait ? 64 : 80; const usable = width - margin * 2;
  const text = (value, x, y, size = 32, color = C.text, maxWidth = usable, align = 'left', family = 'Analis Text') =>
    fitText(ctx, String(value), x, y, { size, min: size - 4, family, color, width: maxWidth, align });
  const line = y => { ctx.strokeStyle = '#33405D'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(width - margin, y); ctx.stroke(); };
  text('Review pertandingan', margin, 100, 50, C.text, usable - 170, 'left', 'Analis Bold');
  const logo = await loadImage(require('node:path').join(__dirname, '../assets/brand/hengs-bot-icon-v2.png'));
  ctx.drawImage(logo, width - margin - 72, 38, 72, 72);
  text(`${o.event || 'Event belum diketahui'} · Game ${display(o.gameNumber)} · ${duration(o.durationSeconds)}`, margin, 148, 30);
  text(review.evidenceLabel, margin, 190, 26, C.win);
  const a = o.teams[0]; const b = o.teams[1];
  const badgeSize = portrait ? 56 : 82;
  const badgeGap = portrait ? 16 : 24;
  const badgeY = portrait ? 224 : 214;
  const teamMark = (team, index) => {
    const x = index === 0 ? margin : width - margin - badgeSize;
    const region = review.teamLogoEvidence?.teams[index].region;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
    ctx.fillStyle = region ? '#F1F5F4' : (index === 0 ? '#163658' : '#42243A');
    ctx.beginPath(); ctx.roundRect(x, badgeY, badgeSize, badgeSize, 12); ctx.fill();
    ctx.restore();
    if (region) {
      const inset = 6; const scale = Math.min((badgeSize - inset * 2) / region.width, (badgeSize - inset * 2) / region.height);
      const w = region.width * scale; const h = region.height * scale;
      // Contain the complete original mark, with its source background, without recoloring or AI redraw.
      ctx.drawImage(logoImage, region.x, region.y, region.width, region.height,
        x + (badgeSize - w) / 2, badgeY + (badgeSize - h) / 2, w, h);
    } else {
      const initial = (team.name || '?').split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
      text(initial, x + badgeSize / 2, badgeY + badgeSize * 0.69, portrait ? 28 : 40,
        index === 0 ? C.blue : C.red, badgeSize - 12, 'center', 'Analis Bold');
    }
  };
  teamMark(a, 0); teamMark(b, 1);
  const nameInset = badgeSize + badgeGap;
  text(a.name || 'Tim ?', margin + nameInset, portrait ? 270 : 282, portrait ? 50 : 72, C.blue, usable * 0.28 - nameInset, 'left', 'Analis Bold');
  text(b.name || 'Tim ?', width - margin - nameInset, portrait ? 270 : 282, portrait ? 50 : 72, C.red, usable * 0.28 - nameInset, 'right', 'Analis Bold');
  text(`${display(a.kills)} : ${display(b.kills)}`, width / 2, 282, portrait ? 76 : 96, C.text, usable * 0.36, 'center', 'Analis Display');
  text('KILL GAME, BUKAN SKOR SERI', width / 2, 322, 23, C.muted, usable, 'center');
  if (o.winnerIndex !== null) text(`Pemenang tercatat: ${o.teams[o.winnerIndex].name || '?'}`, width / 2, 365, 30, C.win, usable, 'center');
  else text('Pemenang belum diketahui', width / 2, 365, 30, C.muted, usable, 'center');
  text(`${gold(a.gold)} gold`, margin, 416, 32, C.blue, usable * 0.45);
  text(`${gold(b.gold)} gold`, width - margin, 416, 32, C.red, usable * 0.45, 'right');
  if (review.derived.goldDifference !== null) text(`Selisih ${gold(Math.abs(review.derived.goldDifference))}`,
    width / 2, 414, portrait ? 22 : 26, C.win, usable * 0.28, 'center');
  ctx.fillStyle = '#33405D'; ctx.fillRect(margin, 438, usable, 10);
  if (review.derived.blueGoldSharePercent !== null) {
    const split = usable * review.derived.blueGoldSharePercent / 100;
    ctx.fillStyle = C.blue; ctx.fillRect(margin, 438, split, 10);
    ctx.fillStyle = C.red; ctx.fillRect(margin + split, 438, usable - split, 10);
  }
  const table = (team, index, x, y, w) => {
    const color = index === 0 ? C.blue : C.red;
    const col = { name: x + 16, kda: x + w * 0.56, gold: x + w * 0.80, kp: x + w - 16 };
    ctx.fillStyle = index === 0 ? '#132B49' : '#352239'; ctx.fillRect(x, y - 2, w, 56);
    text(team.name || 'Tim ?', x + 16, y + 36, 36, color, w * 0.55, 'left', 'Analis Bold');
    text(o.winnerIndex === index ? 'MENANG' : o.winnerIndex === null ? 'HASIL ?' : 'KALAH', x + w - 16, y + 34, 24,
      o.winnerIndex === index ? C.win : C.muted, w * 0.35, 'right', 'Analis Bold');
    text('PEMAIN', col.name, y + 82, 24, C.muted, w * 0.32);
    text('K / D / A', col.kda, y + 82, 24, C.muted, w * 0.22, 'right');
    text('GOLD', col.gold, y + 82, 24, C.muted, w * 0.22, 'right');
    text('KP', col.kp, y + 82, 24, C.muted, w * 0.17, 'right');
    team.players.forEach((p, i) => {
      const rowHeight = itemImage ? 116 : 57;
      const rowY = y + 99 + i * rowHeight;
      ctx.fillStyle = i % 2 === 0 ? '#151D33' : '#0E162A'; ctx.fillRect(x, rowY, w, rowHeight - (itemImage ? 6 : 0));
      text(p.name || '?', col.name, rowY + 38, 32, C.text, w * 0.33, 'left', 'Analis Bold');
      text(`${display(p.kills)} / ${display(p.deaths)} / ${display(p.assists)}`, col.kda, rowY + 38, 29, C.text, w * 0.23, 'right');
      text(gold(p.gold), col.gold, rowY + 38, 29, C.text, w * 0.22, 'right');
      text(pct(p.killParticipationPercent), col.kp, rowY + 38, 28, C.muted, w * 0.17, 'right');
      if (itemImage) {
        const size = 43; const step = 52; const iconStart = x + 92; const iconY = rowY + 55;
        text('ITEM', col.name, iconY + 29, 21, C.muted, 60, 'left', 'Analis Bold');
        review.itemEvidence.rows[index][i].slots.forEach((slot, n) => {
          const iconX = iconStart + n * step;
          ctx.fillStyle = '#080D1F'; ctx.fillRect(iconX - 1, iconY - 1, size + 2, size + 2);
          if (slot) {
            // Pixel crop only: no invented icon, sharpening, name or item-order inference.
            ctx.drawImage(itemImage, slot.x, slot.y, slot.width, slot.height, iconX, iconY, size, size);
          } else text('?', iconX + size / 2, iconY + 30, 28, C.muted, size, 'center');
        });
      }
    });
  };
  const tableY = 480; const tableWidth = portrait ? usable : (usable - 56) / 2;
  table(a, 0, margin, tableY, tableWidth);
  table(b, 1, portrait ? margin : width / 2 + 28, portrait ? tableY + (itemImage ? 720 : 424) : tableY, tableWidth);
  const footY = itemImage ? (portrait ? 1930 : 1208) : (portrait ? 1330 : 906);
  line(footY - 20);
  text('KP = (kill + assist) / kill tim. ? = belum diketahui.', margin, footY + 16, 26, C.muted);
  text(review.notes[0] || 'Angka belum cukup konsisten untuk menghitung selisih gold.', margin, footY + 58, 30,
    review.numericConsistent ? C.win : C.red);
  text(review.numericConsistent ? 'Angka konsisten. Tetap perlu review sumber.' : 'Ada konflik angka. Periksa sumber sebelum dipakai.', margin, footY + 98, 28, C.muted);
  text(o.videoOffsetSeconds === null ? 'Posisi video belum pasti · Patch belum diverifikasi'
    : 'Posisi video dari input · Belum diverifikasi oleh alat ini', margin, footY + 138, 26, C.muted);
  text(o.sourceUrl ? 'Sumber: arsip publik YouTube · Tautan lengkap di review.md' : 'Sumber belum valid. Jangan dipublikasikan.', margin, footY + 180, 25, C.muted);
  if (itemImage) text(logoImage ? 'Item & logo dari screenshot. Nama item belum diverifikasi.'
    : 'Ikon asli screenshot. Nama item & urutan beli belum diverifikasi.', margin, footY + 222, 25, C.win);
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
  const readSource = (evidence, maxBytes, errorCode) => {
    if (!evidence) return undefined;
    const imagePath = path.join(path.dirname(inputPath), evidence.imageFile);
    inside(imagePath); noLinks(imagePath);
    if (!fs.statSync(imagePath).isFile() || fs.statSync(imagePath).size > maxBytes) fail(errorCode);
    return fs.readFileSync(imagePath);
  };
  const itemSourceBytes = readSource(review.itemEvidence, MAX_ITEM_IMAGE_BYTES, 'INVALID_ITEM_IMAGE');
  const logoSourceBytes = readSource(review.teamLogoEvidence, MAX_LOGO_IMAGE_BYTES, 'INVALID_LOGO_IMAGE');
  const wide = await renderReviewCard(input, { itemSourceBytes, logoSourceBytes });
  const portrait = await renderReviewCard(input, { layout: 'portrait', itemSourceBytes, logoSourceBytes });
  const markdown = renderReviewMarkdown(input);
  fs.mkdirSync(outputDir); // Exclusive new directory; all inputs/rendering were validated first.
  for (const [name, contents] of [['scoreboard-wide.png', wide], ['scoreboard-portrait.png', portrait],
    ['review.md', markdown], ['review.json', JSON.stringify(review, null, 2)]]) {
    fs.writeFileSync(path.join(outputDir, name), contents, { flag: 'wx', mode: 0o600 });
  }
  return { code: 'OFFLINE_REVIEW_CREATED', images: 2, trustedForCoach: false, networkRequests: 0 };
}

module.exports = { createReview, renderReviewCard, renderReviewMarkdown, writeReviewBundle, DIMENSIONS, ITEM_DIMENSIONS };
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 6 || process.argv[2] !== '--input' || process.argv[4] !== '--out-dir') fail('REVIEW_USAGE_REQUIRED');
    console.log(JSON.stringify(await writeReviewBundle(process.argv[3], process.argv[5])));
  })().catch(err => {
    const allowed = ['INVALID_REVIEW_INPUT', 'INVALID_REVIEW_ROSTER', 'REVIEW_PATH_OUTSIDE_EVALS', 'REVIEW_LINK_REJECTED',
      'INVALID_REVIEW_FILE', 'REVIEW_OUTPUT_EXISTS', 'REVIEW_USAGE_REQUIRED', 'ESPORTS_FONT_UNAVAILABLE',
      'INVALID_ITEM_EVIDENCE', 'INVALID_ITEM_ROWS', 'ITEM_PLAYER_MISMATCH', 'INVALID_ITEM_REGION',
      'INVALID_ITEM_IMAGE', 'ITEM_SOURCE_MISMATCH', 'INVALID_LOGO_EVIDENCE', 'LOGO_TEAM_MISMATCH',
      'INVALID_LOGO_REGION', 'INVALID_LOGO_IMAGE', 'LOGO_SOURCE_MISMATCH'];
    console.log(JSON.stringify({ code: allowed.includes(err.message) ? err.message : 'REVIEW_OUTPUT_FAILED', networkRequests: 0 }));
    process.exitCode = 1;
  });
}
