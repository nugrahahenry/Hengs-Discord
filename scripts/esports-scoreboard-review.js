'use strict';

// Offline extension of the existing Hengs Analis card, not a bot route or an importer into Coach.
// THESIS: compare ten players without turning a final scoreboard into invented gameplay advice.
// OWN-WORLD: inherited navy, blue/red sides, gold result emphasis and bundled Barlow fonts.
// STORY: read the result, check each number, then see exactly what evidence is still missing.
// FIRST VIEWPORT: labelled manual/model evidence, game kills (not series score), final gold, two rosters.
// FORM: existing broadcast card extended for review; stacked roster layout for phone reading.
const { canonicalVideoUrl, inspectScoreboard } = require('./esports-video-lab');
const { resolveTeamBrands, loadCatalogLogo } = require('./esports-team-catalog');
const { renderBroadcastCard, cardGeometry, DIMENSIONS, ITEM_DIMENSIONS } = require('./esports-broadcast-card');
const { reviewItemEvidence, decodeItemSource, MAX_ITEM_IMAGE_BYTES } = require('./esports-item-evidence');
const { reviewTeamLogos, decodeLogoSource, MAX_LOGO_IMAGE_BYTES } = require('./esports-team-logos');

const KINDS = Object.freeze({ manual_transcription: 'Dibaca manual dari screenshot', model_candidate: 'Kandidat model, belum diverifikasi' });
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
  const teamBranding = resolveTeamBrands(input.teamCatalog, teams);
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
    observation: { ...observation, teams }, itemEvidence, teamLogoEvidence, teamBranding, checks, numericConsistent,
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
  if (review.teamBranding) {
    const brand = review.teamBranding;
    rows.push('## Katalog logo lokal', '',
      `Koleksi: ${brand.collectionId}. Region: ${brand.region}. Season: ${brand.season}. Diperiksa: ${brand.verifiedAt}.`,
      `Sumber aset: [Situs MPL](${brand.sourcePage}). Pencocokan alias persis di dalam koleksi, bukan pencarian lintas region.`,
      ...brand.teams.map((team, index) => `- ${md(o.teams[index].name)}: ${team ? md(team.name) : 'tidak cocok, gunakan inisial'}.`),
      review.teamLogoEvidence ? 'Potongan logo manual pertandingan diprioritaskan di atas katalog.'
        : 'Logo memakai file lokal yang hash dan ukurannya diperiksa. Tidak ada unduhan saat render.',
      'Snapshot katalog bukan bukti branding historis pertandingan, afiliasi resmi, atau izin publikasi.', '');
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
  const review = createReview(input);
  const itemImage = review.itemEvidence ? await decodeItemSource(itemSourceBytes, review.itemEvidence) : null;
  const logoImage = review.teamLogoEvidence ? await decodeLogoSource(logoSourceBytes, review.teamLogoEvidence) : null;
  const catalogLogos = review.teamLogoEvidence || !review.teamBranding ? [null, null]
    : await Promise.all(review.teamBranding.teams.map(team =>
      team ? loadCatalogLogo(review.teamBranding.collectionId, team.id) : null));
  return renderBroadcastCard(review, { layout, itemImage, logoImage, catalogLogos });
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

module.exports = { createReview, renderReviewCard, renderReviewMarkdown, writeReviewBundle, cardGeometry, DIMENSIONS, ITEM_DIMENSIONS };
if (require.main === module) {
  (async () => {
    if (process.argv.length !== 6 || process.argv[2] !== '--input' || process.argv[4] !== '--out-dir') fail('REVIEW_USAGE_REQUIRED');
    console.log(JSON.stringify(await writeReviewBundle(process.argv[3], process.argv[5])));
  })().catch(err => {
    const allowed = ['INVALID_REVIEW_INPUT', 'INVALID_REVIEW_ROSTER', 'REVIEW_PATH_OUTSIDE_EVALS', 'REVIEW_LINK_REJECTED',
      'INVALID_REVIEW_FILE', 'REVIEW_OUTPUT_EXISTS', 'REVIEW_USAGE_REQUIRED', 'ESPORTS_FONT_UNAVAILABLE',
      'INVALID_ITEM_EVIDENCE', 'INVALID_ITEM_ROWS', 'ITEM_PLAYER_MISMATCH', 'INVALID_ITEM_REGION',
      'INVALID_ITEM_IMAGE', 'ITEM_SOURCE_MISMATCH', 'INVALID_LOGO_EVIDENCE', 'LOGO_TEAM_MISMATCH',
      'INVALID_LOGO_REGION', 'INVALID_LOGO_IMAGE', 'LOGO_SOURCE_MISMATCH',
      'TEAM_CATALOG_UNAVAILABLE', 'CATALOG_LOGO_LINK_REJECTED', 'BROADCAST_BACKGROUND_UNAVAILABLE'];
    console.log(JSON.stringify({ code: allowed.includes(err.message) ? err.message : 'REVIEW_OUTPUT_FAILED', networkRequests: 0 }));
    process.exitCode = 1;
  });
}
